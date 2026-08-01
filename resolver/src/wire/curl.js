import { fetchHeaders } from './headers.js'
import { Agent, setGlobalDispatcher } from 'undici'

// Use a shared Keep-Alive agent for native fetch to prevent tearing down TCP connections
setGlobalDispatcher(new Agent({
  keepAliveTimeout: 60000, // 1 minute
  keepAliveMaxTimeout: 600000,
  connections: 500
}))

function hdrs(slot) {
  const referer = slot.referer || `${slot.origin}/`
  return {
    ...fetchHeaders(referer),
    Origin: slot.referer ? new URL(referer).origin : slot.origin,
    Accept: '*/*',
  }
}

export async function pull(url, slot) {
  const headers = hdrs(slot)
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) })
  if (!res.ok) throw new Error(`upstream ${res.status}`)
  const arrayBuffer = await res.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

export async function pullStream(url, slot) {
  const headers = hdrs(slot)
  // Removed hard 30s timeout so live streams don't randomly abort
  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error(`upstream ${res.status}`)
  return res
}
