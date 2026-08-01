const BaseProvider = require('./BaseProvider');
const MatchEntity = require('../domain/MatchEntity');
const StreamEntity = require('../domain/StreamEntity');

class WatchFootyProvider extends BaseProvider {
  constructor(opts) {
    super(opts);
    this.name = 'WatchFooty';
    this.apiUrl = 'https://api.watchfooty.st/api/v1/matches/football';
    
    this.fetchMain = this.circuitBreaker.wrap(`${this.name}_fetchMain`, async () => {
      const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };
      const res = await fetch(this.apiUrl, { headers, signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      return await res.json();
    });

    this.fetchMatchDetails = this.circuitBreaker.wrap(`${this.name}_fetchMatch`, async (matchId) => {
      const url = `https://api.watchfooty.st/api/v1/match/${matchId}`;
      const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      return await res.json();
    });
  }

  async getMatches() {
    const matches = [];
    try {
      const data = await this.fetchMain.fire();
      
      if (Array.isArray(data)) {
        for (const item of data) {
          const matchId = item.matchId;
          const title = item.title || `${item.teams?.home?.name || 'Home'} vs ${item.teams?.away?.name || 'Away'}`;
          let status = 'upcoming';
          
          if (item.status === 'in' || item.status === 'live') {
            status = 'live';
          } else if (item.status === 'post' || item.status === 'postponed' || item.status === 'cancelled') {
            status = 'finished'; // Or upcoming, but we ignore finished usually
          }

          const matchTime = item.timestamp ? new Date(item.timestamp).getTime() : Date.now();
          
          // WatchFooty is mostly football
          const category = 'football';

          matches.push(new MatchEntity({
            id: `wf_${matchId}`,
            title: title,
            category: category,
            status: status,
            timestamp: matchTime,
            sources: [{ source: 'watchfooty', id: matchId }]
          }));
        }
      }
    } catch (err) {
      console.error(`[${this.name}] Failed to get matches:`, err.message);
    }
    return matches;
  }

  async resolveStream(sourceId, matchCategory, matchTitle) {
    const streams = [];
    try {
      const data = await this.fetchMatchDetails.fire(sourceId);
      const match = Array.isArray(data) ? data[0] : data;
      
      if (match && match.streams && Array.isArray(match.streams)) {
        match.streams.forEach((s, idx) => {
          if (s.url) {
            const isDirect = s.url.includes('.m3u8') || s.url.includes('.mp4');
            const entityParams = {
              name: `WatchFooty`,
              title: `WatchFooty Stream ${idx + 1}`,
              resolution: s.quality ? String(s.quality).toUpperCase() : 'SD'
            };
            
            if (isDirect) {
              entityParams.url = s.url;
            } else {
              entityParams.externalUrl = `/watch?url=${encodeURIComponent(s.url)}&title=${encodeURIComponent(matchTitle || 'WatchFooty')}`;
            }
            
            streams.push(new StreamEntity(entityParams));
          }
        });
      }
    } catch (err) {
      console.error(`[${this.name}] resolveStream failed for ${sourceId}:`, err.message);
    }
    return streams;
  }
}

module.exports = WatchFootyProvider;
