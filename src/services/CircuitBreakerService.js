const CircuitBreaker = require('opossum');

class CircuitBreakerService {
  constructor() {
    this.breakers = new Map();
  }

  /**
   * Wraps an async function in a circuit breaker.
   * If the function fails 3 times, the breaker opens and trips immediately
   * for the next 5 minutes without hitting the actual endpoint.
   */
  wrap(name, asyncFunction) {
    if (this.breakers.has(name)) {
      return this.breakers.get(name);
    }

    const options = {
      timeout: 20000, // If function takes longer than 20 seconds, trigger a failure
      errorThresholdPercentage: 50, // When 50% of requests fail, trip the circuit
      resetTimeout: 5 * 60 * 1000, // After 5 minutes, try again
      volumeThreshold: 3 // Wait for at least 3 failures before tripping
    };

    const breaker = new CircuitBreaker(asyncFunction, options);
    
    breaker.fallback((err) => {
      const reason = err ? err.message : 'Unknown';
      console.warn(`[CircuitBreaker] ${name} Fallback triggered. Reason: ${reason}`);
      return null;
    });

    breaker.on('open', () => console.warn(`[CircuitBreaker] ${name} TRIPPED OPEN.`));
    breaker.on('halfOpen', () => console.info(`[CircuitBreaker] ${name} HALF-OPEN. Testing recovery.`));
    breaker.on('close', () => console.info(`[CircuitBreaker] ${name} CLOSED. Fully recovered.`));

    this.breakers.set(name, breaker);
    return breaker;
  }
}

module.exports = CircuitBreakerService;
