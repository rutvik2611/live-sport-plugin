const BaseProvider = require('./BaseProvider');
const MatchEntity = require('../domain/MatchEntity');
const StreamEntity = require('../domain/StreamEntity');
const { BASE_URL } = require('../config');

class Strims24Provider extends BaseProvider {
  constructor(opts) {
    super(opts);
    this.name = 'Strims24';
    this.baseUrl = 'https://strims24.pl';
    this.flashBase = 'https://1.newsoccers.one/2/x/feed';
    this.flashSign = 'SW9D1eZo';

    this.sports = ['football', 'basketball', 'tennis', 'mma', 'motorsport'];
    
    this.SPORT_FS_ID = {
      football: 1, tennis: 2, basketball: 3, hockey: 4, nfl: 5, baseball: 6,
      handball: 7, futsal: 11, volleyball: 12, cricket: 13, darts: 14,
      snooker: 15, boxing: 16, mma: 28, motorsport: 31, 'winter-sports': 37,
      cycling: 34, golf: 23, waterpolo: 0
    };

    this.fetchData = this.circuitBreaker.wrap(`${this.name}_fetch`, async (url, headers = {}) => {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      return res;
    });
  }

  getTodayDate() {
    return new Date().toISOString().slice(0, 10);
  }

  tviKey(n) {
    return String(n).replace(/^0+(\d)/, "$1");
  }

  parseTvChannels(alField) {
    if (!alField) return [];
    try {
      const parsed = JSON.parse(alField);
      const tvChannels = parsed['1'] || [];
      return tvChannels.filter(ch => ch && ch.TVI).map(ch => this.tviKey(String(ch.TVI)));
    } catch { return []; }
  }

  parseFlashData(text, sport) {
    if (!text) return [];
    const isEventBased = sport === 'motorsport';
    const rows = text.split('~');
    const events = [];
    let currentTournament = null;

    rows.forEach((row, idx) => {
      if (idx === 0 || !row) return;
      const cells = row.split('¬');
      const data = {};
      for (const cell of cells) {
        const [k, v] = cell.split('÷');
        if (k && v != null) data[k] = v;
      }

      if (data.ZA) {
        if (isEventBased && data.ZW !== '1') {
          const zn = (data.ZN || '').split('|');
          const startTime = parseInt(zn[0] || '0', 10);
          events.push({
            id: data.ZC || data.ZEE || `mtr-${idx}`,
            tournamentName: data.ZA,
            homeTeam: '',
            awayTeam: '',
            eventTitle: data.ZA,
            startTime,
            tvChannelIds: []
          });
          currentTournament = null;
          return;
        }

        let leagueName = data.ZA;
        if (data.ZA.includes(':')) {
          const [c, l] = data.ZA.split(':');
          leagueName = l ? l.trim() : data.ZA;
        }
        currentTournament = { name: leagueName };
        return;
      }

      if (data.AA && currentTournament) {
        events.push({
          id: data.AA,
          tournamentName: currentTournament.name,
          homeTeam: data.CX || data.AE || '',
          awayTeam: data.AF || '',
          startTime: parseInt(data.AD || '0', 10),
          tvChannelIds: this.parseTvChannels(data.AL),
        });
      }
    });
    return events;
  }

  async fetchFlashscore(sport) {
    const sportId = this.SPORT_FS_ID[sport];
    if (sportId === undefined) return [];
    const prefix = sport === 'motorsport' ? 'fp_' : 'f_';
    const url = `${this.flashBase}/${prefix}${sportId}_0_2_en_1`;
    try {
      const res = await this.fetchData.fire(url, { 'x-fsign': this.flashSign, accept: '*/*' });
      if (!res) return [];
      const text = await res.text();
      return this.parseFlashData(text, sport);
    } catch (e) {
      console.error(`[${this.name}] Failed to fetch flashscore for ${sport}`, e.message);
      return [];
    }
  }

  async fetchStrimsMatches(sport, date) {
    try {
      const url = `${this.baseUrl}/api/v1/${sport}/${date}`;
      const res = await this.fetchData.fire(url);
      if (!res) return [];
      const data = await res.json();
      return Array.isArray(data.items) ? data.items : [];
    } catch (e) {
      console.error(`[${this.name}] Failed to fetch strims matches for ${sport}`, e.message);
      return [];
    }
  }

  async fetchStrimsChannels() {
    try {
      const res = await this.fetchData.fire(`${this.baseUrl}/api/v1/channels`);
      if (!res) return {};
      const data = await res.json();
      const arr = Array.isArray(data) ? data : (data && Array.isArray(data.items)) ? data.items : (data && Array.isArray(data.channels)) ? data.channels : [];
      const userChannels = {};
      for (const ch of arr) {
        if (!ch) continue;
        if (ch.FS) {
          const m = ch.FS.match(/TVI(\d+)/);
          if (m) userChannels[this.tviKey(m[1])] = ch;
        }
        if (ch.id != null) userChannels[String(ch.id)] = ch;
      }
      return userChannels;
    } catch (e) {
      console.error(`[${this.name}] Failed to fetch channels`, e.message);
      return {};
    }
  }

  async fetchMatchTvChannelIds(matchId) {
    try {
      const res = await this.fetchData.fire(`${this.flashBase}/df_dos_1_${matchId}_`, { 'x-fsign': this.flashSign, accept: '*/*' });
      if (!res) return [];
      const text = await res.text();
      const m = text.match(/AL÷(\{[^¬]+\})/);
      return m ? this.parseTvChannels(m[1]) : [];
    } catch (e) {
      return [];
    }
  }

