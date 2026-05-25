# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PWA Player is a vanilla JavaScript Progressive Web App — an offline-capable media player for video, audio, and IPTV streams. It is intentionally lightweight (~200KB minified) with zero framework dependencies.

## Tech Stack

- **No framework** — vanilla JavaScript, HTML, CSS
- **No bundler** — manual minification via a custom build script
- **Video/Audio** — HTML5 `<video>` element; HLS.js (v1.5.7, lazy-loaded from CDN) for M3U8 streams
- **Storage** — IndexedDB for offline media persistence
- **PWA** — Service Worker (cache-first strategy) + Web App Manifest with file handlers

## Directory Structure

| Path | Purpose |
|---|---|
| `source/` | Unminified source code (development) |
| `docs/` | Minified build output (production, deployed via GitHub Pages) |
| `build/` | Build tooling and converters |
| `cors-bypass/` | Standalone Node.js CORS proxy server |
| `tvs/` | TV channel data |

## Key Source Files

| File | Purpose |
|---|---|
| `player.js` | Core video/audio playback logic (~89KB, largest JS file) |
| `storage.js` | Media storage management via IndexedDB (~146KB) |
| `settings.js` | Settings/preferences UI |
| `playlist.js` | Playlist management |
| `iptv.js` / `iptvchannels.js` | IPTV stream handling and channel list |
| `embeddedplayer.js` | Embedded third-party player orchestrator |
| `extrafeatures.js` | Speed control, A-B loop, etc. |
| `hls.js` | HLS.js loader/initializer |
| `sw.js` / `sw-register.js` | Service Worker registration |
| `locale.js` | Internationalization (en, zh-CN, ja) |
| `wakelock.js` | Screen wake lock API |
| `manifest.json` | PWA manifest with file handlers |

### Platform Adapters

`source/platforms/` contains embedded player adapters for external platforms (YouTube, Spotify, Twitch, Vimeo, Bilibili, TikTok, SoundCloud, Apple Music, Kick, NetEase Music). Each extends a base class defined in `embeddedplayer.js`.

### Locales

`source/locales/` contains translation files: `en.js`, `zhcn.js`, `ja.js`.

## Commands

**Build (minify source → docs/):**
```bash
node build/build.js <project_root>
```

**CORS proxy (for local testing):**
```bash
node cors-bypass/server.js [port] [--no-proxy]
```

**M3U8 to channels converter:**
```bash
node build/m3u8_to_channels.js input.m3u8 output.js
# or
python build/m3u8_to_channels.py
```

**No lint or test commands exist** — the project has no formal linting or testing infrastructure.

## Architecture Notes

- **No `package.json`** — it's gitignored. Build dependencies (`uglify-js`, `html-minifier-terser`, `clean-css`) must be installed separately.
- **`source/` is the working directory** — make all edits here, not in `docs/`.
- **Build is a simple minification pipeline** — `walk(source/)` → minify HTML/CSS/JS → output to `docs/`. No bundling, no module resolution, no transpilation.
- **Service Worker version** is tracked as a comment in `sw.js` (currently v438).
- **Git commit messages** are short, imperative, lowercase — e.g., "add hls.js support", "change retry count to 8".
- **HLS.js is lazy-loaded** from jsDelivr CDN at runtime, not bundled.

