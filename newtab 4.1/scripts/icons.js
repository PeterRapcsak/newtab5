/*======================================================================
    icons.js - Shortcut- és bottom bar-ikonok feloldása
------------------------------------------------------------------------
    CÉL:
     - Egy adott URL-hez és névhez a lehető "legvalódibb" ikon
       megkeresése, cache-elése és egy <img> elemre való rákötése
    HÁTTÉR:
     - A nyilvános favicon-aggregátorok (pld. a DuckDuckGo-é) csak azokat
       az oldalakat ismerik, amiket már bejártak — a self-hosted/belső
       hálózati alkalmazásoknál (Portainer, az *arr csomag, Immich,
       cPanel, stb.) nem hibáznak, csak csendben egy általános
       placeholder ikont adnak vissza, így egy sima <img onerror> csere
       el sem sülne
     - Ennek kiküszöbölésére: először magának az oldalnak a saját
       favicon.ico-ját próbáljuk (a böngésző el tud érni olyan belső
       hostokat is, amikhez egy nyilvános crawler soha), utána jön egy
       favicon-aggregátor, végül pedig egy generált betűs avatar, ami
       mindig sikerül, és mindig szándékosnak, nem hibásnak tűnik
======================================================================*/

//! ---------- KONSTANSOK / ADATOK ----------

const BASE_ICON_URL = "https://www.gstatic.com/images/branding/product/1x/";

// Google szolgáltatásokhoz kézzel válogatott, "hivatalos" ikonok
// (a saját favicon.ico-juk gyakran nem a márka logóját mutatja)
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

// Kézzel megadott, speciális ikon URL-ek olyan oldalakhoz, ahol a
// favicon.ico / aggregátor lánc nem adna jó eredményt
const SPECIAL_ICONS = {
    "chat.deepseek.com": "https://chat.deepseek.com/favicon.ico",
    "deepseek.com": "https://chat.deepseek.com/favicon.ico",
    "chat.openai.com": "https://cdn.oaistatic.com/_next/static/media/apple-touch-icon.59f2e898.png",
    "openai.com": "https://cdn.oaistatic.com/_next/static/media/apple-touch-icon.59f2e898.png",
    "gemini.google.com": "https://www.gstatic.com/lamda/images/gemini_sparkle_v002_d4735304ff6292a690345.svg",
    "aistudio.google.com": "https://www.gstatic.com/aistudio/ai_studio_favicon_32x32.png",
};

// Lágy, egyenletesen elosztott színpaletta (ugyanaz az S/L képlet, mint a
// téma-előbeállításoknál), hogy a generált avatarok illeszkedjenek a UI
// többi részéhez, a témától függetlenül
const AVATAR_PALETTE = [
    'hsl(224 55% 60%)', 'hsl(252 52% 62%)', 'hsl(280 48% 60%)', 'hsl(320 50% 60%)',
    'hsl(340 55% 60%)', 'hsl(8 58% 60%)', 'hsl(28 60% 55%)', 'hsl(45 55% 48%)',
    'hsl(90 38% 45%)', 'hsl(155 45% 45%)', 'hsl(172 48% 42%)', 'hsl(193 52% 48%)',
    'hsl(213 55% 55%)', 'hsl(262 40% 55%)',
];

const ICON_CACHE_KEY = 'iconCacheV1'; // localStorage kulcs a cache-elt ikonokhoz

//! ---------- SEGÉDFÜGGVÉNYEK ----------

/*
    CÉL: URL string biztonságos feldolgozása URL objektummá
    KI: az URL objektum, vagy null, ha érvénytelen a string
*/
function parseUrl(url) {
    try {
        return new URL(url);
    } catch {
        return null;
    }
}

/*
    CÉL: Az ikon-cache beolvasása a localStorage-ból
    KI: { url: dataUri, ... } alakú objektum (üres objektum, ha nincs/hibás)
*/
function loadIconCache() {
    try {
        return JSON.parse(localStorage.getItem(ICON_CACHE_KEY) || '{}');
    } catch {
        return {};
    }
}

//! ---------- CACHE (a Refresh Icons tölti fel, lásd iconRefresh.js) ----------

