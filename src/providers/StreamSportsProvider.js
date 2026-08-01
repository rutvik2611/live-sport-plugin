const axios = require('axios');
const BaseProvider = require('./BaseProvider');
const MatchEntity = require('../domain/MatchEntity');
const StreamEntity = require('../domain/StreamEntity');

const { BASE_URL } = require('../config');

class StreamSportsProvider extends BaseProvider {
  constructor({ circuitBreaker }) {
    super({ circuitBreaker });
    this.name = 'StreamSports99';
    this.apiUrl = 'https://api.cdnlivetv.is/matches'; // Assumed endpoint based on standard patterns
    
    this.fetchData = this.circuitBreaker.wrap(`${this.name}_fetch`, async () => {
      const res = await axios.get(this.apiUrl, { timeout: 8000 });
      return res.data;
    });
  }

  async getMatches() {
    const matches = [];
    try {
      const data = await this.fetchData.fire();
      if (!Array.isArray(data)) return [];

      data.forEach((m, index) => {
        matches.push(new MatchEntity({
          id: `streamsports_${m.id || index}`,
          title: m.title || m.name || `StreamSports Match ${index}`,
          category: (m.sport || 'other').toLowerCase(),
          date: m.timestamp || m.date || null,
          popular: '0',
          sources: [{ source: 'streamsports', id: m.id || index, url: m.url || m.streamUrl }]
        }));
      });
      
    } catch (error) {
      console.error(`[${this.name}] Error fetching matches:`, error.message);
    }
    return matches;
  }

  async resolveStream(sourceId, matchCategory, matchTitle) {
    // Return external web player link for now
    return [new StreamEntity({
      name: 'Nuvio Web Player',
      title: `StreamSports99 Stream`,
      externalUrl: `https://streamsports99.ru/match/${sourceId}`
    })];
  }
}

module.exports = StreamSportsProvider;
