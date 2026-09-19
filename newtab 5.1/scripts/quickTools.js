/*======================================================================
    quickTools.js - Ikon-popoverek (részletes keresés / valuta / idő)
----------------------------------------------------------------------
    FELADAT:
     - Általános "popover" mechanizmus: egy ikongombra kattintva az adott
       panel (pld. a valutaváltó kártya) popoverré válik, a gomb alá
       pozícionálva jelenik meg, majd kívülre kattintásra / Escape-re /
       átméretezésre bezáródik
     - Ez teszi lehetővé, hogy kis képernyőn a #advanced-btn, a
       #quick-currency-btn és a #quick-time-btn ikonok mögé "rejtve" is
       elérhető maradjon a részletes keresés, a valutaváltó és az
       idő-eszközök panel
     - Egyszerre csak EGY popover lehet nyitva (lásd activeTrigger / activePanel)
======================================================================*/

import { domElements } from './dom.js';

//! ---------- KONSTANSOK ÉS ÁLLAPOT ----------

const POPOVER_MARGIN = 12; // minimális távolság a popover és a képernyő szélei között
const POPOVER_GAP = 10;    // függőleges rés a triggergomb és a popover teteje között

let activeTrigger = null; // az épp nyitott popovert kinyitó gomb
let activePanel = null;   // az épp nyitott popover maga
// A kettőt együtt kezeljük: vagy MINDKETTŐ null (nincs nyitva semmi),
// vagy mindkettő ki van töltve - lásd closeActivePopover()

/*
    CÉL: A popover panel triggergomb alá pozícionálása
    BE:
     - triggerEl: a gomb, ami alá kerüljön a panel
     - panelEl: maga a popover panel
    MEGJEGYZÉS:
     - A pozíciót CSS változókon (--popover-top / --popover-left)
       keresztül állítjuk be, nem közvetlen style.top/left-tel
*/
function positionPopover(triggerEl, panelEl) {
    // A getBoundingClientRect() a képernyőhöz (viewporthoz) képesti
    // koordinátákat ad - pont ez kell a position: fixed panelhez
    const rect = triggerEl.getBoundingClientRect();
    let left = Math.round(rect.left); // kerekítés, hogy ne legyen elmosódott a szöveg

    // A panel ALJA a gomb aljához igazodik, plusz a rés
    panelEl.style.setProperty('--popover-top', `${Math.round(rect.bottom + POPOVER_GAP)}px`);
    panelEl.style.setProperty('--popover-left', `${left}px`);

    // Miután a panel a saját természetes szélességével kirajzolódott,
    // visszahúzzuk a képernyőre, ha túllógna a jobb szélen.
    requestAnimationFrame(() => {
        const panelRect = panelEl.getBoundingClientRect();
        const overflowRight = panelRect.right - (window.innerWidth - POPOVER_MARGIN);

        // Csak jobbra korrigálunk: balra a gombok úgysem lógnak ki
        if (overflowRight > 0) {
            left = Math.max(POPOVER_MARGIN, left - overflowRight);
            panelEl.style.setProperty('--popover-left', `${left}px`);
        }
    });
}

// CÉL: Az épp nyitott popover bezárása (ha van ilyen)
function closeActivePopover() {
    // Az ?. miatt akkor is nyugodtan hívható, ha nincs nyitva semmi
    activePanel?.classList.remove('popover-panel'); // a panel visszakerül a normál helyére
    activeTrigger?.classList.remove('active');      // a gomb kiemelése is megszűnik

    activeTrigger = null;
    activePanel = null;
}

/*
    CÉL: Popover megnyitása egy adott trigger/panel párosra
     - Előbb mindig bezárja az esetlegesen már nyitva lévő popovert
     - Ha ugyanarra a gombra kattintottak újra -> csak bezár, nem nyit újra
*/
function openPopover(triggerEl, panelEl) {
    const reopeningSame = activePanel === panelEl;
    closeActivePopover();
    if (reopeningSame) return; // második kattintás ugyanarra az ikonra -> csak bezárja

    // A .popover-panel osztály az, ami a panelt kiemeli a normál
    // elrendezésből, és lebegő, pozicionálható dobozzá teszi
    panelEl.classList.add('popover-panel');
    positionPopover(triggerEl, panelEl);
    triggerEl.classList.add('active');

    activeTrigger = triggerEl;
    activePanel = panelEl;
}

/*
    CÉL: Az összes ikon-popover bekötése
     - Trigger/panel párok listája (melyik gomb melyik panelt nyissa popoverként)
     - Kattintás kívülre / Escape / ablak-átméretezés -> popover bezárása
*/
export function initializeQuickTools() {
    // [gomb, panel] párok. Új popovert felvenni ennyi: egy sor ide
    const triggers = [
        [document.getElementById('advanced-btn'), domElements.advancedSearch],
        [document.getElementById('quick-currency-btn'), document.querySelector('.currency-exchanger')],
        [document.getElementById('quick-time-btn'), document.querySelector('.time-tools')],
    ];

    triggers.forEach(([triggerEl, panelEl]) => {
        if (!triggerEl || !panelEl) return; // hiányzó elem -> ezt a párt kihagyjuk
        triggerEl.addEventListener('click', (e) => {
            e.stopPropagation(); // ne fusson le rá a lenti "kattintás kívülre" listener is
            openPopover(triggerEl, panelEl);
        });
    });

    // Kattintás bárhova a panelen/triggeren KÍVÜL -> bezárás
    document.addEventListener('click', (e) => {
        if (!activePanel) return; // nincs nyitva semmi

        // A panelen vagy a triggeren belüli kattintás nem számít "kívülre"
        if (activePanel.contains(e.target) || activeTrigger?.contains(e.target)) return;

        closeActivePopover();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeActivePopover();
    });

    // Átméretezéskor a korábban kiszámolt pozíció már nem lenne pontos,
    // egyszerűbb egyből bezárni, mint újraszámolni
    window.addEventListener('resize', closeActivePopover);
}
