import { fetchJson } from './api.js'

export async function fetchLinks(source, id) {
  const links = await fetchJson(`/api/stream/${encodeURIComponent(source)}/${encodeURIComponent(id)}`)
  if (!Array.isArray(links) || links.length === 0) throw new Error('no streams returned for source')
  return links
}

export function pickLink(links, streamNo) {
  if (streamNo == null || streamNo === '') throw new Error('stream number required')
  const wanted = Number(streamNo)
  const picked = links.find((link) => Number(link.streamNo) === wanted)
  if (!picked) throw new Error(`stream ${streamNo} not found`)
  return picked
}
