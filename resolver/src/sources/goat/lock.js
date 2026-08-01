import { Worker } from 'node:worker_threads'

const workerUrl = new URL('./lock-worker.js', import.meta.url)

class Semaphore {
  constructor(max) {
    this.max = max;
    this.active = 0;
    this.queue = [];
  }
  async acquire() {
    if (this.active < this.max) {
      this.active++;
      return;
    }
    return new Promise(resolve => this.queue.push(resolve));
  }
  release() {
    if (this.queue.length > 0) {
      const resolve = this.queue.shift();
      resolve();
    } else {
      this.active--;
    }
  }
}

// Max 2 concurrent workers to prevent OOM on 512MB RAM servers
const lockSemaphore = new Semaphore(2);

export async function unlock(slot, goat, body) {
  await lockSemaphore.acquire();
  try {
    return await new Promise((resolve, reject) => {
      const worker = new Worker(workerUrl, {
        workerData: { slot, goat, bodyHex: body.toString('hex') },
      })
      
      const timer = setTimeout(() => {
        worker.terminate().catch(() => {})
        reject(new Error('lock worker timeout'))
      }, 12000)

      worker.once('message', (msg) => {
        clearTimeout(timer)
        worker.terminate().catch(() => {})
        if (msg.ok) resolve(msg.url)
        else reject(new Error(msg.error || 'lock decrypt failed'))
      })
      
      worker.once('error', (err) => {
        clearTimeout(timer)
        worker.terminate().catch(() => {})
        reject(err)
      })
    })
  } finally {
    lockSemaphore.release();
  }
}
