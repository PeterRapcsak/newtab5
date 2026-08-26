// On-demand "Refresh Icons" flow: fetches each shortcut/tool's own page,
// reads the <link rel="icon"> it actually declares (the correct way to find
// a favicon — most modern sites don't serve one at /favicon.ico), downloads
// it, and caches a resized copy permanently via icons.js's cache. Only runs
// when the user clicks the button; never runs in the background.

import { getShortcutsConfig } from './shortcuts.js';
import { bottomBarConfig } from './bottomBar.js';
import { setCachedIconUrl } from './icons.js';

const ORIGIN_PATTERNS = ['http://*/*', 'https://*/*'];
const ICON_SIZE = 64;

function hasPermissionsApi() {
    return typeof chrome !== 'undefined' && !!chrome.permissions;
}

export function isIconRefreshPermissionGranted() {
    return new Promise((resolve) => {
        if (!hasPermissionsApi()) { resolve(false); return; }
        chrome.permissions.contains({ origins: ORIGIN_PATTERNS }, (granted) => resolve(!!granted));
    });
}

// Must be called directly from a click handler (no awaits before it) —
// Chrome requires a user gesture for permission prompts.
export function requestIconRefreshPermission() {
    return new Promise((resolve) => {
        if (!hasPermissionsApi()) { resolve(false); return; }
        chrome.permissions.request({ origins: ORIGIN_PATTERNS }, (granted) => resolve(!!granted));
    });
}

function collectIconTargets() {
    const targets = new Map(); // url -> name, de-duplicated
    getShortcutsConfig().containers.forEach((container) => {
        container.shortcuts.forEach((s) => targets.set(s.url, s.name));
    });
    bottomBarConfig.sections.forEach((section) => {
        section.items.forEach((item) => targets.set(item.url, item.name));
    });
    return Array.from(targets, ([url, name]) => ({ url, name }));
}

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
        .sort((a, b) => declaredSize(b) - declaredSize(a))
        .find((el) => declaredSize(el) > 0)
        || links.find((el) => el.getAttribute('rel').includes('apple-touch-icon'))
        || links[0];

    return new URL(best.getAttribute('href'), pageUrl).href;
}

async function discoverFaviconUrl(pageUrl) {
    const res = await fetch(pageUrl);
    if (!res.ok) throw new Error(`page fetch failed: ${res.status}`);
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return bestIconHref(doc, pageUrl);
}

async function fetchAndResizeIcon(iconUrl) {
    const res = await fetch(iconUrl);
    if (!res.ok) throw new Error(`icon fetch failed: ${res.status}`);
    const blob = await res.blob();
    const bitmap = await createImageBitmap(blob);

    const canvas = document.createElement('canvas');
    canvas.width = ICON_SIZE;
    canvas.height = ICON_SIZE;
    const ctx = canvas.getContext('2d');

    const scale = Math.min(ICON_SIZE / bitmap.width, ICON_SIZE / bitmap.height);
    const w = bitmap.width * scale;
    const h = bitmap.height * scale;
    ctx.drawImage(bitmap, (ICON_SIZE - w) / 2, (ICON_SIZE - h) / 2, w, h);

    return canvas.toDataURL('image/png');
}

// Fetches + caches a real icon for every shortcut and bottom-bar tool.
// Requests the one-time permission grant itself if not already held.
// onProgress({ done, total, cached, current }) fires after each attempt.
export async function refreshAllIcons({ onProgress } = {}) {
    // request() resolves instantly (no prompt) if already granted, so this is
    // safe to call unconditionally — and calling it first, with nothing
    // awaited before it, keeps it inside the click's user-gesture window.
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
            // Leave this one to the existing live fallback cascade in icons.js.
        }
        onProgress?.({ done: i + 1, total: targets.length, cached, current: name });
    }

    return { granted: true, total: targets.length, cached };
}
