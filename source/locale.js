// Localization system (non-module for global access).
//
// Translations live in `locales/<lang>.json` (one flat key -> string object) and
// are fetched on demand, so the two languages the user does not use are never
// downloaded, parsed or kept in memory. JSON on purpose: `response.json()` is a
// native parser, so there is no format code of ours to get wrong or maintain.
// Keeping the table in wasm was implemented and measured at ~350 ns per lookup
// against ~11 ns here (the UTF-8 encode/decode across the boundary dominates),
// see build/bench_locale.js. Translations are pure data: changing a string needs
// no rebuild of anything.

const LANGUAGES = {
    'en': { name: 'English' },
    'zhcn': { name: '简体中文' },
    'ja': { name: '日本語' }
};

let currentLang = 'en';
let currentTranslations = null;   // key -> string
let currentLoad = null;            // in-flight locale request
let loadToken = 0;                 // only the newest request may publish a table

// Translations containing {placeholders} are split once into literal parts plus
// parameter names: ~90 ns per call instead of ~170 ns for rescanning the string
// every time, with no eval/CSP cost and no wasm round trip (see
// build/bench_locale.js for why the wasm route cannot win: the unavoidable
// encode+decode of the result alone costs ~270 ns).
const templateCache = new Map();

// Maps a browser language tag onto one of ours: "ja-JP" -> ja, "zh-CN"/"zh-TW"
// -> zhcn, "en-GB" -> en. Returns null for languages we do not ship.
function matchLanguage(tag) {
    const primary = String(tag || "").toLowerCase().split("-")[0];
    if (!primary) return null;
    if (primary === "zh") return "zhcn";
    return Object.prototype.hasOwnProperty.call(LANGUAGES, primary) ? primary : null;
}

// The active language, in order of precedence:
//   1. the language the user picked in Settings, if we ship it;
//   2. English, as soon as the browser advertises it anywhere in its list -
//      a browser reporting ["ja", "en-US", "en"] gets English, not Japanese;
//   3. the first language in the browser's list that we do ship;
//   4. English.
// The settings select always shows what this resolved to, so the two can never
// disagree.
function detectLanguage() {
    const saved = localStorage.getItem("language");
    if (saved && Object.prototype.hasOwnProperty.call(LANGUAGES, saved)) return saved;

    const candidates = navigator.languages && navigator.languages.length
        ? navigator.languages
        : [navigator.language];
    let firstMatch = null;
    for (const tag of candidates) {
        const match = matchLanguage(tag);
        if (match === "en") return "en";
        if (match && firstMatch === null) firstMatch = match;
    }
    return firstMatch || "en";
}

