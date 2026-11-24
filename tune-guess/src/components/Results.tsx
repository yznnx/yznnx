import type { CSSProperties } from 'react';
import type { GameSettings, Player, RoundResult } from '../types';
import { Cover } from './ui';

export function Results({
  players,
  scores,
  results,
  mode,
  onPlayAgain,
  onChangeMusic,
}: {
  players: Player[];
  scores: Record<string, number>;
  results: RoundResult[];
  mode: GameSettings['mode'];
  onPlayAgain: () => void;
  onChangeMusic: () => void;
}) {
  const ranked = players.slice().sort((a, b) => (scores[b.id] ?? 0) - (scores[a.id] ?? 0));
  const best = scores[ranked[0]?.id] ?? 0;
  const winners = ranked.filter((p) => (scores[p.id] ?? 0) === best);
  const byId = Object.fromEntries(players.map((p) => [p.id, p]));
  const correct = results.filter((r) => Object.values(r.points).some((v) => v > 0)).length;

  let headline: string;
  if (players.length === 1) {
    headline = `You got ${correct} of ${results.length} songs!`;
  } else if (best === 0) {
    headline = 'Nobody scored… rematch?';
  } else if (winners.length > 1) {
    headline = `It's a tie: ${winners.map((w) => w.name).join(' & ')}!`;
  } else {
    headline = `${winners[0].name} wins!`;
  }

  return (
    <div className="screen results">
      <div className="confetti" aria-hidden>
        {Array.from({ length: 24 }, (_, i) => (
          <i key={i} style={{ '--i': i } as CSSProperties} />
        ))}
      </div>
      <h1 className="screen-title center">🏆 {headline}</h1>

      <ol className="ranking">
        {ranked.map((p) => {
          // Players with the same score share a place.
          const place = ranked.findIndex((q) => (scores[q.id] ?? 0) === (scores[p.id] ?? 0));
          return (
          <li key={p.id} className={place === 0 && best > 0 ? 'first' : ''} style={{ '--c': p.color } as CSSProperties}>
            <span className="ranking__place">{['🥇', '🥈', '🥉'][place] ?? `${place + 1}.`}</span>
            <span className="dot" />
            <span className="ranking__name">{p.name}</span>
            <b>
              {scores[p.id] ?? 0}
              <small> pts</small>
            </b>
          </li>
          );
        })}
      </ol>

      <div className="row center">
        <button className="btn btn--primary btn--big" onClick={onPlayAgain}>
          ↻ Play again
        </button>
        <button className="btn btn--big" onClick={onChangeMusic}>
          🎵 Other music
        </button>
      </div>

      <h2 className="section-title">Songs in this game</h2>
      <ul className="played">
        {results.map((r, i) => {
          const who = r.playerId ? byId[r.playerId] : undefined;
          const winnersOfSong = Object.entries(r.points)
            .filter(([, v]) => v > 0)
            .map(([id, v]) => `${byId[id]?.name ?? '?'} +${v}`);
          return (
            <li key={`${r.track.id}-${i}`}>
              <Cover src={r.track.artwork} alt="" size={48} />
              <div className="played__text">
                <strong>{r.track.title}</strong>
                <small>
                  {r.track.artist}
                  {r.track.year ? ` · ${r.track.year}` : ''}
                </small>
              </div>
              <div className="played__result">
                {mode === 'party'
                  ? winnersOfSong.join(', ') || '—'
                  : `${who && players.length > 1 ? `${who.name}: ` : ''}${r.note ?? ''}${
                      r.playerId && r.points[r.playerId] ? ` +${r.points[r.playerId]}` : ''
                    }`}
              </div>
              {r.track.link && (
                <a className="link" href={r.track.link} target="_blank" rel="noreferrer" title="Open song">
                  ↗
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
