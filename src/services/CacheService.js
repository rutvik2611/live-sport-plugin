class CacheService {
  constructor() {
    this.cachedMatches = [];
    this.lastFetchTime = 0;
    this.CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  }

  getMatches() {
    return this.cachedMatches;
  }

  setMatches(matches) {
    this.cachedMatches = matches;
    this.lastFetchTime = Date.now();
  }

  isStale() {
    return (Date.now() - this.lastFetchTime) > this.CACHE_TTL;
  }
}

module.exports = CacheService;
