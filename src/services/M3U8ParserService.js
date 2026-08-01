const axios = require('axios');
const m3u8Parser = require('m3u8-parser');

class M3U8ParserService {
  constructor() {}

  /**
   * Fetches an m3u8 playlist, parses it, and returns the highest quality stream details
   */
  async getHighestQuality(manifestUrl) {
    try {
      const res = await axios.get(manifestUrl, { timeout: 5000 });
      const parser = new m3u8Parser.Parser();
      parser.push(res.data);
      parser.end();

      const playlists = parser.manifest.playlists || [];
      if (playlists.length === 0) return null;

      // Sort by bandwidth descending
      playlists.sort((a, b) => (b.attributes.BANDWIDTH || 0) - (a.attributes.BANDWIDTH || 0));
      
      const best = playlists[0];
      const resolution = best.attributes.RESOLUTION ? `${best.attributes.RESOLUTION.width}x${best.attributes.RESOLUTION.height}` : null;
      const bitrate = best.attributes.BANDWIDTH ? Math.round(best.attributes.BANDWIDTH / 100000) / 10 + 'Mbps' : null;
      
      // Extract Audio Languages
      let languages = [];
      const audioGroupId = best.attributes.AUDIO;
      if (audioGroupId && parser.manifest.mediaGroups && parser.manifest.mediaGroups.AUDIO) {
        const audioGroup = parser.manifest.mediaGroups.AUDIO[audioGroupId];
        if (audioGroup) {
          for (const key of Object.keys(audioGroup)) {
            const track = audioGroup[key];
            if (track.language) {
              languages.push(track.language.toUpperCase());
            } else if (track.name) {
              // Sometimes they use NAME="English" instead of LANGUAGE="en"
              languages.push(track.name.substring(0,2).toUpperCase());
            }
          }
        }
      }
      // Deduplicate
      languages = [...new Set(languages)];

      let label = '';
      if (resolution) label += resolution;
      if (bitrate) label += (label ? ' @ ' : '') + bitrate;
      if (languages.length > 0) label += ` [${languages.join(', ')}]`;

      return {
        resolution,
        bitrate,
        languages,
        label: label || 'Auto',
        uri: best.uri
      };
    } catch (e) {
      console.error('[M3U8Parser] Error parsing manifest:', e.message);
      return null;
    }
  }
}

module.exports = M3U8ParserService;
