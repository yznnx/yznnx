import type { GameSettings, Player } from '../types';

export const COLORS = ['#ff4d8d', '#3dd6ff', '#ffc53d', '#7cff6b', '#b98cff', '#ff8a3d', '#4dffd2', '#ff5e5e'];

export const DEFAULT_SETTINGS: GameSettings = {
  mode: 'choice',
  songs: 10,
  clipSeconds: 15,
  startAt: 'random',
};

function read<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? { ...fallback, ...JSON.parse(v) } : fallback;
  } catch {
    return fallback;
  }
}

export function loadSettings(): GameSettings {
  return read('tuneGuess.settings', DEFAULT_SETTINGS);
}

export function saveSettings(s: GameSettings): void {
  localStorage.setItem('tuneGuess.settings', JSON.stringify(s));
}

export function newPlayer(index: number, name?: string): Player {
  return {
    id: Math.random().toString(36).slice(2, 10),
    name: name ?? `Player ${index + 1}`,
    color: COLORS[index % COLORS.length],
  };
}

export function loadPlayers(): Player[] {
  try {
    const v = JSON.parse(localStorage.getItem('tuneGuess.players') || 'null');
    if (Array.isArray(v) && v.length) return v;
  } catch {
    /* ignore */
  }
  return [newPlayer(0)];
}

export function savePlayers(players: Player[]): void {
  localStorage.setItem('tuneGuess.players', JSON.stringify(players));
}
