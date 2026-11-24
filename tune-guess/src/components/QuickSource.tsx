import { useState } from 'react';
import type { MusicSelection, Track } from '../types';
import { PACKS } from '../lib/packs';
import { searchSongs, songsByArtist } from '../lib/itunes';
import { dedupeTracks } from '../lib/game';
import { BackButton, ErrorBox, PickRow, Spinner } from './ui';

export function QuickSource({ onBack, onReady }: { onBack: () => void; onReady: (s: MusicSelection) => void }) {
  const [picked, setPicked] = useState<Set<string>>(new Set(['pop']));
  const [artists, setArtists] = useState('');
  const [term, setTerm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const customArtists = artists
    .split(/[,;\n]/)
    .map((a) => a.trim())
    .filter(Boolean);
  const canGo = picked.size > 0 || customArtists.length > 0 || term.trim().length > 1;

  async function load() {
    setError('');
    const names: string[] = [];
    const artistList = new Set<string>(customArtists);
    for (const p of PACKS) {
      if (picked.has(p.id)) {
        names.push(p.name);
        p.artists.forEach((a) => artistList.add(a));
      }
    }
    if (customArtists.length) names.push(customArtists.join(', '));

    const all: Track[] = [];
    let failures = 0;
    const list = [...artistList];
    // Fewer songs per artist when many artists are mixed, so loading stays quick.
    const perArtist = list.length > 20 ? 8 : list.length > 10 ? 10 : 15;
    for (let i = 0; i < list.length; i++) {
      setBusy(`Finding songs… ${i + 1}/${list.length} (${list[i]})`);
      try {
        all.push(...(await songsByArtist(list[i], undefined, perArtist)));
      } catch {
        failures++;
      }
    }
    if (term.trim()) {
      setBusy(`Searching "${term.trim()}"…`);
      try {
        all.push(...(await searchSongs(term.trim())));
        names.push(`"${term.trim()}"`);
      } catch {
        failures++;
      }
    }
    setBusy('');
    const pool = dedupeTracks(all);
    if (pool.length < 4) {
      setError(
        failures
          ? 'Could not reach the music catalog. Check your internet connection and try again.'
          : 'Not enough songs found. Try other artists or another pack.',
      );
      return;
    }
    onReady({ source: 'quick', label: names.join(' + '), pool, playback: 'previews' });
  }

  return (
    <div className="screen">
      <BackButton onClick={onBack} />
      <h1 className="screen-title">⚡ Quick play</h1>
      <p className="lead">No login needed. Songs play as 30-second previews from Apple's public music catalog.</p>
      <ErrorBox onClose={() => setError('')}>{error}</ErrorBox>

      <h2 className="section-title">Song packs</h2>
      <div className="picks picks--grid">
        {PACKS.map((p) => (
          <PickRow
            key={p.id}
            checked={picked.has(p.id)}
            onChange={(v) => {
              const next = new Set(picked);
              if (v) next.add(p.id);
              else next.delete(p.id);
              setPicked(next);
            }}
            emoji={p.emoji}
            title={p.name}
            subtitle={p.artists.slice(0, 3).join(', ') + '…'}
          />
        ))}
      </div>

      <h2 className="section-title">Your own artists</h2>
      <textarea
        className="input"
        rows={2}
        placeholder="e.g. Queen, Adele, Linkin Park"
        value={artists}
        onChange={(e) => setArtists(e.target.value)}
      />
      <p className="hint">Separate artists with commas. Great for "who knows the most songs by …" rounds.</p>

      <h2 className="section-title">Or search anything</h2>
      <input
        className="input"
        placeholder='e.g. "christmas", "disney", "eurovision"'
        value={term}
        onChange={(e) => setTerm(e.target.value)}
      />

      <div className="footer-bar">
        {busy ? (
          <Spinner label={busy} />
        ) : (
          <button className="btn btn--primary btn--big" disabled={!canGo} onClick={load}>
            Continue
          </button>
        )}
      </div>
    </div>
  );
}
