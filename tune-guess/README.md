# 🎵 TuneGuess

A music guessing game for the browser. Connect **Spotify** or **Apple Music**, pick your playlists, and take turns guessing songs from short clips. You can play alone or with friends on one screen.

No account? Use **Quick play**: pick a genre pack or type in your favourite artists and play 30-second previews right away.

## Game modes

| Mode | How it works |
| --- | --- |
| 🔢 **Multiple choice** | Pick the right song out of 4. Players take turns. 100 points per correct answer, plus up to 50 bonus points for answering quickly. |
| ⌨️ **Type it** | Type the song title (small typos are fine). Add the artist for +50 bonus points. |
| 🎉 **Party** | The clip plays for everyone and people shout their guesses. The host reveals the answer and taps who got the title (+1) and/or the artist (+1). |

Options: number of songs, listening time (5–30 s), and whether the clip starts at the beginning or somewhere in the middle of the song. After the game you'll see the ranking and a list of every song played, with links to open them.

## Run it on your computer

You need [Node.js](https://nodejs.org) 22 or newer.

```bash
cd tune-guess
npm install
npm run dev
```

Then open **http://127.0.0.1:5173**. Use that exact address: Spotify won't accept `localhost`.

To try it right away, click **Quick play**. Nothing else needs setting up.

## Connect Spotify

Spotify requires every app to be registered once. It's free, but **the person who registers the app needs Spotify Premium**.

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) and click **Create app**.
2. Under **Redirect URIs**, add the address TuneGuess shows on its Spotify screen:
   - on your computer: `http://127.0.0.1:5173/`
   - on GitHub Pages (see below): `https://yznnx.github.io/yznnx/`
3. Tick **Web API** and **Web Playback SDK**, then save.
4. Copy the **Client ID** into TuneGuess and click **Connect Spotify**.

Things to know about Spotify's current rules for personal ("Development Mode") apps:

- **Up to 5 people** can log in. Add your friends' Spotify emails under *User Management* in the dashboard.
- Songs can only be loaded from **playlists you created or collaborate on**, plus your Liked Songs and top songs. To use a playlist you only follow, copy its songs into a playlist of your own.
- **Full songs** play in the browser tab and need Premium plus a desktop browser (Chrome, Edge or Firefox). If that doesn't work, for example on a phone, choose **30-second previews**. TuneGuess then finds a preview for each song in Apple's public catalog.

## Connect Apple Music

Apple requires a **developer token**, and making one needs a paid [Apple Developer Program](https://developer.apple.com/programs/) membership.

1. In the Apple developer portal, create a **Media ID** with MusicKit enabled.
2. Under **Keys**, create a key with **Media Services (MusicKit)**. Download the `.p8` file and note the **Key ID** and your **Team ID**.
3. Create the token (valid for up to 6 months):
   ```bash
   npm run apple-token -- --team YOUR_TEAM_ID --key YOUR_KEY_ID --p8 ./AuthKey_XXXX.p8
   ```
   If the app is online, add `--origin https://yznnx.github.io` so the token only works on your site.
4. Paste the token into TuneGuess, then sign in with your Apple ID.

Apple Music subscribers hear full songs. Everyone else hears previews. Never commit the `.p8` file (it's already in `.gitignore`).

## Put it online (play on any phone or computer)

This repo includes a GitHub Actions workflow (`.github/workflows/deploy-tune-guess.yml`) that publishes the app to GitHub Pages.

1. On GitHub, open the repository's **Settings → Pages** and set **Source** to **GitHub Actions**.
2. Merge this into `main`, or run the "Deploy TuneGuess" workflow by hand.
3. The game will be at **https://yznnx.github.io/yznnx/**. Add that address as a Redirect URI in your Spotify app.

You can also install it like a desktop app: in Chrome or Edge, click the install icon in the address bar.

## Development

```bash
npm run dev      # dev server with hot reload
npm test         # unit tests (answer matching, scoring, song picking)
npm run build    # type-check and build into dist/
```

Built with React and Vite. There's no server: logins use OAuth PKCE (Spotify) and MusicKit (Apple) directly from the browser, and everything is saved in the browser's localStorage. The code layout:

- `src/lib/spotify.ts`: Spotify login, library and Web Playback SDK player
- `src/lib/appleMusic.ts`: Apple MusicKit library and player
- `src/lib/itunes.ts`: public iTunes catalog for Quick play and previews
- `src/lib/match.ts`: lenient matching for typed answers
- `src/lib/game.ts`: song shuffling, answer options and scoring
- `src/components/`: the screens (home, music pickers, setup, game, results)
