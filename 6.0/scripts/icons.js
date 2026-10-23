/*======================================================================
    icons.js - Shortcut- és bottom bar-ikonok feloldása
----------------------------------------------------------------------
     - Lánc: Refresh Icons cache -> kurált/saját favicon.ico -> favicon-
       aggregátor -> generált betűs avatar (ez mindig sikerül)
     - A favicon.ico-t a shortcut SAJÁT originjéről kérjük, így a belső
       hálózati appok (http://192.168.x.x:8096) is feloldódnak
    6.0:
     - A cache-t EGYSZER olvassuk be (az 5.1 minden egyes ikonnál újra
       JSON.parse-olta az egész, data URI-kkal teli cache-t)
     - Megjegyezzük, ha egy oldalnál csak az aggregátor működött -> a
       következő új fülön már nem kérjük le újra a 404-es favicon.ico-t
======================================================================*/

//! ---------- KONSTANSOK / ADATOK ----------

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

const AVATAR_PALETTE = [
    'hsl(224 55% 60%)', 'hsl(252 52% 62%)', 'hsl(280 48% 60%)', 'hsl(320 50% 60%)',
    'hsl(340 55% 60%)', 'hsl(8 58% 60%)', 'hsl(28 60% 55%)', 'hsl(45 55% 48%)',
    'hsl(90 38% 45%)', 'hsl(155 45% 45%)', 'hsl(172 48% 42%)', 'hsl(193 52% 48%)',
    'hsl(213 55% 55%)', 'hsl(262 40% 55%)',
];

const LEGACY_CACHE_KEY = 'iconCacheV1';   // 6.0 előtti localStorage cache (data URI-k) - egyszer migráljuk
const RESOLVED_KEY = 'iconResolvedV2';     // url -> a működő aggregátor URL (V2: nagyobb, 128px-es kérés)
const DB_NAME = 'newtab-icons';
const STORE = 'icons';                     // url -> { blob, plate, size }
export const MAX_ICON_SIZE = 256;          // ennyi px-ig mentünk (a 120px-es csempe 2x-es HiDPI-n is éles)

function readJson(key) {
    try {
        return JSON.parse(localStorage.getItem(key) || '{}');
    } catch {
        return {};
    }
}

function writeJson(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
        console.error(`localStorage write failed for ${key}`, e);
    }
}

const resolvedIcons = readJson(RESOLVED_KEY);

function parseUrl(url) {
    try {
        return new URL(url);
    } catch {
        return null;
    }
}

//! ---------- CACHE: IndexedDB (iconRefresh.js tölti fel) ----------
/*
    MIÉRT IndexedDB:
     - A localStorage ~5 MB-os és csak szöveget tárol (data URI = +33%),
       ráadásul induláskor az EGÉSZET be kell olvasni és parse-olni
     - Az IndexedDB nyers képet (Blob) tárol, nincs gyakorlati méretkorlát
       -> beleférnek a nagy, éles (256 px-es) ikonok is
     - Memóriában url -> { src: object URL, plate } -> az applyIcon szinkron marad
*/
const iconCache = new Map();
let db = null;

const request = (req) => new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
});

function openDb() {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    return request(req);
}

function remember(url, { blob, plate }) {
    const old = iconCache.get(url);
    if (old) URL.revokeObjectURL(old.src);
    iconCache.set(url, { src: URL.createObjectURL(blob), plate: plate || '' });
}

// CÉL: Az 5.1/6.0-s localStorage cache áthelyezése IndexedDB-be (a sötét ikonok felismerésével együtt)
async function migrateLegacyCache() {
    const legacy = readJson(LEGACY_CACHE_KEY);
    const entries = Object.entries(legacy);
    if (!entries.length) return;

    for (const [url, dataUri] of entries) {
        try {
            const record = await processIcon(await (await fetch(dataUri)).blob());
            await setCachedIcon(url, record);
        } catch (e) {
            console.warn('Could not migrate cached icon for', url, e);
        }
    }
    localStorage.removeItem(LEGACY_CACHE_KEY); // ~MB-ok felszabadulnak a localStorage-ban
}

// Induláskor EGYSZER betölti az egészet; a main.js megvárja, mielőtt kirajzol
export const iconCacheReady = (async () => {
    try {
        db = await openDb();
        const store = db.transaction(STORE).objectStore(STORE);
        const [keys, values] = await Promise.all([request(store.getAllKeys()), request(store.getAll())]);
        keys.forEach((url, i) => remember(url, values[i]));
        await migrateLegacyCache();
        localStorage.removeItem('iconResolvedV1'); // a régi, 64 px-es aggregátor-URL-ek
    } catch (e) {
        console.error('Icon cache unavailable (IndexedDB):', e);
    }
})();

export function getCachedIconUrl(url) {
    return iconCache.get(url)?.src || null;
}

export async function setCachedIcon(url, record) {
    remember(url, record);
    if (!db) return;
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record, url);
    await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
    });
}

export async function clearIconCache() {
    iconCache.forEach(({ src }) => URL.revokeObjectURL(src));
    iconCache.clear();
    if (db) await request(db.transaction(STORE, 'readwrite').objectStore(STORE).clear());
}

//! ---------- KÉPFELDOLGOZÁS (méret + sötét ikon felismerése) ----------

