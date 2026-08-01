import { pullStream } from '../wire/curl.js'
import { parseRelaySlot, relayLink } from './link.js'
import { createSegmentStream } from './segment.js'
import { getPrefetched, prefetchSegment, setNextSegment, getNextSegment } from './prefetch.js'
import { Readable } from 'stream'

const cors = { 'Access-Control-Allow-Origin': '*' }

function absUri(uri, base) {
  if (uri.startsWith('http')) return uri
  const b = new URL(base)
  const u = new URL(uri, base)
  for (const [k, v] of b.searchParams.entries()) {
    if (!u.searchParams.has(k)) u.searchParams.set(k, v)
  }
  return u.href
}

function isPlaylist(body) {
  const head = body.toString('utf8', 0, Math.min(body.length, 256))
  return head.includes('#EXTM3U')
}

function rewrite(text, base, slot, origin) {
  let prevUri = null
  return text
    .split('\n')
    .map((line) => {
      const t = line.trim()
      if (!t) return line
      if (t.startsWith('#')) {
        if (!t.includes('URI="')) return line
        return t.replace(/URI="([^"]+)"/g, (_, uri) => {
          const href = absUri(uri, base)
          if (prevUri) setNextSegment(prevUri, href)
          prevUri = href
          return `URI="${relayLink(origin, href, slot)}"`
        })
      }
      
      const href = absUri(t, base)
      if (prevUri) setNextSegment(prevUri, href)
      prevUri = href
      
      return relayLink(origin, href, slot)
    })
    .join('\n')
}

async function relay(res, url, slot, origin) {
  const fetchRes = await (getPrefetched(url) || pullStream(url, slot))
  const bodyStream = Readable.fromWeb(fetchRes.body)

  const firstChunk = await new Promise((resolve, reject) => {
    const onReadable = () => {
      cleanup()
      resolve(bodyStream.read())
    }
    const onEnd = () => {
      cleanup()
      resolve(null)
    }
    const onError = (err) => {
      cleanup()
      reject(err)
    }
    const cleanup = () => {
      bodyStream.off('readable', onReadable)
      bodyStream.off('end', onEnd)
      bodyStream.off('error', onError)
    }
    bodyStream.once('readable', onReadable)
    bodyStream.once('end', onEnd)
    bodyStream.once('error', onError)
  })

  if (!firstChunk) {
    res.writeHead(200, cors)
    res.end()
    return
  }

  if (isPlaylist(firstChunk)) {
    const chunks = [firstChunk]
    for await (const chunk of bodyStream) {
      chunks.push(chunk)
    }
    const raw = Buffer.concat(chunks)
    res.writeHead(200, {
      ...cors,
      'Content-Type': 'application/vnd.apple.mpegurl',
      'Cache-Control': 'no-cache',
    })
    res.end(rewrite(raw.toString('utf8'), url, slot, origin))
    return
  }

  res.writeHead(200, { ...cors, 'Content-Type': 'video/mp2t', 'Cache-Control': 'no-cache' })
  
  const segmentStream = createSegmentStream()
  
  bodyStream.on('error', (err) => {
    console.error(`[Stream Error] Upstream fetch failed during segment streaming:`, err.message)
    segmentStream.destroy()
    if (!res.headersSent) res.writeHead(502)
    res.end()
  })
  
  segmentStream.on('error', (err) => {
    res.destroy()
  })

  segmentStream.pipe(res)
  
  segmentStream.write(firstChunk)
  bodyStream.pipe(segmentStream)

  const nextUrl = getNextSegment(url)
  if (nextUrl) {
    prefetchSegment(nextUrl, slot)
  }
}

export async function serve(res, params, origin) {
  const target = params.get('url')
  if (!target) {
    res.writeHead(400, { 'Content-Type': 'text/plain' })
    res.end('url required')
    return
  }

  let slot
  try {
    slot = parseRelaySlot(params)
  } catch (err) {
    res.writeHead(400, { 'Content-Type': 'text/plain' })
    res.end(String(err.message || err))
    return
  }

  try {
    await relay(res, target, slot, origin)
  } catch (err) {
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'text/plain' })
      res.end(String(err.message || err))
    }
  }
}
