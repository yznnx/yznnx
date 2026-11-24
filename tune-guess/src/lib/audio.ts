import type { Track } from '../types';

/** Something that can play a track from a given position. */
export interface AudioEngine {
  readonly label: string;
  /** True when only ~30 s previews can be played (affects where clips start). */
  readonly previewOnly: boolean;
  /** Call synchronously inside a click handler: unlocks audio on iOS/Safari. */
  unlock(): void;
  /** Starts playback; resolves once audio is actually playing. */
  play(track: Track, offsetSec: number): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  setVolume(volume: number): void;
  dispose(): void;
}

/** A tiny silent WAV, used to unlock the <audio> element during a user gesture. */
function silentWav(): string {
  const sampleRate = 8000;
  const samples = 800;
  const bytes = new Uint8Array(44 + samples);
  const view = new DataView(bytes.buffer);
  const write = (offset: number, s: string) => [...s].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  write(0, 'RIFF');
  view.setUint32(4, 36 + samples, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  write(36, 'data');
  view.setUint32(40, samples, true);
  bytes.fill(128, 44);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return `data:audio/wav;base64,${btoa(bin)}`;
}

function waitForEvent(el: HTMLMediaElement, ok: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = () => {
      clearTimeout(timer);
      el.removeEventListener(ok, onOk);
      el.removeEventListener('error', onErr);
    };
    const onOk = () => {
      done();
      resolve();
    };
    const onErr = () => {
      done();
      reject(new Error('This song could not be loaded.'));
    };
    const timer = setTimeout(() => {
      done();
      reject(new Error('This song took too long to load.'));
    }, timeoutMs);
    el.addEventListener(ok, onOk);
    el.addEventListener('error', onErr);
  });
}

/** Plays 30-second preview files with a plain <audio> element. Works everywhere, no account needed. */
export class PreviewEngine implements AudioEngine {
  readonly label = '30-second previews';
  readonly previewOnly = true;
  private audio = new Audio();
  private unlocked = false;

  constructor() {
    this.audio.preload = 'auto';
    this.audio.volume = 0.9;
  }

  unlock(): void {
    if (this.unlocked) return;
    this.unlocked = true;
    const a = this.audio;
    if (!a.src) {
      a.src = silentWav();
      a.play().catch(() => {});
    }
  }

  async play(track: Track, offsetSec: number): Promise<void> {
    if (!track.previewUrl) throw new Error('No preview available for this song.');
    const a = this.audio;
    a.pause();
    if (a.src !== track.previewUrl) {
      a.src = track.previewUrl;
      a.load();
      if (a.readyState < 1) await waitForEvent(a, 'loadedmetadata', 12000);
    }
    a.currentTime = offsetSec;
    await a.play();
  }

  async pause(): Promise<void> {
    this.audio.pause();
  }

  async resume(): Promise<void> {
    if (this.audio.src) await this.audio.play().catch(() => {});
  }

  setVolume(volume: number): void {
    this.audio.volume = volume;
  }

  dispose(): void {
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
  }
}