  async getMatches() {
    const matches = [];
    try {
      const date = this.getTodayDate();
      const userChannels = await this.fetchStrimsChannels();

      for (const sport of this.sports) {
        const [flashRaw, backendMatches] = await Promise.all([
          this.fetchFlashscore(sport),
          this.fetchStrimsMatches(sport, date)
        ]);

        const manualFsIds = new Set();
        const customItems = [];
        for (const it of backendMatches) {
          if (typeof it.match_id !== 'string') continue;
          if (it.match_id.startsWith('FS:')) {
            manualFsIds.add(it.match_id.replace(/^FS:/, ''));
          } else {
            customItems.push(it);
          }
        }

        const haveChannels = Object.keys(userChannels).length > 0;

        for (const e of flashRaw) {
          const hasChannelMatch = haveChannels && e.tvChannelIds.some(id => userChannels[id]);
          const isManual = manualFsIds.has(e.id);
          
          if (hasChannelMatch || isManual) {
            const title = e.eventTitle || ((e.homeTeam && e.awayTeam) ? `${e.homeTeam} - ${e.awayTeam}` : (e.homeTeam || e.tournamentName));
            
            matches.push(new MatchEntity({
              id: `FS:${e.id}`,
              title: title,
              category: this.normalizeCategory(sport),
              date: e.startTime ? (e.startTime * 1000).toString() : Date.now().toString(),
              popular: '0',
              league: e.tournamentName,
              sources: [{ source: 'strims24', id: `FS:${e.id}`, original_sport: sport }]
            }));
          }
        }

        for (const it of customItems) {
           matches.push(new MatchEntity({
              id: it.match_id,
              title: it.name || it.match_id,
              category: this.normalizeCategory(sport),
              date: it.start_ts ? (it.start_ts * 1000).toString() : Date.now().toString(),
              popular: '0',
              sources: [{ source: 'strims24', id: it.match_id, original_sport: sport }]
            }));
        }
      }
    } catch (e) {
      console.error(`[${this.name}] Error in getMatches:`, e.message);
    }
    return matches;
  }

  async resolveStream(sourceId, matchCategory, matchTitle) {
    try {
      const streams = [];
      const cleanId = sourceId.replace(/^(FS:|CUST:)/, '');
      const isFs = sourceId.startsWith('FS:');

      const dbDetailRes = await this.fetchData.fire(`${this.baseUrl}/api/v1/match/${sourceId}`).catch(() => null);
      let dbDetail = null;
      if (dbDetailRes) dbDetail = await dbDetailRes.json();

      const userChannels = await this.fetchStrimsChannels();

      const channels = [];
      const disabledIds = new Set();
      const dbChannels = (dbDetail && Array.isArray(dbDetail.channels)) ? dbDetail.channels : [];

      for (const ch of dbChannels) {
        if (ch.enabled === false) {
          const sId = String(ch.id);
          const resolved = userChannels[sId] || userChannels[this.tviKey(sId.replace(/^TVI/, ''))];
          if (resolved) disabledIds.add(String(resolved.id));
        }
      }

      for (const ch of dbChannels) {
        if (ch.enabled === false) continue;
        const sId = String(ch.id);
        const resolved = userChannels[sId] || userChannels[this.tviKey(sId.replace(/^TVI/, ''))];
        if (!resolved) continue;
        channels.push({ id: resolved.id, name: resolved.name || ch.name });
      }

      if (isFs) {
        const feedTviIds = await this.fetchMatchTvChannelIds(cleanId);
        for (const tviId of feedTviIds) {
          const ch = userChannels[tviId];
          if (!ch) continue;
          if (disabledIds.has(String(ch.id))) continue;
          channels.push({ id: ch.id, name: ch.name });
        }
      }

      const seen = new Set();
      const uniqueChannels = channels.filter(c => {
        const k = String(c.id);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });

      for (const ch of uniqueChannels) {
        const embedUrl = `https://main.wwin.cloud/player/lean/${encodeURIComponent(ch.id)}`;
        streams.push(new StreamEntity({
          name: `Strims24 Channel`,
          title: ch.name || `Channel ${ch.id}`,
          externalUrl: `${BASE_URL}/watch?url=${encodeURIComponent(embedUrl)}&title=${encodeURIComponent(matchTitle || 'Live Event')}`
        }));
      }

      if (dbDetail && Array.isArray(dbDetail.custom_urls)) {
        for (const cu of dbDetail.custom_urls) {
          if (cu.enabled === false) continue;
          let embed = cu.url;
          if (!/^https?:\/\//i.test(embed)) {
             embed = `https://main.wwin.cloud${embed.startsWith('/') ? '' : '/'}${embed}`;
          }
          streams.push(new StreamEntity({
             name: `Strims24 Custom`,
             title: cu.name || `Custom ${cu.id}`,
             externalUrl: `${BASE_URL}/watch?url=${encodeURIComponent(embed)}&title=${encodeURIComponent(matchTitle || 'Live Event')}`
          }));
        }
      }

      return streams;
    } catch (e) {
      console.error(`[${this.name}] resolveStream failed for ${sourceId}:`, e.message);
      return [];
    }
  }
}

module.exports = Strims24Provider;
