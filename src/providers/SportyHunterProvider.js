const axios = require('axios');
const cheerio = require('cheerio');
const BaseProvider = require('./BaseProvider');
const MatchEntity = require('../domain/MatchEntity');
const StreamEntity = require('../domain/StreamEntity');

const { BASE_URL } = require('../config');

class SportyHunterProvider extends BaseProvider {
  constructor({ circuitBreaker }) {
    super({ circuitBreaker });
    this.name = 'SportyHunter';
    this.baseUrl = 'https://sportyhunter.xyz';
    
    this.fetchData = this.circuitBreaker.wrap(`${this.name}_fetch`, async () => {
      const res = await axios.get(this.baseUrl, { timeout: 8000 });
      return res.data;
    });
  }

  async getMatches() {
    const matches = [];
    try {
      const html = await this.fetchData.fire();
      if (!html) return [];

      const $ = cheerio.load(html);
      
      // Next.js injects page data into a script tag
      const nextDataJson = $('#__NEXT_DATA__').html();
      if (nextDataJson) {
        const nextData = JSON.parse(nextDataJson);
        const pageProps = nextData?.props?.pageProps || {};
        const matchesData = pageProps?.matches || [];
        
        matchesData.forEach((m, index) => {
          matches.push(new MatchEntity({
            id: `sporty_${m.id || index}`,
            title: m.title || m.name || `Sporty Match ${index}`,
            category: (m.sport || 'other').toLowerCase(),
            date: m.timestamp || m.date || null,
            popular: '0',
            sources: [{ source: 'sportyhunter', id: m.id || index, url: m.url || m.streamUrl }]
          }));
        });
      } else {
        // Fallback: If they moved away from pages router to app router, __NEXT_DATA__ won't exist.
        // We just return empty array gracefully.
      }
      
    } catch (error) {
      console.error(`[${this.name}] Error fetching matches:`, error.message);
    }
    return matches;
  }

  async resolveStream(sourceId, matchCategory, matchTitle) {
    // Return external web player link for now
    return [new StreamEntity({
      name: 'Nuvio Web Player',
      title: `SportyHunter Stream`,
      externalUrl: `${this.baseUrl}/match/${sourceId}`
    })];
  }
}

module.exports = SportyHunterProvider;
