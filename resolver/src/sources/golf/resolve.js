import { fetchHeaders } from '../../wire/headers.js'

export const relayReferer = 'https://exposestrat.com/'

function iframeUrl(html) {
  const m = html.match(/iframe src="([^"]+)"/)
  if (!m) throw new Error('golf embed iframe not found')
  return m[1].replace(/&amp;/g, '&')
}

function fid(html) {
  const m = html.match(/fid="([^"]+)"/)
  if (!m) throw new Error('golf stream fid not found')
  return m[1]
}

function m3u8Url(html) {
  const m = html.match(/return\(\[("[^"]+"(?:,"[^"]+")*)\]\.join\(""\)/)
  if (!m) throw new Error('golf m3u8 url not found')
  return JSON.parse(`[${m[1]}]`).join('')
}

export async function resolve(slot) {
  const embedUrl = `${slot.origin}/embed/${slot.path}`
  const embedHtml = await (await fetch(embedUrl, { headers: fetchHeaders(`${slot.origin}/`), signal: AbortSignal.timeout(10000) })).text()
  const streamedUrl = iframeUrl(embedHtml)
  const streamedHtml = await (await fetch(streamedUrl, { headers: fetchHeaders(embedUrl), signal: AbortSignal.timeout(10000) })).text()
  const live = fid(streamedHtml)
  const playerUrl = `https://exposestrat.com/maestrohd1.php?player=desktop&live=${encodeURIComponent(live)}`
  const playerHtml = await (await fetch(playerUrl, { headers: fetchHeaders(streamedUrl), signal: AbortSignal.timeout(10000) })).text()
  return m3u8Url(playerHtml)
}
