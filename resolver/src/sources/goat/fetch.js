import { ua } from '../../env.js'

export async function postFetch(body, slot) {
  const referer = `${slot.origin}/embed/${slot.path}`
  const res = await fetch(`${slot.origin}/fetch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      Origin: slot.origin,
      Referer: referer,
      'User-Agent': ua,
    },
    body,
    signal: AbortSignal.timeout(10000)
  })
  if (!res.ok) {
    const detail = (await res.text()).trim() || res.statusText
    throw new Error(`embed /fetch ${res.status}: ${detail}`)
  }
  const goat = res.headers.get('goat')
  if (!goat) throw new Error('missing goat header')
  return { body: Buffer.from(await res.arrayBuffer()), goat }
}
