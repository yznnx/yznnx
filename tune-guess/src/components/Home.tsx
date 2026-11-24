import type { SourceKind } from '../types';
import { Equalizer } from './ui';

export function Home({ onPick, spotifyName }: { onPick: (s: SourceKind) => void; spotifyName?: string }) {
  return (
    <div className="screen home">
      <header className="hero">
        <Equalizer active bars={7} />
        <h1>
          Tune<span>Guess</span>
        </h1>
        <p>Connect your music, hear a few seconds, guess the song. Play solo or with friends on one screen.</p>
      </header>

      <h2 className="section-title">Where is your music?</h2>
      <div className="sources">
        <button className="source source--spotify" onClick={() => onPick('spotify')}>
          <span className="source__icon">
            <SpotifyIcon />
          </span>
          <strong>Spotify</strong>
          <small>{spotifyName ? `Connected as ${spotifyName}` : 'Your playlists, liked songs and top tracks'}</small>
        </button>
        <button className="source source--apple" onClick={() => onPick('apple')}>
          <span className="source__icon">
            <AppleMusicIcon />
          </span>
          <strong>Apple Music</strong>
          <small>Your library, playlists and recently played songs</small>
        </button>
        <button className="source source--quick" onClick={() => onPick('quick')}>
          <span className="source__icon">⚡</span>
          <strong>Quick play</strong>
          <small>No account needed: pick a genre or your favourite artists</small>
        </button>
      </div>

      <section className="how">
        <div>
          <b>1</b>
          <span>Pick your music</span>
        </div>
        <div>
          <b>2</b>
          <span>Add players</span>
        </div>
        <div>
          <b>3</b>
          <span>Listen &amp; guess</span>
        </div>
      </section>
    </div>
  );
}

export function SpotifyIcon() {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden>
      <circle cx="12" cy="12" r="12" fill="#1ed760" />
      <path
        d="M17.3 16.6a.75.75 0 0 1-1 .25c-2.8-1.7-6.3-2.1-10.4-1.2a.75.75 0 1 1-.33-1.46c4.5-1 8.4-.56 11.5 1.36.36.22.47.69.24 1.05Zm1.4-3.2a.94.94 0 0 1-1.3.31c-3.2-2-8.1-2.5-11.9-1.4a.94.94 0 1 1-.54-1.8c4.3-1.3 9.7-.68 13.4 1.6.44.27.58.85.31 1.29Zm.12-3.3C15 7.8 8.6 7.6 4.9 8.7a1.12 1.12 0 1 1-.65-2.15c4.3-1.3 11.3-1.05 15.7 1.57a1.12 1.12 0 0 1-1.15 1.93Z"
        fill="#000"
      />
    </svg>
  );
}

export function AppleMusicIcon() {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden>
      <rect width="24" height="24" rx="6" fill="url(#am)" />
      <defs>
        <linearGradient id="am" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff5e7e" />
          <stop offset="1" stopColor="#fa233b" />
        </linearGradient>
      </defs>
      <path
        d="M16.5 5.2v9.3a2.3 2.3 0 1 1-1.4-2.1V8.3l-5.6 1.2v6.6a2.3 2.3 0 1 1-1.4-2.1V7.2l8.4-2Z"
        fill="#fff"
      />
    </svg>
  );
}
