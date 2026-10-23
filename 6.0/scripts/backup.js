/*======================================================================
    backup.js - "Export All" / "Import All"
----------------------------------------------------------------------
     - A teljes beállításhalmaz egy .json fájlba / fájlból
     - A formátum az 5.1-gyel kompatibilis; a 6.0-s megjelenési
       beállítások egy új "ui" kulcson utaznak (az 5.1 ezt figyelmen
       kívül hagyja)
======================================================================*/

import { getShortcutsConfig, setShortcutsConfig } from './shortcuts.js';
import { getPomodoroSettings, setPomodoroSettings } from './pomodoro.js';
import { settings } from './settings.js';

function readJson(key, fallback) {
    try {
        return JSON.parse(localStorage.getItem(key)) || fallback;
    } catch {
        return fallback;
    }
}

export function exportAllSettings() {
    const allSettings = {
        shortcuts: getShortcutsConfig(),
        bottomBar: readJson('bottomBarConfig', { sections: [] }),
        theme: localStorage.getItem('selectedTheme') || 'grey',
        lowDetailMode: localStorage.getItem('lowDetailMode') === 'true',
        searchEngine: localStorage.getItem('selectedSearchEngine') || 'google',
        currencies: {
            from: localStorage.getItem('fromCurrency') || 'EUR',
            to: localStorage.getItem('toCurrency') || 'HUF'
        },
        pomodoro: getPomodoroSettings(),
        ui: settings
    };

    const url = URL.createObjectURL(new Blob([JSON.stringify(allSettings, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'newtab-settings.json';
    a.click();
    // Azonnali revoke-nál egyes böngészőkben elmaradna a letöltés
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/*
    CÉL: Korábban exportált .json visszatöltése
    LOGIKA:
     - Minden mezőt külön ellenőriz -> egy részleges fájl sem gond
     - A végén újratölt, hogy minden modul a friss állapotból induljon
*/
export function importAllSettings() {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json,application/json';

    fileInput.addEventListener('change', async () => {
        const file = fileInput.files[0];
        if (!file) return;

        try {
            const data = JSON.parse(await file.text());

            if (data.shortcuts) setShortcutsConfig(data.shortcuts);
            if (data.bottomBar) {
                if (!Array.isArray(data.bottomBar.sections) && !data.bottomBar.langTools && !data.bottomBar.aiTools) {
                    throw new Error('Invalid bottomBar format');
                }
                localStorage.setItem('bottomBarConfig', JSON.stringify(data.bottomBar));
            }
            if (data.theme) localStorage.setItem('selectedTheme', data.theme);
            if (data.lowDetailMode !== undefined) localStorage.setItem('lowDetailMode', data.lowDetailMode === true);
            if (data.searchEngine) localStorage.setItem('selectedSearchEngine', data.searchEngine);
            if (data.currencies?.from) localStorage.setItem('fromCurrency', data.currencies.from);
            if (data.currencies?.to) localStorage.setItem('toCurrency', data.currencies.to);
            if (data.pomodoro) setPomodoroSettings(data.pomodoro);
            if (data.ui && typeof data.ui === 'object') localStorage.setItem('uiSettings', JSON.stringify(data.ui));

            alert('All settings imported successfully!');
            location.reload();
        } catch (error) {
            console.error('Error importing settings:', error);
            alert('Invalid file format. Please upload a valid settings JSON file.');
        }
    });

    fileInput.click();
}
