/**
 * Apple's public iTunes Search API: no account or key needed, returns 30-second previews.
 * Used for "Quick play" and to find previews for Spotify songs when Spotify can't play them.
 * The API allows roughly 20 requests per minute, so requests are spaced out.
 */
import type { Track } from '../types';
import { cleanTitle, isArtistMatch, normalize, similarity, titleKey } from './match';

interface ItunesResult {
  wrapperType?: string;
  kind?: string;
  trackId?: number;
  trackName?: string;
  artistName?: string;
  collectionName?: string;
  artworkUrl100?: string;
  releaseDate?: string;
  trackTimeMillis?: number;
  previewUrl?: string;
  trackViewUrl?: string;
}

interface ItunesResponse {
  resultCount: number;
  results: ItunesResult[];
}

export function defaultCountry(): string {
  const region = (navigator.language || 'en-US').split('-')[1];
  return region && /^[A-Za-z]{2}$/.test(region) ? region.toUpperCase() : 'US';
}

let transport: 'fetch' | 'jsonp' = 'fetch';
let jsonpCounter = 0;

function jsonp<T>(url: string, timeoutMs = 12000): Promise<T> {
  return new Promise((resolve, reject) => {
    const name = `__tuneGuessJsonp${Date.now()}_${jsonpCounter++}`;
    const script = document.createElement('script');
    const w = window as unknown as Record<string, unknown>;
    const cleanup = () => {
      delete w[name];
      script.remove();
      clearTimeout(timer);
    };
    w[name] = (data: T) => {
      cleanup();
      resolve(data);
    };
    script.onerror = () => {
      cleanup();
      reject(new Error('Could not reach the iTunes music catalog.'));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('The iTunes music catalog did not answer in time.'));
    }, timeoutMs);
    script.src = `${url}&callback=${name}`;
    document.head.append(script);
  });
}

// Simple request spacing to stay under the rate limit.
let last: Promise<unknown> = Promise.resolve();
const SPACING_MS = 150;

function request(path: 'search' | 'lookup', params: Record<string, string>): Promise<ItunesResponse> {
  const url = `https://itunes.apple.com/${path}?${new URLSearchParams(params)}`;
  const run = async (): Promise<ItunesResponse> => {
    if (transport === 'fetch') {
      try {
        const res = await fetch(url);
        if (res.ok) return (await res.json()) as ItunesResponse;
        if (res.status === 403 || res.status === 429) {
          await new Promise((r) => setTimeout(r, 3000));
          const retry = await fetch(url);
          if (retry.ok) return (await retry.json()) as ItunesResponse;
        }
        throw new Error(`iTunes catalog error (${res.status})`);
      } catch (err) {
        // A TypeError means the browser blocked the request (CORS); fall back to JSONP for good.
        if (!(err instanceof TypeError)) throw err;
        transport = 'jsonp';
      }
    }
    return jsonp<ItunesResponse>(url);
  };
  const p = last.then(run, run);
  last = p.catch(() => {}).then(() => new Promise((r) => setTimeout(r, SPACING_MS)));
  return p;
}

function toTrack(r: ItunesResult): Track | null {
  if (!r.trackId || !r.trackName || !r.artistName || !r.previewUrl) return null;
  if (r.kind && r.kind !== 'song') return null;
  return {
    id: String(r.trackId),
    title: r.trackName,
    artist: r.artistName,
    album: r.collectionName,
    artwork: r.artworkUrl100?.replace(/\/\d+x\d+bb\./, '/400x400bb.'),
    year: r.releaseDate ? Number(r.releaseDate.slice(0, 4)) || undefined : undefined,
    durationMs: r.trackTimeMillis,
    previewUrl: r.previewUrl,
    appleId: String(r.trackId),
    link: r.trackViewUrl,
  };
}

/** Popular songs by one artist. */
export async function songsByArtist(artist: string, country = defaultCountry(), limit = 15): Promise<Track[]> {
  const res = await request('search', {
    term: artist,
    entity: 'song',
    attribute: 'artistTerm',
    limit: '50',
    country,
  });
  const wanted = normalize(artist);
  const tracks = res.results
    .map(toTrack)
    .filter((t): t is Track => !!t)
    .filter((t) => {
      const a = normalize(t.artist);
      return a === wanted || a.startsWith(wanted) || isArtistMatch(artist, t.artist);
    });
  const seen = new Set<string>();
  return tracks
    .filter((t) => {
      const k = titleKey(t.title);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, limit);
}

/** Songs for any search term (genre, mood, movie, ...). */
export async function searchSongs(term: string, country = defaultCountry(), limit = 50): Promise<Track[]> {
  const res = await request('search', { term, entity: 'song', limit: String(limit), country });
  return res.results.map(toTrack).filter((t): t is Track => !!t);
}

/** Finds a 30-second preview for a song that came from another service (e.g. Spotify). */
export async function findPreview(track: Track, country = defaultCountry()): Promise<Track | null> {
  if (track.previewUrl) return track;

  // Apple Music catalog ids are the same as iTunes ids: look them up directly.
  if (track.appleId && /^\d+$/.test(track.appleId)) {
    const res = await request('lookup', { id: track.appleId, country });
    const hit = res.results.map(toTrack).find(Boolean);
    if (hit) return { ...track, previewUrl: hit.previewUrl, artwork: track.artwork ?? hit.artwork };
  }

  const firstArtist = track.artist.split(/,|&| feat/i)[0].trim();
  const res = await request('search', {
    term: `${cleanTitle(track.title)} ${firstArtist}`,
    entity: 'song',
    limit: '10',
    country,
  });
  const want = titleKey(track.title);
  let best: { t: Track; score: number } | null = null;
  for (const t of res.results.map(toTrack)) {
    if (!t) continue;
    const titleScore = similarity(titleKey(t.title), want);
    const artistOk = isArtistMatch(firstArtist, t.artist) || isArtistMatch(t.artist, track.artist);
    if (titleScore < 0.75 || !artistOk) continue;
    if (!best || titleScore > best.score) best = { t, score: titleScore };
  }
  if (!best) return null;
  return {
    ...track,
    previewUrl: best.t.previewUrl,
    artwork: track.artwork ?? best.t.artwork,
    year: track.year ?? best.t.year,
  };
}
