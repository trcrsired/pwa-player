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

## Media Playback Flow

- **Entry point**: `play_source(sourceobject, playlist)` → `play_source_internal(blobURL, mediametadata, sourceobject, playlist)` — this is the canonical playback path
- **Embedded URLs** (YouTube, Spotify, etc.) are detected via `isEmbeddedUrl()` and routed to `playEmbeddedUrl()` instead
- **Image files** are routed to `window.viewImage()` instead of video playback
- **MediaSession**: `navigator.mediaSession.metadata` is set in `play_source_internal` with title/artist/album from the entry. When a cover image is loaded, `artwork` is added to the metadata
- **Sidecar files** (subtitles + covers): auto-loaded via `tryAutoLoadSidecars()` which looks for `.vtt` and `.cover.webp` alongside the media file across HTTP, IndexedDB, and file system paths
  - Subtitles: controlled by `isSubtitleInMediaSessionEnabled()` — subtitle text appears in MediaSession by replacing title/artist fields
  - Covers: controlled by `isAutoLoadCoverEnabled()` — always set as MediaSession `artwork`, shown full-viewport for audio-only files (same detection as `speedAudioOnly`: `videoWidth === 0 || videoHeight === 0`)
  - Cover display: `showAudioCover()` uses `position: absolute; inset: 0` within `#playerWrapper` to fill the viewport on top of the video element. Video element gets `position: relative; z-index: 1; background: transparent` so subtitles render above the cover. Cover uses `object-fit: contain` for correct display on any screen orientation.
- **Cover files are excluded from storage listings** by `isCoverFile()` in `storage.js` — `isPlayableOrImageFile()` returns `false` for `.cover.webp`, so they don't appear in bulk directory-add operations. Manual single-file play/add of `.cover.webp` is still allowed in menu actions (each handler checks `isCoverFile()` explicitly and permits it).
- **Remote storage listing is unfiltered** — `parseRemoteDirectoryListing()` no longer restricts to playable/image/subtitle files; it shows all files for consistency with external/navigator storage. Cover file exclusion still applies via `isPlayableOrImageFile()` when remote entries are used in other contexts.

## Key Helpers

- `tryAutoLoadSidecars(entryPath)` — merged function that loads both `.vtt` subtitles and `.cover.webp` images alongside a media file
- `isPlayableOrImageFile(name)` — filters for storage listings and bulk playlist adds; excludes `.cover.webp`
- `isCoverFile(name)` — detects `*.cover.webp` files; used to exclude from listings but allow manual operations
- `isImageFile(name)` — detects image extensions; used for routing and filtering
- `isSubtitleFile(name)` — detects `.vtt` files; allows manual "load subtitle" menu action
- `setCoverFromBlob(blob)` / `setCoverFromUrl(url)` — loads a cover image, sets MediaSession `artwork`, and calls `showAudioCover()`
- `showAudioCover()` / `hideAudioCover()` — shows/hides the `#audioCover` element; only shown for audio-only files (no video dimensions), fills the viewport with `object-fit: contain`
- `currentCoverURL` — global that stores the current cover image blob URL; `hideAudioCover()` sets it to null
- `getMediaMetadataFromSource(sourceobject)` — resolves various source types (File, FileSystemFileHandle, URL, Blob, MediaSource) into `[source, blobURL, metadata]`
- **Subtitle persistence on seek**: A `seeked` event listener on the video element forces a MediaSession subtitle update after seeking, so stale subtitle text doesn't linger. `clearSubtitles()` and `updateMediaSessionSubtitle()` preserve the existing `artwork` when updating subtitle state.
- **`clearVideoSource()` and `toggleStopBtn()`** both call `hideAudioCover()` to ensure the cover is hidden when playback stops or sources are cleared.

