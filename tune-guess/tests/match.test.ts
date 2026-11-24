import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isArtistMatch, isTitleMatch, normalize, titleKey } from '../src/lib/match.ts';
import { buildOptions, dedupeTracks, pickOffset, scoreCorrect, RoundSource } from '../src/lib/game.ts';
import type { Track } from '../src/types.ts';

test('normalize strips accents, punctuation and leading "the"', () => {
  assert.equal(normalize('Beyoncé'), 'beyonce');
  assert.equal(normalize("Don't Stop Me Now!"), 'dont stop me now');
  assert.equal(normalize('The Scientist'), 'scientist');
  assert.equal(normalize('Rock & Roll'), 'rock and roll');
});

test('titleKey ignores features, remasters and brackets', () => {
  assert.equal(titleKey('Bohemian Rhapsody - Remastered 2011'), 'bohemian rhapsody');
  assert.equal(titleKey('Stay (with Justin Bieber)'), 'stay');
  assert.equal(titleKey('Lose Yourself [From "8 Mile"]'), 'lose yourself');
  assert.equal(titleKey('Love Me Again feat. Someone'), 'love me again');
});

test('title matching is forgiving but not too forgiving', () => {
  assert.ok(isTitleMatch('bohemian rhapsody', 'Bohemian Rhapsody - Remastered 2011'));
  assert.ok(isTitleMatch('bohemian rapsody', 'Bohemian Rhapsody'));
  assert.ok(isTitleMatch('dont stop me now', "Don't Stop Me Now - Remastered"));
  assert.ok(isTitleMatch('Stay', 'Stay (with Justin Bieber)'));
  assert.ok(isTitleMatch('99 luftballons', '99 Luftballons'));
  assert.ok(!isTitleMatch('Stay', 'Shout'));
  assert.ok(!isTitleMatch('hello', 'Halo'));
  assert.ok(!isTitleMatch('', 'Anything'));
  assert.ok(!isTitleMatch('love', 'Love Story'));
});

test('artist matching accepts any of several artists', () => {
  assert.ok(isArtistMatch('queen', 'Queen'));
  assert.ok(isArtistMatch('beyonce', 'Beyoncé'));
  assert.ok(isArtistMatch('justin bieber', 'The Kid LAROI, Justin Bieber'));
  assert.ok(isArtistMatch('dua lipa', 'Calvin Harris & Dua Lipa'));
  assert.ok(!isArtistMatch('adele', 'Queen'));
});

const t = (id: string, title: string, artist = 'Artist'): Track => ({ id, title, artist });

test('dedupeTracks removes remasters of the same song', () => {
  const out = dedupeTracks([t('1', 'Song A'), t('2', 'Song A - Remastered'), t('3', 'Song A', 'Other'), t('4', 'Song B')]);
  assert.deepEqual(out.map((x) => x.id), ['1', '3', '4']);
});

test('buildOptions gives 4 distinct titles including the answer', () => {
  const pool = ['A', 'B', 'C', 'D', 'E', 'A - Live'].map((x, i) => t(String(i), x));
  for (let i = 0; i < 50; i++) {
    const opts = buildOptions(pool[0], pool);
    assert.equal(opts.length, 4);
    assert.ok(opts.some((o) => o.id === '0'));
    assert.equal(new Set(opts.map((o) => titleKey(o.title))).size, 4);
  }
});

test('pickOffset stays within the playable range', () => {
  for (let i = 0; i < 200; i++) {
    const p = pickOffset({ startAt: 'random', clipSeconds: 15, previewOnly: true });
    assert.ok(p >= 0 && p + 15 <= 30, `preview offset ${p}`);
    const f = pickOffset({ startAt: 'random', clipSeconds: 10, durationMs: 200_000, previewOnly: false });
    assert.ok(f >= 40 && f <= 120, `full offset ${f}`);
  }
  assert.equal(pickOffset({ startAt: 'start', clipSeconds: 10, previewOnly: false }), 0);
});

test('scoreCorrect rewards speed', () => {
  assert.equal(scoreCorrect(0, 10), 150);
  assert.equal(scoreCorrect(5, 10), 125);
  assert.equal(scoreCorrect(30, 10), 100);
});

test('RoundSource skips songs that cannot be played and ends with null', async () => {
  // Many runs, because the pool is shuffled and songs resolve ahead of time in parallel.
  for (let run = 0; run < 300; run++) {
    const pool = ['a', 'b', 'c', 'd', 'e', 'f'].map((x) => t(x, x));
    const playable = new Set(['a', 'c', 'f']);
    const src = new RoundSource(pool, async (x) => {
      if (Math.random() < 0.5) await new Promise((r) => setTimeout(r, Math.random() * 3));
      return playable.has(x.id) ? x : null;
    });
    const got = [await src.next(), await src.next(), await src.next(), await src.next()];
    assert.deepEqual(got.slice(0, 3).map((x) => x?.id).sort(), ['a', 'c', 'f']);
    assert.equal(got[3], null);
  }
});
