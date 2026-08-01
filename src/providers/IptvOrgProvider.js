const axios = require('axios');
const BaseProvider = require('./BaseProvider');
const MatchEntity = require('../domain/MatchEntity');
const StreamEntity = require('../domain/StreamEntity');

class IptvOrgProvider extends BaseProvider {
  constructor(opts) {
    super(opts);
    this.name = 'IptvOrg';
    
    // We fetch two endpoints
    this.channelsUrl = 'https://iptv-org.github.io/api/channels.json';
    this.streamsUrl = 'https://iptv-org.github.io/api/streams.json';

    this.fetchData = this.circuitBreaker.wrap(`${this.name}_fetch`, async () => {
      const [channelsRes, streamsRes] = await Promise.all([
        axios.get(this.channelsUrl, { timeout: 10000 }),
        axios.get(this.streamsUrl, { timeout: 10000 })
      ]);
      return { channels: channelsRes.data, streams: streamsRes.data };
    });
  }

  async getMatches() {
    const matches = [];
    try {
      const data = await this.fetchData.fire();
      if (!data || !data.channels || !data.streams) return [];

      // 1. Get major English sports channels
      const keywords = ['espn', 'sky', 'fox', 'bein', 'eurosport', 'btsport', 'tnt', 'nbc', 'cbs', 'abc', 'tsn', 'sportsnet', 'nfl', 'nba', 'mlb', 'nhl', 'wwe', 'ufc', 'optus', 'super sport'];
      const sportsChannels = data.channels.filter(c => {
        if (!c.categories || !c.categories.includes('sports') || c.closed) return false;
        if (!c.name) return false;
        const nameLower = c.name.toLowerCase();
        return keywords.some(kw => nameLower.includes(kw));
      });

      // 2. Map channel ID to channel info
      const channelMap = new Map();
      sportsChannels.forEach(c => channelMap.set(c.id, c));

      // 3. Find active streams for these channels
      const activeChannels = new Map(); // Map to store MatchEntity per channel
      
      data.streams.forEach(s => {
        if (!s.channel || !channelMap.has(s.channel)) return;
        // Don't include YouTube streams or geo-blocked ones if possible, but for now we include all
        if (s.status === 'error' || s.status === 'timeout') return;

        const cInfo = channelMap.get(s.channel);
        
        if (!activeChannels.has(s.channel)) {
          activeChannels.set(s.channel, new MatchEntity({
            id: `iptv_${s.channel}`,
            title: cInfo.name || s.channel,
            category: 'networks',
            date: '0', // 24/7 channel
            popular: cInfo.country === 'US' || cInfo.country === 'UK' ? '1' : '0', // Boost English networks
            league: `Live TV (${cInfo.country})`,
            thumbnail_url: cInfo.logo,
            sources: []
          }));
        }

        const match = activeChannels.get(s.channel);
        match.sources.push({
          source: 'iptv-org',
          id: s.url,
          url: s.url,
          quality: s.quality || 'Auto',
          user_agent: s.user_agent,
          referrer: s.referrer
        });
      });

      return Array.from(activeChannels.values());
    } catch (error) {
      console.error(`[${this.name}] Error fetching matches:`, error.message);
    }
    return [];
  }

  async resolveStream(sourceId, matchCategory, matchTitle) {
    // IptvOrg sources are direct M3U8 links. 
    return [new StreamEntity({
      name: 'Direct Stream',
      title: matchTitle,
      url: sourceId
    })];
  }
}

module.exports = IptvOrgProvider;
