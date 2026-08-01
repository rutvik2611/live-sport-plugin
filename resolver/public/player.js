const $ = (id) => document.getElementById(id)

const form = $('form')
const urlIn = $('embed')
const panel = $('out')
const heading = $('title')
const vid = $('vid')
const err = $('err')
const btn = form.querySelector('button')
const rawOut = $('direct')
const relayOut = $('proxy')
const vlcOut = $('vlc')
const mpvOut = $('mpv')
const timing = $('timing')
const tResolve = $('t-resolve')
const tPlay = $('t-play')
const tTotal = $('t-total')

let hls = null
let timer = null
const hlsReady = import('https://cdn.jsdelivr.net/npm/hls.js@1.5.20/+esm')

function fmtMs(ms) {
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function stopTimer() {
  if (timer) {
    cancelAnimationFrame(timer.raf)
    timer = null
  }
}

function startTimer() {
  stopTimer()
  timing.hidden = false
  tResolve.textContent = '0ms'
  tPlay.textContent = 'waiting'
  tTotal.textContent = '0ms'
  tResolve.className = 'timing__val is-live'
  tPlay.className = 'timing__val'
  tTotal.className = 'timing__val is-live'

  const t0 = performance.now()
  let resolveAt = null
  let playAt = null

  const tick = () => {
    const now = performance.now()
    if (resolveAt == null) tResolve.textContent = fmtMs(now - t0)
    if (resolveAt != null && playAt == null) {
      tPlay.textContent = fmtMs(now - resolveAt)
      tPlay.className = 'timing__val is-live'
    }
    if (playAt == null) tTotal.textContent = fmtMs(now - t0)
    if (playAt == null) timer.raf = requestAnimationFrame(tick)
  }

  timer = {
    raf: requestAnimationFrame(tick),
    markResolve() {
      if (resolveAt != null) return
      resolveAt = performance.now()
      tResolve.textContent = fmtMs(resolveAt - t0)
      tResolve.className = 'timing__val is-done'
      tPlay.textContent = '0ms'
      tPlay.className = 'timing__val is-live'
    },
    markPlay() {
      if (playAt != null) return
      playAt = performance.now()
      if (resolveAt == null) this.markResolve()
      tPlay.textContent = fmtMs(playAt - resolveAt)
      tPlay.className = 'timing__val is-done'
      tTotal.textContent = fmtMs(playAt - t0)
      tTotal.className = 'timing__val is-done'
      stopTimer()
    },
  }
  return timer
}

function vlcCmd(url) {
  return `vlc "${url}"`
}

function mpvCmd(url, name) {
  return `mpv --force-media-title="${name.replace(/"/g, '\\"')}" "${url}"`
}

function hlsErr(data) {
  if (data.details) return data.details
  const code = data.response?.code
  if (code && (code < 200 || code >= 300)) return `HTTP ${code}`
  return data.type || 'playback error'
}

function stop() {
  if (hls) {
    hls.destroy()
    hls = null
  }
}

async function play(relay, clock) {
  stop()
  const { default: Hls } = await hlsReady
  if (!Hls.isSupported()) throw new Error('HLS playback is not supported in this browser. Use VLC or MPV.')
  hls = new Hls()
  hls.loadSource(relay)
  hls.attachMedia(vid)
  await new Promise((resolve, reject) => {
    hls.on(Hls.Events.FRAG_BUFFERED, () => vid.play().catch(() => {}), { once: true })
    vid.addEventListener(
      'playing',
      () => {
        clock?.markPlay()
        resolve()
      },
      { once: true },
    )
    hls.on(Hls.Events.ERROR, (_, data) => {
      if (!data.fatal) return
      reject(new Error(hlsErr(data)))
    })
  })
}

document.querySelectorAll('[data-copy]').forEach((node) => {
  node.addEventListener('click', async () => {
    const field = $(node.dataset.copy)
    await navigator.clipboard.writeText(field.value)
    const label = node.textContent
    node.textContent = 'Copied'
    node.classList.add('ok')
    setTimeout(() => {
      node.textContent = label
      node.classList.remove('ok')
    }, 1200)
  })
})

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  btn.disabled = true
  err.hidden = true
  panel.hidden = true
  stop()
  const clock = startTimer()
  try {
    const res = await fetch('/api/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: urlIn.value.trim() }),
    })
    const data = await res.json()
    if (!data.ok) throw new Error(`${data.stage || 'error'}: ${data.error || 'resolve failed'}`)
    if (!data.m3u8 || !data.relay) throw new Error('missing stream URLs in response')

    clock.markResolve()
    const name = data.slug.replace(/-/g, ' ')
    heading.textContent = `${name} · ${data.source} · stream ${data.stream}`
    panel.hidden = false
    rawOut.value = data.m3u8
    relayOut.value = data.relay
    vlcOut.value = vlcCmd(data.relay)
    mpvOut.value = mpvCmd(data.relay, name)
    await play(data.relay, clock)
  } catch (e) {
    stopTimer()
    timing.hidden = true
    err.textContent = e.message
    err.hidden = false
  } finally {
    btn.disabled = false
  }
})
