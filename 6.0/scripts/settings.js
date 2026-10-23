/*======================================================================
    settings.js - Megjelenési / viselkedési beállítások (uiSettings)
----------------------------------------------------------------------
     - Az alapértékek és a CSS-szintű alkalmazás a boot.js-ben élnek
       (az első festés előtt is kellenek); ez a modul a többi modulnak
       ad olvasható állapotot + változás-értesítést
======================================================================*/

const KEY = 'uiSettings';

export const settings = globalThis.loadUiSettings();

const listeners = new Set();
export const onSettingsChange = (fn) => listeners.add(fn);

// CÉL: Részleges módosítás (a widgets/custom alobjektumok is összefésülve), mentés, alkalmazás
export function updateSettings(patch) {
    for (const [key, value] of Object.entries(patch)) {
        settings[key] = value && typeof value === 'object' ? { ...settings[key], ...value } : value;
    }
    localStorage.setItem(KEY, JSON.stringify(settings));
    globalThis.applyUiSettings(settings);
    listeners.forEach((fn) => fn(settings, patch));
}

// A téma váltásakor (egyéni <-> előbeállítás) az inline változókat is frissíteni kell
export const reapplySettings = () => globalThis.applyUiSettings(settings);
