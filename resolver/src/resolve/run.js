import { relayLink } from '../relay/link.js'
import { loadWatch } from '../streamed/watch.js'
import { parseInput } from './parse.js'
import { resolveSource } from '../sources/registry.js'

export async function run(input, origin) {
  let slot
  let meta

  try {
    if (input?.matchId) {
      if (!input.source || input.stream == null) {
        return { ok: false, stage: 'input', error: 'matchId requires source and stream' }
      }
      meta = await loadWatch(input.matchId, input.source, String(input.stream))
      slot = meta.slot
    } else if (input?.url?.trim()) {
      slot = await parseInput(input.url.trim())
    } else {
      return { ok: false, stage: 'input', error: 'url or matchId required' }
    }
  } catch (err) {
    return { ok: false, stage: 'input', error: String(err.message || err) }
  }

  try {
    const m3u8 = await resolveSource(slot)
    return {
      ok: true,
      slug: slot.slug,
      source: slot.source,
      stream: slot.stream,
      matchId: meta?.matchId,
      title: meta?.title,
      watchUrl: meta?.watchUrl,
      embedUrl: meta?.embedUrl,
      m3u8,
      relay: relayLink(origin, m3u8, slot),
    }
  } catch (err) {
    return { ok: false, stage: 'resolve', error: String(err.message || err) }
  }
}
