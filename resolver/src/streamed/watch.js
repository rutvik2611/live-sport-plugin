import { embedOrigin, streamedOrigin } from '../env.js'
import { fetchJson } from './api.js'
import { fetchLinks, pickLink } from './match.js'
import { makeSlot } from '../resolve/slot.js'

const watchRe = /^\/watch\/([^/]+)\/([^/]+)\/(\d+)\/?$/

async function loadMatch(matchId) {
  const list = await fetchJson('/api/matches/all')
  if (!Array.isArray(list)) throw new Error('streamed.pk /api/matches/all invalid response')
  const match = list.find((item) => item.id === matchId)
  if (!match) throw new Error(`match not found: ${matchId}`)
  return match
}

function pickSource(match, name) {
  const sources = match.sources ?? []
  if (!sources.length) throw new Error('match has no stream sources')
  const picked = sources.find((item) => item.source === name)
  if (!picked) throw new Error(`source ${name} not found`)
  return picked
}

function watchLink(matchId, source, stream) {
  return `${streamedOrigin}/watch/${matchId}/${source}/${Number(stream)}`
}

export function parseWatchPath(pathname) {
  const m = pathname.match(watchRe)
  if (!m) return null
  return { matchId: m[1], source: m[2], stream: m[3] }
}

export async function loadWatch(matchId, source, stream) {
  const match = await loadMatch(matchId)
  const src = pickSource(match, source)
  const link = pickLink(await fetchLinks(src.source, src.id), stream)
  return {
    matchId: match.id,
    title: match.title,
    watchUrl: watchLink(match.id, link.source, link.streamNo),
    embedUrl: link.embedUrl,
    slot: makeSlot(embedOrigin, link.source, link.id, link.streamNo),
  }
}
