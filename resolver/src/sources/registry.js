import { resolve as resolveGolf, relayReferer as golfReferer } from './golf/resolve.js'
import { resolveGoat } from './goat/resolve.js'

const resolvers = new Map()

export function registerResolver(source, handler) {
  resolvers.set(source, handler)
}

// Pre-register known sources
registerResolver('golf', async (slot) => {
  const m3u8 = await resolveGolf(slot)
  slot.referer = golfReferer
  return m3u8
})

registerResolver('goat', async (slot) => {
  return await resolveGoat(slot)
})

export async function resolveSource(slot) {
  const source = slot.source || 'goat'
  const handler = resolvers.get(source) || resolvers.get('goat')
  
  if (!handler) {
    throw new Error(`No resolver registered for source: ${source}`)
  }
  
  return await handler(slot)
}
