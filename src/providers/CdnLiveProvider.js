const BaseProvider = require('./BaseProvider');
const MatchEntity = require('../domain/MatchEntity');
const StreamEntity = require('../domain/StreamEntity');

class CdnLiveProvider extends BaseProvider {
  constructor(opts) {
    super(opts);
    this.name = 'CDNLiveTV';
    this.apiUrl = 'https://api.cdnlivetv.tv/api/v1/events/sports/?user=cdnlivetv&plan=free';
    
    this.fetchMain = this.circuitBreaker.wrap(`${this.name}_fetchMain`, async () => {
      const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };
      const res = await fetch(this.apiUrl, { headers, signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      return await res.json();
    });
  }

  async getMatches() {
    const matches = [];
    try {
      const data = await this.fetchMain.fire();
      const sportsData = data?.['cdn-live-tv'] || {};
      
      // CDNLive mostly provides Football/Soccer
      const soccerEvents = sportsData['Soccer'] || sportsData['Football'] || [];
      
      if (Array.isArray(soccerEvents)) {
        for (const item of soccerEvents) {
          const matchId = item.gameID || `${item.homeTeam}-vs-${item.awayTeam}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
          const title = `${item.homeTeam || ''} vs ${item.awayTeam || ''}`;
          
          let status = 'upcoming';
          if (item.status === 'live' || item.status === 'in') status = 'live';

          const matchTime = item.start ? new Date(item.start).getTime() : Date.now();

          matches.push(new MatchEntity({
            id: `cdn_${matchId}`,
            title: title,
            category: 'football',
            status: status,
            timestamp: matchTime,
            sources: [{ source: 'cdnlive', id: matchId }]
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
      // Re-fetch (or use cache if circuitBreaker had a cache, but it doesn't. Since it's called 
      // individually, we fetch. In real production we might cache this in cacheService)
      const data = await this.fetchMain.fire();
      const sportsData = data?.['cdn-live-tv'] || {};
      const soccerEvents = sportsData['Soccer'] || sportsData['Football'] || [];
      
      const item = soccerEvents.find(e => 
        (e.gameID === sourceId) || 
        (`${e.homeTeam}-vs-${e.awayTeam}`.toLowerCase().replace(/[^a-z0-9-]/g, '-') === sourceId)
      );

      if (item && item.channels && Array.isArray(item.channels)) {
        item.channels.forEach((ch, idx) => {
          if (ch.url) {
            streams.push(new StreamEntity({
              name: `CDNLiveTV`,
              title: ch.channel_name || `CDNLive Stream ${idx + 1}`,
              url: ch.url,
              resolution: 'HD'
            }));
          }
        });
      }
    } catch (err) {
      console.error(`[${this.name}] resolveStream failed for ${sourceId}:`, err.message);
    }
    return streams;
  }
}

module.exports = CdnLiveProvider;
