const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();
app.use(cors());

const CHANNELS = [
  { id: 'SaltyCracker', name: 'TheSaltyCracker' },
  { id: 'StevenCrowder', name: 'Steven Crowder' }
];

const LIVESTREAMS = [
  { url: 'https://rumble.com/v6xkx0a-infowars-network-feed-live-247.html', name: 'InfoWars Live' }
];

// ---------------------------------------------------------------------------
// ADDED 2025-12-19: Scraper health monitoring
// REASON: Scraper could silently fail if Rumble changes HTML structure
// SOLUTION: Track consecutive failures and expose health status
// ---------------------------------------------------------------------------
let scraperHealth = {
  consecutiveEmptyLineups: 0,
  lastSuccessfulScrape: null,
  lastAttempt: null,
  totalScrapes: 0,
  totalFailures: 0,
  channelStatus: {}
};
// ---------------------------------------------------------------------------

async function scrapeChannel(channelId) {
  try {
    const response = await fetch(`https://rumble.com/c/${channelId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    const html = await response.text();
    
    // Extract video URLs
    const videoMatches = html.match(/href="(\/v[^"]+\.html[^"]*)"/g);
    
    // Extract thumbnail URLs
    const thumbMatches = html.match(/src="(https:\/\/[^"]*-small-[^"]*\.jpg[^"]*)"/g);
    
    if (videoMatches && videoMatches.length > 0) {
      const videoUrl = videoMatches[0].match(/href="([^"]+)"/)[1].split('?')[0];
      
      let thumbnail = null;
      if (thumbMatches && thumbMatches.length > 0) {
        const originalThumb = thumbMatches[0].match(/src="([^"]+)"/)[1];
        // Use proxy URL instead of direct URL
        thumbnail = '/api/rumble/image?url=' + encodeURIComponent(originalThumb);
      }
      
      let title = videoUrl.split('/')[1].replace('.html', '');
      title = title.replace(/^v[a-z0-9]+-/, '');
      title = title.split('-').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1)
      ).join(' ');
      
      // ADDED 2025-12-19: Track channel success
      scraperHealth.channelStatus[channelId] = { status: 'ok', lastSuccess: new Date().toISOString() };
      
      return {
        channelId,
        title: title.substring(0, 60) + (title.length > 60 ? '...' : ''),
        url: 'https://rumble.com' + videoUrl,
        thumbnail,
        type: 'video'
      };
    }
    
    // ADDED 2025-12-19: Track channel failure
    console.warn(`[SCRAPER WARNING] No videos found for channel: ${channelId} - HTML structure may have changed`);
    scraperHealth.channelStatus[channelId] = { status: 'empty', lastAttempt: new Date().toISOString() };
    
    return null;
  } catch (error) {
    console.error(`Error scraping ${channelId}:`, error.message);
    // ADDED 2025-12-19: Track channel error
    scraperHealth.channelStatus[channelId] = { status: 'error', error: error.message, lastAttempt: new Date().toISOString() };
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
    res.set('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
    
    const buffer = await response.buffer();
    res.send(buffer);
  } catch (error) {
    console.error('Image proxy error:', error.message);
    res.status(500).send('Failed to fetch image');
  }
});

// Cache results for 5 minutes
let cache = { data: null, timestamp: 0 };
const CACHE_TTL = 5 * 60 * 1000;

app.get('/api/rumble/lineup', async (req, res) => {
  const now = Date.now();
  
  if (cache.data && (now - cache.timestamp) < CACHE_TTL) {
    return res.json(cache.data);
  }
  
  try {
    scraperHealth.totalScrapes++;
    scraperHealth.lastAttempt = new Date().toISOString();
    
    const channelPromises = CHANNELS.map(ch => scrapeChannel(ch.id));
    const livestreamPromises = LIVESTREAMS.map(ls => checkLivestream(ls));
    
    const [channelResults, livestreamResults] = await Promise.all([
      Promise.all(channelPromises),
      Promise.all(livestreamPromises)
    ]);
    
    const lineup = [
      ...livestreamResults.filter(r => r),
      ...channelResults.filter(r => r)
    ];
    
    // ---------------------------------------------------------------------------
    // ADDED 2025-12-19: Monitor for empty lineup (scraper may be broken)
    // ---------------------------------------------------------------------------
    if (lineup.length === 0) {
      scraperHealth.consecutiveEmptyLineups++;
      scraperHealth.totalFailures++;
      console.error(`[SCRAPER ALERT] Empty lineup returned! Consecutive failures: ${scraperHealth.consecutiveEmptyLineups}`);
      console.error('[SCRAPER ALERT] Rumble HTML structure may have changed - check regex patterns');
      
      if (scraperHealth.consecutiveEmptyLineups >= 3) {
        console.error('[SCRAPER CRITICAL] 3+ consecutive empty lineups - scraper is likely broken!');
      }
    } else {
      scraperHealth.consecutiveEmptyLineups = 0;
      scraperHealth.lastSuccessfulScrape = new Date().toISOString();
    }
    // ---------------------------------------------------------------------------
    
    cache = { data: { lineup, updated: new Date().toISOString() }, timestamp: now };
    res.json(cache.data);
  } catch (error) {
    console.error('Error fetching lineup:', error);
    scraperHealth.totalFailures++;
    res.status(500).json({ error: 'Failed to fetch lineup' });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ---------------------------------------------------------------------------
// ADDED 2025-12-19: Scraper status endpoint for monitoring
// ---------------------------------------------------------------------------
app.get('/api/rumble/status', (req, res) => {
  const isHealthy = scraperHealth.consecutiveEmptyLineups < 3 && 
                    scraperHealth.lastSuccessfulScrape !== null;
  
  res.json({
    status: isHealthy ? 'healthy' : 'degraded',
    scraper: {
      consecutiveEmptyLineups: scraperHealth.consecutiveEmptyLineups,
      lastSuccessfulScrape: scraperHealth.lastSuccessfulScrape,
      lastAttempt: scraperHealth.lastAttempt,
      totalScrapes: scraperHealth.totalScrapes,
      totalFailures: scraperHealth.totalFailures,
      successRate: scraperHealth.totalScrapes > 0 
        ? ((scraperHealth.totalScrapes - scraperHealth.totalFailures) / scraperHealth.totalScrapes * 100).toFixed(1) + '%'
        : 'N/A'
    },
    channels: scraperHealth.channelStatus,
    monitored: {
      channels: CHANNELS.map(c => c.id),
      livestreams: LIVESTREAMS.map(l => l.name)
    }
  });
});
// ---------------------------------------------------------------------------

const PORT = 3099;
app.listen(PORT, () => {
  console.log(`Rumble API running on port ${PORT}`);
  console.log('[SCRAPER] Monitoring enabled - check /api/rumble/status for health');
});
