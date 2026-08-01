import { Transform } from 'stream'

function tsOff(buf) {
  for (let i = 0; i < Math.min(buf.length, 65536); i++) {
    if (buf[i] === 0x47 && i + 188 < buf.length && buf[i + 188] === 0x47) return i
  }
  return -1
}

function strip(buf) {
  if (buf.length < 4 || buf[0] === 0x47) return buf
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    const iend = buf.indexOf(Buffer.from('IEND'))
    if (iend >= 0 && iend + 8 <= buf.length) return buf.subarray(iend + 8)
  }
  const at = tsOff(buf)
  if (at >= 0) return buf.subarray(at)
  return buf
}

export function segmentBody(body) {
  const out = strip(body)
  if (out.length >= 188 && out[0] === 0x47) return out
  throw new Error('invalid segment payload')
}

export function createSegmentStream() {
  let buffered = Buffer.alloc(0)
  let stripping = true

  return new Transform({
    transform(chunk, encoding, callback) {
      if (!stripping) {
        this.push(chunk)
        return callback()
      }

      buffered = Buffer.concat([buffered, chunk])

      if (buffered.length >= 4 && buffered[0] === 0x47) {
        stripping = false
        this.push(buffered)
        return callback()
      }

      if (buffered.length >= 4 && buffered[0] === 0x89 && buffered[1] === 0x50 && buffered[2] === 0x4e && buffered[3] === 0x47) {
        const iend = buffered.indexOf(Buffer.from('IEND'))
        if (iend >= 0 && iend + 8 <= buffered.length) {
          stripping = false
          this.push(buffered.subarray(iend + 8))
          return callback()
        }
      } else {
        const at = tsOff(buffered)
        if (at >= 0) {
          stripping = false
          this.push(buffered.subarray(at))
          return callback()
        }
      }

      if (buffered.length > 131072) {
        // Fallback if no sync byte found within 128KB
        stripping = false
        this.push(buffered)
        return callback()
      }

      callback()
    }
  })
}
