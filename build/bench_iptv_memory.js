/*
 * bench_iptv_memory.js — compare the retained memory of
 *   (A) the previous pure JavaScript channel table, and
 *   (B) the current C++ constexpr table inside source/pwaplayer.wasm.
 *
 * Usage:
 *   node --expose-gc build/bench_iptv_memory.js [project_root]
 *
 * (A) is loaded from cpp/iptvchannels.js — the data source that used to be
 * shipped to the browser as source/iptvchannels.js.
 * Numbers are V8 numbers; a browser reports the same shape (JS heap for the
 * object graph, a separate ArrayBuffer backing store for wasm memory).
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const root = process.argv[2] || path.join(__dirname, "..");
const wasmPath = path.join(root, "source", "pwaplayer.wasm");
const dataPath = path.join(root, "cpp", "iptvchannels.js");

if (typeof global.gc !== "function") {
    console.error("Run me with: node --expose-gc build/bench_iptv_memory.js");
    process.exit(1);
}

function snapshot() {
    global.gc();
    global.gc();
    const usage = process.memoryUsage();
    return {
        heap: usage.heapUsed,
        external: usage.external + usage.arrayBuffers,
        rss: usage.rss
    };
}

const fmt = (n) => `${(n / 1024).toFixed(1)} KiB`;
const delta = (after, before) => ({
    heap: after.heap - before.heap,
    external: after.external - before.external,
    rss: after.rss - before.rss
});

async function measureOld() {
    const tmp = path.join(os.tmpdir(), `iptvchannels-${process.pid}.mjs`);
    const source = fs.readFileSync(dataPath, "utf8")
        .replace(/export\s+const\s+iptvChannels\s*=/, "export const iptvChannels =");
    fs.writeFileSync(tmp, source, "utf8");

    const before = snapshot();
    const started = process.hrtime.bigint();

    const { iptvChannels } = await import(`file://${tmp}`);
    // Touch every entry the way the old renderer did, so V8 cannot keep any
    // string lazy or the object graph unmaterialised.
    let urls = 0;
    for (const channel of iptvChannels) {
        urls += channel.urls ? channel.urls.length : 1;
        void channel.name.length;
        for (const url of channel.urls || [channel.url]) void url.length;
    }

    const elapsed = Number(process.hrtime.bigint() - started) / 1e6;
    const after = snapshot();
    fs.rmSync(tmp, { force: true });

    return {
        label: "A. JS table (source/iptvchannels.js)",
        detail: `${iptvChannels.length} channels, ${urls} urls`,
        ...delta(after, before),
        wasmMemory: 0,
        elapsed
    };
}

async function measureNew() {
    const before = snapshot();
    const started = process.hrtime.bigint();

    let exports = null;
    const importObject = {
        wasi_snapshot_preview1: {
            proc_exit(code) { throw new Error("exit " + code); },
            random_get(bufPtr, bufLen) {
                crypto.getRandomValues(new Uint8Array(exports.memory.buffer, bufPtr, bufLen));
                return 0;
            }
        }
    };
    const { instance } = await WebAssembly.instantiate(fs.readFileSync(wasmPath), importObject);
    exports = instance.exports;
    exports.__wasm_call_ctors();

    // One rendered page (the only work done up front in the app).
    exports.iptv_render_page(0, 0, 0, 50, 1, 0);

    const elapsed = Number(process.hrtime.bigint() - started) / 1e6;
    const after = snapshot();

    return {
        label: "B. C++ table (source/pwaplayer.wasm)",
        detail: `${exports.iptv_channel_count()} channels (linear memory ${fmt(exports.memory.buffer.byteLength)})`,
        ...delta(after, before),
        wasmMemory: exports.memory.buffer.byteLength,
        elapsed
    };
}

(async () => {
    const results = [await measureOld(), await measureNew()];
    results.forEach((r) => {
        console.log(`${r.label}`);
        console.log(`  ${r.detail}`);
        console.log(`  JS heap        : ${fmt(r.heap)}`);
        console.log(`  external       : ${fmt(r.external)}`);
        console.log(`  wasm linear mem: ${fmt(r.wasmMemory)}`);
        console.log(`  load + init    : ${r.elapsed.toFixed(2)} ms`);
        console.log("");
    });
    const [oldR, newR] = results;
    console.log(`JS heap retained: ${fmt(oldR.heap)} -> ${fmt(newR.heap)} ` +
        `(${(100 - (newR.heap / oldR.heap) * 100).toFixed(1)}% less, GC no longer traces the catalogue)`);
})();
