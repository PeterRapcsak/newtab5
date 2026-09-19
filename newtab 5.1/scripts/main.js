/*======================================================================
    main.js - Belépési pont
----------------------------------------------------------------------
    FELADAT:
     - Az összes modul (scripts/*.js) inicializálása, DOMContentLoaded-re
     - A dinamikusan, JS-ből létrehozott, közös vezérlők felépítése: az
       Import/Export gombok és az egyetlen, közös Edit gomb
     - "Export All" / "Import All": a teljes beállításhalmaz (shortcut-ok,
       bottom bar, téma, keresőmotor, valuták, Pomodoro) egyetlen .json
       fájlba mentése, illetve visszatöltése
    PLATFORM:
     - Böngésző-kiegészítő (Manifest V3), helyenként chrome.* API-kat
       használ (lásd search.js, iconRefresh.js) -> elsősorban Chrome/
       Chromium-alapú böngészőkben fut; Firefoxhoz lásd manifest(firefox).json
    SZERZŐI JEGYZET (a teljes scripts/ mappára érvényes elnevezési/
    kommentelési konvenció):
     - Minden függvénynek camelCase elnevezése van
     - A függvények fejléce fölötti értelmező:
        CÉL         = Mi a célja a függvénynek
        BE          = Bemenet (paraméterek)
        KI          = Kimenet (visszatérési érték)
        MEGJEGYZÉS  = egyéb, nem magától értetődő tudnivaló
     - SZEKCIÓK:   //! ---------- cím ----------
       (fájlon belüli nagyobb, logikai blokkok elválasztására)
     - //? egy-egy alpont/megjegyzés kiemelésére, a //!-nál kisebb súllyal
======================================================================*/

//! ---------- MODULOK ----------

import { domElements } from './dom.js';
import { initializeTimeTools } from './timeTools.js';
import { getPomodoroSettings, setPomodoroSettings } from './pomodoro.js';
import { loadCurrencies, setupCurrencyInputs } from './currency.js';
import { setupSearch, initializeSearchSettings } from './search.js';
import { loadShortcuts, renderShortcuts, addShortcut, deleteShortcut, toggleEditMode, toggleAddMode, handleAddShortcutKeyPress, getShortcutsConfig, setShortcutsConfig, setupClickOutsideListener } from './shortcuts.js';
import { loadBottomBarConfig, toggleBottomBarEditMode } from './bottomBar.js';
import { initializeThemeCustomizer } from './themeCustomizer.js';
import { initializeQuickTools } from './quickTools.js';
import { initQrWidget } from './qrWidget.js';

// A shortcuts.js-ből szándékosan sok mindent importálunk: az Import/Export
// a teljes shortcut-konfigurációt is kezeli, nem csak a megjelenítést

