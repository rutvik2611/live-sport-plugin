const BaseProvider = require('./BaseProvider');
const MatchEntity = require('../domain/MatchEntity');
const StreamEntity = require('../domain/StreamEntity');

class StreamSports99Provider extends BaseProvider {
  constructor(opts) {
    super(opts);
    this.name = 'StreamSports99';
    // VIP Endpoint to get access to all categories
    this.apiUrl = 'https://api.cdnlivetv.is/api/v1/events/sports/?user=streamsports99&plan=vip';
    
    this.fetchMain = this.circuitBreaker.wrap(`${this.name}_fetchMain`, async () => {
      const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };
      const res = await fetch(this.apiUrl, { headers, signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      return await res.json();
    });
  }

  mapCategory(apiCategory) {
    const lower = apiCategory.toLowerCase();
    const map = {
      'soccer': 'football',
      'nba': 'basketball',
      'nfl': 'american_football',
      'nhl': 'hockey',
      'mlb': 'baseball',
      'cricket': 'cricket',
      'motorsport': 'motorsport',
      'f1': 'motorsport',
      'ufc': 'mma',
      'mma': 'mma',
      'boxing': 'mma',
      'tennis': 'tennis',
      'golf': 'golf',
      'rugby': 'rugby',
      'darts': 'darts'
    };
    return map[lower] || 'other';
  }

  async getMatches() {
    const matches = [];
    try {
      const data = await this.fetchMain.fire();
      const sportsData = data?.['cdn-live-tv'] || {};
      
      const excludeKeys = ['total_events', 'cached', 'timestamp'];

      Object.keys(sportsData).forEach(key => {
        if (excludeKeys.includes(key) || key.startsWith('total_events_')) return;
        
        const events = sportsData[key];
        const mappedCategory = this.mapCategory(key);

        if (Array.isArray(events)) {
          for (const item of events) {
            // Some events might just have 'name' instead of homeTeam/awayTeam
            const title = item.name || `${item.homeTeam || ''} vs ${item.awayTeam || ''}`.trim();
            if (!title || title === 'vs') continue;

            const matchId = item.gameID || title.toLowerCase().replace(/[^a-z0-9-]/g, '-');
            
            let status = 'upcoming';
            if (item.status === 'live' || item.status === 'in') status = 'live';

            const matchTime = item.start ? new Date(item.start).getTime() : Date.now();

            matches.push(new MatchEntity({
              id: `ss99_${matchId}`,
              title: title,
              category: mappedCategory,
              status: status,
              timestamp: matchTime,
              date: matchTime.toString(),
              popular: status === 'live' ? '1' : '0',
              league: item.tournament || key,
              sources: [{ source: 'streamsports99', id: matchId }]
            }));
          }
        }
      });
    } catch (err) {
      console.error(`[${this.name}] Failed to get matches:`, err.message);
    }
    return matches;
  }

  async resolveStream(sourceId, matchCategory, matchTitle) {
    const streams = [];
    try {
      const data = await this.fetchMain.fire();
      const sportsData = data?.['cdn-live-tv'] || {};
      const excludeKeys = ['total_events', 'cached', 'timestamp'];
      
      let item = null;

      // Find the specific item across all categories
      for (const key of Object.keys(sportsData)) {
        if (excludeKeys.includes(key) || key.startsWith('total_events_')) continue;
        const events = sportsData[key];
        if (Array.isArray(events)) {
          const found = events.find(e => {
            const title = e.name || `${e.homeTeam || ''} vs ${e.awayTeam || ''}`.trim();
            const genId = title.toLowerCase().replace(/[^a-z0-9-]/g, '-');
            return e.gameID === sourceId || genId === sourceId;
          });
          if (found) {
            item = found;
            break;
          }
        }
      }

      if (item && item.channels && Array.isArray(item.channels)) {
        for (const [idx, ch] of item.channels.entries()) {
          if (ch.url) {
            try {
              // Fetch the player HTML to extract the actual m3u8
              const playerRes = await fetch(ch.url, {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                  'Referer': 'https://streamsports99.fun/'
                },
                signal: AbortSignal.timeout(10000)
              });
              
              if (playerRes.ok) {
                const html = await playerRes.text();
                const decoderMatch = html.match(/function\s+([a-zA-Z0-9_]+)\s*\([a-zA-Z0-9_]+\)\s*\{.+?atob/);
                if (decoderMatch) {
                  const decoderName = decoderMatch[1];
                  const concatRegex = new RegExp(`var\\s+([a-zA-Z0-9_]+)\\s*=\\s*${decoderName}\\([^;]+;`);
                  const concatMatch = html.match(concatRegex);
                  
                  if (concatMatch) {
                    const varRegex = new RegExp(`${decoderName}\\(([a-zA-Z0-9_]+)\\)`, 'g');
                    let match;
                    const vars = [];
                    while ((match = varRegex.exec(concatMatch[0])) !== null) {
                      vars.push(match[1]);
                    }
                    
                    let m3u8Url = '';
                    for (const v of vars) {
                      const valMatch = html.match(new RegExp(`var\\s+${v}\\s*=\\s*'([^']+)'`));
                      if (valMatch && valMatch[1]) {
                        let b64 = valMatch[1].replace(/-/g, '+').replace(/_/g, '/');
                        while (b64.length % 4) b64 += '=';
                        try { m3u8Url += Buffer.from(b64, 'base64').toString('utf8'); } catch(e) {}
                      }
                    }
                    
                    if (m3u8Url) {
                      const embedPath = `streamsports99/${sourceId || 'match'}/stream${idx+1}`;
                      const embedOrigin = 'https://streamsports99.fun';
                      const proxiedUrl = `/api/hls/playlist.m3u8?url=${encodeURIComponent(m3u8Url)}&referer=${encodeURIComponent('https://streamsports99.fun/')}&embed=${encodeURIComponent(embedPath)}&embedOrigin=${encodeURIComponent(embedOrigin)}`;
                      streams.push(new StreamEntity({
                        name: `StreamSports99`,
                        title: ch.channel_name || `VIP Stream ${idx + 1}`,
                        url: proxiedUrl,
                        resolution: 'HD'
                      }));
                      continue; // move to next channel
                    }
                  }
                }
              }
            } catch (e) {
              console.warn(`[${this.name}] Failed to extract m3u8 for ${ch.url}:`, e.message);
            }
            
            // Fallback to web player link if extraction fails
            streams.push(new StreamEntity({
              name: `StreamSports99`,
              title: ch.channel_name || `VIP Stream ${idx + 1} (Web Player)`,
              externalUrl: ch.url,
              resolution: 'HD'
            }));
          }
        }
      }
    } catch (err) {
      console.error(`[${this.name}] resolveStream failed for ${sourceId}:`, err.message);
    }
    return streams;
  }
}

module.exports = StreamSports99Provider;
