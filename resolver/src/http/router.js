import { serve } from '../relay/m3u8.js'
import { run } from '../resolve/run.js'
import { serveStatic } from './static.js'

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
  res.end(JSON.stringify(body))
}

async function readJson(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return JSON.parse(Buffer.concat(chunks).toString())
}

export async function route(req, res) {
  if (!req.headers.host && !process.env.BASE_URL) {
    res.writeHead(400, { 'Content-Type': 'text/plain' })
    res.end('missing host')
    return
  }

  const proto = (req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim()
  const host = req.headers['x-forwarded-host'] || req.headers.host
  
  let baseOrigin = process.env.BASE_URL || `${proto}://${host}`
  if (req.headers['x-forwarded-host']) {
    const fwHost = req.headers['x-forwarded-host'].split(',')[0].trim()
    baseOrigin = `${proto}://${fwHost}`
  }

  const loc = new URL(req.url ?? '/', baseOrigin)
  const { pathname, searchParams, origin } = loc

  try {
    if (pathname.startsWith('/api/hls')) {
      await serve(res, searchParams, origin)
      return
    }

    if (pathname === '/api/stream') {
      if (req.method !== 'POST') {
        json(res, 405, { error: 'POST required' })
        return
      }
      let body
      try {
        body = await readJson(req)
      } catch {
        json(res, 400, { ok: false, error: 'invalid json' })
        return
      }
      json(res, 200, await run(body, origin))
      return
    }

    if (serveStatic(pathname, res)) return

    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('not found')
  } catch (err) {
    json(res, 500, { ok: false, error: String(err.message || err) })
  }
}
