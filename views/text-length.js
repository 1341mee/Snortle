(function (root) {
  const segmenter = typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null;

  function countUserCharacters(text) {
    const value = String(text ?? '');
    if (segmenter) return Array.from(segmenter.segment(value)).length;
    return Array.from(value).length;
  }

  if (typeof module === 'object' && module.exports) {
    module.exports = countUserCharacters;
  } else {
    root.countUserCharacters = countUserCharacters;
  }
})(globalThis);