// Fetches one locale file and returns its table (does not install it).
async function fetchLocale(lang) {
    const res = await fetch(`locales/${lang}.json`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
}

/* ---- public API ------------------------------------------------------ */

// Initialize. Returns the language that ended up active; the table itself
// arrives asynchronously (the markup already contains English defaults, and
// applyTranslations() re-runs as soon as the file lands).
function initLocale() {
    currentLang = detectLanguage();
    // Start the fetch before the DOM is ready so it overlaps parsing; the markup
    // already carries English defaults, so nothing is blank while it lands.
    startLoad(currentLang);
    const finish = () => {
        populateLanguageSelect();
        currentLoad.then((ok) => {
            if (!ok) return;
            applyTranslations();
            window.dispatchEvent(new CustomEvent('pwa-language-changed', { detail: { lang: currentLang } }));
        });
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', finish, { once: true });
    } else {
        finish();
    }
    return currentLang;
}

// Loads `lang` and installs it only if it is still the language that is being
// asked for. Without the token a slow first request (auto-detected language)
// could land after the user already switched, leaving the UI in the old
// language while the settings select showed the new one.
function startLoad(lang) {
    const token = ++loadToken;
    currentLoad = fetchLocale(lang)
        .then((table) => {
            if (token !== loadToken || lang !== currentLang) return false;
            if (!table || Object.keys(table).length === 0) return false;
            currentTranslations = table;
            return true;
        })
        .catch((err) => {
            console.warn(`Failed to load locale "${lang}":`, err);
            return false;
        });
    return currentLoad;
}

// Populate language select dropdown
function populateLanguageSelect() {
    const select = document.getElementById('languageSelect');
    if (!select) return;

    select.innerHTML = "";
    Object.entries(LANGUAGES).forEach(([code, info]) => {
        const option = document.createElement('option');
        option.value = code;
        option.textContent = info.name;
        if (code === currentLang) option.selected = true;
        select.appendChild(option);
    });
    // Keep the widget on the language that is actually loaded.
    select.value = currentLang;
}

function getCurrentLang() {
    return currentLang;
}

// Switch language. Returns true when the switch was accepted; the DOM is
// updated once the new file is loaded.
function setLanguage(lang) {
    if (!LANGUAGES[lang]) {
        console.warn('Unknown language:', lang);
        return false;
    }
    if (lang === currentLang && currentTranslations) {
        return true; // already active
    }

    currentLang = lang;
    localStorage.setItem('language', lang);
    const select = document.getElementById('languageSelect');
    if (select) select.value = lang;
    startLoad(lang).then((ok) => {
        if (!ok) return;
        applyTranslations();
        window.dispatchEvent(new CustomEvent('pwa-language-changed', { detail: { lang } }));
    });
    return true;
}

// Get available languages
function getAvailableLanguages() {
    return Object.entries(LANGUAGES).map(([code, info]) => ({
        code,
        name: info.name
    }));
}

// Splits "Page {current} / {total}" into { parts: ["Page ", " / ", ""],
// keys: ["current", "total"] }. Returns null when there is nothing to replace.
function compileTemplate(text) {
    const parts = [];
    const keys = [];
    let at = 0;
    for (;;) {
        const open = text.indexOf("{", at);
        if (open === -1) break;
        const close = text.indexOf("}", open + 1);
        if (close === -1) break;
        parts.push(text.slice(at, open));
        keys.push(text.slice(open + 1, close));
        at = close + 1;
    }
    if (keys.length === 0) return null;
    parts.push(text.slice(at));
    const compiled = { parts, keys };
    templateCache.set(text, compiled);
    return compiled;
}

// Get translation for a key with optional parameter replacement.
// Usage: t('key', { count: 5 }) replaces {count} in the translation string.
function t(key, params) {
    let text = key;
    if (currentTranslations !== null) {
        text = currentTranslations[key] || key;
    }
    if (!params || typeof params !== "object" || text.indexOf("{") === -1) {
        return text;   // the common case: one map lookup and nothing else
    }
    const compiled = templateCache.get(text) || compileTemplate(text);
    if (!compiled) return text;
    const { parts, keys } = compiled;
    let out = parts[0];
    for (let i = 0; i < keys.length; i++) {
        const value = params[keys[i]];
        // A missing parameter keeps its placeholder, as before.
        out += (value === undefined ? `{${keys[i]}}` : value) + parts[i + 1];
    }
    return out;
}

// Apply translations to DOM elements with data-i18n attributes
function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const translated = t(key);
        if (translated !== key) {
            el.textContent = translated;
            // textContent replaced the children, which took the leading icon
            // with it: put it back for elements that carry both attributes
            // (the storage buttons do). setIcon keeps the label we just set.
            if (el.dataset.icon && typeof window.setIcon === 'function') {
                window.setIcon(el, el.dataset.icon);
            }
        }
    });

    // Also update placeholders
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        const translated = t(key);
        if (translated !== key) {
            el.placeholder = translated;
        }
    });

    // Update titles
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        const translated = t(key);
        if (translated !== key) {
            el.title = translated;
        }
    });
}

// Expose globally
window.i18n = {
    t,
    initLocale,
    setLanguage,
    getCurrentLang,
    getAvailableLanguages,
    applyTranslations
};

// Auto-initialize as early as possible so the fetch overlaps page parsing.
initLocale();
