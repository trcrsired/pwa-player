// Should number formatting move into wasm? Measured answer: no.
//
// Usage: node build/bench_format.js [bench.wasm]
//
// The wasm module is a throwaway one (see bench_format.cpp), so the shipped
// pwaplayer.wasm does not have to carry the floating-point converter. Build:
//
//   cd /tmp/fmt && cp $FAST_IO/share/fast_io/fast_io_floating.cppm . \
//     && cp $FAST_IO/share/fast_io/scripts/da_cache.bin . \
//     && clang++ --config=$HOME/cfgs/wasm32-wasip1-noeh-nomtg.cfg -std=c++26 \
//          -fherbceptions -Oz -fno-exceptions -fno-rtti -x c++-module \
//          --precompile -o floating.pcm fast_io_floating.cppm \
//     && clang++ ... -c floating.pcm -o floating.o \
//     && clang++ ... -fmodule-file=fast_io.floating=floating.pcm \
//          -Wl,--export=fb_out -Wl,--export=fb_time -Wl,--export=fb_fixed \
//          -Wl,--export=fb_bulk -Wl,--export=__wasm_call_ctors \
//          -o bench.wasm bench_format.cpp floating.o
//
// Results (this machine, -Oz; -O2/-O3 change nothing, 231-263 ns):
//   JS formatTime(sec)                         41 ns
//   JS v.toFixed(2) + " MB"                   121 ns
//   wasm fb_time + TextDecoder                245 ns
//   wasm fb_fixed + TextDecoder               492 ns   (call only: 241 ns)
//   bulk 1000 rows: JS 0.156 ms  vs wasm 0.238-0.269 ms
// fast_io's integer path is fast (~40 ns) and the fixed-point converter is
// correct-by-construction (exact 128-bit digits, then rounding), but the
// ~230 ns TextDecoder per result plus V8's specialised toFixed keep the JS
// version ahead in every shape. Keep formatting in JS; use C++ formatting only
// where C++ already renders the whole string (the IPTV list), where nothing
// crosses the boundary at all.
"use strict";
const fs = require("fs");
const WASM = process.argv[2] || "/tmp/fmt/bench.wasm";
const dec = new TextDecoder();

function formatTime(seconds) {
    if (!isFinite(seconds) || seconds < 0) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
}

(async () => {
    const { instance } = await WebAssembly.instantiate(fs.readFileSync(WASM), {});
    const ex = instance.exports;
    if (ex.__wasm_call_ctors) ex.__wasm_call_ctors();
    const wasmStr = (fn, ...args) => {
        const len = fn(...args);
        return dec.decode(new Uint8Array(ex.memory.buffer, ex.fb_out(), len));
    };
    console.log("sanity:", JSON.stringify(wasmStr(ex.fb_time, 3725.4)), formatTime(3725.4),
        "|", JSON.stringify(wasmStr(ex.fb_fixed, 1.23456, 2)), (1.23456).toFixed(2));

    const N = 200000;
    const bench = (label, fn) => {
        for (let i = 0; i < 20000; i++) fn(i);
        const t0 = process.hrtime.bigint();
        let sink = 0;
        for (let i = 0; i < N; i++) sink += fn(i).length;
        const ns = Number(process.hrtime.bigint() - t0) / N;
        console.log(`  ${label.padEnd(46)} ${ns.toFixed(0).padStart(6)} ns`);
    };
    bench("JS  formatTime(sec)", (i) => formatTime(1000 + i));
    bench('JS  v.toFixed(2) + " MB"', (i) => (i * 1.37).toFixed(2) + " MB");
    bench("wasm fb_time(sec) + TextDecoder", (i) => wasmStr(ex.fb_time, 1000 + i));
    bench("wasm fb_fixed(v, 2) + TextDecoder", (i) => wasmStr(ex.fb_fixed, i * 1.37, 2));
    bench("wasm fb_fixed call only (no decode)", (i) => { ex.fb_fixed(i * 1.37, 2); return ""; });

    const M = 200;
    const bulkJS = (n) => { const o = []; for (let i = 0; i < n; i++) o.push((i * 1430.0 / 1048576).toFixed(2) + " MB"); return o.join("\n"); };
    const bulkWasm = (n) => dec.decode(new Uint8Array(ex.memory.buffer, ex.fb_out(), ex.fb_bulk(n)));
    let s = 0;
    let t0 = process.hrtime.bigint();
    for (let i = 0; i < M; i++) s += bulkJS(1000).length;
    const jsMs = Number(process.hrtime.bigint() - t0) / 1e6 / M;
    t0 = process.hrtime.bigint();
    for (let i = 0; i < M; i++) s += bulkWasm(1000).length;
    const wasmMs = Number(process.hrtime.bigint() - t0) / 1e6 / M;
    console.log(`  bulk 1000 rows: JS ${jsMs.toFixed(3)} ms, wasm ${wasmMs.toFixed(3)} ms (sink ${s % 7})`);
})();
