const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Default channels (used if no custom config provided)
const DEFAULT_CHANNELS = [
  { id: 'Infowars', name: 'InfoWars', type: 'livestream', url: 'https://rumble.com/v6xkx0a-infowars-network-feed-live-247.html' },
  { id: 'SaltyCracker', name: 'SaltyCracker', type: 'channel' },
  { id: 'StevenCrowder', name: 'Steven Crowder', type: 'channel' }
];

// Scraper health monitoring
let scraperHealth = {
  consecutiveEmptyLineups: 0,
  lastSuccessfulScrape: null,
  lastAttempt: null,
  totalScrapes: 0,
  totalFailures: 0,
  channelStatus: {}
};

async function scrapeChannel(channelId) {
  try {
    const response = await fetch(`https://rumble.com/c/${channelId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    const html = await response.text();
    
    const videoMatches = html.match(/href="(\/v[^"]+\.html[^"]*)"/g);
    const thumbMatches = html.match(/src="(https:\/\/[^"]*-small-[^"]*\.jpg[^"]*)"/g);
    
    if (videoMatches && videoMatches.length > 0) {
      const videoUrl = videoMatches[0].match(/href="([^"]+)"/)[1].split('?')[0];
      
      let thumbnail = null;
      if (thumbMatches && thumbMatches.length > 0) {
        const originalThumb = thumbMatches[0].match(/src="([^"]+)"/)[1];
        thumbnail = '/api/rumble/image?url=' + encodeURIComponent(originalThumb);
      }
      
      let title = videoUrl.split('/')[1].replace('.html', '');
      title = title.replace(/^v[a-z0-9]+-/, '');
      title = title.split('-').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1)
      ).join(' ');
      
      scraperHealth.channelStatus[channelId] = { status: 'ok', lastSuccess: new Date().toISOString() };
      
      return {
        channelId,
        channel: channelId,
        title: title.substring(0, 60) + (title.length > 60 ? '...' : ''),
        url: 'https://rumble.com' + videoUrl,
        thumbnail,
        type: 'video'
      };
    }
    
    scraperHealth.channelStatus[channelId] = { status: 'empty', lastAttempt: new Date().toISOString() };
    return null;
  } catch (error) {
    console.error(`Error scraping ${channelId}:`, error.message);
    scraperHealth.channelStatus[channelId] = { status: 'error', error: error.message };
    return null;
  }
}

async function checkLivestream(streamInfo) {
  try {
    const response = await fetch(streamInfo.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    const html = await response.text();
    
    const isLive = html.includes('LIVE') || html.includes('"isLiveBroadcast":true');
    
    const thumbMatch = html.match(/property="og:image"\s+content="([^"]+)"/);
    let thumbnail = null;
    if (thumbMatch) {
      thumbnail = '/api/rumble/image?url=' + encodeURIComponent(thumbMatch[1]);
    }
    
    const titleMatch = html.match(/<title>([^<]+)<\/title>/);
    const title = titleMatch ? titleMatch[1].replace(' - Rumble', '').trim() : streamInfo.name;
    
    return {
      name: streamInfo.name,
      channel: streamInfo.name,
      title: title.substring(0, 50) + (title.length > 50 ? '...' : ''),
      url: streamInfo.url,
      thumbnail,
      isLive,
      type: 'livestream'
    };
  } catch (error) {
    console.error(`Error checking livestream:`, error.message);
    return { ...streamInfo, isLive: false, type: 'livestream', thumbnail: null };
  }
}

// Image proxy endpoint
app.get('/api/rumble/image', async (req, res) => {
  const imageUrl = req.query.url;
  if (!imageUrl) {
    return res.status(400).send('Missing url parameter');
  }
  
  try {
    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://rumble.com/'
      }
    });
    
    if (!response.ok) {
      return res.status(response.status).send('Failed to fetch image');
    }
    
    const contentType = response.headers.get('content-type');
    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'public, max-age=86400');
    
    const buffer = await response.buffer();
    res.send(buffer);
  } catch (error) {
    res.status(500).send('Failed to fetch image');
  }
});

// Cache per config hash
let cache = {};
const CACHE_TTL = 5 * 60 * 1000;

// Fetch lineup with optional custom channels
async function fetchLineup(channels) {
  const channelConfigs = channels || DEFAULT_CHANNELS;
  
  scraperHealth.totalScrapes++;
  scraperHealth.lastAttempt = new Date().toISOString();
  
  const channelPromises = channelConfigs
    .filter(ch => ch.type === 'channel')
    .map(ch => scrapeChannel(ch.id));
    
  const livestreamPromises = channelConfigs
    .filter(ch => ch.type === 'livestream')
    .map(ch => checkLivestream({ url: ch.url, name: ch.name }));
  
  const [channelResults, livestreamResults] = await Promise.all([
    Promise.all(channelPromises),
    Promise.all(livestreamPromises)
  ]);
  
  // Build lineup in the order specified
  const lineup = [];
  for (const config of channelConfigs) {
    if (config.type === 'livestream') {
      const result = livestreamResults.find(r => r && r.name === config.name);
      if (result) lineup.push(result);
    } else {
      const result = channelResults.find(r => r && r.channelId === config.id);
      if (result) lineup.push(result);
    }
  }
  
  if (lineup.length === 0) {
    scraperHealth.consecutiveEmptyLineups++;
    scraperHealth.totalFailures++;
  } else {
    scraperHealth.consecutiveEmptyLineups = 0;
    scraperHealth.lastSuccessfulScrape = new Date().toISOString();
  }
  
  return { lineup, updated: new Date().toISOString() };
}

// GET lineup with default channels
app.get('/api/rumble/lineup', async (req, res) => {
  const now = Date.now();
  const cacheKey = 'default';
  
  if (cache[cacheKey] && (now - cache[cacheKey].timestamp) < CACHE_TTL) {
    return res.json(cache[cacheKey].data);
  }
  
  try {
    const data = await fetchLineup(null);
    cache[cacheKey] = { data, timestamp: now };
    res.json(data);
  } catch (error) {
    console.error('Error fetching lineup:', error);
    res.status(500).json({ error: 'Failed to fetch lineup' });
  }
});

// POST lineup with custom channels (no caching for custom)
app.post('/api/rumble/lineup', async (req, res) => {
  try {
    const { channels } = req.body;
    if (!channels || !Array.isArray(channels) || channels.length === 0) {
      return res.status(400).json({ error: 'channels array required' });
    }
    
    // Validate channels (max 10)
    if (channels.length > 10) {
      return res.status(400).json({ error: 'Maximum 10 channels allowed' });
    }
    
    const data = await fetchLineup(channels);
    res.json(data);
  } catch (error) {
    console.error('Error fetching custom lineup:', error);
    res.status(500).json({ error: 'Failed to fetch lineup' });
  }
});

// Get default channels for UI
app.get('/api/rumble/defaults', (req, res) => {
  res.json({ channels: DEFAULT_CHANNELS });
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/api/rumble/status', (req, res) => {
  const isHealthy = scraperHealth.consecutiveEmptyLineups < 3;
  res.json({
    status: isHealthy ? 'healthy' : 'degraded',
    scraper: scraperHealth,
    defaultChannels: DEFAULT_CHANNELS
  });
});

const PORT = 3099;
app.listen(PORT, () => {
  console.log(`Rumble API running on port ${PORT}`);
});
