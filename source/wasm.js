/* pwaplayer.wasm loader + thin JS facade.
 *
 * The WebAssembly module (built from cpp/pwaplayer.cpp, see cpp/build.sh) owns:
 *   - the whole built-in IPTV channel catalogue as a flat C++ constexpr table,
 *   - the filtering / paging / DOM markup rendering of that catalogue,
 *   - the queue shuffle permutation (::std::shuffle over fast_io entropy).
 *
 * UI translations are deliberately NOT here: see build/bench_locale.js.
 *
 * The helpers below never keep a JS copy of the catalogue, so the browser does
 * not allocate ~671 channel objects plus ~750 URL strings, and there is nothing
 * for the garbage collector to trace beyond the module memory itself.
 *
 * Everything degrades gracefully: if the module is missing or the browser has
 * no WebAssembly support, pwaWasm.ready stays false and the callers fall back.
 */
(function () {
    "use strict";

    const WASM_URL = "pwaplayer.wasm";
    const LANGUAGE_IDS = { en: 0, zhcn: 1, ja: 2 };

    const decoder = new TextDecoder("utf-8");
    const encoder = new TextEncoder();

    const state = {
        ready: false,
        failed: false,
        exports: null
    };
    window.pwaWasm = state;

    const importObject = {
        wasi_snapshot_preview1: {
            proc_exit(code) {
                throw new WebAssembly.RuntimeError("pwaplayer.wasm exited with code " + code);
            },
            // fast_io's white hole entropy source
            random_get(bufPtr, bufLen) {
                crypto.getRandomValues(new Uint8Array(state.exports.memory.buffer, bufPtr, bufLen));
                return 0;
            },
            clock_time_get(clockId, precision, resultPtr) {
                const ns = clockId === 0
                    ? BigInt(Date.now()) * BigInt(1000000)
                    : BigInt(Math.floor(performance.now() * 1000000));
                new DataView(state.exports.memory.buffer).setBigUint64(resultPtr, ns, true);
                return 0;
            }
        }
    };

    async function instantiate(response) {
        if (typeof WebAssembly.instantiateStreaming === "function") {
            try {
                const result = await WebAssembly.instantiateStreaming(response, importObject);
                return result.instance;
            } catch (err) {
                // Wrong Content-Type or a server that will not stream: fall back
                console.warn("pwaplayer.wasm: streaming instantiation failed, retrying", err);
            }
        }
        const bytes = await response.arrayBuffer();
        const result = await WebAssembly.instantiate(bytes, importObject);
        return result.instance;
    }

    window.pwaWasmReady = (async () => {
        if (typeof WebAssembly === "undefined") {
            state.failed = true;
            return null;
        }
        try {
            const instance = await instantiate(await fetch(WASM_URL));
            state.exports = instance.exports;
            // Static constructors must run before any export is used.
            if (typeof state.exports.__wasm_call_ctors === "function") {
                state.exports.__wasm_call_ctors();
            }
            state.ready = true;
            return state.exports;
        } catch (err) {
            state.failed = true;
            console.error("Failed to load pwaplayer.wasm:", err);
            return null;
        }
    })();

    /* ---- helpers ---------------------------------------------------- */

    // Memory can grow during a call, so every access reads a fresh view.
    function readOut(ptr, len) {
        return decoder.decode(new Uint8Array(state.exports.memory.buffer, ptr, len));
    }

    // Copies text into the module's shared input buffer; returns the byte length.
    // encodeInto() writes straight into wasm memory: `encoder.encode()` plus a
    // .set() allocated and copied a Uint8Array on every call, which measured at
    // ~1.3 us for a short key versus ~0.14 us here - more than the whole wasm
    // call it feeds.
    function writeInput(text) {
        const ex = state.exports;
        const capacity = ex.pwa_input_capacity();
        const view = new Uint8Array(ex.memory.buffer, ex.pwa_input_ptr(), capacity - 1);
        return text ? encoder.encodeInto(text, view).written : 0;
    }

    // 0 = en, 1 = zhcn, 2 = ja; drives which stored name the renderer picks.
    window.pwaLangId = function () {
        const lang = window.i18n && typeof window.i18n.getCurrentLang === "function"
            ? window.i18n.getCurrentLang()
            : (localStorage.getItem("language") || "en");
        const id = LANGUAGE_IDS[lang];
        return id === undefined ? 0 : id;
    };

    /* ---- IPTV catalogue --------------------------------------------- */

    window.pwaIptvChannelCount = function () {
        return state.ready ? state.exports.iptv_channel_count() : 0;
    };

    window.pwaIptvChannelName = function (index, lang) {
        if (!state.ready) return "";
        const ex = state.exports;
        const len = ex.iptv_channel_name(index, lang === undefined ? window.pwaLangId() : lang);
        return len ? readOut(ex.iptv_out_ptr(), len) : "";
    };

    window.pwaIptvChannelUrl = function (index, urlIndex) {
        if (!state.ready) return "";
        const ex = state.exports;
        const len = ex.iptv_channel_url(index, urlIndex);
        return len ? readOut(ex.iptv_out_ptr(), len) : "";
    };

    window.pwaIptvChannelUrlCount = function (index) {
        return state.ready ? state.exports.iptv_channel_url_count(index) : 0;
    };

    // Materialises one built-in channel on demand. Only the channels the user
    // actually interacts with ever become JS objects.
    window.pwaIptvChannel = function (index, lang) {
        if (!state.ready) return null;
        const ex = state.exports;
        const urlCount = ex.iptv_channel_url_count(index);
        if (urlCount === 0) return null;
        const urls = [];
        for (let i = 0; i < urlCount; ++i) {
            urls.push(window.pwaIptvChannelUrl(index, i));
        }
        const flags = ex.iptv_channel_flags(index);
        return {
            index,
            name: window.pwaIptvChannelName(index, lang),
            url: urls[0],
            urls,
            nsfw: (flags & 1) !== 0,
            cors: (flags & 2) !== 0
        };
    };

    window.pwaIptvFilteredCount = function (search, includeNsfw) {
        if (!state.ready) return 0;
        const ex = state.exports;
        const n = writeInput(search);
        return ex.iptv_filtered_count(ex.pwa_input_ptr(), n, includeNsfw ? 1 : 0);
    };

    // Renders filtered ordinals [start, start + count) into DOM-ready markup.
    window.pwaIptvRenderPage = function (search, start, count, includeNsfw, lang) {
        if (!state.ready) return null;
        const ex = state.exports;
        const n = writeInput(search);
        const rendered = ex.iptv_render_page(
            ex.pwa_input_ptr(), n, start >>> 0, count >>> 0,
            includeNsfw ? 1 : 0, lang === undefined ? window.pwaLangId() : lang);
        if (!rendered) return { html: "", rendered: 0 };
        return { html: readOut(ex.iptv_html_ptr(), ex.iptv_html_len()), rendered };
    };

    /* ---- URL classification ------------------------------------------ */

    // Same host/HTTP classification C++ uses for built-in channel badges, so
    // custom channels cannot drift from it. Bit 0: IP literal, bit 1: http://.
    window.pwaUrlFlags = function (url) {
        if (!state.ready || !url) return 0;
        const ex = state.exports;
        const n = writeInput(url);
        return ex.pwa_url_flags(ex.pwa_input_ptr(), n);
    };

    // Convenience wrappers used by the IPTV view.
    window.isIpAddressUrl = function (url) {
        return (window.pwaUrlFlags(url) & 1) !== 0;
    };
    window.isPlainHttpUrl = function (url) {
        return (window.pwaUrlFlags(url) & 2) !== 0;
    };

    /* ---- shuffle ---------------------------------------------------- */

    // Returns a permutation of 0..n-1 built by ::std::shuffle in C++, or null
    // when the module is not available yet (callers keep a JS fallback).
    window.pwaShufflePermutation = function (n) {
        if (!state.ready || !(n > 1)) return null;
        const ex = state.exports;
        const len = ex.shuffle_permutation(n);
        if (!len) return null;
        const ptr = ex.shuffle_permutation_ptr();
        return new Uint32Array(ex.memory.buffer, ptr, len).slice();
    };
})();
