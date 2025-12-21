import axios from "axios";

const API_BASE = "/api";

// ============================================================================
// REQUEST DEDUPLICATION - Prevent duplicate in-flight requests
// ============================================================================
const inflightRequests = new Map(); // key -> Promise

function getRequestKey(config) {
  // Create unique key from method + url + params
  const params = config.params ? JSON.stringify(config.params) : '';
  const data = config.data ? JSON.stringify(config.data) : '';
  return `${config.method}:${config.url}:${params}:${data}`;
}

// ============================================================================
// 429 HANDLING - Backoff + Jitter + Retry-After
// ============================================================================
const MAX_RETRIES = 3;
const BASE_DELAY = 1000; // 1 second
const MAX_DELAY = 30000; // 30 seconds

function getRetryDelay(retryCount, retryAfterHeader) {
  // 1. Respect Retry-After header if present
  if (retryAfterHeader) {
    const seconds = parseInt(retryAfterHeader, 10);
    if (!isNaN(seconds)) {
      return Math.min(seconds * 1000, MAX_DELAY);
    }
  }
  
  // 2. Exponential backoff with jitter
  const exponentialDelay = BASE_DELAY * Math.pow(2, retryCount);
  const jitter = Math.random() * BASE_DELAY * 0.5; // 0-50% jitter
  return Math.min(exponentialDelay + jitter, MAX_DELAY);
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// AXIOS INSTANCES
// ============================================================================

// Configure the default axios instance
axios.interceptors.request.use((config) => {
  const token = localStorage.getItem("accessToken");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Create dedicated api instance
export const api = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
});

// Attach token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("accessToken");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ============================================================================
// TOKEN REFRESH LOGIC
// ============================================================================
let refreshPromise = null; // Singleton to prevent multiple refresh calls

async function refreshAccessToken() {
  // Dedupe refresh calls
  if (refreshPromise) {
    return refreshPromise;
  }
  
  const rt = localStorage.getItem("refreshToken");
  if (!rt) return null;
  
  refreshPromise = (async () => {
    try {
      const res = await axios.post(`${API_BASE}/auth/refresh`, { refresh_token: rt });
      const newToken = res.data.access_token;
      localStorage.setItem("accessToken", newToken);
      return newToken;
    } catch (err) {
      console.error("refresh failed:", err.response?.data || err.message);
      localStorage.removeItem("accessToken");
      localStorage.removeItem("refreshToken");
      return null;
    } finally {
      refreshPromise = null;
    }
  })();
  
  return refreshPromise;
}

// ============================================================================
// RESPONSE INTERCEPTOR - 401 retry + 429 handling
// ============================================================================
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    
    // Handle 401 - Token refresh
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      const newToken = await refreshAccessToken();
      if (newToken) {
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      }
    }
    
    // Handle 429 - Rate limit with backoff + jitter
    if (error.response?.status === 429) {
      const retryCount = original._retryCount || 0;
      
      if (retryCount < MAX_RETRIES) {
        original._retryCount = retryCount + 1;
        
        const retryAfter = error.response.headers['retry-after'];
        const delay = getRetryDelay(retryCount, retryAfter);
        
        console.warn(`[API] 429 rate limited. Retry ${retryCount + 1}/${MAX_RETRIES} in ${Math.round(delay)}ms`);
        
        await sleep(delay);
        return api(original);
      } else {
        console.error('[API] Max retries exceeded for rate limit');
      }
    }
    
    return Promise.reject(error);
  }
);

// Same for default axios instance
axios.interceptors.response.use(
  (r) => r,
  async (error) => {
    const original = error.config;
    
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      const newToken = await refreshAccessToken();
      if (newToken) {
        original.headers.Authorization = `Bearer ${newToken}`;
        return axios(original);
      }
    }
    
    if (error.response?.status === 429) {
      const retryCount = original._retryCount || 0;
      if (retryCount < MAX_RETRIES) {
        original._retryCount = retryCount + 1;
        const retryAfter = error.response.headers['retry-after'];
        const delay = getRetryDelay(retryCount, retryAfter);
        console.warn(`[API] 429 rate limited. Retry ${retryCount + 1}/${MAX_RETRIES} in ${Math.round(delay)}ms`);
        await sleep(delay);
        return axios(original);
      }
    }
    
    return Promise.reject(error);
  }
);

// ============================================================================
// DEDUPLICATED FETCH - Prevents duplicate in-flight requests
// ============================================================================
export async function deduplicatedGet(url, config = {}) {
  const key = `GET:${url}:${JSON.stringify(config.params || {})}`;
  
  // If request already in flight, return the existing promise
  if (inflightRequests.has(key)) {
    console.log(`[API] Deduping GET ${url}`);
    return inflightRequests.get(key);
  }
  
  // Start new request
  const promise = api.get(url, config).finally(() => {
    inflightRequests.delete(key);
  });
  
  inflightRequests.set(key, promise);
  return promise;
}

// ============================================================================
// API HELPERS
// ============================================================================
export async function register(data) {
  return api.post("/auth/register", data);
}

export async function verify(data) {
  return api.post("/auth/verify", data);
}

export async function login(data) {
  const res = await api.post("/auth/login", data);
  if (res.data.token) localStorage.setItem("accessToken", res.data.token);
  if (res.data.refresh_token) localStorage.setItem("refreshToken", res.data.refresh_token);
  return res;
}

export async function logout() {
  const token = localStorage.getItem("refreshToken");
  if (token) await api.post("/auth/logout", { refresh_token: token });
  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");
}

export async function getProfile() {
  return deduplicatedGet("/profile");
}

// Export dedupe helper for components to use
export { deduplicatedGet as dedupedGet };
