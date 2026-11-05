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

// Detects the language to use: saved preference, else the browser's.
function detectLanguage() {
    const saved = localStorage.getItem('language');
    if (saved && LANGUAGES[saved]) return saved;
    const primary = (navigator.language || 'en').split('-')[0];
    if (primary === 'zh') return 'zhcn';
    if (LANGUAGES[primary]) return primary;
    return 'en';
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
