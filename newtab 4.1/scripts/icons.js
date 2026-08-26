// Shared icon resolution for shortcuts and bottom-bar tools.
//
// Public favicon aggregators (DuckDuckGo, etc.) only know about sites they've
// crawled — for self-hosted/internal apps (Portainer, the *arr suite,
// Immich, cPanel, ...) they don't error, they silently return a generic
// placeholder, so a plain <img onerror> swap never even fires. To fix that
// we try the site's own favicon.ico first (the browser can reach internal
// hosts a public crawler never could), fall back to a favicon aggregator,
// and finally fall back to a generated letter-avatar that always succeeds
// and always looks intentional instead of broken.

const BASE_ICON_URL = "https://www.gstatic.com/images/branding/product/1x/";

const GOOGLE_SERVICE_ICONS = {
    "analytics.google.com": "analytics_48dp.png",
    "books.google.com": "books_48dp.png",
    "calendar.google.com": "calendar_2020q4_48dp.png",
    "classroom.google.com": "classroom_48dp.png",
    "docs.google.com": "docs_2020q4_48dp.png",
    "drive.google.com": "drive_2020q4_48dp.png",
    "earth.google.com": "earth_48dp.png",
    "finance.google.com": "finance_48dp.png",
    "groups.google.com": "groups_48dp.png",
    "keep.google.com": "keep_2020q4_48dp.png",
    "mail.google.com": "gmail_2020q4_48dp.png",
    "maps.google.com": "maps_48dp.png",
    "meet.google.com": "meet_2020q4_48dp.png",
    "news.google.com": "news_48dp.png",
    "photos.google.com": "photos_48dp.png",
    "play.google.com": "play_prism_48dp.png",
    "podcasts.google.com": "podcasts_48dp.png",
    "scholar.google.com": "scholar_48dp.png",
    "sheets.google.com": "sheets_2020q4_48dp.png",
    "slides.google.com": "slides_2020q4_48dp.png",
    "translate.google.com": "translate_48dp.png",
    "youtube.com": "youtube_48dp.png",
    "www.youtube.com": "youtube_48dp.png",
    "music.youtube.com": "youtube_music_48dp.png",
    "studio.youtube.com": "youtube_studio_48dp.png",
};

const SPECIAL_ICONS = {
    "chat.deepseek.com": "https://chat.deepseek.com/favicon.ico",
    "deepseek.com": "https://chat.deepseek.com/favicon.ico",
    "chat.openai.com": "https://cdn.oaistatic.com/_next/static/media/apple-touch-icon.59f2e898.png",
    "openai.com": "https://cdn.oaistatic.com/_next/static/media/apple-touch-icon.59f2e898.png",
    "gemini.google.com": "https://www.gstatic.com/lamda/images/gemini_sparkle_v002_d4735304ff6292a690345.svg",
    "aistudio.google.com": "https://www.gstatic.com/aistudio/ai_studio_favicon_32x32.png",
};

// Soft, evenly-spread palette (same S/L formula as the theme presets) so
// generated avatars feel native to the rest of the UI regardless of theme.
const AVATAR_PALETTE = [
    'hsl(224 55% 60%)', 'hsl(252 52% 62%)', 'hsl(280 48% 60%)', 'hsl(320 50% 60%)',
    'hsl(340 55% 60%)', 'hsl(8 58% 60%)', 'hsl(28 60% 55%)', 'hsl(45 55% 48%)',
    'hsl(90 38% 45%)', 'hsl(155 45% 45%)', 'hsl(172 48% 42%)', 'hsl(193 52% 48%)',
    'hsl(213 55% 55%)', 'hsl(262 40% 55%)',
];

const ICON_CACHE_KEY = 'iconCacheV1';

function parseUrl(url) {
    try {
        return new URL(url);
    } catch {
        return null;
    }
}

function loadIconCache() {
    try {
        return JSON.parse(localStorage.getItem(ICON_CACHE_KEY) || '{}');
    } catch {
        return {};
    }
}

// Permanent, locally-cached "real" icon for a URL, set by the Refresh Icons
// flow (see iconRefresh.js). Checked before any network attempt.
export function getCachedIconUrl(url) {
    return loadIconCache()[url] || null;
}

export function setCachedIconUrl(url, dataUri) {
    const cache = loadIconCache();
    cache[url] = dataUri;
    try {
        localStorage.setItem(ICON_CACHE_KEY, JSON.stringify(cache));
    } catch (e) {
        console.error('Icon cache write failed (storage full?)', e);
    }
}

export function clearIconCache() {
    localStorage.removeItem(ICON_CACHE_KEY);
}

function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
    }
    return hash;
}

function escapeXml(str) {
    return str.replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
    }[c]));
}

// First choice: a curated icon for known services, otherwise the site's own
// favicon.ico — fetched via the shortcut's own protocol/host/port so
// internal-network apps (http://192.168.x.x:8096, custom ports, etc.)
// resolve correctly.
export function getPrimaryIconUrl(url) {
    const parsed = parseUrl(url);
    if (!parsed) return null;
    if (SPECIAL_ICONS[parsed.hostname]) return SPECIAL_ICONS[parsed.hostname];
    if (GOOGLE_SERVICE_ICONS[parsed.hostname]) return BASE_ICON_URL + GOOGLE_SERVICE_ICONS[parsed.hostname];
    return `${parsed.origin}/favicon.ico`;
}

// Second choice: a public favicon aggregator, for sites that are reachable
// on the open web but didn't have a favicon.ico at the root.
export function getSecondaryIconUrl(url) {
    const parsed = parseUrl(url);
    return parsed ? `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(parsed.hostname)}` : null;
}

// Last resort: a generated initial-letter avatar. Always succeeds (it's a
// local data URI, no network involved) and always looks like a real icon
// rather than a broken image.
export function getLetterAvatarUrl(label) {
    const text = (label || '').trim();
    const letter = escapeXml((Array.from(text)[0] || '?').toUpperCase());
    const color = AVATAR_PALETTE[hashString(text.toLowerCase()) % AVATAR_PALETTE.length];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">`
        + `<rect width="64" height="64" rx="16" fill="${color}"/>`
        + `<text x="32" y="34" font-family="Inter,system-ui,sans-serif" font-size="28" `
        + `font-weight="600" fill="#fff" text-anchor="middle" dominant-baseline="central">${letter}</text>`
        + `</svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// Wires up an <img> with the full fallback cascade: real favicon -> favicon
// aggregator -> generated letter-avatar. Call once per image right after
// creating it.
export function applyIcon(imgElement, url, label) {
    const cached = getCachedIconUrl(url);
    if (cached) {
        imgElement.onerror = null;
        imgElement.src = cached;
        return;
    }

    const primary = getPrimaryIconUrl(url);
    const avatar = getLetterAvatarUrl(label);

    if (!primary) {
        imgElement.onerror = null;
        imgElement.src = avatar;
        return;
    }

    const secondary = getSecondaryIconUrl(url);
    imgElement.src = primary;
    imgElement.onerror = () => {
        if (secondary) {
            imgElement.onerror = () => {
                imgElement.onerror = null;
                imgElement.src = avatar;
            };
            imgElement.src = secondary;
        } else {
            imgElement.onerror = null;
            imgElement.src = avatar;
        }
    };
}
