// =============================================================================
// BeKord WebSocket Hook - Real-time communication
// =============================================================================
// Best practices:
// - Auto-reconnect with exponential backoff
// - Heartbeat to keep connection alive
// - Event-based message handling
// - Connection state management
// - Uses HttpOnly cookie for auth (no token needed in JS)
// =============================================================================

import { useEffect, useRef, useCallback, useState } from 'react';

const WS_URL = `wss://${window.location.host}/ws`;
const HEARTBEAT_INTERVAL = 25000; // 25 seconds
const RECONNECT_BASE_DELAY = 2000; // 2 seconds (increased)
const RECONNECT_MAX_DELAY = 60000; // 60 seconds (increased)
const MAX_RECONNECT_ATTEMPTS = 5; // Reduced from 10

// Dedupe ws-token requests - singleton promise
let wsTokenPromise = null;
let wsTokenExpiry = 0;

async function getWsToken() {
  const now = Date.now();
  
  // If we have a cached valid token (cache for 5 minutes)
  if (wsTokenPromise && now < wsTokenExpiry) {
    return wsTokenPromise;
  }
  
  // Start a new request
  wsTokenPromise = fetch('/api/auth/ws-token', { credentials: 'include' })
    .then(res => {
      if (res.ok) {
        wsTokenExpiry = now + 300000; // Cache for 5 minutes
        return res.json();
      }
      // On 401, try refreshing token first
      if (res.status === 401) {
        console.log('[WS] ws-token got 401, attempting token refresh');
        return fetch('/api/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({})
        }).then(refreshRes => {
          if (refreshRes.ok) {
            // Retry ws-token after refresh
            return fetch('/api/auth/ws-token', { credentials: 'include' })
              .then(r => r.ok ? r.json() : null);
          }
          return null;
        });
      }
      return null;
    })
    .catch(() => null);
  
  return wsTokenPromise;
}

export function useWebSocket(onMessage) {
  const wsRef = useRef(null);
  const heartbeatRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const [connectionState, setConnectionState] = useState('disconnected');
  const [isConnected, setIsConnected] = useState(false);
  const onMessageRef = useRef(onMessage);
  
  // Keep onMessage ref updated
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  // Clear all timers
  const clearTimers = useCallback(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  // Send a message through WebSocket
  const send = useCallback((data) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
      return true;
    }
    return false;
  }, []);

  // Subscribe to a server's events
  const subscribeToServer = useCallback((serverId) => {
    return send({ type: 'subscribe_server', server_id: serverId });
  }, [send]);

  // Subscribe to a DM's events
  const subscribeToDm = useCallback((dmId) => {
    return send({ type: 'subscribe_dm', dm_id: dmId });
  }, [send]);

  // Unsubscribe from a server
  const unsubscribeFromServer = useCallback((serverId) => {
    return send({ type: 'unsubscribe_server', server_id: serverId });
  }, [send]);

  // Send typing indicator
  const sendTyping = useCallback((context) => {
    // context: { server_id, channel } or { dm_id }
    return send({ type: 'typing', ...context });
  }, [send]);

  // Connect to WebSocket
  const connect = useCallback(async () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      console.log('[WS] Already connected');
      return;
    }

    setConnectionState('connecting');
    console.log('[WS] Connecting to', WS_URL);

    try {
      // Get a WebSocket token from the backend (validates session and returns token)
      // Uses deduped/cached getWsToken to prevent request storms
      let wsUrl = WS_URL;
      try {
        const data = await getWsToken();
        if (data && data.token) {
          wsUrl = `${WS_URL}?token=${encodeURIComponent(data.token)}`;
          console.log('[WS] Got WS token from API (deduped)');
        } else {
          console.log('[WS] Could not get WS token, will retry on reconnect');
        }
      } catch (err) {
        console.log('[WS] Error getting WS token:', err);
      }
      
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log('[WS] Connected');
        setConnectionState('connected');
        setIsConnected(true);
        reconnectAttemptsRef.current = 0;

        // Start heartbeat
        heartbeatRef.current = setInterval(() => {
          send({ type: 'ping' });
        }, HEARTBEAT_INTERVAL);
      };

      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          // Handle pong internally
          if (data.type === 'pong') {
            return;
          }
          
          // Forward other messages to handler
          if (onMessageRef.current) {
            onMessageRef.current(data);
          }
        } catch (e) {
          console.warn('[WS] Failed to parse message:', e);
        }
      };

      wsRef.current.onclose = (event) => {
        console.log('[WS] Disconnected:', event.code, event.reason);
        setConnectionState('disconnected');
        setIsConnected(false);
        clearTimers();

        // Attempt reconnection if not intentionally closed
        if (event.code !== 1000 && reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          // Add jitter (0-50% of base delay) to prevent thundering herd
          const jitter = Math.random() * RECONNECT_BASE_DELAY * 0.5;
          const baseDelay = RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttemptsRef.current);
          const delay = Math.min(baseDelay + jitter, RECONNECT_MAX_DELAY);
          console.log(`[WS] Reconnecting in ${Math.round(delay)}ms (attempt ${reconnectAttemptsRef.current + 1}/${MAX_RECONNECT_ATTEMPTS})`);
          
          // Invalidate cached token on reconnect
          wsTokenExpiry = 0;
          
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttemptsRef.current++;
            connect();
          }, delay);
        } else if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
          console.log('[WS] Max reconnect attempts reached, giving up');
        }
      };

      wsRef.current.onerror = (error) => {
        console.error('[WS] Error:', error);
        setConnectionState('error');
      };

    } catch (e) {
      console.error('[WS] Connection failed:', e);
      setConnectionState('error');
    }
  }, [send, clearTimers]);

  // Disconnect
  const disconnect = useCallback(() => {
    clearTimers();
    if (wsRef.current) {
      wsRef.current.close(1000, 'User disconnect');
      wsRef.current = null;
    }
    setConnectionState('disconnected');
    setIsConnected(false);
  }, [clearTimers]);

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return {
    isConnected,
    connectionState,
    send,
    subscribeToServer,
    subscribeToDm,
    unsubscribeFromServer,
    sendTyping,
    reconnect: connect,
    disconnect,
  };
}

export default useWebSocket;
