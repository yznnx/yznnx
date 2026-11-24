import { useEffect, useState } from 'react';
import type { MusicSelection, Playback, Track } from '../types';
import * as spotify from '../lib/spotify';
import { dedupeTracks } from '../lib/game';
import { BackButton, CopyField, ErrorBox, PickRow, PlaybackChoice, Spinner } from './ui';
import { SpotifyIcon } from './Home';

type TopRange = 'short_term' | 'medium_term' | 'long_term';
const TOP_LABELS: Record<TopRange, string> = {
  short_term: 'last 4 weeks',
  medium_term: 'last 6 months',
  long_term: 'all time',
};

export function SpotifySource({
  onBack,
  onReady,
  initialError,
}: {
  onBack: () => void;
  onReady: (s: MusicSelection) => void;
  initialError?: string;
}) {
  const [clientId, setClientIdState] = useState(spotify.getClientId());
  const [draftId, setDraftId] = useState(clientId);
  const [loggedIn, setLoggedIn] = useState(spotify.isLoggedIn());
  const [me, setMe] = useState<spotify.SpotifyUser | null>(null);
  const [playlists, setPlaylists] = useState<spotify.SpotifyPlaylist[] | null>(null);
  const [error, setError] = useState(initialError ?? '');
  const [busy, setBusy] = useState('');

  const [liked, setLiked] = useState(true);
  const [top, setTop] = useState<Record<TopRange, boolean>>({ short_term: false, medium_term: false, long_term: false });
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [playback, setPlayback] = useState<Playback>('spotify');

  useEffect(() => {
    if (!loggedIn) return;
    let cancelled = false;
    (async () => {
      try {
        const user = await spotify.getMe();
        if (cancelled) return;
        setMe(user);
        if (user.product && user.product !== 'premium') setPlayback('previews');
        const lists = await spotify.getPlaylists(user);
        if (!cancelled) setPlaylists(lists);
      } catch (err) {
        if (cancelled) return;
        setError((err as Error).message);
        if (!spotify.isLoggedIn()) setLoggedIn(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loggedIn]);

  const anyPicked = liked || Object.values(top).some(Boolean) || picked.size > 0;

  async function connect() {
    setError('');
    try {
      await spotify.login();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function loadSongs() {
    setError('');
    const parts: string[] = [];
    const all: Track[] = [];
    const failures: string[] = [];
    const run = async (name: string, fn: () => Promise<Track[]>) => {
      setBusy(`Loading ${name}…`);
      try {
        const tracks = await fn();
        all.push(...tracks);
        parts.push(name);
      } catch (err) {
        failures.push(`${name}: ${(err as Error).message}`);
      }
    };
    if (liked) await run('Liked Songs', () => spotify.getLikedSongs());
    for (const range of Object.keys(top) as TopRange[]) {
      if (top[range]) await run(`Top songs (${TOP_LABELS[range]})`, () => spotify.getTopTracks(range));
    }
    for (const p of playlists ?? []) {
      if (picked.has(p.id)) await run(p.name, () => spotify.getPlaylistTracks(p.id));
    }
    setBusy('');
    const pool = dedupeTracks(all);
    if (pool.length < 4) {
      setError(
        [
          pool.length === 0 ? 'No songs found in what you picked.' : `Only ${pool.length} songs found — pick more music (at least 4 songs).`,
          ...failures,
        ].join('\n'),
      );
      return;
    }
    onReady({
      source: 'spotify',
      label: `Spotify · ${parts.join(', ')}`,
      pool,
      playback,
      notice: failures.length ? `Skipped: ${failures.join(' ')}` : undefined,
    });
  }

  return (
    <div className="screen">
      <BackButton onClick={onBack} />
      <h1 className="screen-title">
        <SpotifyIcon /> Spotify
      </h1>
      <ErrorBox onClose={() => setError('')}>{error}</ErrorBox>

      {!clientId && (
        <section className="card setup">
          <h2>One-time setup (about 3 minutes)</h2>
          <p>
            Spotify needs every app to be registered. You only do this once, and it's free (the owner of the developer
            app needs Spotify Premium).
          </p>
          <ol>
            <li>
              Open the{' '}
              <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer">
                Spotify Developer Dashboard
              </a>{' '}
              and log in.
            </li>
            <li>
              Click <b>Create app</b>. Name it anything (e.g. "TuneGuess"). As <b>Redirect URI</b> add exactly:
              <CopyField value={spotify.redirectUri()} />
            </li>
            <li>
              Under "Which API/SDKs are you planning to use?" tick <b>Web API</b> and <b>Web Playback SDK</b>, then
              save.
            </li>
            <li>
              Copy the <b>Client ID</b> from the app's page and paste it here:
            </li>
          </ol>
          <div className="row">
            <input
              className="input"
              placeholder="Client ID (32 characters)"
              value={draftId}
              onChange={(e) => setDraftId(e.target.value)}
            />
            <button
              className="btn btn--primary"
              disabled={!/^[0-9a-f]{32}$/i.test(draftId.trim())}
              onClick={() => {
                spotify.setClientId(draftId);
                setClientIdState(draftId.trim());
              }}
            >
              Save
            </button>
          </div>
          <p className="hint">
            Friends who want to log in with their own Spotify must be added under <b>User Management</b> in the
            dashboard (Spotify allows up to 5 people for personal apps).
          </p>
        </section>
      )}

      {clientId && !loggedIn && (
        <section className="card center">
          <p>Log in so TuneGuess can see your playlists and songs. Nothing is changed in your account.</p>
          <button className="btn btn--spotify btn--big" onClick={connect}>
            Connect Spotify
          </button>
          <button
            className="link"
            onClick={() => {
              spotify.setClientId('');
              setClientIdState('');
              setDraftId('');
            }}
          >
            Change Client ID
          </button>
        </section>
      )}

      {clientId && loggedIn && (
        <>
          <div className="account">
            <span>
              Connected as <b>{me?.display_name ?? me?.id ?? '…'}</b>
              {me?.product && me.product !== 'premium' && <em className="tag">Free account</em>}
            </span>
            <button
              className="link"
              onClick={() => {
                spotify.logout();
                setLoggedIn(false);
                setMe(null);
                setPlaylists(null);
              }}
            >
              Disconnect
            </button>
          </div>

          <h2 className="section-title">Pick the music</h2>
          <div className="picks">
            <PickRow checked={liked} onChange={setLiked} emoji="💚" title="Liked Songs" subtitle="Songs you saved" />
            {(Object.keys(TOP_LABELS) as TopRange[]).map((r) => (
              <PickRow
                key={r}
                checked={top[r]}
                onChange={(v) => setTop({ ...top, [r]: v })}
                emoji="🔥"
                title="Your top songs"
                subtitle={TOP_LABELS[r]}
              />
            ))}
          </div>

          <h3 className="sub-title">Your playlists</h3>
          {!playlists && !error && <Spinner label="Loading playlists…" />}
          {playlists && playlists.length === 0 && <p className="hint">No playlists found.</p>}
          {playlists && playlists.length > 0 && (
            <div className="picks">
              {playlists.map((p) => (
                <PickRow
                  key={p.id}
                  checked={picked.has(p.id)}
                  onChange={(v) => {
                    const next = new Set(picked);
                    if (v) next.add(p.id);
                    else next.delete(p.id);
                    setPicked(next);
                  }}
                  image={p.image}
                  title={p.name}
                  subtitle={
                    <>
                      {p.total != null && `${p.total} songs`}
                      {!p.ownedOrCollab && <em className="tag tag--warn">followed – Spotify may block it</em>}
                    </>
                  }
                />
              ))}
            </div>
          )}

          <h2 className="section-title">How should songs play?</h2>
          <PlaybackChoice
            value={playback}
            onChange={setPlayback}
            options={[
              {
                value: 'spotify',
                title: 'Full songs via Spotify',
                text: 'Needs Spotify Premium. Plays in this browser (Chrome, Edge or Firefox on a computer).',
              },
              {
                value: 'previews',
                title: '30-second previews',
                text: 'Works without Premium and on phones. A few songs may be skipped if no preview exists.',
              },
            ]}
          />

          <div className="footer-bar">
            {busy ? (
              <Spinner label={busy} />
            ) : (
              <button className="btn btn--primary btn--big" disabled={!anyPicked} onClick={loadSongs}>
                Continue
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
