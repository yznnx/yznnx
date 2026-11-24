/**
 * Spotify login (Authorization Code with PKCE, no server needed), Web API helpers and the
 * Web Playback SDK player. Works with the Spotify API rules for "Development Mode" apps
 * as of 2026 (playlist items live under /items and only for playlists you own/collaborate on).
 */
import type { Track } from '../types';
import type { AudioEngine } from './audio';

const AUTH_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const API = 'https://api.spotify.com/v1';
const SCOPES = [
  'user-read-private',
  'user-read-email',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-library-read',
  'user-top-read',
  'streaming',
  'user-read-playback-state',
  'user-modify-playback-state',
];

const K = {
  clientId: 'tuneGuess.spotify.clientId',
  tokens: 'tuneGuess.spotify.tokens',
  verifier: 'tuneGuess.spotify.verifier',
  state: 'tuneGuess.spotify.state',
};

interface Tokens {
  access_token: string;
  refresh_token?: string;
  expires_at: number;
}

export function getClientId(): string {
  return localStorage.getItem(K.clientId) || import.meta.env.VITE_SPOTIFY_CLIENT_ID || '';
}

export function setClientId(id: string): void {
  if (id.trim()) localStorage.setItem(K.clientId, id.trim());
  else localStorage.removeItem(K.clientId);
}

/** The exact address Spotify sends people back to after login. Must be added in the Spotify dashboard. */
export function redirectUri(): string {
  const u = new URL(window.location.href);
  u.search = '';
  u.hash = '';
  u.pathname = u.pathname.replace(/index\.html$/, '');
  return u.toString();
}

export function isLoggedIn(): boolean {
  return !!loadTokens();
}

export function logout(): void {
  localStorage.removeItem(K.tokens);
}

function loadTokens(): Tokens | null {
  try {
    return JSON.parse(localStorage.getItem(K.tokens) || 'null');
  } catch {
    return null;
  }
}

function saveTokens(t: { access_token: string; refresh_token?: string; expires_in: number }, previousRefresh?: string) {
  const tokens: Tokens = {
    access_token: t.access_token,
    refresh_token: t.refresh_token ?? previousRefresh,
    expires_at: Date.now() + t.expires_in * 1000,
  };
  localStorage.setItem(K.tokens, JSON.stringify(tokens));
  return tokens;
}

function randomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const values = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(values, (v) => chars[v % chars.length]).join('');
}

async function codeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function login(): Promise<void> {
  const clientId = getClientId();
  if (!clientId) throw new Error('Add your Spotify Client ID first.');
  if (!window.isSecureContext || !crypto.subtle) {
    throw new Error('Spotify login needs a secure address. Open the app via http://127.0.0.1:5173 or an https:// address.');
  }
  const verifier = randomString(64);
  const state = randomString(16);
  localStorage.setItem(K.verifier, verifier);
  localStorage.setItem(K.state, state);
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri(),
    code_challenge_method: 'S256',
    code_challenge: await codeChallenge(verifier),
    scope: SCOPES.join(' '),
    state,
  });
  window.location.assign(`${AUTH_URL}?${params}`);
}

/**
 * Call once on page load. If we just came back from the Spotify login page, exchanges the code
 * for tokens and cleans up the address bar. Returns true if a login just completed.
 */
