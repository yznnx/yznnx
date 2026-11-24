import type { Track } from '../types';
import { titleKey, normalize } from './match.ts';

export function shuffle<T>(items: readonly T[]): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Removes duplicates (same song on two playlists, remasters, live versions of the same title by the same artist). */
export function dedupeTracks(tracks: readonly Track[]): Track[] {
  const seen = new Set<string>();
  const out: Track[] = [];
  for (const t of tracks) {
    if (!t.title || !t.artist) continue;
    const key = `${titleKey(t.title)}|${normalize(t.artist.split(',')[0])}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

/** Four answer options: the right song plus three other songs with different titles from the pool. */
export function buildOptions(answer: Track, pool: readonly Track[], count = 4): Track[] {
  const used = new Set([titleKey(answer.title)]);
  const options = [answer];
  for (const t of shuffle(pool)) {
    if (options.length >= count) break;
    const k = titleKey(t.title);
    if (used.has(k)) continue;
    used.add(k);
    options.push(t);
  }
  return shuffle(options);
}

/** Where in the song the clip starts (seconds). */
export function pickOffset(opts: {
  startAt: 'start' | 'random';
  clipSeconds: number;
  durationMs?: number;
  previewOnly: boolean;
}): number {
  if (opts.startAt === 'start') return 0;
  if (opts.previewOnly) {
    // Previews are ~30 s long.
    const room = Math.max(0, 29 - opts.clipSeconds);
    return Math.round(Math.random() * room);
  }
  const length = (opts.durationMs ?? 180_000) / 1000;
  // Somewhere between 20 % and 60 % of the song: skips long intros, usually lands near a chorus.
  const min = length * 0.2;
  const max = Math.max(min, Math.min(length * 0.6, length - opts.clipSeconds - 1));
  return Math.round(min + Math.random() * (max - min));
}

export const BASE_POINTS = 100;
export const SPEED_BONUS = 50;
export const ARTIST_POINTS = 50;

/** Correct answer: 100 points plus up to 50 for answering quickly. */
export function scoreCorrect(elapsedSec: number, clipSeconds: number): number {
  const fraction = Math.min(1, Math.max(0, elapsedSec / Math.max(clipSeconds, 1)));
  return BASE_POINTS + Math.round(SPEED_BONUS * (1 - fraction));
}

/**
 * Hands out playable tracks one at a time. `resolve` can turn a track into a playable one
 * (e.g. find a 30-second preview) or return null to skip it. Resolution happens a couple of
 * songs ahead so the next round is usually ready instantly.
 */
export class RoundSource {
  private queue: Track[];
  private buffer: Promise<Track | null>[] = [];
  private resolve: (t: Track) => Promise<Track | null>;
  private lookahead: number;

  constructor(pool: readonly Track[], resolve: (t: Track) => Promise<Track | null>, lookahead = 2) {
    this.queue = shuffle(pool);
    this.resolve = resolve;
    this.lookahead = lookahead;
  }

  private async resolveNext(): Promise<Track | null> {
    while (this.queue.length) {
      const t = this.queue.shift()!;
      try {
        const r = await this.resolve(t);
        if (r) return r;
      } catch {
        // skip unplayable song
      }
    }
    return null;
  }

  prefetch(): void {
    while (this.buffer.length < this.lookahead && this.queue.length) this.buffer.push(this.resolveNext());
  }

  /** The next playable track, or null once every song has been tried. */
  async next(): Promise<Track | null> {
    this.prefetch();
    while (this.buffer.length) {
      const t = await this.buffer.shift()!;
      this.prefetch();
      // A null only means that lookahead slot ran out of songs; others may still hold one.
      if (t) return t;
    }
    return null;
  }
}
