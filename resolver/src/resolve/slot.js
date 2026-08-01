export function makeSlot(origin, source, id, stream) {
  const streamNo = String(stream)
  return { origin, path: `${source}/${id}/${streamNo}`, source, id, stream: streamNo, slug: id }
}
