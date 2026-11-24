import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { GameSettings, Player, RoundResult, Track } from '../types';
import type { AudioEngine } from '../lib/audio';
import { ARTIST_POINTS, RoundSource, buildOptions, pickOffset, scoreCorrect } from '../lib/game';
import { isArtistMatch, isTitleMatch } from '../lib/match';
import { Cover, Equalizer, ErrorBox, Ring, Spinner } from './ui';

type Phase = 'loading' | 'ready' | 'guessing' | 'reveal';
type AudioState = 'idle' | 'loading' | 'playing' | 'stopped';

interface Verdict {
  title: boolean;
  artist: boolean;
  points: number;
  kind: 'answer' | 'timeup' | 'skip' | 'party';
  guess?: { title: string; artist: string };
}

/** Seconds players still get to answer after the clip stops (turn-based modes). */
const GRACE_SECONDS = 10;

export function Game({
  players,
  settings,
  pool,
  engine,
  resolve,
  onFinish,
  onQuit,
}: {
  players: Player[];
  settings: GameSettings;
  pool: Track[];
  engine: AudioEngine;
  resolve: (t: Track) => Promise<Track | null>;
  onFinish: (results: RoundResult[], scores: Record<string, number>) => void;
  onQuit: () => void;
}) {
  const turnBased = settings.mode !== 'party';
  const total = Math.min(turnBased ? settings.songs * players.length : settings.songs, pool.length);

  const [source] = useState(() => new RoundSource(pool, resolve));
  const [round, setRound] = useState(0);
  const [loadKey, setLoadKey] = useState(0);
  const [phase, setPhase] = useState<Phase>('loading');
  const [audio, setAudio] = useState<AudioState>('idle');
  const [track, setTrack] = useState<Track | null>(null);
  const [options, setOptions] = useState<Track[]>([]);
  const [scores, setScores] = useState<Record<string, number>>(() => Object.fromEntries(players.map((p) => [p.id, 0])));
  const [results, setResults] = useState<RoundResult[]>([]);
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => performance.now());
  const [chosen, setChosen] = useState<string | null>(null);
  const [typed, setTyped] = useState({ title: '', artist: '' });
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [marks, setMarks] = useState<Record<string, { title: boolean; artist: boolean }>>({});
  const [volume, setVolume] = useState(0.9);

  const timing = useRef({ firstStart: 0, clipStart: 0, stoppedAt: 0, offset: 0 });
  const playToken = useRef(0);
  const loadedKey = useRef(-1);
  const mounted = useRef(true);
  const titleInput = useRef<HTMLInputElement>(null);

  const turnPlayer = turnBased ? players[round % players.length] : undefined;
  const isLast = round + 1 >= total;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      playToken.current++;
      engine.pause().catch(() => {});
    };
  }, [engine]);

  // Load the next playable song.
  useEffect(() => {
    if (phase !== 'loading' || loadedKey.current === loadKey) return;
    loadedKey.current = loadKey;
    source.next().then((t) => {
      if (!mounted.current) return;
      if (!t) {
        onFinish(results, scores);
        return;
      }
      timing.current = {
        firstStart: 0,
        clipStart: 0,
        stoppedAt: 0,
        offset: pickOffset({
          startAt: settings.startAt,
          clipSeconds: settings.clipSeconds,
          durationMs: t.durationMs,
          previewOnly: engine.previewOnly,
        }),
      };
      setTrack(t);
      setOptions(settings.mode === 'choice' ? buildOptions(t, pool) : []);
      setChosen(null);
      setTyped({ title: '', artist: '' });
      setVerdict(null);
      setMarks({});
      setError('');
      setAudio('idle');
      setPhase('ready');
    });
  }, [phase, loadKey]);

  // Countdown: stop the clip when time is up, end the turn when the answer time runs out.
  useEffect(() => {
    if (phase !== 'guessing' || (audio !== 'playing' && !(audio === 'stopped' && turnBased))) return;
    let raf = 0;
    const loop = () => {
      const n = performance.now();
      setNow(n);
      const tm = timing.current;
      if (audio === 'playing' && n - tm.clipStart >= settings.clipSeconds * 1000) {
        engine.pause().catch(() => {});
        tm.stoppedAt = n;
        setAudio('stopped');
        return;
      }
      if (audio === 'stopped' && n - tm.stoppedAt >= GRACE_SECONDS * 1000) {
        reveal({ title: false, artist: false, points: 0, kind: 'timeup' });
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase, audio]);

  // Keyboard: space/enter plays, 1-4 picks an answer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (phase === 'ready' && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        startClip();
      } else if (phase === 'guessing' && settings.mode === 'choice' && /^[1-4]$/.test(e.key)) {
        const opt = options[Number(e.key) - 1];
        if (opt) choose(opt);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  async function startClip() {
    if (!track) return;
    engine.unlock();
    const token = ++playToken.current;
    setError('');
    setAudio('loading');
    setPhase((p) => (p === 'ready' ? 'guessing' : p));
    try {
      await engine.play(track, timing.current.offset);
    } catch (err) {
      if (token !== playToken.current || !mounted.current) return;
      setAudio('idle');
      setError((err as Error).message || 'This song could not be played.');
      return;
    }
    if (token !== playToken.current || !mounted.current) return;
    const t = performance.now();
    timing.current.clipStart = t;
    timing.current.stoppedAt = 0;
    if (!timing.current.firstStart) timing.current.firstStart = t;
    setNow(t);
    setAudio('playing');
    if (settings.mode === 'type') setTimeout(() => titleInput.current?.focus(), 0);
  }

  function elapsedSeconds() {
    const start = timing.current.firstStart;
    return start ? (performance.now() - start) / 1000 : settings.clipSeconds;
  }

  function reveal(v: Verdict) {
    setVerdict(v);
    setPhase('reveal');
    if (turnPlayer && v.points) setScores((s) => ({ ...s, [turnPlayer.id]: (s[turnPlayer.id] ?? 0) + v.points }));
    // Let the song keep playing while everyone sees the answer.
    if (audio === 'stopped') {
      engine
        .resume()
        .then(() => mounted.current && setAudio('playing'))
        .catch(() => {});
    }
  }

  function choose(opt: Track) {
    if (phase !== 'guessing' || chosen || !track || !timing.current.firstStart) return;
    const correct = opt.id === track.id;
    setChosen(opt.id);
    reveal({
      title: correct,
      artist: false,
      points: correct ? scoreCorrect(elapsedSeconds(), settings.clipSeconds) : 0,
      kind: 'answer',
    });
  }

  function submitTyped() {
    if (phase !== 'guessing' || !track || !typed.title.trim() || !timing.current.firstStart) return;
    const titleOk = isTitleMatch(typed.title, track.title);
    const artistOk = !!typed.artist.trim() && isArtistMatch(typed.artist, track.artist);
    reveal({
      title: titleOk,
      artist: artistOk,
      points: (titleOk ? scoreCorrect(elapsedSeconds(), settings.clipSeconds) : 0) + (artistOk ? ARTIST_POINTS : 0),
      kind: 'answer',
      guess: { ...typed },
    });
  }

  /** Song failed to play: replace it with another one without counting a round. */
  function replaceSong() {
    playToken.current++;
    engine.pause().catch(() => {});
    setAudio('idle');
    setLoadKey((k) => k + 1);
    setPhase('loading');
  }

  function next() {
    if (!track) return;
    playToken.current++;
    engine.pause().catch(() => {});
    setAudio('idle');
    const points: Record<string, number> = {};
    let newScores = scores;
    let note: string | undefined;
    if (settings.mode === 'party') {
      newScores = { ...scores };
      for (const p of players) {
        const m = marks[p.id];
        const pts = (m?.title ? 1 : 0) + (m?.artist ? 1 : 0);
        if (pts) {
          points[p.id] = pts;
          newScores[p.id] = (newScores[p.id] ?? 0) + pts;
        }
      }
      setScores(newScores);
    } else if (turnPlayer && verdict) {
      points[turnPlayer.id] = verdict.points;
      note =
        verdict.kind === 'timeup'
          ? "Time's up"
          : verdict.kind === 'skip'
            ? 'Skipped'
            : verdict.title
              ? 'Correct'
              : verdict.artist
                ? 'Artist only'
                : 'Wrong';
    }
    const res = [...results, { track, playerId: turnPlayer?.id, points, note }];
    setResults(res);
    if (isLast) {
      onFinish(res, newScores);
      return;
    }
    setRound((r) => r + 1);
    setLoadKey((k) => k + 1);
    setPhase('loading');
  }

  const tm = timing.current;
  const clipElapsed = audio === 'playing' ? (now - tm.clipStart) / 1000 : 0;
  const clipProgress = audio === 'stopped' ? 1 : audio === 'playing' ? clipElapsed / settings.clipSeconds : 0;
  const remaining = Math.max(0, Math.ceil(settings.clipSeconds - clipElapsed));
  const graceLeft = Math.max(0, Math.ceil(GRACE_SECONDS - (now - tm.stoppedAt) / 1000));
  const started = tm.firstStart > 0;

  return (
    <div className="screen game">
      <header className="game__top">
        <button
          className="link"
          onClick={() => {
            if (results.length === 0 || confirm('Quit this game?')) onQuit();
          }}
        >
          ✕ Quit
        </button>
        <span className="game__count">
          Song <b>{Math.min(round + 1, total)}</b> / {total}
        </span>
        <label className="volume" title="Volume">
          🔊
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(e) => {
              const v = Number(e.target.value);
              setVolume(v);
              engine.setVolume(v);
            }}
          />
        </label>
      </header>

      <Scoreboard players={players} scores={scores} active={turnPlayer?.id} />

      <main className="stage">
        {phase === 'loading' && <Spinner label="Picking a song…" />}

        {phase === 'ready' && (
          <div className="ready">
            {turnPlayer && players.length > 1 ? (
              <h2 className="turn" style={{ '--c': turnPlayer.color } as CSSProperties}>
                {turnPlayer.name}, your turn!
              </h2>
            ) : (
              <h2 className="turn">{settings.mode === 'party' ? 'Everybody listen!' : 'Ready?'}</h2>
            )}
            <button className="play-big" onClick={startClip} aria-label="Play the clip">
              ▶
            </button>
            <p className="muted">
              You'll hear {settings.clipSeconds} seconds{turnBased ? ' — answer fast for bonus points' : ''}.
            </p>
          </div>
        )}

        {phase === 'guessing' && (
          <>
            <div className="listen">
              <Ring
                progress={clipProgress}
                label={audio === 'loading' || audio === 'idle' ? <Equalizer active={false} bars={3} /> : audio === 'playing' ? remaining : '■'}
              />
              <div className="listen__side">
                <Equalizer active={audio === 'playing'} bars={9} />
                {audio === 'loading' && <span className="muted">Loading song…</span>}
                {audio === 'stopped' && turnBased && (
                  <span className={`grace ${graceLeft <= 3 ? 'grace--hot' : ''}`}>Answer in {graceLeft}s</span>
                )}
                {(audio === 'stopped' || (audio === 'idle' && started)) && (
                  <button className="btn btn--small" onClick={startClip}>
                    ↻ Play again
                  </button>
                )}
              </div>
            </div>

            {error && (
              <ErrorBox>
                {error}
                <div className="row">
                  <button className="btn btn--small" onClick={startClip}>
                    Try again
                  </button>
                  <button className="btn btn--small" onClick={replaceSong}>
                    Skip to another song
                  </button>
                </div>
              </ErrorBox>
            )}

            {settings.mode === 'choice' && started && (
              <div className="answers">
                {options.map((o, i) => (
                  <button key={o.id} className="answer" onClick={() => choose(o)}>
                    <kbd>{i + 1}</kbd>
                    <span>
                      <strong>{o.title}</strong>
                      <small>{o.artist}</small>
                    </span>
                  </button>
                ))}
              </div>
            )}

            {settings.mode === 'type' && (
              <form
                className="typed"
                onSubmit={(e) => {
                  e.preventDefault();
                  submitTyped();
                }}
              >
                <input
                  ref={titleInput}
                  className="input input--big"
                  placeholder="Song title"
                  autoComplete="off"
                  value={typed.title}
                  onChange={(e) => setTyped({ ...typed, title: e.target.value })}
                />
                <input
                  className="input"
                  placeholder={`Artist (optional, +${ARTIST_POINTS} bonus)`}
                  autoComplete="off"
                  value={typed.artist}
                  onChange={(e) => setTyped({ ...typed, artist: e.target.value })}
                />
                <button className="btn btn--primary btn--big" type="submit" disabled={!typed.title.trim() || !started}>
                  Guess!
                </button>
              </form>
            )}

            {settings.mode === 'party' && (
              <div className="party-actions">
                <p className="muted">Shout out the title and artist! Then reveal.</p>
                <button
                  className="btn btn--primary btn--big"
                  disabled={!started}
                  onClick={() => reveal({ title: false, artist: false, points: 0, kind: 'party' })}
                >
                  Reveal the answer
                </button>
              </div>
            )}

            {turnBased && started && (
              <button className="link skip" onClick={() => reveal({ title: false, artist: false, points: 0, kind: 'skip' })}>
                I don't know
              </button>
            )}
          </>
        )}

        {phase === 'reveal' && track && verdict && (
          <div className="reveal">
            <div className="reveal__song">
              <Cover src={track.artwork} alt={track.album ?? track.title} size={150} />
              <div>
                <h2>{track.title}</h2>
                <p className="reveal__artist">{track.artist}</p>
                <p className="muted">
                  {[track.album, track.year].filter(Boolean).join(' · ')}
                </p>
              </div>
            </div>

            {verdict.kind !== 'party' && <VerdictLine verdict={verdict} mode={settings.mode} />}

            {settings.mode === 'choice' && (
              <div className="answers answers--done">
                {options.map((o) => (
                  <div
                    key={o.id}
                    className={`answer ${o.id === track.id ? 'answer--right' : o.id === chosen ? 'answer--wrong' : 'answer--dim'}`}
                  >
                    <span>
                      <strong>{o.title}</strong>
                      <small>{o.artist}</small>
                    </span>
                  </div>
                ))}
              </div>
            )}

            {settings.mode === 'party' && (
              <div className="marks">
                <p className="muted">Who got it? Tap to give points.</p>
                {players.map((p) => {
                  const m = marks[p.id] ?? { title: false, artist: false };
                  const toggle = (k: 'title' | 'artist') => setMarks({ ...marks, [p.id]: { ...m, [k]: !m[k] } });
                  return (
                    <div className="mark-row" key={p.id} style={{ '--c': p.color } as CSSProperties}>
                      <span className="mark-row__name">
                        <span className="dot" /> {p.name}
                      </span>
                      <button className={`chip ${m.title ? 'chip--on' : ''}`} onClick={() => toggle('title')}>
                        Title +1
                      </button>
                      <button className={`chip ${m.artist ? 'chip--on' : ''}`} onClick={() => toggle('artist')}>
                        Artist +1
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <button className="btn btn--primary btn--big" onClick={next} autoFocus>
              {isLast ? '🏆 See results' : 'Next song →'}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

function VerdictLine({ verdict, mode }: { verdict: Verdict; mode: GameSettings['mode'] }) {
  if (verdict.kind === 'timeup') return <p className="verdict verdict--bad">⏰ Time's up!</p>;
  if (verdict.kind === 'skip') return <p className="verdict verdict--bad">🤷 Skipped</p>;
  if (mode === 'type') {
    return (
      <div className="verdict-typed">
        <p className={`verdict ${verdict.points ? 'verdict--good' : 'verdict--bad'}`}>
          {verdict.points ? `🎉 +${verdict.points} points` : '❌ Not quite'}
        </p>
        <ul>
          <li className={verdict.title ? 'ok' : 'no'}>
            {verdict.title ? '✓' : '✗'} Title: "{verdict.guess?.title}"
          </li>
          {verdict.guess?.artist && (
            <li className={verdict.artist ? 'ok' : 'no'}>
              {verdict.artist ? '✓' : '✗'} Artist: "{verdict.guess.artist}"
            </li>
          )}
        </ul>
      </div>
    );
  }
  return verdict.title ? (
    <p className="verdict verdict--good">🎉 Correct! +{verdict.points}</p>
  ) : (
    <p className="verdict verdict--bad">❌ Not quite</p>
  );
}

export function Scoreboard({ players, scores, active }: { players: Player[]; scores: Record<string, number>; active?: string }) {
  return (
    <div className="scoreboard">
      {players.map((p) => (
        <div
          key={p.id}
          className={`score ${active === p.id ? 'score--active' : ''}`}
          style={{ '--c': p.color } as CSSProperties}
        >
          <span className="dot" />
          <span className="score__name">{p.name}</span>
          <b>{scores[p.id] ?? 0}</b>
        </div>
      ))}
    </div>
  );
}