/*
    CÉL: Egy URL-hez tartozó, véglegesen cache-elt "valódi" ikon lekérése
     - A Refresh Icons folyamat tölti fel (lásd iconRefresh.js)
     - Minden hálózati próbálkozás ELŐTT ezt ellenőrizzük
    KI: data URI string, vagy null, ha nincs cache-elve
*/
export function getCachedIconUrl(url) {
    return loadIconCache()[url] || null;
}

// CÉL: Egy URL-hez tartozó ikon elmentése a cache-be
export function setCachedIconUrl(url, dataUri) {
    const cache = loadIconCache();
    cache[url] = dataUri;
    try {
        localStorage.setItem(ICON_CACHE_KEY, JSON.stringify(cache));
    } catch (e) {
        console.error('Icon cache write failed (storage full?)', e);
    }
}

// CÉL: A teljes ikon-cache törlése
export function clearIconCache() {
    localStorage.removeItem(ICON_CACHE_KEY);
}

//! ---------- BETŰS AVATAR GENERÁLÁSA ----------

/*
    CÉL: Egyszerű hash-függvény: string -> egész szám
     - Ebből választjuk ki a betűs avatar színét, hogy mindig ugyanaz a
       szín tartozzon ugyanahhoz a névhez
*/
function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
    }
    return hash;
}

// CÉL: XML-ben (itt: SVG-ben) veszélyes karakterek escape-elése
function escapeXml(str) {
    return str.replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
    }[c]));
}

//! ---------- IKON-FALLBACK LÁNC ----------

/*
    CÉL: Első próbálkozás -> kurált ikon ismert szolgáltatáshoz, egyébként
    az oldal saját favicon.ico-ja
     - A shortcut saját protokollján/hostján/portján keresztül kérjük le,
       így a belső hálózati appok (http://192.168.x.x:8096, egyedi
       portok, stb.) is helyesen feloldódnak
    KI: ikon URL string, vagy null, ha az input URL érvénytelen
*/
export function getPrimaryIconUrl(url) {
    const parsed = parseUrl(url);
    if (!parsed) return null;
    if (SPECIAL_ICONS[parsed.hostname]) return SPECIAL_ICONS[parsed.hostname];
    if (GOOGLE_SERVICE_ICONS[parsed.hostname]) return BASE_ICON_URL + GOOGLE_SERVICE_ICONS[parsed.hostname];
    return `${parsed.origin}/favicon.ico`;
}

/*
    CÉL: Második próbálkozás -> nyilvános favicon-aggregátor, azoknak az
    oldalaknak, amik elérhetők a nyílt weben, de nem volt favicon.ico-juk
    a gyökérben
*/
export function getSecondaryIconUrl(url) {
    const parsed = parseUrl(url);
    return parsed ? `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(parsed.hostname)}` : null;
}

/*
    CÉL: Utolsó lehetőség -> generált kezdőbetűs avatar
     - Mindig sikerül (helyi data URI, nincs hozzá hálózat)
     - Mindig szándékos ikonnak néz ki, nem törött képnek
*/
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

/*
    CÉL: Egy <img> elem felkötése a teljes fallback láncra:
    valódi favicon -> favicon-aggregátor -> generált betűs avatar
    BE:
     - imgElement: a kép DOM elem
     - url: a shortcut/tool URL-je (ebből próbáljuk kitalálni az ikont)
     - label: a megjelenített név (ebből lesz a fallback avatar betűje)
    MEGJEGYZÉS:
     - Elemenként egyszer kell meghívni, közvetlenül a létrehozása után
*/
export function applyIcon(imgElement, url, label) {
    const cached = getCachedIconUrl(url);
    if (cached) {
        // Van végleges cache -> nincs szükség a fallback láncra
        imgElement.onerror = null;
        imgElement.src = cached;
        return;
    }

    const primary = getPrimaryIconUrl(url);
    const avatar = getLetterAvatarUrl(label);

    if (!primary) {
        // Érvénytelen URL -> egyenesen az avatar
        imgElement.onerror = null;
        imgElement.src = avatar;
        return;
    }

    const secondary = getSecondaryIconUrl(url);
    imgElement.src = primary;
    imgElement.onerror = () => {
        // Az elsődleges (favicon.ico) nem töltött be -> jöhet a lánc második eleme
        if (secondary) {
            imgElement.onerror = () => {
                // A másodikra (aggregátor) is hiba -> végső fallback: avatar
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
