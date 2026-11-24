/**
 * Forgiving answer matching for the "type the title" mode.
 * Ignores case, accents, punctuation, "(feat. ...)", "- Remastered 2011" and small typos.
 */

export function normalize(input: string): string {
  return input
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[‘’'`´]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^the /, '');
}

/** Strips decorations that people never type: "(feat. X)", "[Live]", "- 2011 Remaster" ... */
export function cleanTitle(title: string): string {
  return title
    .replace(/\s*[([{][^)\]}]*[)\]}]/g, ' ')
    .replace(/\s+[-–—]\s+.*$/, '')
    .replace(/\s+(feat|ft)\.?\s.*$/i, '')
    .trim() || title;
}

/** Titles count as "the same song" for de-duplication and multiple-choice options. */
export function titleKey(title: string): string {
  return normalize(cleanTitle(title));
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

export function similarity(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  return max === 0 ? 1 : 1 - levenshtein(a, b) / max;
}

function closeEnough(guess: string, answer: string): boolean {
  if (!guess || !answer) return false;
  if (guess === answer) return true;
  // Short answers ("Hello", "ABC") must be (almost) exact; longer ones tolerate a few typos.
  const needed = answer.length <= 4 ? 1 : answer.length <= 8 ? 0.75 : 0.7;
  return similarity(guess, answer) >= needed;
}

export function isTitleMatch(guess: string, title: string): boolean {
  const g = normalize(guess);
  if (!g) return false;
  const variants = new Set([normalize(title), titleKey(title)]);
  for (const v of variants) {
    if (closeEnough(g, v)) return true;
  }
  return false;
}

export function splitArtists(artist: string): string[] {
  return artist
    .split(/\s*(?:,|&|\band\b|\bx\b|\bfeat\.?|\bft\.?|\bwith\b|\/)\s*/i)
    .map(normalize)
    .filter(Boolean);
}

export function isArtistMatch(guess: string, artist: string): boolean {
  const g = normalize(guess);
  if (!g) return false;
  if (closeEnough(g, normalize(artist))) return true;
  return splitArtists(artist).some((a) => closeEnough(g, a));
}
