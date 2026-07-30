# couchpad.games

Static landing site for **CouchPad** — the umbrella brand for party games
where everyone plays together on the TV/screen and phones are the controllers
(scan a QR to play, no install required).

Flagship game: **HexStacker Party** (live at [hexstacker.com](https://hexstacker.com),
coming to Apple TV & Android TV). Also in development: **Tiny Track** (kart
racer) and **Powder** (skiing).

## Design

Neutral **MONO graphite chrome**, mirroring the CouchPad Controller launcher
(console-shell pattern — the game posters carry the color, the chrome stays
neutral). Stock system type, Material 3 surface values, follows the system
light/dark setting. Tokens live in `assets/theme.css`.

## Structure

- `index.html`, `de/index.html` — landing page (EN / DE)
- `room.html` + `assets/room.js` — room join page, served at `/<CODE>#<instance>`
  (nginx maps any 6-char base58 path to it); browser fallback for the app deep
  links in `.well-known/`
- `games-manifest.json` — drives the room page and is fetched by the controller
  apps. Keep in sync with the controller repo's bundled copy; when a poster's
  bytes change, bump the `?v=` in its `art` path (the apps cache artwork by URL)
- `privacy.html`, `imprint.html` — legal pages (German, umbrella policy for all
  CouchPad infra); English versions in `en/`
- `assets/` — CSS (design tokens in `theme.css`) and 16×9 game posters in
  `artwork/`
- `nginx.conf`, `Dockerfile` — the deployed container; fully static otherwise

## Local preview

```sh
python3 -m http.server 8000
```
