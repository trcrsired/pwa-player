// Localization system (non-module for global access)

// Available languages - translations loaded from locale files
const LANGUAGES = {
    'en': { name: 'English', translations: EN_TRANSLATIONS },
    'zhcn': { name: '简体中文', translations: ZHCN_TRANSLATIONS },
    'ja': { name: '日本語', translations: JA_TRANSLATIONS }
};

let currentLang = 'en';
let currentTranslations = null;

// Initialize
function initLocale() {
    // Load saved language
    const saved = localStorage.getItem('language');

    if (saved && LANGUAGES[saved]) {
        currentLang = saved;
    } else {
        // Detect browser language (e.g., "en-US" → "en")
        const browserLang = navigator.language?.split('-')[0];

        if (browserLang && LANGUAGES[browserLang]) {
            currentLang = browserLang;
        } else {
            currentLang = 'en'; // default fallback
        }
    }

    currentTranslations = LANGUAGES[currentLang].translations;

    applyTranslations();
    populateLanguageSelect();

    return currentLang;
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

// Get current language
function getCurrentLang() {
    return currentLang;
}

// Set language
function setLanguage(lang) {
    if (!LANGUAGES[lang]) {
        console.warn('Unknown language:', lang);
        return false;
    }

    currentLang = lang;
    currentTranslations = LANGUAGES[lang].translations;
    localStorage.setItem('language', lang);
    applyTranslations();
    return true;
}

// Get available languages
function getAvailableLanguages() {
    return Object.entries(LANGUAGES).map(([code, info]) => ({
        code,
        name: info.name
    }));
}

// Get translation for a key with optional parameter replacement
// Usage: t('key', { count: 5 }) replaces {count} in translation string
function t(key, params) {
    let text = key;
    if (currentTranslations && currentTranslations[key]) {
        text = currentTranslations[key];
    }
    // Replace placeholders like {count}, {current}, {total}, etc.
    if (params && typeof params === 'object') {
        for (const [k, v] of Object.entries(params)) {
            text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
        }
    }
    return text;
}

// Apply translations to DOM elements with data-i18n attribute
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

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initLocale());
} else {
    initLocale();
}