export type SourceKind = 'spotify' | 'apple' | 'quick';

/** A song in the game, normalised from whichever service it came from. */
export interface Track {
  /** Unique id within the source (Spotify track id, Apple Music id, iTunes track id). */
  id: string;
  title: string;
  artist: string;
  album?: string;
  artwork?: string;
  year?: number;
  durationMs?: number;
  /** 30-second preview MP3/M4A, if known. */
  previewUrl?: string;
  /** spotify:track:... URI, used by the Spotify player. */
  spotifyUri?: string;
  /** Apple Music catalog id (or library id "i.xxx") used by MusicKit. */
  appleId?: string;
  /** Link to open the song in its app after the game. */
  link?: string;
}

export type GameMode = 'choice' | 'type' | 'party';
export type StartAt = 'start' | 'random';

export interface GameSettings {
  mode: GameMode;
  /** Party mode: total songs. Turn-based modes: songs per player. */
  songs: number;
  clipSeconds: number;
  startAt: StartAt;
}

export interface Player {
  id: string;
  name: string;
  color: string;
}

export interface RoundResult {
  track: Track;
  /** Player who had the turn (turn-based modes), undefined in party mode. */
  playerId?: string;
  /** Points earned per player id. */
  points: Record<string, number>;
  /** Short description of what happened, e.g. "Correct in 3.2s". */
  note?: string;
}

/** How songs are played during the game. */
export type Playback = 'spotify' | 'apple' | 'previews';

/** The music the players picked, ready to start a game with. */
export interface MusicSelection {
  source: SourceKind;
  /** e.g. "Spotify · Road trip, Liked Songs" */
  label: string;
  pool: Track[];
  playback: Playback;
  /** Shown on the setup screen, e.g. playlists that could not be loaded. */
  notice?: string;
}
