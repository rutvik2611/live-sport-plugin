import { pullStream } from '../wire/curl.js'

const cache = new Map()
const nextMap = new Map()

export function setNextSegment(url, nextUrl) {
  nextMap.set(url, nextUrl)
  if (nextMap.size > 1000) {
    const firstKey = nextMap.keys().next().value
    nextMap.delete(firstKey)
  }
}

export function getNextSegment(url) {
  const nextUrl = nextMap.get(url)
  nextMap.delete(url)
  return nextUrl
}

export function prefetchSegment(url, slot) {
  if (cache.has(url)) return
  
  const promise = pullStream(url, slot).catch((err) => {
    cache.delete(url)
    throw err
  })

  cache.set(url, promise)
  
  if (cache.size > 5) {
    const firstKey = cache.keys().next().value
    cache.delete(firstKey)
  }
}

export function getPrefetched(url) {
  const promise = cache.get(url)
  if (promise) {
    cache.delete(url)
    return promise
  }
  return null
}