/*
    CÉL: Egy letöltött ikon feldolgozása mentésre
    BE: blob - bármilyen képformátum (png/ico/svg/webp...)
    KI: { blob: PNG, size: a forrás valódi mérete px-ben, plate: 'light' | '' }
    LOGIKA:
     - Nem nagyít fel (egy 32 px-es forrásból nem lesz élesebb 256 px), csak
       kicsinyít MAX_ICON_SIZE-ra; az SVG vektoros -> mindig teljes méretben
     - "Sötét ikon átlátszó háttéren" (GitHub, Tailscale): a fedett pixelek
       átlagos fényessége alacsony, és van átlátszó rész -> világos alátét kell
*/
export async function processIcon(blob) {
    const objectUrl = URL.createObjectURL(blob);
    try {
        const img = new Image();
        img.src = objectUrl;
        await img.decode();

        const isSvg = blob.type.includes('svg');
        const natural = isSvg ? MAX_ICON_SIZE : Math.max(img.naturalWidth, img.naturalHeight);
        if (!natural) throw new Error('empty image');

        const size = Math.min(MAX_ICON_SIZE, natural);
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        const ratio = isSvg ? 1 : Math.min(size / img.naturalWidth, size / img.naturalHeight);
        const w = isSvg ? size : img.naturalWidth * ratio;
        const h = isSvg ? size : img.naturalHeight * ratio;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);

        const plate = isDarkOnTransparent(ctx.getImageData(0, 0, size, size).data) ? 'light' : '';
        const png = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
        return { blob: png, size: natural, plate };
    } finally {
        URL.revokeObjectURL(objectUrl);
    }
}

// "Sötét": a fedett pixelek többsége közel fekete/sötétszürke (MINDEN csatorna
// alacsony). A telített színek (YouTube-piros, Netflix) a sötét felületen is jól
// látszanak, ezért a puszta fényesség nem jó mérce
function isDarkOnTransparent(pixels) {
    let opaque = 0;
    let dark = 0;
    for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i + 3] < 128) continue;
        opaque++;
        if (Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) < 90) dark++;
    }
    const coverage = opaque / (pixels.length / 4);
    return opaque > 0 && coverage < 0.9 && dark / opaque > 0.6;
}

//! ---------- IKON-JELÖLTEK ----------

// CÉL: Kurált ikon ismert szolgáltatáshoz, egyébként az oldal saját favicon.ico-ja
export function getPrimaryIconUrl(url) {
    const parsed = parseUrl(url);
    if (!parsed) return null;
    if (SPECIAL_ICONS[parsed.hostname]) return SPECIAL_ICONS[parsed.hostname];
    if (GOOGLE_SERVICE_ICONS[parsed.hostname]) return BASE_ICON_URL + GOOGLE_SERVICE_ICONS[parsed.hostname];
    return `${parsed.origin}/favicon.ico`;
}

// CÉL: Nyilvános favicon-aggregátor (csak a hostname megy ki, az útvonal nem)
export function getSecondaryIconUrl(url) {
    const parsed = parseUrl(url);
    return parsed ? `https://www.google.com/s2/favicons?sz=128&domain=${encodeURIComponent(parsed.hostname)}` : null;
}

function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
    return hash;
}

function escapeXml(str) {
    return str.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
}

// CÉL: Generált kezdőbetűs avatar (helyi data URI, mindig sikerül)
export function getLetterAvatarUrl(label) {
    const text = (label || '').trim();
    const letter = escapeXml((Array.from(text)[0] || '?').toUpperCase());
    const color = AVATAR_PALETTE[hashString(text.toLowerCase()) % AVATAR_PALETTE.length];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">`
        + `<rect width="64" height="64" fill="${color}"/>`
        + `<text x="32" y="34" font-family="Inter,system-ui,sans-serif" font-size="28" `
        + `font-weight="600" fill="#fff" text-anchor="middle" dominant-baseline="central">${letter}</text>`
        + `</svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/*
    CÉL: Egy <img> felkötése a teljes fallback láncra
    MEGJEGYZÉS:
     - Ha a lánc az aggregátornál áll meg, azt megjegyezzük (RESOLVED_KEY);
       az avatart NEM, mert az lehet csak egy átmeneti hálózati hiba is
     - plateOverride: a shortcut saját "Icon background" beállítása
       ('auto' | 'none' | 'light' | 'dark'); auto = a cache felismerése
*/
export function applyIcon(img, url, label, plateOverride = 'auto') {
    const cached = iconCache.get(url);
    const plate = plateOverride === 'auto' || !plateOverride ? cached?.plate : plateOverride === 'none' ? '' : plateOverride;
    if (plate) img.dataset.plate = plate;
    else delete img.dataset.plate;

    const secondary = getSecondaryIconUrl(url);
    const first = cached?.src || resolvedIcons[url] || getPrimaryIconUrl(url);
    const chain = [first, secondary].filter((src, i, all) => src && all.indexOf(src) === i);
    let step = 0;

    img.decoding = 'async';
    img.onload = () => {
        // Ismeretlen oldalra az aggregátor egy 16px-es "földgömb" placeholdert ad
        // (hibakód helyett) -> felnagyítva elmosódott; inkább a betűs avatar
        if (img.src === secondary && img.naturalWidth <= 16) {
            img.onerror = null;
            img.src = getLetterAvatarUrl(label);
            return;
        }
        if (img.src === secondary && resolvedIcons[url] !== secondary) {
            resolvedIcons[url] = secondary;
            writeJson(RESOLVED_KEY, resolvedIcons);
        }
    };
    img.onerror = () => {
        step++;
        if (step < chain.length) {
            img.src = chain[step];
        } else {
            img.onerror = null; // egy hibás avatar ne pörögjön végtelen ciklusban
            img.src = getLetterAvatarUrl(label);
        }
    };
    img.src = chain[0] || getLetterAvatarUrl(label);
}
