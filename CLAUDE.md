# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PWA Player is a vanilla JavaScript Progressive Web App — an offline-capable media player for video, audio, and IPTV streams. It is intentionally lightweight (~200KB minified) with zero framework dependencies.

## Tech Stack

- **No framework** — vanilla JavaScript, HTML, CSS
- **No bundler** — manual minification via a custom build script
- **WebAssembly core** — `source/pwaplayer.wasm`, built from C++ with [fast_io](https://github.com/cppfastio/fast_io). Holds the IPTV channel catalogue, its paging/filtering/DOM rendering, and the queue shuffle
- **Video/Audio** — HTML5 `<video>` element; HLS.js (v1.5.7, lazy-loaded from CDN) for M3U8 streams
- **Storage** — IndexedDB for offline media persistence
- **PWA** — Service Worker (cache-first strategy) + Web App Manifest with file handlers

## Directory Structure

| Path | Purpose |
|---|---|
| `source/` | Unminified source code (development) + `pwaplayer.wasm` (build artifact, committed) |
| `docs/` | Minified build output (production, deployed via GitHub Pages) |
| `build/` | Build tooling and converters |
| `cpp/` | C++ sources for `pwaplayer.wasm` (`pwaplayer.cpp`, generated `iptv_channels_data.inc`, channel data source `iptvchannels.js`) |
| `cors-bypass/` | Standalone Node.js CORS proxy server |
| `tvs/` | TV channel data |

## Key Source Files

| File | Purpose |
|---|---|
| `player.js` | Core video/audio playback logic (~89KB, largest JS file) |
| `storage.js` | Media storage management via IndexedDB (~146KB) |
| `settings.js` | Settings/preferences UI |
| `playlist.js` | Playlist management |
| `iptv.js` | IPTV view: custom channels, paging glue, delegated clicks (the built-in list is rendered by `pwaplayer.wasm`) |
| `wasm.js` | Loads `pwaplayer.wasm` and exposes the `pwaIptv*` / `pwaShufflePermutation` helpers |
| `embeddedplayer.js` | Embedded third-party player orchestrator |
| `extrafeatures.js` | Speed control, A-B loop, etc. |
| `hls.js` | HLS.js loader/initializer |
| `util.js` | Shared helpers: `showToast`/`hideToast`, `escapeHTML`, `buildShareText`, `shareOrCopy` |
| `sw.js` / `sw-register.js` | Service Worker registration |
| `locale.js` | Internationalization loader (en, zh-CN, ja), TOML on demand |
| `icons.js` | Icon renderer: emoji by default, inline SVG on request |
| `wakelock.js` | Screen wake lock API |
| `sidepanel.js` | Edge rail + slide-over sheets for views (left/right/off via `sidePanelPosition` setting) |
| `manifest.json` | PWA manifest with file handlers |

### Platform Adapters

`source/platforms/` contains embedded player adapters for external platforms (YouTube, Spotify, Twitch, Vimeo, Bilibili, TikTok, SoundCloud, Apple Music, Kick, NetEase Music). Each extends the base class in `platforms/base.js`:

- `BasePlatform.mountEmbedIframe(container, {src, id, allow, allowFullscreen, playsInline, styles})` — resolves the container, clears it, mounts one styled iframe, sets `this.player`.
- `BasePlatform.applyEmbedNowPlaying({title, artist, album, url, documentTitle})` — document title, MediaSession metadata/playbackState, side-panel labels, play/pause icons.
- `BasePlatform.removeEmbedIframe()`.
- `PassiveEmbedPlatform` (extends `BasePlatform`) — the "iframe exposes no control API" base: no-op transport methods, `setVolume` persisting to localStorage, `destroyPlayerInternal()` → `removeEmbedIframe()`. **SoundCloud, Apple Music, NetEase, Kick, TikTok and Bilibili extend it**, so their only code is URL/id parsing, `getTitle()` and `getVideoUrl()`. SDK based adapters (YouTube, Spotify, Twitch, Vimeo, Douyin) still extend `BasePlatform`.

### Conventions

- **Never re-declare the translation helper.** `locale.js` defines a global `t(key, params)`; do not add `const t = (key, params) => window.i18n ? ... : ...` inside functions.
- **Use `util.js`** for toasts, HTML escaping and sharing instead of local copies.
- **Adding a translation**: add the key to `source/locales/*.toml` — never to a JS
  file, and never to C++.
- **Adding an icon**: add it to both `ICONS` (SVG) and `EMOJI` in `icons.js`;
  `setIcon()` falls back to the SVG if the emoji entry is missing.

### Locales

`source/locales/` contains `en.json`, `zhcn.json` and `ja.json` — one flat
`key: "value"` object each. Plain JSON on purpose: `response.json()` is a native
parser, so there is no format code of ours to maintain, and the build minifies
them like the manifest.

- **Only the active language is fetched** (`locales/<lang>.json`, cache-first from
  the Service Worker). The other two are never downloaded or parsed.
- Loading is async, so `startLoad()` stamps every request with a token and only
  the newest one may install its table. Without that, a slow auto-detected
  request can land after the user already picked a language and silently flip
  the UI back — the settings select and the actual table must never disagree.
- **English is the default, always**: the active language is the saved preference
  or `en`. `navigator.language` is deliberately ignored (it used to pick the UI
  language, which surprised users whose browser was not in English).
- `t(key, params)` returns the literal immediately when there are no params, and
  when there are it uses a cached pre-split template (`compileTemplate()` →
  literal parts + parameter names), so a two-placeholder string costs ~114 ns
  instead of ~235 ns for rescanning or ~540 ns for a `RegExp` per parameter
  (`build/bench_locale.js`). A missing parameter keeps its placeholder.
- **A wasm formatter cannot beat that**: encoding the request and decoding the
  result already costs ~320 ns before fast_io does any work, and asking C++
  "does this string even have a placeholder?" costs more than the in-process
  `indexOf("{")` that answers it for free.
- Editing a translation is a data change: **no rebuild of anything**, and no wasm
  recompile.
- **Translations stay in JavaScript.** A `::fast_io::u8str_swiss_map` in wasm was
  implemented and measured (`build/bench_locale.js`): the lookup plus the call is
  only ~45 ns, but every `t()` then costs a `TextEncoder` (~100 ns) and a
  `TextDecoder` (~235 ns) for ~350 ns, against ~4-11 ns for a `Map` hit. The
  boundary copies dominate, so the wasm path was removed rather than shipped.
  The corollary that *does* pay: render whole pages in C++ (the IPTV list), where
  the strings never cross the boundary individually.
- Translation is pure data, so nothing has to be rebuilt when a string changes.

### Formatting numbers

Also measured and rejected (`build/bench_format.js`, `build/bench_format.cpp`):

| | JS | wasm + `TextDecoder` |
|---|---|---|
| `formatTime(sec)` | 41 ns | 245 ns |
| `v.toFixed(2)` | 121 ns | 492 ns (call alone 241 ns) |
| 1000 rows in bulk | 0.156 ms | 0.238–0.269 ms |

fast_io's integer path is fast and its fixed-point path is exact-by-construction,
but V8's `toFixed` is a specialised builtin and every wasm result still pays the
decode. `-O2`/`-O3` do not change the ordering. Keep number formatting in JS,
except inside markup C++ already renders itself.

### Icons

`icons.js` renders one of two representations per icon, chosen by the
`iconStyle` setting (Settings → Icons), default **emoji**:

- `"emoji"` — a single text node, no extra elements. The controls + channel list
  hold ~600 icons, so this mode keeps the default view at **964 elements**.
- `"svg"` — inline `<svg>` (thin stroke set), for systems without color emoji.
  Same view costs **1772 elements**.

Measured A/B in one process (same page, `setIconStyle()` and back): the SVG set
costs +808 elements / +581 DOM nodes and **+2.3 MB** of renderer private memory,
and JS heap is unchanged. `setIconStyle()` re-renders every `[data-icon]` element,
so the toggle is live; the channel-list hydrator uses `iconRendered(el)` to skip
elements that already show their icon.

## Commands

**Build (minify source → docs/, rebuild the wasm core first):**
```bash
node build/build.js <project_root>
```

**wasm core only (`source/pwaplayer.wasm`):**
```bash
sh cpp/build.sh <project_root>
# uses --config=$HOME/cfgs/wasm32-wasip1-noeh-nomtg.cfg -fherbceptions -lherbceptions -flto=thin -s -Oz
# override the config with PWA_WASM_CONFIG=/path/to/wasm32-wasip1.cfg, compiler with CXX=clang++
```

**Channel table codegen (`cpp/iptvchannels.js` → `cpp/iptv_channels_data.inc`):**
```bash
node build/gen_iptv_cpp.js <project_root>
```

**Memory benchmark (JS table vs wasm table):**
```bash
node --expose-gc build/bench_iptv_memory.js <project_root>
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

- **`pwaplayer.wasm` is the only binary shipped** — it replaces the 69KB `iptvchannels.js` catalogue. Job layout below.
- **No `package.json`** — it's gitignored. Build dependencies (`uglify-js`, `html-minifier-terser`, `clean-css`) must be installed separately.
- **`source/` is the working directory** — make all edits here, not in `docs/`.
- **Build is a simple minification pipeline** — `walk(source/)` → minify HTML/CSS/JS → output to `docs/`. No bundling, no module resolution, no transpilation.
- **Service Worker version** is tracked as a comment in `sw.js` (currently v438).
- **Git commit messages** are short, imperative, lowercase — e.g., "add hls.js support", "change retry count to 8".
- **HLS.js is lazy-loaded** from jsDelivr CDN at runtime, not bundled.

## WebAssembly Core (`cpp/` + `source/pwaplayer.wasm`)

C++ (built with fast_io, `wasm32-wasip1`, thin LTO, stripped, no exceptions/RTTI) owns
everything that used to be a large JavaScript data structure:

- **`cpp/iptvchannels.js`** — plain data module (`export const iptvChannels = [...]`), never shipped to the browser.
  `build/gen_iptv_cpp.js` turns it into **`cpp/iptv_channels_data.inc`**: one big `inline constexpr` table where every
  name and URL is a sized `::fast_io::u8string_view` (pointer + length, never NUL-scanned). Layout: a flat URL array,
  a zhcn-name array, and `iptv_channel {name, url_first, url_count, flags, zhcn}` entries (24 bytes each).
- **Filtering + paging + DOM markup** happen in C++ (`iptv_filtered_count`, `iptv_render_page`). JS uploads the search
  text into the module's search buffer and receives one HTML string per page, then `insertAdjacentHTML`s it.
  Icons are emitted as `data-icon` placeholders and filled in by `hydrateIcons()` in `iptv.js`.
- **Shuffle**: `shuffle_permutation(n)` runs `::std::shuffle` over fast_io's white-hole (getrandom) engine and returns a
  permutation; `shuffleArray()` in `nowplaying.js` reorders the JS queue with it. It falls back to Fisher–Yates until
  `pwaWasmReady` resolves (or if WebAssembly is unavailable).
- **Custom channels stay in JS** (IndexedDB, user data). `iptv.js` filters them, splits one page between custom and
  built-in entries, and renders custom nodes itself — the markup shape matches C++ so one delegated click listener
  handles both (`data-ch` / `data-custom` / `data-url` attributes).
- **Paging**: `iptvChannelsPerPage` setting (default 50, `0` = no paging). Stored in localStorage, editable in Settings,
  part of the profile export/import key list.
- **URL classification** (`pwa_url_flags`) also lives in C++: `wasm.js` exposes `pwaUrlFlags()/isIpAddressUrl()/
  isPlainHttpUrl()`, so the IP/HTTP badges on custom channels use the exact same host parser as the built-in ones.
  JS writes into the shared 4 KiB input buffer (`pwa_input_ptr` / `pwa_input_capacity`) before each call.
- Only `random_get` is imported from wasi; `wasm.js` provides it (plus `proc_exit`/`clock_time_get`).

Measured (`node --expose-gc build/bench_iptv_memory.js`): the JS catalogue retained ~374 KiB of GC-traced JS heap;
the wasm table retains ~12 KiB of JS heap plus ~192 KiB of linear memory (invisible to the GC), and loads ~3× faster.

Size, all minified `docs/**/*.js` + the module: **446 KB → 375 KB of JS plus a 95 KB wasm** (gzip 111 KB → 94 KB + 33 KB).
The JS side pays for the module by dropping the catalogue *and* the deduplicated boilerplate (platform adapters,
share/toast/i18n helpers).

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

