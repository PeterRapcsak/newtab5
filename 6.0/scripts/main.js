/*======================================================================
    main.js - Belépési pont
----------------------------------------------------------------------
     - Minden modul inicializálása (a module script deferred: a DOM itt
       már kész, nem kell DOMContentLoaded-re várni)
     - Quick Tools: ikon -> popover (részletes keresés, valuta, idő)
     - Page controls: Import / Export / Edit gombok
     - "Export All" / "Import All": lásd backup.js
    KONVENCIÓ (a scripts/ mappára):
     - camelCase függvények; CÉL/BE/KI/MEGJEGYZÉS fejléc ott, ahol a
       függvény célja nem magától értetődő
     - //! ---------- szekció ----------   és   //? alpont
======================================================================*/

import { initializeTimeTools } from './timeTools.js';
import { loadCurrencies, setupCurrencyInputs } from './currency.js';
import { setupSearch, initializeSearchSettings } from './search.js';
import { loadShortcuts, animateLayout } from './shortcuts.js';
import { loadBottomBarConfig, refreshBottomBar } from './bottomBar.js';
import { initializeSettingsPanel } from './settingsPanel.js';
import { initQrWidget } from './qrWidget.js';
import { exportAllSettings, importAllSettings } from './backup.js';
import { togglePopover, closeAllPopovers, svgIcon } from './ui.js';
import { iconCacheReady } from './icons.js';

//! ---------- INDÍTÁS ----------

setupSearch();
initializeSearchSettings();
loadCurrencies();
setupCurrencyInputs();
initializeTimeTools();
initQrWidget();
initializeQuickTools();
initializeSettingsPanel();
buildPageControls();

// Az ikon-cache (IndexedDB) egyetlen gyors olvasás; megvárjuk, hogy a
// csempék rögtön a mentett ikonnal rajzolódjanak, ne a tartalék-láncon át
await iconCacheReady;
loadShortcuts();
loadBottomBarConfig();

//! ---------- BAL OSZLOP ILLESZTÉSE ----------

/*
    CÉL: Ha a bal oszlop nem fér ki (alacsony ablak), a widgetek egyesével
    a keresősáv ikonjai mögé költöznek — előbb a QR, aztán a valuta,
    végül az idő-eszközök — amíg ki nem fér; nagyobb ablakban visszajönnek
*/
const leftHalf = document.querySelector('.left-half');
const COLLAPSE_ORDER = ['qr', 'currency', 'time'];

function fitLeftColumn() {
    const root = document.documentElement;
    COLLAPSE_ORDER.forEach((w) => root.classList.remove(`collapse-${w}`));
    for (const widget of COLLAPSE_ORDER) {
        if (leftHalf.scrollHeight <= leftHalf.clientHeight) return;
        root.classList.add(`collapse-${widget}`);
    }
}

let lastLeftSize = '';
new ResizeObserver(() => {
    const size = `${leftHalf.clientWidth}x${leftHalf.clientHeight}`;
    if (size !== lastLeftSize) {
        lastLeftSize = size;
        fitLeftColumn();
    }
}).observe(leftHalf);

// A betöltéskori "beúszó" animációk után kikapcsoljuk őket, hogy a
// később beszúrt elemeknél ne játszódjanak le újra
setTimeout(() => document.documentElement.classList.add('ready'), 700);

//! ---------- QUICK TOOLS ----------

// [gomb, panel] párok — a panel csak nyitás idejére lesz lebegő (transient)
function initializeQuickTools() {
    [
        ['advanced-btn', '#advanced-search'],
        ['quick-currency-btn', '.currency-exchanger'],
        ['quick-time-btn', '.time-tools'],
        ['quick-qr-btn', '.qr-widget']
    ].forEach(([buttonId, panelSelector]) => {
        const button = document.getElementById(buttonId);
        const panel = document.querySelector(panelSelector);
        button.addEventListener('click', () => togglePopover(panel, button, { transient: true }));
    });
}

//! ---------- PAGE CONTROLS (jobb alul) ----------

function buildPageControls() {
    const pageControls = document.getElementById('page-controls');

    const makeButton = (id, title, icon, onClick) => {
        const button = document.createElement('button');
        button.id = id;
        button.className = 'icon-btn edit-only'; // csak szerkesztő módban látszik
        button.title = title;
        button.innerHTML = svgIcon(icon);
        button.addEventListener('click', onClick);
        return button;
    };

    const editButton = document.createElement('button');
    editButton.id = 'edit-btn';
    editButton.className = 'btn-primary';
    editButton.textContent = 'Edit';

    // EGY közös Edit gomb a shortcut-oknak ÉS a bottom barnak: csak egy
    // osztályt vált a <html>-en, a többit a CSS + a delegált kezelők intézik
    editButton.addEventListener('click', () => {
        closeAllPopovers();
        animateLayout(() => {
            const editing = document.documentElement.classList.toggle('editing');
            editButton.textContent = editing ? 'Done' : 'Edit';
        });
        refreshBottomBar(); // az üres szekciók / "+" gombok megjelenése változtat a sáv szélességén
    });

    pageControls.append(
        makeButton('import-btn', 'Import All Settings', 'import', importAllSettings),
        makeButton('export-btn', 'Export All Settings', 'export', exportAllSettings),
        editButton
    );
}
