/*======================================================================
    iconRefresh.js - "Refresh Icons" folyamat
------------------------------------------------------------------------
    CÉL:
     - Igény szerint (gombnyomásra) lekéri minden shortcut/tool SAJÁT
       oldalát, kiolvassa az általa deklarált <link rel="icon">-t (ez a
       helyes módja a favicon megkeresésének — a legtöbb modern oldal
       nem szolgál ki favicon.ico-t közvetlenül a gyökérből), letölti,
       átméretezi, majd véglegesen elmenti icons.js cache-ébe
     - CSAK akkor fut, ha a felhasználó rákattint a gombra — a háttérben
       soha nem indul el magától
======================================================================*/

import { getShortcutsConfig } from './shortcuts.js';
import { bottomBarConfig } from './bottomBar.js';
import { setCachedIconUrl } from './icons.js';

const ORIGIN_PATTERNS = ['http://*/*', 'https://*/*']; // engedélykéréshez: "minden oldal"
const ICON_SIZE = 64; // ennyi pixelre méretezzük át a letöltött ikonokat

function hasPermissionsApi() {
    return typeof chrome !== 'undefined' && !!chrome.permissions;
}

//! ---------- JOGOSULTSÁGKEZELÉS (chrome.permissions) ----------

/*
    CÉL: Megnézni, hogy a felhasználó már megadta-e korábban a
    jogosultságot (minden oldal olvasása)
    KI: Promise<boolean> - true, ha már megvan a jogosultság
*/
export function isIconRefreshPermissionGranted() {
    return new Promise((resolve) => {
        if (!hasPermissionsApi()) { resolve(false); return; }
        chrome.permissions.contains({ origins: ORIGIN_PATTERNS }, (granted) => resolve(!!granted));
    });
}

/*
    CÉL: A jogosultság kikérése a felhasználótól (felugró ablakkal)
    KI: Promise<boolean> - true, ha megadta
    MEGJEGYZÉS:
     - Közvetlenül egy kattintás-eseménykezelőből kell meghívni (await
       nélkül előtte) — a Chrome csak valódi felhasználói interakcióra
       (user gesture) engedi megjeleníteni az engedélykérő ablakot
*/
export function requestIconRefreshPermission() {
    return new Promise((resolve) => {
        if (!hasPermissionsApi()) { resolve(false); return; }
        chrome.permissions.request({ origins: ORIGIN_PATTERNS }, (granted) => resolve(!!granted));
    });
}

//! ---------- FRISSÍTENDŐ IKONOK ÖSSZEGYŰJTÉSE ----------

/*
    CÉL: Minden shortcut és bottom bar-tool URL-jének/nevének összegyűjtése
     - Map-et használunk, hogy azonos URL ne szerepeljen duplán
    KI: [{ url, name }, ...] tömb
*/
function collectIconTargets() {
    const targets = new Map(); // url -> name, duplikátum-mentesítve
    getShortcutsConfig().containers.forEach((container) => {
        container.shortcuts.forEach((s) => targets.set(s.url, s.name));
    });
    bottomBarConfig.sections.forEach((section) => {
        section.items.forEach((item) => targets.set(item.url, item.name));
    });
    return Array.from(targets, ([url, name]) => ({ url, name }));
}

//! ---------- A VALÓDI FAVICON MEGKERESÉSE ÉS LETÖLTÉSE ----------

