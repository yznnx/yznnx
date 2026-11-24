/**
 * Apple Music via MusicKit on the Web (v3).
 * Needs a "developer token" (a JWT made with an Apple Developer account, see scripts/apple-music-token.mjs).
 * Players then sign in with their own Apple ID; subscribers hear full songs, others hear previews.
 */
import type { Track } from '../types';
import type { AudioEngine } from './audio';

const TOKEN_KEY = 'tuneGuess.apple.developerToken';

declare global {
  interface Window {
    MusicKit?: any;
  }
}

export function getDeveloperToken(): string {
  return localStorage.getItem(TOKEN_KEY) || import.meta.env.VITE_APPLE_DEVELOPER_TOKEN || '';
}

export function setDeveloperToken(token: string): void {
  if (token.trim()) localStorage.setItem(TOKEN_KEY, token.trim());
  else localStorage.removeItem(TOKEN_KEY);
  instance = null;
}

/** Reads the expiry date out of the developer token (a JWT) so we can warn before it stops working. */
export function tokenExpiry(token: string): Date | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp === 'number' ? new Date(payload.exp * 1000) : null;
  } catch {
    return null;
  }
}

let loading: Promise<any> | null = null;
let instance: any = null;

function loadScript(): Promise<any> {
  if (window.MusicKit) return Promise.resolve(window.MusicKit);
  loading ??= new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Apple Music did not load in time.')), 20000);
    document.addEventListener(
      'musickitloaded',
      () => {
        clearTimeout(timer);
        resolve(window.MusicKit);
      },
      { once: true },
    );
    const s = document.createElement('script');
    s.src = 'https://js-cdn.music.apple.com/musickit/v3/musickit.js';
    s.async = true;
    s.dataset.webComponents = '';
    s.onerror = () => {
      clearTimeout(timer);
      loading = null;
      reject(new Error('Could not load Apple MusicKit.'));
    };
    document.head.append(s);
  });
  return loading;
}

export async function getMusicKit(): Promise<any> {
  if (instance) return instance;
  const developerToken = getDeveloperToken();
  if (!developerToken) throw new Error('Add your Apple Music developer token first.');
  const MusicKit = await loadScript();
  try {
    await MusicKit.configure({ developerToken, app: { name: 'TuneGuess', build: '1.0.0' } });
  } catch (err) {
    throw new Error(`Apple Music rejected the developer token. Is it complete and not expired? (${(err as Error)?.message ?? err})`);
  }
  instance = MusicKit.getInstance();
  return instance;
}

export async function authorize(): Promise<void> {
  const m = await getMusicKit();
  if (m.isAuthorized) return;
  try {
    await m.authorize();
  } catch (err) {
    throw new Error(`Apple Music sign-in failed: ${(err as Error)?.message ?? err}`);
  }
  if (!m.isAuthorized) throw new Error('Apple Music sign-in was cancelled.');
}

export async function isAuthorized(): Promise<boolean> {
  if (!getDeveloperToken()) return false;
  try {
    return !!(await getMusicKit()).isAuthorized;
  } catch {
    return false;
  }
}

export async function signOut(): Promise<void> {
  if (instance) await instance.unauthorize();
}

async function get(path: string, params: Record<string, string | number>): Promise<any> {
  const m = await getMusicKit();
  try {
    const res = await m.api.music(path, params);
    return res?.data ?? {};
  } catch (err: any) {
    const status = err?.status ?? err?.errorCode;
    if (status === 404 || err?.errorCode === 'NOT_FOUND') return { data: [] };
    throw new Error(`Apple Music error: ${err?.message || err?.description || status || 'unknown'}`);
  }
}

function artwork(art?: { url?: string }): string | undefined {
  return art?.url?.replace('{w}', '400').replace('{h}', '400').replace('{f}', 'jpg');
}

