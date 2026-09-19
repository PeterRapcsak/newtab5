/*======================================================================
    dom.js - Központi DOM-referenciák
----------------------------------------------------------------------
    CÉL:
     - Az index.html leggyakrabban használt elemeit egyetlen helyen
       lekérdezni és exportálni, hogy a többi modulnak ne kelljen
       mindenhol újra document.getElementById()-t hívnia
     - Ezt a modult importálja majdnem az összes többi scripts/*.js fájl
    MEGJEGYZÉS:
     - Ha egy elem (még) nincs a DOM-ban, az értéke null lesz -> ezért
       kell mindenhol null-ellenőrzés ott, ahol ezt a struktúrát használjuk
======================================================================*/

export const domElements = {
    //! ---------- Valutaváltó (currency.js) ----------
    currency: {
        fromSelect: document.getElementById('from-currency'),  // "-ból/-ből" pénznem <select>
        toSelect: document.getElementById('to-currency'),      // "-ba/-be" pénznem <select>
        amountInput: document.getElementById('amount'),        // bemeneti összeg mező
        resultInput: document.getElementById('result')         // átváltott összeg mező
    },

    //! ---------- Keresősáv (search.js) ----------
    search: {
        input: document.getElementById('search-q'),             // a keresett szöveg mezője
        button: document.getElementById('search-btn'),          // "Search" gomb
        advancedButton: document.getElementById('advanced-btn') // részletes keresést nyitó ikongomb
    },

    // Részletes keresés panel (quickTools.js nyitja/zárja popoverként)
    advancedSearch: document.getElementById('advanced-search'),

    //! ---------- Shortcut-ok (shortcuts.js) ----------
    shortcuts: {
        wrapper: document.getElementById('shortcuts-wrapper'),
        container: document.getElementById('shortcuts-wrapper'), // ua. mint wrapper - kompatibilitás miatt maradt meg
        addForm: document.querySelector('.add-shortcut'),        // "új shortcut hozzáadása" form
        newName: document.getElementById('new-shortcut-name'),
        newUrl: document.getElementById('new-shortcut-url'),
        addButton: document.getElementById('add-shortcut-btn')
    },

    // Kódból, dinamikusan létrehozott gombok (lásd main.js) -> itt még
    // csak a "hely" van nekik lefoglalva, induláskor mind null
    buttons: {
        edit: null,    // Edit gomb (shortcut- és bottom bar-szerkesztő mód közös kapcsolója)
        new: null,     // (jelenleg nincs használatban)
        import: null,  // beállítások importálása gomb
        export: null   // beállítások exportálása gomb
    }
};
