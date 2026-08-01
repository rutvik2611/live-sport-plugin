const { createContainer, asClass, asValue, InjectionMode } = require('awilix');

const CacheService = require('./services/CacheService');
const CircuitBreakerService = require('./services/CircuitBreakerService');
const CronService = require('./services/CronService');
const M3U8ParserService = require('./services/M3U8ParserService');
const MatchAggregator = require('./services/MatchAggregator');
const StreamScoringService = require('./services/StreamScoringService');

const StreamFreeProvider = require('./providers/StreamFreeProvider');
const TimStreamsProvider = require('./providers/TimStreamsProvider');
const BinTvProvider = require('./providers/BinTvProvider');
const NtvProvider = require('./providers/NtvProvider');
const IptvOrgProvider = require('./providers/IptvOrgProvider');
const SportyHunterProvider = require('./providers/SportyHunterProvider');
const StreamSportsProvider = require('./providers/StreamSportsProvider');
const WatchFootyProvider = require('./providers/WatchFootyProvider');
const CdnLiveProvider = require('./providers/CdnLiveProvider');
const StreamSports99Provider = require('./providers/StreamSports99Provider');
const StreamicProvider = require('./providers/StreamicProvider');
const PpvDomainsProvider = require('./providers/PpvDomainsProvider');
const Strims24Provider = require('./providers/Strims24Provider');

const YamlProviderBuilder = require('./services/YamlProviderBuilder');

const container = createContainer({
  injectionMode: InjectionMode.PROXY
});

// Register Core Services
container.register({
  cacheService: asClass(CacheService).singleton(),
  circuitBreaker: asClass(CircuitBreakerService).singleton(),
  m3u8Parser: asClass(M3U8ParserService).singleton(),
  cronService: asClass(CronService).singleton(),
  matchAggregator: asClass(MatchAggregator).singleton(),
  streamScorer: asClass(StreamScoringService).singleton()
});

// Build dynamic YAML Providers
const yamlBuilder = new YamlProviderBuilder();
const yamlProviders = yamlBuilder.buildProviders(container, container.resolve('circuitBreaker'));

// Register Providers
container.register({
  streamFreeProvider: asClass(StreamFreeProvider).singleton(),
  timStreamsProvider: asClass(TimStreamsProvider).singleton(),
  binTvProvider: asClass(BinTvProvider).singleton(),
  ntvProvider: asClass(NtvProvider).singleton(),
  iptvOrgProvider: asClass(IptvOrgProvider).singleton(),
  sportyHunterProvider: asClass(SportyHunterProvider).singleton(),
  streamSportsProvider: asClass(StreamSportsProvider).singleton(),
  watchFootyProvider: asClass(WatchFootyProvider).singleton(),
  cdnLiveProvider: asClass(CdnLiveProvider).singleton(),
  streamSports99Provider: asClass(StreamSports99Provider).singleton(),
  streamicProvider: asClass(StreamicProvider).singleton(),
  ppvDomainsProvider: asClass(PpvDomainsProvider).singleton(),
  strims24Provider: asClass(Strims24Provider).singleton(),
  yamlProviders: asValue(yamlProviders)
});

module.exports = container;