/*
    CÉL: Az oldal felépítése induláskor (DOMContentLoaded-re hívva)
     - Minden modul saját inicializáló függvényének meghívása
     - A shortcut-hozzáadás gomb/mezők bekötése
     - Az Import/Export gombok és a közös Edit gomb dinamikus felépítése
       és a fix, jobb alsó gombcsoportba (#page-controls) illesztése
*/
function init() {

    //! ---------- MODULOK INICIALIZÁLÁSA ----------

    // A sorrend nem véletlen: előbb a tartalom (keresés, shortcut-ok,
    // valuta), és csak utána a rájuk épülő UI-rétegek (téma, popoverek)
    setupSearch();
    loadShortcuts();
    setupClickOutsideListener();
    loadCurrencies();
    setupCurrencyInputs();
    initializeSearchSettings();
    initializeTimeTools();
    loadBottomBarConfig();
    initializeThemeCustomizer();
    initializeQuickTools();
    initQrWidget();

    //! ---------- SHORTCUT-HOZZÁADÁS BEKÖTÉSE ----------

    if (domElements.shortcuts.addButton) {
        domElements.shortcuts.addButton.addEventListener('click', addShortcut);
    } else {
        console.error('Add shortcut button not found');
    }

    // Enterre is lehessen hozzáadni, mindkét mezőből
    if (domElements.shortcuts.newName) {
        domElements.shortcuts.newName.addEventListener('keypress', handleAddShortcutKeyPress);
    }
    if (domElements.shortcuts.newUrl) {
        domElements.shortcuts.newUrl.addEventListener('keypress', handleAddShortcutKeyPress);
    }

    // A fix, jobb alsó gombcsoport - ide megy minden dinamikus vezérlő
    const pageControls = document.getElementById('page-controls');

    //! ---------- IMPORT / EXPORT GOMBOK ----------

    // Az Import/Export kör alakú, üveghatásos ikongombként él a fix,
    // jobb alsó gombcsoportban, az Edit és a téma-fogaskerék mellett,
    // nem egy sima szöveges gombpár a shortcut-oszlop tetején. Rejtve
    // maradnak, amíg szerkesztő mód nincs bekapcsolva — a
    // shortcuts.js-beli toggleEditMode() állítja a láthatóságukat.
    //? Import gomb
    domElements.buttons.import = document.createElement('button');
    domElements.buttons.import.id = 'import-btn';
    domElements.buttons.import.classList.add('icon-btn');
    domElements.buttons.import.title = 'Import All Settings';
    domElements.buttons.import.innerHTML = '<i class="fas fa-file-import"></i>';
    domElements.buttons.import.style.display = 'none'; // csak szerkesztő módban látszik
    domElements.buttons.import.addEventListener('click', importAllSettings);

    //? Export gomb (ugyanaz a minta, csak a másik irányba)
    domElements.buttons.export = document.createElement('button');
    domElements.buttons.export.id = 'export-btn';
    domElements.buttons.export.classList.add('icon-btn');
    domElements.buttons.export.title = 'Export All Settings';
    domElements.buttons.export.innerHTML = '<i class="fas fa-file-export"></i>';
    domElements.buttons.export.style.display = 'none'; // ez is rejtve indul
    domElements.buttons.export.addEventListener('click', exportAllSettings);

    if (pageControls) {
        pageControls.appendChild(domElements.buttons.import);
        pageControls.appendChild(domElements.buttons.export);
    }

    //! ---------- KÖZÖS EDIT GOMB ----------

    // Egyetlen, közös Edit gomb, a jobb alsó gombcsoportban, ami EGYSZERRE
    // vezérli a shortcut-ok és a bottom bar szerkesztő módját — nincs
    // többé két külön "Edit" gomb, amik egymástól függetlenül csúszhatnának szét.
    domElements.buttons.edit = document.createElement('button');
    domElements.buttons.edit.id = 'edit-btn';
    domElements.buttons.edit.textContent = 'Edit';
    domElements.buttons.edit.addEventListener('click', () => {
        // Egy kattintás, két modul - így nem tudnak kicsúszni egymásból
        toggleEditMode();
        toggleBottomBarEditMode();
    });

    if (pageControls) pageControls.appendChild(domElements.buttons.edit);
}

//! ---------- BEÁLLÍTÁSOK EXPORTÁLÁSA / IMPORTÁLÁSA ----------

/*
    CÉL: A teljes beállításhalmaz összegyűjtése, és letöltése egy .json fájlba
     - Shortcut-ok, bottom bar, téma, low detail mode, keresőmotor,
       valuták, Pomodoro beállítások — mind egy objektumban
*/
function exportAllSettings() {

    // Minden érték mellé ott a fallback is, hogy egy soha nem piszkált
    // beállítás is értelmes alapértékkel kerüljön a fájlba
    const allSettings = {
        shortcuts: getShortcutsConfig(), // Most már a teljes konténer-struktúrát exportálja
        bottomBar: JSON.parse(localStorage.getItem('bottomBarConfig') || '{"langTools":[],"aiTools":[]}'),
        theme: localStorage.getItem('selectedTheme') || 'purple',
        lowDetailMode: localStorage.getItem('lowDetailMode') === 'true',
        searchEngine: localStorage.getItem('selectedSearchEngine') || 'google',
        currencies: {
            from: localStorage.getItem('fromCurrency') || 'USD',
            to: localStorage.getItem('toCurrency') || 'EUR'
        },
        pomodoro: getPomodoroSettings()
    };

    // A null, 2 paraméterek miatt szépen behúzott, kézzel is olvasható
    // JSON lesz belőle, nem egyetlen hosszú sor
    const blob = new Blob([JSON.stringify(allSettings, null, 2)], { type: 'application/json' });

    // Klasszikus trükk: készítünk egy láthatatlan <a download>-t, "rákattintunk",
    // és a böngésző elindítja a letöltést
    // https://stackoverflow.com/questions/19327749/javascript-blob-filename-without-link
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'newtab-settings.json';
    a.click();

    // A blob URL-t illik felszabadítani, különben a memóriában marad
    URL.revokeObjectURL(url);
}