export async function handleRedirect(): Promise<boolean> {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const error = params.get('error');
  const state = params.get('state');
  if (!code && !error) return false;
  window.history.replaceState({}, '', redirectUri());
  if (error) throw new Error(error === 'access_denied' ? 'Spotify login was cancelled.' : `Spotify login failed: ${error}`);
  if (!state || state !== localStorage.getItem(K.state)) throw new Error('Spotify login failed (state mismatch). Please try again.');
  const verifier = localStorage.getItem(K.verifier);
  if (!verifier) throw new Error('Spotify login failed (missing verifier). Please try again.');
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: getClientId(),
      grant_type: 'authorization_code',
      code: code!,
      redirect_uri: redirectUri(),
      code_verifier: verifier,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Spotify login failed: ${body.error_description || body.error || res.status}`);
  saveTokens(body);
  localStorage.removeItem(K.verifier);
  localStorage.removeItem(K.state);
  return true;
}

let refreshing: Promise<Tokens> | null = null;

async function refresh(tokens: Tokens): Promise<Tokens> {
  if (!tokens.refresh_token) {
    logout();
    throw new Error('Your Spotify session expired. Please connect again.');
  }
  refreshing ??= (async () => {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: getClientId(),
        grant_type: 'refresh_token',
        refresh_token: tokens.refresh_token!,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      logout();
      throw new Error('Your Spotify session expired. Please connect again.');
    }
    return saveTokens(body, tokens.refresh_token);
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

export async function getAccessToken(force = false): Promise<string> {
  let tokens = loadTokens();
  if (!tokens) throw new Error('Not connected to Spotify.');
  if (force || tokens.expires_at - Date.now() < 60_000) tokens = await refresh(tokens);
  return tokens.access_token;
}

export class SpotifyApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, init: RequestInit = {}, retried = false): Promise<T> {
  const url = path.startsWith('http') ? path : `${API}${path}`;
  const token = await getAccessToken(retried);
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers },
  });
  if (res.status === 401 && !retried) return api<T>(path, init, true);
  if (res.status === 429 && !retried) {
    const wait = Number(res.headers.get('Retry-After') || '2');
    await new Promise((r) => setTimeout(r, Math.min(wait, 10) * 1000));
    return api<T>(path, init, true);
  }
  if (res.status === 204 || res.status === 202) return undefined as T;
  const text = await res.text();
  const body = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    const msg = body?.error?.message || body?.error_description || `Spotify error ${res.status}`;
    throw new SpotifyApiError(msg, res.status);
  }
  return body as T;
}

// ---------- Library ----------

interface SpotifyImage {
  url: string;
  width?: number;
}

interface SpotifyTrackObject {
  id: string | null;
  type?: string;
  name: string;
  uri: string;
  is_local?: boolean;
  duration_ms?: number;
  preview_url?: string | null;
  artists: { name: string }[];
  album?: { name: string; images?: SpotifyImage[]; release_date?: string };
  external_urls?: { spotify?: string };
}

interface Page<T> {
  items: T[];
  next: string | null;
  total?: number;
}

export interface SpotifyUser {
  id: string;
  display_name?: string;
  product?: string;
  images?: SpotifyImage[];
}

export interface SpotifyPlaylist {
  id: string;
  name: string;
  image?: string;
  total?: number;
  ownedOrCollab: boolean;
  owner: string;
}

export function getMe(): Promise<SpotifyUser> {
  return api<SpotifyUser>('/me');
}

function pickImage(images?: SpotifyImage[]): string | undefined {
  if (!images?.length) return undefined;
  const sorted = images.slice().sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
  return (sorted.find((i) => (i.width ?? 0) >= 250) ?? sorted[sorted.length - 1]).url;
}

function toTrack(t: SpotifyTrackObject | null | undefined): Track | null {
  if (!t || !t.id || t.is_local || (t.type && t.type !== 'track')) return null;
  return {
    id: t.id,
    title: t.name,
    artist: t.artists.map((a) => a.name).join(', '),
    album: t.album?.name,
    artwork: pickImage(t.album?.images),
    year: t.album?.release_date ? Number(t.album.release_date.slice(0, 4)) || undefined : undefined,
    durationMs: t.duration_ms,
    previewUrl: t.preview_url || undefined,
    spotifyUri: t.uri,
    link: t.external_urls?.spotify ?? `https://open.spotify.com/track/${t.id}`,
  };
}

async function collect<T>(first: string, max: number, map: (item: T) => Track | null): Promise<Track[]> {
  const out: Track[] = [];
  let next: string | null = first;
  while (next && out.length < max) {
    const page: Page<T> = await api<Page<T>>(next);
    for (const item of page.items ?? []) {
      const t = map(item);
      if (t) out.push(t);
    }
    next = page.next;
  }
  return out.slice(0, max);
}

export async function getPlaylists(me: SpotifyUser): Promise<SpotifyPlaylist[]> {
  type Raw = {
    id: string;
    name: string;
    images?: SpotifyImage[] | null;
    owner?: { id: string; display_name?: string };
    collaborative?: boolean;
    tracks?: { total?: number };
    items?: { total?: number };
  };
  const out: SpotifyPlaylist[] = [];
  let next: string | null = '/me/playlists?limit=50';
  while (next && out.length < 500) {
    const page: Page<Raw | null> = await api<Page<Raw | null>>(next);
    for (const p of page.items ?? []) {
      if (!p) continue;
      out.push({
        id: p.id,
        name: p.name,
        image: pickImage(p.images ?? undefined),
        total: p.items?.total ?? p.tracks?.total,
        ownedOrCollab: p.owner?.id === me.id || !!p.collaborative,
        owner: p.owner?.display_name || p.owner?.id || '',
      });
    }
    next = page.next;
  }
  // Own playlists first: Spotify only lets Development Mode apps read songs of playlists you own.
  return out.sort((a, b) => Number(b.ownedOrCollab) - Number(a.ownedOrCollab));
}

type PlaylistItem = { item?: SpotifyTrackObject | null; track?: SpotifyTrackObject | null };

export async function getPlaylistTracks(id: string, max = 1000): Promise<Track[]> {
  const map = (i: PlaylistItem) => toTrack(i.item ?? i.track);
  try {
    return await collect<PlaylistItem>(`/playlists/${id}/items?limit=50`, max, map);
  } catch (err) {
    if (err instanceof SpotifyApiError && (err.status === 403 || err.status === 404)) {
      try {
        // Older endpoint, still available to apps with extended access.
        return await collect<PlaylistItem>(`/playlists/${id}/tracks?limit=50`, max, map);
      } catch {
        throw new Error(
          "Spotify doesn't let this app read songs from playlists you only follow. Pick one of your own playlists (or copy the songs into a playlist you made).",
        );
      }
    }
    throw err;
  }
}

