import { fetchHeaders } from '../wire/headers.js'
import { streamedOrigin } from '../env.js'

export async function fetchJson(path) {
  const res = await fetch(`${streamedOrigin}${path}`, {
    headers: fetchHeaders(undefined, { Accept: 'application/json' }),
    signal: AbortSignal.timeout(10000)
  })
  if (!res.ok) throw new Error(`streamed.pk ${path} ${res.status}`)
  return res.json()
}