/*
    CÉL: A letöltött HTML <head>-jéből kiválasztani a "legjobb" ikon-linket
    BE:
     - doc: a parse-olt HTML dokumentum
     - pageUrl: az oldal URL-je (a relatív href-ek feloldásához kell)
    KI: a kiválasztott ikon abszolút URL-je
    LOGIKA:
     - Először minden <link rel="...icon..."> jelöltet összeszed
     - Ha egy sincs -> egyszerűen a /favicon.ico-t próbálja
     - A "sizes" attribútum alapján a legnagyobb megadott méretűt
       választja, ha van ilyen (declaredSize > 0)
     - Ha egyiknek sincs mérete megadva -> az apple-touch-icon-t
       részesíti előnyben, különben egyszerűen az első találatot
*/
function bestIconHref(doc, pageUrl) {
    const links = Array.from(doc.querySelectorAll(
        'link[rel~="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"], link[rel="apple-touch-icon-precomposed"]'
    )).filter((el) => el.getAttribute('href'));

    if (links.length === 0) return new URL('/favicon.ico', pageUrl).href;

    const declaredSize = (el) => {
        const match = (el.getAttribute('sizes') || '').match(/(\d+)x\d+/i);
        return match ? parseInt(match[1], 10) : 0;
    };

    const best = links
        .slice()
        .sort((a, b) => declaredSize(b) - declaredSize(a))  // nagyobb méret előre
        .find((el) => declaredSize(el) > 0)                 // legnagyobb, aminek van méretadata
        || links.find((el) => el.getAttribute('rel').includes('apple-touch-icon')) // vagy apple-touch-icon
        || links[0];                                        // vagy egyszerűen az első

    return new URL(best.getAttribute('href'), pageUrl).href;
}

/*
    CÉL: Egy oldal favicon URL-jének kiderítése
     - Letölti magát az oldal HTML-jét, DOMParser-rel értelmezi, majd
       bestIconHref()-fel választja ki belőle a legjobb <link>-et
    KI: Promise<string> - a favicon abszolút URL-je
*/
async function discoverFaviconUrl(pageUrl) {
    const res = await fetch(pageUrl);
    if (!res.ok) throw new Error(`page fetch failed: ${res.status}`);
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return bestIconHref(doc, pageUrl);
}

/*
    CÉL: Az ikon letöltése és ICON_SIZE x ICON_SIZE méretre skálázása
     - Canvas-ra rajzolja ki, a képarány megtartásával, középre igazítva
    KI: Promise<string> - PNG data URL
*/
async function fetchAndResizeIcon(iconUrl) {
    const res = await fetch(iconUrl);
    if (!res.ok) throw new Error(`icon fetch failed: ${res.status}`);
    const blob = await res.blob();
    const bitmap = await createImageBitmap(blob);

    const canvas = document.createElement('canvas');
    canvas.width = ICON_SIZE;
    canvas.height = ICON_SIZE;
    const ctx = canvas.getContext('2d');

    const scale = Math.min(ICON_SIZE / bitmap.width, ICON_SIZE / bitmap.height); // képarány megtartása
    const w = bitmap.width * scale;
    const h = bitmap.height * scale;
    ctx.drawImage(bitmap, (ICON_SIZE - w) / 2, (ICON_SIZE - h) / 2, w, h); // középre igazítva

    return canvas.toDataURL('image/png');
}

//! ---------- FŐFOLYAMAT ----------

/*
    CÉL: Valódi ikon lekérése és cache-elése MINDEN shortcut-hoz és
    bottom bar-toolhoz
    BE:
     - onProgress: opcionális callback, minden próbálkozás UTÁN meghívva,
       { done, total, cached, current } paraméterrel
    KI: Promise<{ granted, total, cached }>
    MEGJEGYZÉS:
     - Saját maga kéri be az egyszeri jogosultságot, ha még nincs meg
*/
export async function refreshAllIcons({ onProgress } = {}) {
    // A request() azonnal (felugró ablak nélkül) visszatér, ha már
    // megvan a jogosultság, ezért ezt feltétel nélkül biztonságos
    // meghívni — és mivel ez fut le elsőként, await nélkül előtte, a
    // hívás a kattintás user gesture-jén belül marad
    const granted = await requestIconRefreshPermission();
    if (!granted) {
        return { granted: false, total: 0, cached: 0 };
    }

    const targets = collectIconTargets();
    let cached = 0;

    for (let i = 0; i < targets.length; i++) {
        const { url, name } = targets[i];
        try {
            const faviconUrl = await discoverFaviconUrl(url);
            const dataUri = await fetchAndResizeIcon(faviconUrl);
            setCachedIconUrl(url, dataUri);
            cached++;
        } catch {
            // Ezt az egyet meghagyjuk az icons.js-ben lévő élő fallback láncnak.
        }
        onProgress?.({ done: i + 1, total: targets.length, cached, current: name });
    }

    return { granted: true, total: targets.length, cached };
}
