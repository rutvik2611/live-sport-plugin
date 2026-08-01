const BaseProvider = require('./BaseProvider');
const MatchEntity = require('../domain/MatchEntity');
const StreamEntity = require('../domain/StreamEntity');

class PpvDomainsProvider extends BaseProvider {
  constructor(opts) {
    super(opts);
    this.name = 'PpvDomains';
    this.apiUrl = 'https://api.ppv.st/api/streams';
    // Wrap the fetch with our circuit breaker
    this.fetchData = this.circuitBreaker.wrap(`${this.name}_fetch`, async () => {
      const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };
      const res = await fetch(this.apiUrl, { headers, signal: AbortSignal.timeout(7000) });
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      return await res.json();
    });
  }

  async getMatches() {
    const matches = [];
    try {
      const data = await this.fetchData.fire();
      if (!data || !data.streams || !data.success) return [];

      data.streams.forEach(categoryObj => {
        const categoryName = this.normalizeCategory(categoryObj.category);
        
        if (Array.isArray(categoryObj.streams)) {
          categoryObj.streams.forEach(s => {
            const id = s.id.toString();
            // Ppv returns teams in the name usually e.g. "Team A vs. Team B"
            let team1 = null, team2 = null;
            if (s.name && s.name.includes(' vs. ')) {
               const parts = s.name.split(' vs. ');
               team1 = parts[0].trim();
               team2 = parts[1].trim();
            }

            matches.push(new MatchEntity({
              id: id,
              title: s.name,
              category: categoryName,
              date: s.starts_at ? (s.starts_at * 1000).toString() : null,
              popular: (parseInt(s.viewers || '0') > 100) ? '1' : '0',
              league: s.tag || categoryName,
              team1: team1,
              team2: team2,
              thumbnail_url: s.poster,
              sources: [{ source: 'ppvdomains', id: id, iframe: s.iframe }]
            }));
          });
        }
      });
    } catch (error) {
      console.error(`[${this.name}] Error fetching matches:`, error.message);
    }
    return matches;
  }

  async resolveStream(sourceId, matchCategory, matchTitle, extraData) {
    try {
      if (!extraData || !extraData.iframe) return [];
      
      return [new StreamEntity({
        name: 'PPV Domains',
        title: `Watch via Web Browser (PPV)`,
        externalUrl: extraData.iframe
      })];
    } catch (error) {
      console.error(`[${this.name}] resolveStream failed for ${sourceId}:`, error.message);
      return [];
    }
  }
}

module.exports = PpvDomainsProvider;
