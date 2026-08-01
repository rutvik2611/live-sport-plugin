const axios = require('axios');
const cheerio = require('cheerio');
const BaseProvider = require('./BaseProvider');
const MatchEntity = require('../domain/MatchEntity');
const StreamEntity = require('../domain/StreamEntity');

const { BASE_URL } = require('../config');

class NtvProvider extends BaseProvider {
  constructor({ circuitBreaker }) {
    super({ circuitBreaker });
    this.name = 'NTV';
    this.baseUrl = 'http://ntv.cx';
    
    this.fetchData = this.circuitBreaker.wrap(`${this.name}_fetch`, async (url) => {
      const res = await axios.get(url, { timeout: 15000 });
      return res.data;
    });
  }

  async getMatches() {
    const matches = [];
    try {
      const html = await this.fetchData.fire(this.baseUrl);
      if (!html) return [];

      const $ = cheerio.load(html);
      
      // NTV might categorize by servers or lists
      $('.server-list a.server-link').each((i, el) => {
        const link = $(el).attr('href');
        const serverName = $(el).find('.server-name').text().trim();
        
        if (link) {
          matches.push(new MatchEntity({
            id: `ntv_${i}`,
            title: `NTV ${serverName || `Server ${i}`}`,
            category: 'other',
            popular: '0',
            sources: [{ source: 'ntv', id: link, url: `${this.baseUrl}${link}` }]
          }));
        }
      });
      
    } catch (error) {
      console.error(`[${this.name}] Error fetching matches:`, error.message);
    }
    return matches;
  }

  async resolveStream(sourceId, matchCategory, matchTitle) {
    // We will pass the NTV page URL directly to the Web Player,
    // or if we had time we would scrape the iframe from that page.
    const watchUrl = sourceId.startsWith('http') ? sourceId : `${this.baseUrl}${sourceId.startsWith('/') ? '' : '/'}${sourceId}`;
    return [new StreamEntity({
      name: 'Nuvio Web Player',
      title: `NTV Stream`,
      externalUrl: watchUrl
    })];
  }
}

module.exports = NtvProvider;
