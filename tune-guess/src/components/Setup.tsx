import { useState, type CSSProperties } from 'react';
import type { GameMode, GameSettings, MusicSelection, Player } from '../types';
import { newPlayer } from '../lib/storage';
import { BackButton, ErrorBox, Spinner } from './ui';

export type EngineStatus = { state: 'loading' } | { state: 'ready'; label: string } | { state: 'error'; message: string };

const MODES: { value: GameMode; emoji: string; title: string; text: string }[] = [
  { value: 'choice', emoji: '🔢', title: 'Multiple choice', text: 'Pick the right song out of 4. Players take turns.' },
  { value: 'type', emoji: '⌨️', title: 'Type it', text: 'Type the title (and artist for bonus). Small typos are OK.' },
  { value: 'party', emoji: '🎉', title: 'Party', text: 'Everyone shouts their guess, the host taps who got it right.' },
];

export function Setup({
  selection,
  players,
  setPlayers,
  settings,
  setSettings,
  engine,
  onUsePreviews,
  onBack,
  onStart,
}: {
  selection: MusicSelection;
  players: Player[];
  setPlayers: (p: Player[]) => void;
  settings: GameSettings;
  setSettings: (s: GameSettings) => void;
  engine: EngineStatus;
  onUsePreviews: () => void;
  onBack: () => void;
  onStart: () => void;
}) {
  const [newName, setNewName] = useState('');
  const turnBased = settings.mode !== 'party';
  const totalSongs = turnBased ? settings.songs * players.length : settings.songs;
  const poolSize = selection.pool.length;

  function addPlayer() {
    if (players.length >= 8) return;
    const p = newPlayer(players.length, newName.trim() || undefined);
    setPlayers([...players, p]);
    setNewName('');
  }

  return (
    <div className="screen">
      <BackButton onClick={onBack}>Change music</BackButton>
      <h1 className="screen-title">Game setup</h1>
      <p className="lead">
        🎵 {selection.label} · <b>{poolSize}</b> songs
      </p>
      {selection.notice && <p className="hint">⚠️ {selection.notice}</p>}

      <h2 className="section-title">Players</h2>
      <div className="players">
        {players.map((p, i) => (
          <div className="player-edit" key={p.id} style={{ '--c': p.color } as CSSProperties}>
            <span className="dot" />
            <input
              className="input input--bare"
              value={p.name}
              maxLength={20}
              aria-label={`Player ${i + 1} name`}
              onChange={(e) => setPlayers(players.map((q) => (q.id === p.id ? { ...q, name: e.target.value } : q)))}
            />
            {players.length > 1 && (
              <button
                className="link"
                aria-label={`Remove ${p.name}`}
                onClick={() => setPlayers(players.filter((q) => q.id !== p.id))}
              >
                ✕
              </button>
            )}
          </div>
        ))}
        {players.length < 8 && (
          <form
            className="player-edit player-edit--new"
            onSubmit={(e) => {
              e.preventDefault();
              addPlayer();
            }}
          >
            <input
              className="input input--bare"
              placeholder="Add player…"
              value={newName}
              maxLength={20}
              onChange={(e) => setNewName(e.target.value)}
            />
            <button className="btn btn--small" type="submit">
              + Add
            </button>
          </form>
        )}
      </div>

      <h2 className="section-title">Game mode</h2>
      <div className="modes">
        {MODES.map((m) => (
          <button
            key={m.value}
            className={`mode ${settings.mode === m.value ? 'mode--on' : ''}`}
            onClick={() => setSettings({ ...settings, mode: m.value })}
          >
            <span className="mode__emoji">{m.emoji}</span>
            <strong>{m.title}</strong>
            <small>{m.text}</small>
          </button>
        ))}
      </div>

      <h2 className="section-title">Options</h2>
      <div className="options">
        <div className="option">
          <span>{turnBased && players.length > 1 ? 'Songs per player' : 'Songs'}</span>
          <Segmented
            value={settings.songs}
            values={[5, 10, 15, 20]}
            onChange={(songs) => setSettings({ ...settings, songs })}
          />
        </div>
        <div className="option">
          <span>Listening time</span>
          <Segmented
            value={settings.clipSeconds}
            values={[5, 10, 15, 30]}
            format={(v) => `${v}s`}
            onChange={(clipSeconds) => setSettings({ ...settings, clipSeconds })}
          />
        </div>
        <div className="option">
          <span>Start the clip</span>
          <Segmented
            value={settings.startAt}
            values={['random', 'start'] as const}
            format={(v) => (v === 'random' ? 'Somewhere in the song' : 'At the beginning')}
            onChange={(startAt) => setSettings({ ...settings, startAt })}
          />
        </div>
      </div>

      {totalSongs > poolSize && (
        <p className="hint">
          Heads-up: this game needs {totalSongs} songs but only {poolSize} are available, so it will end after{' '}
          {poolSize}.
        </p>
      )}

      {engine.state === 'error' && (
        <ErrorBox>
          {engine.message}
          {selection.playback !== 'previews' && (
            <div>
              <button className="btn btn--small" onClick={onUsePreviews}>
                Use 30-second previews instead
              </button>
            </div>
          )}
        </ErrorBox>
      )}

      <div className="footer-bar">
        {engine.state === 'loading' ? (
          <Spinner label="Getting the music player ready…" />
        ) : (
          <button
            className="btn btn--primary btn--big"
            disabled={engine.state !== 'ready' || players.some((p) => !p.name.trim())}
            onClick={onStart}
          >
            ▶ Start game
          </button>
        )}
        {engine.state === 'ready' && <small className="muted">Playing via {engine.label}</small>}
      </div>
    </div>
  );
}

function Segmented<T extends string | number>({
  value,
  values,
  onChange,
  format = (v) => String(v),
}: {
  value: T;
  values: readonly T[];
  onChange: (v: T) => void;
  format?: (v: T) => string;
}) {
  return (
    <div className="segmented" role="radiogroup">
      {[...new Set(values)].map((v) => (
        <button
          key={String(v)}
          type="button"
          role="radio"
          aria-checked={v === value}
          className={v === value ? 'on' : ''}
          onClick={() => onChange(v)}
        >
          {format(v)}
        </button>
      ))}
    </div>
  );
}