function toTrack(s: any, storefront: string): Track | null {
  const a = s?.attributes;
  if (!a?.name || !a.artistName) return null;
  if (s.type && !/songs$/.test(s.type)) return null; // skip music videos
  const pp = a.playParams ?? {};
  const catalogId: string | undefined = pp.catalogId ?? (s.type === 'songs' ? s.id : undefined);
  const playId: string | undefined = catalogId ?? pp.id ?? s.id;
  if (!playId) return null;
  return {
    id: s.id,
    title: a.name,
    artist: a.artistName,
    album: a.albumName,
    artwork: artwork(a.artwork),
    year: a.releaseDate ? Number(String(a.releaseDate).slice(0, 4)) || undefined : undefined,
    durationMs: a.durationInMillis,
    previewUrl: a.previews?.[0]?.url,
    appleId: playId,
    link: a.url ?? (catalogId ? `https://music.apple.com/${storefront}/song/${catalogId}` : undefined),
  };
}

async function collectTracks(path: string, max: number, pageSize: number): Promise<Track[]> {
  const m = await getMusicKit();
  const storefront = m.storefrontId || 'us';
  const out: Track[] = [];
  let offset = 0;
  while (out.length < max) {
    const body = await get(path, { limit: pageSize, offset });
    const data: any[] = body.data ?? [];
    for (const item of data) {
      const t = toTrack(item, storefront);
      if (t) out.push(t);
    }
    if (!body.next || data.length === 0) break;
    offset += data.length;
  }
  return out.slice(0, max);
}

export interface ApplePlaylist {
  id: string;
  name: string;
  image?: string;
}

export async function getLibraryPlaylists(): Promise<ApplePlaylist[]> {
  const out: ApplePlaylist[] = [];
  let offset = 0;
  while (out.length < 500) {
    const body = await get('/v1/me/library/playlists', { limit: 100, offset });
    const data: any[] = body.data ?? [];
    for (const p of data) {
      if (!p?.attributes?.name) continue;
      out.push({ id: p.id, name: p.attributes.name, image: artwork(p.attributes.artwork) });
    }
    if (!body.next || data.length === 0) break;
    offset += data.length;
  }
  return out;
}

export function getPlaylistTracks(id: string): Promise<Track[]> {
  return collectTracks(`/v1/me/library/playlists/${encodeURIComponent(id)}/tracks`, 1000, 100);
}

export function getLibrarySongs(max = 1000): Promise<Track[]> {
  return collectTracks('/v1/me/library/songs', max, 100);
}

export function getRecentlyPlayed(): Promise<Track[]> {
  return collectTracks('/v1/me/recent/played/tracks', 150, 30);
}

/** Plays songs through MusicKit in this tab. Subscribers hear full songs, everyone else 30 s previews. */
export class AppleMusicEngine implements AudioEngine {
  readonly label = 'Apple Music';
  private volume = 0.9;

  private constructor(private m: any) {}

  static async create(): Promise<AppleMusicEngine> {
    await authorize();
    return new AppleMusicEngine(await getMusicKit());
  }

  get previewOnly(): boolean {
    return !!this.m.previewOnly;
  }

  unlock(): void {}

  async play(track: Track, offsetSec: number): Promise<void> {
    if (!track.appleId) throw new Error('Not an Apple Music song.');
    const m = this.m;
    // Mute while the queue loads and seeks, so nobody hears the first second of the intro.
    m.volume = 0;
    try {
      await m.setQueue({ song: track.appleId, startPlaying: false });
      await m.play();
      if (offsetSec > 0) await m.seekToTime(offsetSec);
    } catch (err) {
      throw new Error(`Apple Music could not play this song: ${(err as Error)?.message ?? err}`);
    } finally {
      m.volume = this.volume;
    }
  }

  async pause(): Promise<void> {
    await this.m.pause();
  }

  async resume(): Promise<void> {
    await this.m.play();
  }

  setVolume(volume: number): void {
    this.volume = volume;
    this.m.volume = volume;
  }

  dispose(): void {
    try {
      this.m.stop();
    } catch {
      /* ignore */
    }
  }
}
