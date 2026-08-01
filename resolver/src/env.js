export const port = Number(process.env.PORT) || 3000

export const streamedOrigin = process.env.STREAMED_ORIGIN || 'https://streamed.pk'

export const embedOrigin = process.env.EMBED_ORIGIN || 'https://embed.st'

export const ua =
  process.env.USER_AGENT ||
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36'
