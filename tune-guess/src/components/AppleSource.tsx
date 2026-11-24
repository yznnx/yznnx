import { useEffect, useState } from 'react';
import type { MusicSelection, Playback, Track } from '../types';
import * as apple from '../lib/appleMusic';
import { dedupeTracks } from '../lib/game';
import { BackButton, ErrorBox, PickRow, PlaybackChoice, Spinner } from './ui';
import { AppleMusicIcon } from './Home';

export function AppleSource({ onBack, onReady }: { onBack: () => void; onReady: (s: MusicSelection) => void }) {
  const [token, setToken] = useState(apple.getDeveloperToken());
  const [draft, setDraft] = useState('');
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [playlists, setPlaylists] = useState<apple.ApplePlaylist[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const [library, setLibrary] = useState(true);
  const [recent, setRecent] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [playback, setPlayback] = useState<Playback>('apple');

  const expiry = token ? apple.tokenExpiry(token) : null;
  const expired = !!expiry && expiry.getTime() < Date.now();

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    apple.isAuthorized().then((ok) => !cancelled && setAuthorized(ok));
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!authorized) return;
    let cancelled = false;
    apple
      .getLibraryPlaylists()
      .then((p) => !cancelled && setPlaylists(p))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [authorized]);

  async function signIn() {
    setError('');
    setBusy('Waiting for Apple Music sign-in…');
    try {
      await apple.authorize();
      setAuthorized(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy('');
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
        all.push(...(await fn()));
        parts.push(name);
      } catch (err) {
        failures.push(`${name}: ${(err as Error).message}`);
      }
    };
    if (library) await run('Library songs', () => apple.getLibrarySongs());
    if (recent) await run('Recently played', () => apple.getRecentlyPlayed());
    for (const p of playlists ?? []) {
      if (picked.has(p.id)) await run(p.name, () => apple.getPlaylistTracks(p.id));
    }
    setBusy('');
    const pool = dedupeTracks(all);
    if (pool.length < 4) {
      setError(
        [pool.length === 0 ? 'No songs found in what you picked.' : `Only ${pool.length} songs found — pick more music.`, ...failures].join(
          '\n',
        ),
      );
      return;
    }
    onReady({
      source: 'apple',
      label: `Apple Music · ${parts.join(', ')}`,
      pool,
      playback,
      notice: failures.length ? `Skipped: ${failures.join(' ')}` : undefined,
    });
  }

  return (
    <div className="screen">
      <BackButton onClick={onBack} />
      <h1 className="screen-title">
        <AppleMusicIcon /> Apple Music
      </h1>
      <ErrorBox onClose={() => setError('')}>{error}</ErrorBox>

      {(!token || expired) && (
        <section className="card setup">
          <h2>{expired ? 'Your developer token expired' : 'One-time setup'}</h2>
          <p>
            Apple only lets apps use Apple Music with a <b>developer token</b>. Making one needs an{' '}
            <a href="https://developer.apple.com/programs/" target="_blank" rel="noreferrer">
              Apple Developer account
            </a>{' '}
            (paid). If you don't have one, use <b>Quick play</b> instead — it also uses Apple's music catalog.
          </p>
          <ol>
            <li>
              In{' '}
              <a href="https://developer.apple.com/account/resources/identifiers/list/musicId" target="_blank" rel="noreferrer">
                Certificates, Identifiers &amp; Profiles
              </a>{' '}
              create a <b>Media ID</b> with MusicKit enabled.
            </li>
            <li>
              Under{' '}
              <a href="https://developer.apple.com/account/resources/authkeys/list" target="_blank" rel="noreferrer">
                Keys
              </a>{' '}
              create a key with <b>Media Services (MusicKit)</b>, download the <code>.p8</code> file and note the Key ID
              and your Team ID.
            </li>
            <li>
              In the <code>tune-guess</code> folder run:
              <pre>npm run apple-token -- --team YOUR_TEAM_ID --key YOUR_KEY_ID --p8 AuthKey_XXXX.p8</pre>
            </li>
            <li>Paste the token it prints here:</li>
          </ol>
          <textarea
            className="input"
            rows={3}
            placeholder="eyJhbGciOiJFUzI1NiIs…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button
            className="btn btn--primary"
            disabled={draft.trim().split('.').length !== 3}
            onClick={() => {
              apple.setDeveloperToken(draft);
              setToken(draft.trim());
              setDraft('');
              setAuthorized(null);
            }}
          >
            Save token
          </button>
        </section>
      )}

      {token && !expired && authorized === null && <Spinner label="Loading Apple Music…" />}

      {token && !expired && authorized === false && (
        <section className="card center">
          <p>Sign in with your Apple ID so TuneGuess can see your library. Nothing is changed in your account.</p>
          {busy ? (
            <Spinner label={busy} />
          ) : (
            <button className="btn btn--apple btn--big" onClick={signIn}>
              Sign in to Apple Music
            </button>
          )}
          {expiry && <p className="hint">Developer token valid until {expiry.toLocaleDateString()}.</p>}
          <button
            className="link"
            onClick={() => {
              apple.setDeveloperToken('');
              setToken('');
            }}
          >
            Change developer token
          </button>
        </section>
      )}

      {token && !expired && authorized && (
        <>
          <div className="account">
            <span>Signed in to Apple Music</span>
            <button
              className="link"
              onClick={async () => {
                await apple.signOut();
                setAuthorized(false);
                setPlaylists(null);
              }}
            >
              Sign out
            </button>
          </div>

          <h2 className="section-title">Pick the music</h2>
          <div className="picks">
            <PickRow checked={library} onChange={setLibrary} emoji="📚" title="Your library" subtitle="Songs you added" />
            <PickRow checked={recent} onChange={setRecent} emoji="🕘" title="Recently played" />
          </div>

          <h3 className="sub-title">Your playlists</h3>
          {!playlists && !error && <Spinner label="Loading playlists…" />}
          {playlists && playlists.length === 0 && <p className="hint">No playlists in your library.</p>}
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
                value: 'apple',
                title: 'Apple Music',
                text: 'Full songs with an Apple Music subscription, otherwise previews.',
              },
              {
                value: 'previews',
                title: '30-second previews',
                text: 'Plain preview files. Use this if Apple Music playback has trouble in your browser.',
              },
            ]}
          />

          <div className="footer-bar">
            {busy ? (
              <Spinner label={busy} />
            ) : (
              <button className="btn btn--primary btn--big" disabled={!library && !recent && picked.size === 0} onClick={loadSongs}>
                Continue
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
