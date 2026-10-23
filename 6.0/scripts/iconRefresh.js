/*======================================================================
    iconRefresh.js - "Refresh Icons" folyamat
----------------------------------------------------------------------
     - Gombnyomásra minden shortcut/tool oldaláról az ÖSSZES felkínált
       ikont megnézi (SVG, apple-touch-icon, <link rel="icon">, favicon.ico,
       aggregátor 256 px), és a legnagyobb felbontásút menti el (max.
       256 px, IndexedDB). A háttérben soha nem fut magától
     - 6.0: 4 párhuzamos szállal (nem egyesével), és oldalanként
       időkorláttal — egy lefagyott host nem állítja meg az egészet
======================================================================*/

import { getShortcutsConfig } from './shortcuts.js';
import { bottomBarConfig } from './bottomBar.js';
import { setCachedIcon, processIcon, getPrimaryIconUrl } from './icons.js';

const ORIGIN_PATTERNS = ['http://*/*', 'https://*/*'];
const CONCURRENCY = 4;
const TIMEOUT_MS = 8000;

const hasPermissionsApi = () => typeof chrome !== 'undefined' && !!chrome.permissions;

export function isIconRefreshPermissionGranted() {
    return new Promise((resolve) => {
        if (!hasPermissionsApi()) return resolve(false);
        chrome.permissions.contains({ origins: ORIGIN_PATTERNS }, (granted) => resolve(!!granted));
    });
}

// Közvetlenül egy kattintásból kell hívni (user gesture), await nélkül előtte
export function requestIconRefreshPermission() {
    return new Promise((resolve) => {
        if (!hasPermissionsApi()) return resolve(false);
        chrome.permissions.request({ origins: ORIGIN_PATTERNS }, (granted) => resolve(!!granted));
    });
}

// CÉL: Minden shortcut és tool url/név párja, duplikátumok nélkül
function collectIconTargets() {
    const targets = new Map();
    getShortcutsConfig().containers.forEach((c) => c.shortcuts.forEach((s) => targets.set(s.url, s.name)));
    bottomBarConfig.sections.forEach((s) => s.items.forEach((item) => targets.set(item.url, item.name)));
    return Array.from(targets, ([url, name]) => ({ url, name }));
}

/*
    CÉL: Az oldal által felkínált ÖSSZES ikon-jelölt, a várhatóan legjobbtól
    LOGIKA: SVG (vektoros, mindig éles) -> legnagyobb deklarált "sizes" ->
    apple-touch-icon (általában 180 px) -> többi <link rel="icon">
*/
function iconCandidates(doc, pageUrl) {
    const score = (el) => {
        const href = el.getAttribute('href');
        if ((el.getAttribute('type') || '').includes('svg') || /\.svg(\?|$)/i.test(href)) return 10000;
        const sizes = el.getAttribute('sizes') || '';
        if (/any/i.test(sizes)) return 9000;
        const declared = parseInt(sizes.match(/(\d+)x\d+/i)?.[1] || '0', 10);
        if (declared) return declared;
        return el.getAttribute('rel').includes('apple-touch-icon') ? 180 : 1;
    };
    return [...doc.querySelectorAll('link[rel~="icon"], link[rel~="apple-touch-icon"], link[rel="apple-touch-icon-precomposed"]')]
        .filter((el) => el.getAttribute('href'))
        .sort((a, b) => score(b) - score(a))
        .map((el) => new URL(el.getAttribute('href'), pageUrl).href);
}

async function fetchBlob(url) {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    // Az aggregátor ismeretlen oldalra 404-gyel küldi a földgömb-placeholdert -> kimarad
    if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
    return res.blob();
}

/*
    CÉL: A legjobb (legnagyobb felbontású) elérhető ikon megkeresése
    KI: { blob, size, plate } (lásd icons.js processIcon)
    MEGJEGYZÉS:
     - Ha az oldal maga nem tölthető le (pld. bejelentkezésre irányít),
       a /favicon.ico, a kurált és az aggregátor-ikon akkor is próbálkozik
     - 128 px fölött megáll: annál jobbat úgysem nyerne a további letöltés
*/
async function findBestIcon(pageUrl) {
    let candidates = [];
    try {
        const html = await (await fetchBlob(pageUrl)).text();
        candidates = iconCandidates(new DOMParser().parseFromString(html, 'text/html'), pageUrl);
    } catch {
        // marad a tartalék lista
    }

    const { origin, hostname } = new URL(pageUrl);
    const fallbacks = [
        getPrimaryIconUrl(pageUrl),
        `${origin}/favicon.ico`,
        `https://www.google.com/s2/favicons?sz=256&domain=${encodeURIComponent(hostname)}`
    ];
    const tried = new Set();
    let best = null;

    for (const candidate of [...candidates.slice(0, 5), ...fallbacks]) {
        if (!candidate || tried.has(candidate)) continue;
        tried.add(candidate);
        try {
            const icon = await processIcon(await fetchBlob(candidate));
            if (!best || icon.size > best.size) best = icon;
            if (best.size >= 128) break;
        } catch {
            // ez a jelölt nem kép / nem elérhető -> következő
        }
    }
    if (!best) throw new Error('no usable icon');
    return best;
}

/*
    CÉL: Valódi ikon lekérése és cache-elése minden shortcut-hoz és toolhoz
    BE: onProgress({ done, total, cached, current }) - minden próbálkozás után
    KI: Promise<{ granted, total, cached }>
*/
export async function refreshAllIcons({ onProgress } = {}) {
    const granted = await requestIconRefreshPermission();
    if (!granted) return { granted: false, total: 0, cached: 0 };

    const targets = collectIconTargets();
    let next = 0;
    let done = 0;
    let cached = 0;

    const worker = async () => {
        while (next < targets.length) {
            const { url, name } = targets[next++];
            try {
                await setCachedIcon(url, await findBestIcon(url));
                cached++;
            } catch {
                // Egy elbukott oldal nem állítja meg a többit; annál marad az élő fallback lánc
            }
            onProgress?.({ done: ++done, total: targets.length, cached, current: name });
        }
    };

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, worker));
    return { granted: true, total: targets.length, cached };
}
