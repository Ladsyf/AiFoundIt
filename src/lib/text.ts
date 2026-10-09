const WORD_CHAR = /[a-z0-9]/;

/**
 * Index of `word` in `hay` when it stands on its own, not inside a longer word ("tin" is not in
 * "meeting"). Both strings should already be lower case. Returns -1 when it is not there.
 */
export function indexOfWord(hay: string, word: string): number {
  if (!word) return -1;
  let from = 0;
  for (;;) {
    const i = hay.indexOf(word, from);
    if (i < 0) return -1;
    const end = i + word.length;
    const before = i === 0 || !WORD_CHAR.test(hay[i - 1]);
    const after = end >= hay.length || !WORD_CHAR.test(hay[end]);
    if (before && after) return i;
    from = i + 1;
  }
}

export function hasWord(hay: string, word: string): boolean {
  return indexOfWord(hay, word) >= 0;
}
