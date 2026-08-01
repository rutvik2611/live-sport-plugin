const BaseProvider = require('./BaseProvider');
const MatchEntity = require('../domain/MatchEntity');
const StreamEntity = require('../domain/StreamEntity');

class StreamicProvider extends BaseProvider {
  constructor(opts) {
    super(opts);
    this.name = 'Streamic';
    this.apiUrl = 'https://streamic.st/api/J.php';
    this.fetchData = this.circuitBreaker.wrap(`${this.name}_fetch`, async () => {
      const headers = { 'User-Agent': 'Mozilla/5.0' };
      const res = await fetch(this.apiUrl, { headers, signal: AbortSignal.timeout(7000) });
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      return await res.json();
    });
  }

  async getMatches() {
    const matches = [];
    try {
      const data = await this.fetchData.fire();
      if (!Array.isArray(data)) return [];

      data.forEach(s => {
        const id = s.id ? s.id.toString() : '';
        if (!id) return;

        const categoryName = this.normalizeCategory(s.category);

        let team1 = null, team2 = null;
        if (s.title && s.title.includes(' - ')) {
           const parts = s.title.split(' - ');
           team1 = parts[0].trim();
           team2 = parts[1].trim();
        } else if (s.title && s.title.includes(' vs ')) {
           const parts = s.title.split(' vs ');
           team1 = parts[0].trim();
           team2 = parts[1].trim();
        }

        matches.push(new MatchEntity({
          id: id,
          title: s.title,
          category: categoryName,
          date: s.startTime ? (s.startTime * 1000).toString() : null,
          popular: '0',
          league: s.league || categoryName,
          team1: team1,
          team2: team2,
          sources: [{ source: 'streamic', id: id, _embeds: s._embeds || [] }]
        }));
      });
    } catch (error) {
      console.error(`[${this.name}] Error fetching matches:`, error.message);
    }
    return matches;
  }

  async resolveStream(sourceId, matchCategory, matchTitle, extraData) {
    try {
      if (!extraData || !extraData._embeds) return [];
      
      const streams = [];
      extraData._embeds.forEach(embedGroup => {
        const lang = embedGroup.language || 'Unknown';
        if (Array.isArray(embedGroup.embeds)) {
          embedGroup.embeds.forEach((e, idx) => {
            if (e.embed) {
              streams.push(new StreamEntity({
                name: 'Streamic',
                title: `${lang} ${e.label ? '(' + e.label + ')' : ''}`,
                externalUrl: e.embed
              }));
            }
          });
        }
      });
      return streams;
    } catch (error) {
      console.error(`[${this.name}] resolveStream failed for ${sourceId}:`, error.message);
      return [];
    }
  }
}

module.exports = StreamicProvider;
