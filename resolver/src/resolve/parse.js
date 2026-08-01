import { embedOrigin } from '../env.js'
import { fetchLinks, pickLink } from '../streamed/match.js'
import { loadWatch, parseWatchPath } from '../streamed/watch.js'
import { makeSlot } from './slot.js'

const embedRe = /^\/embed\/([^/]+)\/([^/]+)\/(\d+)\/?$/
const streamRe = /^\/api\/stream\/([^/]+)\/([^/]+)\/?$/

function parseUrl(raw) {
  const s = String(raw || '').trim()
  if (!s) throw new Error('url required')
  try {
    return new URL(s)
  } catch {
    throw new Error('invalid url')
  }
}

function isStreamed(host) {
  return host === 'streamed.pk' || host.endsWith('.streamed.pk')
}

function isEmbed(host) {
  return host.includes('embed.')
}

async function fromApi(source, id, streamNo) {
  if (streamNo == null || streamNo === '') throw new Error('stream number required')
  const link = pickLink(await fetchLinks(source, id), streamNo)
  return makeSlot(embedOrigin, link.source, link.id, link.streamNo)
}

export async function parseInput(raw) {
  const url = parseUrl(raw)

  const watch = parseWatchPath(url.pathname)
  if (watch && isStreamed(url.hostname)) return (await loadWatch(watch.matchId, watch.source, watch.stream)).slot

  const em = url.pathname.match(embedRe)
  if (em && isEmbed(url.hostname)) return makeSlot(url.origin, em[1], em[2], em[3])

  const api = url.pathname.match(streamRe)
  if (api && isStreamed(url.hostname)) return fromApi(api[1], api[2], url.searchParams.get('stream'))

  throw new Error('expected /watch/{id}/{source}/{n} or embed.st /embed/{source}/{id}/{n}')
}
