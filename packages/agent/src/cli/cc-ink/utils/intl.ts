/** Stub: utils/intl — Grapheme segmenter for terminal width */
let _segmenter: Intl.Segmenter | undefined

export function getGraphemeSegmenter(): Intl.Segmenter {
  if (!_segmenter) {
    _segmenter = new Intl.Segmenter()
  }
  return _segmenter
}

export function lastGrapheme(str: string): string {
  const seg = getGraphemeSegmenter()
  let last = ""
  for (const { segment } of seg.segment(str)) {
    last = segment
  }
  return last
}