export function getLikedSongs(max = 1000): Promise<Track[]> {
  return collect<PlaylistItem>('/me/tracks?limit=50', max, (i) => toTrack(i.item ?? i.track));
}

export function getTopTracks(range: 'short_term' | 'medium_term' | 'long_term'): Promise<Track[]> {
  return collect<SpotifyTrackObject>(`/me/top/tracks?limit=50&time_range=${range}`, 100, toTrack);
}

// ---------- Web Playback SDK ----------

declare global {
  interface Window {
    Spotify?: any;
    onSpotifyWebPlaybackSDKReady?: () => void;
  }
}

let sdkLoading: Promise<void> | null = null;

function loadSdk(): Promise<void> {
  if (window.Spotify) return Promise.resolve();
  sdkLoading ??= new Promise<void>((resolve, reject) => {
    window.onSpotifyWebPlaybackSDKReady = () => resolve();
    const s = document.createElement('script');
    s.src = 'https://sdk.scdn.co/spotify-player.js';
    s.async = true;
    s.onerror = () => {
      sdkLoading = null;
      reject(new Error('Could not load the Spotify player.'));
    };
    document.head.append(s);
  });
  return sdkLoading;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Plays full songs inside this browser tab. Needs Spotify Premium and a desktop browser. */
export class SpotifyEngine implements AudioEngine {
  readonly label = 'Spotify (full songs)';
  readonly previewOnly = false;

  private constructor(
    private player: any,
    private deviceId: string,
  ) {}

  static async create(): Promise<SpotifyEngine> {
    await loadSdk();
    const player = new window.Spotify.Player({
      name: 'TuneGuess',
      volume: 0.8,
      getOAuthToken: (cb: (t: string) => void) => {
        getAccessToken().then(cb, () => cb(''));
      },
    });
    const deviceId = await new Promise<string>((resolve, reject) => {
      const fail = (msg: string) => () => reject(new Error(msg));
      const timer = setTimeout(fail('The Spotify player did not start. Try reloading the page.'), 20000);
      player.addListener('ready', ({ device_id }: { device_id: string }) => {
        clearTimeout(timer);
        resolve(device_id);
      });
      player.addListener('initialization_error', ({ message }: { message: string }) => {
        clearTimeout(timer);
        reject(new Error(`This browser can't play Spotify here (${message}). Try Chrome, Edge or Firefox on a computer.`));
      });
      player.addListener('authentication_error', () => {
        clearTimeout(timer);
        reject(new Error('Spotify rejected the login. Disconnect and connect again.'));
      });
      player.addListener('account_error', () => {
        clearTimeout(timer);
        reject(new Error('Playing full songs needs Spotify Premium.'));
      });
      player.connect().then((ok: boolean) => {
        if (!ok) {
          clearTimeout(timer);
          reject(new Error('Could not connect the Spotify player.'));
        }
      });
    });
    return new SpotifyEngine(player, deviceId);
  }

  unlock(): void {
    try {
      this.player.activateElement?.();
    } catch {
      /* ignore */
    }
  }

  async play(track: Track, offsetSec: number): Promise<void> {
    if (!track.spotifyUri) throw new Error('Not a Spotify song.');
    const body = JSON.stringify({ uris: [track.spotifyUri], position_ms: Math.round(offsetSec * 1000) });
    for (let attempt = 0; ; attempt++) {
      try {
        await api(`/me/player/play?device_id=${encodeURIComponent(this.deviceId)}`, { method: 'PUT', body });
        break;
      } catch (err) {
        // Right after start-up Spotify sometimes doesn't know the device yet.
        if (attempt < 3 && err instanceof SpotifyApiError && (err.status === 404 || err.status === 502)) {
          await sleep(800);
          continue;
        }
        if (err instanceof SpotifyApiError && err.status === 403) {
          throw new Error('Spotify refused to play this song (Premium needed, or not available in your country).');
        }
        throw err;
      }
    }
    // Wait until the song is really playing so the countdown starts with the music.
    const started = Date.now();
    while (Date.now() - started < 6000) {
      const state = await this.player.getCurrentState();
      if (state && !state.paused && state.track_window?.current_track?.uri === track.spotifyUri) return;
      if (state && !state.paused && state.track_window?.current_track?.linked_from?.uri === track.spotifyUri) return;
      await sleep(150);
    }
  }

  async pause(): Promise<void> {
    await this.player.pause();
  }

  async resume(): Promise<void> {
    await this.player.resume();
  }

  setVolume(volume: number): void {
    this.player.setVolume(volume);
  }

  dispose(): void {
    try {
      this.player.pause();
      this.player.disconnect();
    } catch {
      /* ignore */
    }
  }
}