/*
    CÉL: Korábban exportált .json fájl beolvasása, és minden benne lévő
    beállítás alkalmazása
    LOGIKA:
     - Minden mezőt KÜLÖN, egymástól függetlenül ellenőriz és alkalmaz -
       egy részlegesen kitöltött fájl (pld. csak shortcuts) sem probléma
     - A végén újratölti az oldalt, hogy minden modul a friss állapotot lássa
*/
function importAllSettings() {

    // Ugyanaz a trükk, mint exportnál, csak fordítva: egy DOM-ba be sem
    // illesztett <input type="file">-ra kattintunk rá programból
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json';

    fileInput.onchange = (event) => {
        const file = event.target.files[0]; // csak az elsőt nézzük, több nem kell
        if (file) {
            const reader = new FileReader();

            reader.onload = (e) => {
                try {
                    // Innentől MINDEN a try-ban van: egy hibás fájl se
                    // hagyhassa félig átállított állapotban a beállításokat
                    const importedData = JSON.parse(e.target.result);

                    // Shortcut-ok importálása (mind a régi, mind az új formátumot támogatja)
                    if (importedData.shortcuts) {
                        setShortcutsConfig(importedData.shortcuts);
                    }

                    // Bottom bar importálása
                    if (importedData.bottomBar) {
                        localStorage.setItem('bottomBarConfig', JSON.stringify(importedData.bottomBar));
                        loadBottomBarConfig();
                    }

                    // Téma importálása
                    if (importedData.theme) {
                        localStorage.setItem('selectedTheme', importedData.theme);
                        document.documentElement.setAttribute('data-theme', importedData.theme);
                    }

                    // Low Detail Mode importálása
                    //? Itt !== undefined kell, és nem sima if: a false is
                    //? érvényes, elmentendő érték
                    if (importedData.lowDetailMode !== undefined) {
                        localStorage.setItem('lowDetailMode', importedData.lowDetailMode);
                        document.documentElement.classList.toggle('low-detail', importedData.lowDetailMode);
                    }

                    // Keresőmotor importálása
                    if (importedData.searchEngine) {
                        localStorage.setItem('selectedSearchEngine', importedData.searchEngine);
                        const searchSelect = document.getElementById('search-engine-select');
                        if (searchSelect) {
                            searchSelect.value = importedData.searchEngine;
                        }
                    }

                    // Valuták importálása
                    if (importedData.currencies) {
                        if (importedData.currencies.from) {
                            localStorage.setItem('fromCurrency', importedData.currencies.from);
                        }
                        if (importedData.currencies.to) {
                            localStorage.setItem('toCurrency', importedData.currencies.to);
                        }
                        loadCurrencies();
                    }

                    // Pomodoro fókusz/szünet hosszak importálása
                    if (importedData.pomodoro) {
                        setPomodoroSettings(importedData.pomodoro);
                    }

                    alert('All settings imported successfully!');

                    // Újratöltés, hogy minden modul tisztán, a friss
                    // localStorage-ból induljon újra
                    location.reload();
                } catch (error) {
                    console.error('Error importing settings:', error);
                    alert('Invalid file format. Please upload a valid settings JSON file.');
                }
            };
            reader.readAsText(file);
        }
    };

    fileInput.click(); // megnyitjuk a fájlválasztó ablakot
}

// Belépési pont: megvárjuk, amíg a DOM összeáll, különben a
// getElementById-ok (lásd dom.js) mind null-t adnának
document.addEventListener('DOMContentLoaded', init);
