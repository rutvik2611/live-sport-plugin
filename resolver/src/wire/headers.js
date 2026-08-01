import { ua } from '../env.js'

export function fetchHeaders(referer, extra = {}) {
  const headers = { 'User-Agent': ua, ...extra }
  if (referer) headers.Referer = referer
  return headers
}
