class MatchAggregator {
  constructor({ streamFreeProvider, timStreamsProvider, binTvProvider, ntvProvider, iptvOrgProvider, sportyHunterProvider, streamSportsProvider, watchFootyProvider, cdnLiveProvider, streamSports99Provider, ppvDomainsProvider, streamicProvider, cacheService, yamlProviders }) {
    this.providers = [streamFreeProvider, timStreamsProvider, binTvProvider, ntvProvider, iptvOrgProvider, sportyHunterProvider, streamSportsProvider, watchFootyProvider, cdnLiveProvider, streamSports99Provider, ppvDomainsProvider, streamicProvider, ...(yamlProviders || [])];
    this.cacheService = cacheService;
  }

  isSameEvent(e1, e2) {
    if (e1.category && e2.category && e1.category !== 'other' && e2.category !== 'other' && e1.category !== e2.category) {
      return false;
    }
    const d1 = parseInt(e1.date) || 0;
    const d2 = parseInt(e2.date) || 0;
    if (d1 && d2 && Math.abs(d1 - d2) > 86400000) return false;
    if (e1.id === e2.id) return true;

    const words1 = e1.title.toLowerCase().replace(/[^a-z0-9]/g, ' ').split(' ').filter(w => w.length > 2);
    const words2 = e2.title.toLowerCase().replace(/[^a-z0-9]/g, ' ').split(' ').filter(w => w.length > 2);
    
    let matches = 0;
    for (const w of words1) {
      if (words2.includes(w)) matches++;
    }
    const similarity = matches / Math.max(words1.length, words2.length, 1);
    return similarity >= 0.4;
  }

  async syncMatches() {
    console.log('[MatchAggregator] Fetching from all providers...');
    
    // Fetch all providers in parallel
    const results = await Promise.allSettled(this.providers.map(p => p.getMatches()));
    
    const finalMatches = [];

    // Map arrays into dictionaries for easier merging
    results.forEach((promiseResult, providerIndex) => {
      if (promiseResult.status === 'fulfilled') {
        const providerMatches = promiseResult.value;
        providerMatches.forEach(match => {
          if (!match.id || !match.title) return;
          
          const existing = finalMatches.find(m => this.isSameEvent(m, match));
          
          if (!existing) {
            finalMatches.push(match);
          } else {
            // Merge sources
            if (match.sources && Array.isArray(match.sources)) {
              match.sources.forEach(src => {
                if (!existing.sources.find(s => s.id === src.id && s.source === src.source)) {
                  existing.sources.push(src);
                }
              });
            }
            // Prefer popular = '1'
            if (match.popular === '1') {
              existing.popular = '1';
            }
            // Prefer metadata if existing lacks it
            if (!existing.poster && match.poster) existing.poster = match.poster;
            if (!existing.logo && match.logo) existing.logo = match.logo;
          }
        });
      } else {
        console.error(`[MatchAggregator] Provider ${providerIndex} failed:`, promiseResult.reason);
      }
    });
    
    const now = Date.now();
    // Smart Trending Engine: Boost popular matches globally, but only if they are actually live or starting soon
    const TRENDING_KEYWORDS = ['real madrid', 'barcelona', 'manchester', 'arsenal', 'liverpool', 'chelsea', 'bayern', 'psg', 'lakers', 'warriors', 'mcgregor', 'super bowl', 'champions league', 'el clasico', 'f1', 'formula 1', 'grand prix'];
    
    finalMatches.forEach(match => {
      const titleLower = match.title.toLowerCase();
      
      // Parse kickoff date (default to 0 if none provided, assume live)
      let kickoff = 0;
      if (match.date) {
        const parsed = Number(match.date);
        kickoff = isNaN(parsed) ? new Date(match.date).getTime() : parsed;
        if (isNaN(kickoff)) kickoff = 0;
      }
      // Allow matches to be flagged as 'Live' from 3 hours before kickoff up to 14 hours after kickoff
      const isWithinTimeWindow = kickoff === 0 || (now >= kickoff - (3 * 3600 * 1000) && now <= kickoff + (14 * 3600 * 1000));
      
      if (TRENDING_KEYWORDS.some(kw => titleLower.includes(kw))) {
        if (isWithinTimeWindow) {
          match.popular = '1';
        }
      }
      
      // GLOBAL FIX: Some providers (like Streamed.pk) flag future events as popular/live early.
      // We must override and strip the popular flag if the event is too far in the future.
      if (match.popular === '1' && kickoff > 0 && !isWithinTimeWindow) {
        match.popular = '0';
      }
    });

    // Filter out matches that are already over (kickoff was > 24 hours ago)
    const activeMatches = finalMatches.filter(match => {
      let kickoff = 0;
      if (match.date) {
        const parsed = Number(match.date);
        kickoff = isNaN(parsed) ? new Date(match.date).getTime() : parsed;
        if (isNaN(kickoff)) kickoff = 0;
      }
      if (kickoff === 0) return true; // Keep if we don't know the time
      
      const oneDayMs = 24 * 3600 * 1000;
      return now <= kickoff + oneDayMs;
    });

    console.log(`[MatchAggregator] Sync complete. Merged ${activeMatches.length} active events.`);
    if (activeMatches.length > 0) {
      this.cacheService.setMatches(activeMatches);
    }
    return activeMatches;
  }
}

module.exports = MatchAggregator;
