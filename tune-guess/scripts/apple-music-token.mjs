#!/usr/bin/env node
/**
 * Creates an Apple Music developer token (a JWT signed with your MusicKit private key).
 *
 *   npm run apple-token -- --team ABCDE12345 --key XYZ987WVUT --p8 ./AuthKey_XYZ987WVUT.p8 [--days 180] [--origin https://you.github.io]
 *
 * You need an Apple Developer Program membership:
 *   1. developer.apple.com → Certificates, Identifiers & Profiles → Identifiers → "+" → Media IDs (enable MusicKit)
 *   2. Keys → "+" → enable "Media Services (MusicKit, ShazamKit, Apple Music Feed)" → download the .p8 file
 *   3. Your Team ID is shown at the top right of the developer portal.
 *
 * The token is valid for at most 180 days. Keep the .p8 file private; the token itself is meant to be used in the browser.
 * With --origin the token only works on that website (recommended when the app is online).
 */
import { createPrivateKey, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

const team = arg('team');
const keyId = arg('key');
const p8 = arg('p8');
const days = Math.min(Number(arg('days') ?? 180), 180);
const origins = arg('origin')?.split(',').map((o) => o.trim()).filter(Boolean);

if (!team || !keyId || !p8) {
  console.error('Usage: npm run apple-token -- --team TEAM_ID --key KEY_ID --p8 path/to/AuthKey.p8 [--days 180] [--origin https://example.com]');
  process.exit(1);
}

const b64url = (input) => Buffer.from(input).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const header = { alg: 'ES256', kid: keyId };
const payload = { iss: team, iat: now, exp: now + days * 24 * 60 * 60, ...(origins?.length ? { origin: origins } : {}) };
const data = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
const key = createPrivateKey(readFileSync(p8, 'utf8'));
const signature = sign('sha256', Buffer.from(data), { key, dsaEncoding: 'ieee-p1363' });

console.log(`${data}.${b64url(signature)}`);
console.error(`\n✔ Token valid until ${new Date(payload.exp * 1000).toLocaleDateString()}. Paste it into TuneGuess → Apple Music.`);
