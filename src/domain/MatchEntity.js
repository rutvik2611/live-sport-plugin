class MatchEntity {
  constructor({ id, title, category, date, popular, sources, league, team1, team2, thumbnail_url }) {
    this.id = id || '';
    this.title = title || 'Unknown Match';
    this.category = category || 'other';
    
    // Normalize date to unix timestamp string
    if (date && !isNaN(parseInt(date))) {
      this.date = date.toString();
    } else {
      this.date = Date.now().toString(); 
    }
    
    this.popular = popular === '1' || popular === true ? '1' : '0';
    this.sources = Array.isArray(sources) ? sources : [];
    this.league = league || '';
    this.team1 = team1 || null;
    this.team2 = team2 || null;
    this.thumbnail_url = thumbnail_url || '';
  }
}

module.exports = MatchEntity;
