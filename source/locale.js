// Localization system (non-module for global access).
//
// Translations live in `locales/<lang>.toml` (one `key = "value"` per line) and
// are fetched on demand, so the two languages the user does not use are never
// downloaded, parsed or kept in memory. The file is parsed into a plain JS Map:
// keeping the table in wasm was implemented and measured at ~350 ns per lookup
// against ~11 ns here (the UTF-8 encode/decode across the boundary dominates),
// see build/bench_locale.js. Translations are pure data, so nothing here needs
// a rebuild of anything when a string changes.

const LANGUAGES = {
    'en': { name: 'English' },
    'zhcn': { name: '简体中文' },
    'ja': { name: '日本語' }
};

let currentLang = 'en';
let currentTranslations = null;   // key -> string

let currentLoad = null;            // in-flight locale request

/* ---- parsing --------------------------------------------------------- */

// Minimal parser for the locale file format: `key = "value"` lines, `#` comments,
// and \" \\ \n \t \r escapes. Mirrors locale_parse() in cpp/pwaplayer.cpp.
function parseLocaleText(text) {
    const out = Object.create(null);
    const lines = text.split('\n');
    for (let line of lines) {
        const start = line.search(/[^\s]/);
        if (start === -1) continue;
        if (line[start] === '#') continue;
        const eq = line.indexOf('=', start);
        if (eq === -1) continue;
        const key = line.slice(start, eq).trim();
        if (!/^[A-Za-z0-9_]+$/.test(key)) continue;
        let i = eq + 1;
        while (i < line.length && (line[i] === ' ' || line[i] === '\t')) i++;
        if (line[i] !== '"') continue;
        i++;
        let value = '';
        while (i < line.length && line[i] !== '"') {
            let ch = line[i++];
            if (ch === '\\' && i < line.length) {
                const esc = line[i++];
                ch = esc === 'n' ? '\n' : esc === 't' ? '\t' : esc === 'r' ? '\r' : esc;
            }
            value += ch;
        }
        out[key] = value;
    }
    return out;
}

// Detects the language to use: saved preference, else the browser's.
function detectLanguage() {
    const saved = localStorage.getItem('language');
    if (saved && LANGUAGES[saved]) return saved;
    const primary = (navigator.language || 'en').split('-')[0];
    if (primary === 'zh') return 'zhcn';
    if (LANGUAGES[primary]) return primary;
    return 'en';
}

// Fetches + installs one locale. Resolves to true when the table is usable.
async function loadLocale(lang) {
    const res = await fetch(`locales/${lang}.toml`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const text = await res.text();

    currentTranslations = parseLocaleText(text);
    return Object.keys(currentTranslations).length > 0;
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

function startLoad(lang) {
    currentLoad = loadLocale(lang).catch((err) => {
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

// Get translation for a key with optional parameter replacement.
// Usage: t('key', { count: 5 }) replaces {count} in the translation string.
function t(key, params) {
    let text = key;
    if (currentTranslations !== null) {
        text = currentTranslations[key] || key;
    }
    if (params && typeof params === 'object' && text.indexOf("{") !== -1) {
        // No RegExp here: t() runs for every label on every render and building
        // a RegExp per placeholder was the hottest part of translation (177 ns
        // per call, vs 10 ns for the map lookup itself).
        for (const k in params) {
            text = text.split(`{${k}}`).join(params[k]);
        }
    }
    return text;
}

// Apply translations to DOM elements with data-i18n attributes
function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const translated = t(key);
        if (translated !== key) {
            el.textContent = translated;
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
