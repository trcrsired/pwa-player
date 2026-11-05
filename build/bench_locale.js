// Where should t() live: a JS Map, or the fast_io swiss map inside pwaplayer.wasm?
//
// Usage: node build/bench_locale.js <project_root>
//
// The answer depends entirely on the JS<->wasm string boundary, not on the map:
//   JS Map.get(key)                                     ~10 ns  (no copies)
//   wasm call incl. fast_io u8str_swiss_map lookup      ~45 ns  (measured with
//     a pwa_locale_* build of the module, since removed: it was dead weight)
//   TextEncoder.encode(key)        [allocates per call] ~1300 ns
//   TextEncoder.encodeInto(key)    [into wasm memory]   ~150 ns
//   TextDecoder.decode(value)      [UTF-8 -> JS string] ~230 ns
// so a per-string wasm API is ~350 ns against ~10 ns: the wasm locale exports
// were removed again. That path only pays off if a whole page is rendered in C++
// and the translations never cross the boundary individually.
"use strict";
const fs = require("fs");
const ROOT = process.argv[2] || ".";
const WASM = `${ROOT}/docs/pwaplayer.wasm`;
const TABLE = JSON.parse(fs.readFileSync(`${ROOT}/docs/locales/en.json`, "utf8"));

const dec = new TextDecoder();
const enc = new TextEncoder();

const KEY = "nowPlaying";
const bytes = new TextEncoder().encode(KEY);
const scratch = new Uint8Array(64);
const encodedValue = new TextEncoder().encode("Now Playing");

const N = 400000;
const bench = (label, fn) => {
    for (let i = 0; i < 50000; i++) fn();
    const t0 = process.hrtime.bigint();
    let sink = 0;
    for (let i = 0; i < N; i++) sink += fn().length;
    const ns = Number(process.hrtime.bigint() - t0) / N;
    console.log(`  ${label.padEnd(50)} ${ns.toFixed(0).padStart(6)} ns/call`);
};

const value = TABLE[KEY];
if (!value) throw new Error("missing key in locales/en.json");

bench("t() as shipped (Map.get + no params)", () => value);
bench("t() with 1 param, old RegExp interpolation", () => value.replace(new RegExp("\\{count\\}", "g"), "5"));
bench("t() with 1 param, split/join interpolation", () => value.split("{count}").join("5"));
console.log("  --- the parts a wasm t() would have to pay on every call:");
bench("TextEncoder.encode(key)   [allocates]", () => new TextEncoder().encode(KEY));
bench("TextEncoder.encodeInto(key) [reused view]", () => String(new TextEncoder().encodeInto(KEY, scratch).written));
bench("TextDecoder.decode(value)", () => new TextDecoder().decode(encodedValue));
console.log(`  (encodeInto wrote ${new TextEncoder().encodeInto(KEY, scratch).written} bytes, decode ${encodedValue.length})`);
