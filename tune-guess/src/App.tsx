import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameSettings, MusicSelection, Player, Playback, RoundResult, SourceKind, Track } from './types';
import type { AudioEngine } from './lib/audio';
import { PreviewEngine } from './lib/audio';
import { findPreview } from './lib/itunes';
import * as spotify from './lib/spotify';
import { AppleMusicEngine } from './lib/appleMusic';
import { loadPlayers, loadSettings, savePlayers, saveSettings } from './lib/storage';
import { Home } from './components/Home';
import { SpotifySource } from './components/SpotifySource';
import { AppleSource } from './components/AppleSource';
import { QuickSource } from './components/QuickSource';
import { Setup, type EngineStatus } from './components/Setup';
import { Game } from './components/Game';
import { Results } from './components/Results';

type Screen =
  | { name: 'home' }
  | { name: 'source'; kind: SourceKind }
  | { name: 'setup' }
  | { name: 'game'; id: number }
  | { name: 'results'; results: RoundResult[]; scores: Record<string, number> };

async function createEngine(playback: Playback): Promise<AudioEngine> {
  if (playback === 'spotify') return spotify.SpotifyEngine.create();
  if (playback === 'apple') return AppleMusicEngine.create();
  return new PreviewEngine();
}

/** Turns a track into something the chosen player can play, or null to skip it. */
function resolverFor(playback: Playback): (t: Track) => Promise<Track | null> {
  if (playback === 'spotify') return async (t) => (t.spotifyUri ? t : null);
  if (playback === 'apple') return async (t) => (t.appleId ? t : null);
  return (t) => findPreview(t);
}

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const [selection, setSelection] = useState<MusicSelection | null>(null);
  const [players, setPlayersState] = useState<Player[]>(loadPlayers);
  const [settings, setSettingsState] = useState<GameSettings>(loadSettings);
  const [engineStatus, setEngineStatus] = useState<EngineStatus>({ state: 'loading' });
  const [spotifyError, setSpotifyError] = useState('');
  const [spotifyName, setSpotifyName] = useState<string>();
  const engineRef = useRef<{ playback: Playback; engine: AudioEngine } | null>(null);
  const gameId = useRef(0);

  const setPlayers = (p: Player[]) => {
    setPlayersState(p);
    savePlayers(p);
  };
  const setSettings = (s: GameSettings) => {
    setSettingsState(s);
    saveSettings(s);
  };

  // Coming back from the Spotify login page?
  useEffect(() => {
    spotify
      .handleRedirect()
      .then((done) => done && setScreen({ name: 'source', kind: 'spotify' }))
      .catch((err) => {
        setSpotifyError(err.message);
        setScreen({ name: 'source', kind: 'spotify' });
      });
  }, []);

  useEffect(() => {
    if (screen.name !== 'home' || !spotify.isLoggedIn()) return;
    spotify
      .getMe()
      .then((me) => setSpotifyName(me.display_name || me.id))
      .catch(() => setSpotifyName(undefined));
  }, [screen.name]);

  // Make sure the right music player is running for the chosen playback.
  const prepareEngine = useCallback(async (playback: Playback) => {
    if (engineRef.current?.playback === playback) {
      setEngineStatus({ state: 'ready', label: engineRef.current.engine.label });
      return;
    }
    engineRef.current?.engine.dispose();
    engineRef.current = null;
    setEngineStatus({ state: 'loading' });
    try {
      const engine = await createEngine(playback);
      engineRef.current = { playback, engine };
      setEngineStatus({ state: 'ready', label: engine.label });
    } catch (err) {
      setEngineStatus({ state: 'error', message: (err as Error).message });
    }
  }, []);

  useEffect(() => () => engineRef.current?.engine.dispose(), []);

  function onMusicReady(s: MusicSelection) {
    setSelection(s);
    setScreen({ name: 'setup' });
    prepareEngine(s.playback);
  }

  function startGame() {
    const e = engineRef.current?.engine;
    if (!e) return;
    e.unlock();
    gameId.current++;
    setScreen({ name: 'game', id: gameId.current });
  }

  const resolve = useCallback((t: Track) => resolverFor(selection?.playback ?? 'previews')(t), [selection?.playback]);

  return (
    <div className="app">
      <div className="bg" aria-hidden>
        <span />
        <span />
        <span />
      </div>

      {screen.name === 'home' && (
        <Home onPick={(kind) => setScreen({ name: 'source', kind })} spotifyName={spotifyName} />
      )}

      {screen.name === 'source' && screen.kind === 'spotify' && (
        <SpotifySource
          initialError={spotifyError}
          onBack={() => {
            setSpotifyError('');
            setScreen({ name: 'home' });
          }}
          onReady={onMusicReady}
        />
      )}
      {screen.name === 'source' && screen.kind === 'apple' && (
        <AppleSource onBack={() => setScreen({ name: 'home' })} onReady={onMusicReady} />
      )}
      {screen.name === 'source' && screen.kind === 'quick' && (
        <QuickSource onBack={() => setScreen({ name: 'home' })} onReady={onMusicReady} />
      )}

      {screen.name === 'setup' && selection && (
        <Setup
          selection={selection}
          players={players}
          setPlayers={setPlayers}
          settings={settings}
          setSettings={setSettings}
          engine={engineStatus}
          onUsePreviews={() => {
            const s = { ...selection, playback: 'previews' as const };
            setSelection(s);
            prepareEngine('previews');
          }}
          onBack={() => setScreen({ name: 'source', kind: selection.source })}
          onStart={startGame}
        />
      )}

      {screen.name === 'game' && selection && engineRef.current && (
        <Game
          key={screen.id}
          players={players}
          settings={settings}
          pool={selection.pool}
          engine={engineRef.current.engine}
          resolve={resolve}
          onFinish={(results, scores) => setScreen({ name: 'results', results, scores })}
          onQuit={() => setScreen({ name: 'setup' })}
        />
      )}

      {screen.name === 'results' && selection && (
        <Results
          players={players}
          scores={screen.scores}
          results={screen.results}
          mode={settings.mode}
          onPlayAgain={() => setScreen({ name: 'setup' })}
          onChangeMusic={() => setScreen({ name: 'source', kind: selection.source })}
        />
      )}
    </div>
  );
}
