import { postFetch } from './fetch.js'
import { unlock } from './lock.js'
import { encodeBody } from './proto.js'

export async function resolveGoat(slot) {
  const { body, goat } = await postFetch(encodeBody(slot), slot)
  const m3u8 = await unlock(slot, goat, body)
  return m3u8
}
