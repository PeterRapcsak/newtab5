/*======================================================================
    shortcuts.js - Shortcut-ok (jobb oldali linkgyűjtemény)
----------------------------------------------------------------------
     - Konténerek (linkcsoportok) betöltése/mentése, kirajzolása
     - Szerkesztő mód (<html>.editing): hozzáadás/szerkesztés/törlés,
       húzással átrendezés (sortable.js), konténer-átméretezés
    CSEMPÉZÉS (6.0):
     - 12 oszlopos rács: a konténer tárolt %-os szélessége 12-edekre
       kerekítve "span N" lesz (1/4, 1/3, 1/2, 2/3, 3/4 mind pontos)
     - Min. pixelszélesség: keskeny ablakon a túl kicsi konténerek
       maguktól szélesednek, végül egymás alá kerülnek
     - Nézet módban egy sor maradék helye ARÁNYOSAN szétoszlik (nincs
       lyuk), szerkesztéskor viszont a valódi méretek látszanak
     - Minden változás FLIP-pel animál; a DOM-ot célzottan módosítjuk,
       nem rajzoljuk újra az egészet (az ikonok nem töltődnek újra)
    ADATSZERKEZET (változatlan, export/import-kompatibilis):
     - shortcutsConfig.containers = [ { id, name, width (%), shortcuts:
       [ {name, url}, ... ] }, ... ]
======================================================================*/

import { applyIcon } from './icons.js';
import { flip, animateOut, editLink, isEditing, svgIcon } from './ui.js';
import { sortable } from './sortable.js';
import { settings, onSettingsChange } from './settings.js';

const STORAGE_KEY = 'shortcutsConfig';
const COLUMNS = 12;
const MIN_TILE = 28;          // ennél kisebb ikon már nem használható
const MIN_LABELLED_TILE = 36; // ez alatt inkább a feliratok tűnnek el, nem az ikon zsugorodik tovább

export let shortcutsConfig = { containers: [] };

const wrapper = document.getElementById('shortcuts-wrapper');
const area = wrapper.parentElement; // a rendelkezésre álló hely (.right-half)
let addContainerBtn = null;
let tileSize = settings.tileSize;

//! ---------- MENTÉS / BETÖLTÉS / MIGRÁCIÓ ----------

function saveConfig() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(shortcutsConfig));
}

// CÉL: Régi (konténer nélküli) formátum -> konténeres formátum
function migrateOldConfig(oldConfig) {
    if (oldConfig.containers) return oldConfig;
    return { containers: [{ id: 'container-1', name: 'Shortcuts', width: 100, shortcuts: oldConfig.shortcuts || [] }] };
}

function defaultConfig() {
    return {
        containers: [{
            id: 'container-1',
            name: 'Shortcuts',
            width: 100,
            shortcuts: [
                { name: "YouTube", url: "https://www.youtube.com/" },
                { name: "Gmail", url: "https://mail.google.com/mail/u/0/#inbox" },
                { name: "Drive", url: "https://drive.google.com/drive/starred" },
                { name: "Facebook", url: "https://www.facebook.com/" },
                { name: "Netflix", url: "https://www.netflix.com/browse" },
                { name: "Soundcloud", url: "https://soundcloud.com/you/likes" }
            ]
        }]
    };
}

// CÉL: Betöltés induláskor + az összes eseménykezelő bekötése (egyszer)
export function loadShortcuts() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        shortcutsConfig = stored ? migrateOldConfig(JSON.parse(stored)) : defaultConfig();
    } catch (error) {
        console.error('Error parsing stored shortcutsConfig:', error);
        shortcutsConfig = defaultConfig();
    }
    saveConfig();
    bindEvents();
    renderShortcuts();
}

export const getShortcutsConfig = () => shortcutsConfig;

export function setShortcutsConfig(config) {
    shortcutsConfig = migrateOldConfig(config);
    saveConfig();
    renderShortcuts();
}

//! ---------- KIRAJZOLÁS ----------

// CÉL: Teljes felépítés (csak betöltéskor / importkor / ikonfrissítés után)
export function renderShortcuts() {
    addContainerBtn = document.createElement('button');
    addContainerBtn.className = 'add-container-btn ghost-btn edit-only';
    addContainerBtn.innerHTML = `${svgIcon('plus')}<span>Add Container</span>`;

    wrapper.replaceChildren(...shortcutsConfig.containers.map(createContainerElement), addContainerBtn);
    fitShortcuts();
}

function createContainerElement(container) {
    const el = document.createElement('div');
    el.className = 'shortcuts-container glass-card';
    el.__data = container;
    el.innerHTML = `<div class="shortcuts-grid"></div><div class="container-controls"><button type="button" class="delete-container-btn edit-only" title="Delete container">${svgIcon('trash')}</button><button type="button" class="add-shortcut-to-container" title="Add shortcut">${svgIcon('plus')}</button></div><div class="resize-handle edit-only" title="Drag to resize">${svgIcon('grip')}</div>`;
    el.querySelector('.shortcuts-grid').append(...container.shortcuts.map(createShortcutElement));
    return el;
}

// Az EGÉSZ csempe egy link (ikon + felirat): nagyobb kattintási felület,
// és a feliraton sincs szövegkurzor / kijelölés
function createShortcutElement(shortcut) {
    const el = document.createElement('a');
    el.className = 'shortcut';
    el.__data = shortcut; // stabil hivatkozás az adatobjektumra (túléli az átrendezést)
    el.innerHTML = `<span class="shortcut-icon"><img alt="" draggable="false"></span><span class="shortcut-name"></span><button type="button" class="delete-btn edit-only" title="Remove">${svgIcon('x')}</button>`;
    fillShortcutElement(el);
    return el;
}

function fillShortcutElement(el) {
    const { name, url } = el.__data;
    el.href = url;
    el.title = name; // a levágott / elrejtett felirat így is olvasható
    setLinkTarget(el);
    el.querySelector('.shortcut-name').textContent = name;
    applyIcon(el.querySelector('img'), url, name, el.__data.iconBg);
}

function setLinkTarget(el) {
    if (settings.openInNewTab) {
        el.target = '_blank';
        el.rel = 'noopener';
    } else {
        el.removeAttribute('target');
    }
}

// Minden, aminek pozíciója változhat -> ezeket animálja a flip()
const movables = () => wrapper.querySelectorAll('.shortcuts-container, .shortcut, .add-container-btn');

//! ---------- CSEMPÉZÉS (12 oszlopos rács) ----------

const spanOf = (width) => Math.min(COLUMNS, Math.max(1, Math.round((width / 100) * COLUMNS)));

function gridMetrics() {
    const gap = parseFloat(getComputedStyle(wrapper).columnGap) || 16;
    const colWidth = (wrapper.clientWidth - gap * (COLUMNS - 1)) / COLUMNS;
    // Egy konténerbe legalább 3 csempe férjen el egymás mellé:
    // 3 * (csempe + 22 felirat-ráhagyás) + 2 rés + 2 * 16 padding + keret
    const minContainerPx = 3 * tileSize + 110;
    const minSpan = Math.min(COLUMNS, Math.ceil((minContainerPx + gap) / (colWidth + gap)));
    return { gap, colWidth, minSpan };
}

/*
    CÉL: Minden konténer "grid-column: span N" értékének kiszámolása
    LOGIKA:
     - Sorokba rendezés balról jobbra; ami nem fér ki, új sorba kerül
     - Nézet módban a sor maradék helyét a konténerek a saját méretük
       arányában kapják meg (legnagyobb maradék módszer) -> nincs lyuk
*/
function layoutContainers() {
    const { minSpan } = gridMetrics();
    // Ha soronként úgyis csak egy fér el, szerkesztéskor is töltse ki a sort
    const fill = !isEditing() || minSpan > COLUMNS / 2;
    let row = [];
    let used = 0;

    const flushRow = () => {
        const free = COLUMNS - used;
        if (fill && free > 0 && row.length) {
            const shares = row.map((r) => (r.span * free) / used);
            row.forEach((r, i) => { r.span += Math.floor(shares[i]); });
            const leftover = free - shares.reduce((sum, s) => sum + Math.floor(s), 0);
            [...row.keys()]
                .sort((a, b) => (shares[b] % 1) - (shares[a] % 1))
                .slice(0, leftover)
                .forEach((i) => row[i].span++);
        }
        row.forEach(({ el, span }) => { el.style.gridColumn = `span ${span}`; });
        row = [];
        used = 0;
    };

    for (const el of wrapper.querySelectorAll(':scope > .shortcuts-container')) {
        const span = Math.max(minSpan, spanOf(el.__data.width));
        if (used + span > COLUMNS) flushRow();
        row.push({ el, span });
        used += span;
    }
    flushRow();
}

/*
    CÉL: "Fit to screen" — a legnagyobb ikonméret megkeresése (a
    beállított maximumig), amivel MINDEN shortcut kifér a helyére
    LOGIKA:
     - Előbb feliratokkal keres (MIN_LABELLED_TILE-ig), utána felirat
       nélkül (MIN_TILE-ig); ha így sem fér ki, a legkisebb méret marad,
       és csak a shortcut-terület görgethető — a lap maga soha
     - Bináris keresés valódi méréssel (offsetHeight) -> pontos akkor
       is, ha a konténerek több sorba törnek; csempénként ~1 ms alatt
*/
function fitShortcuts() {
    const tryFit = (size, labels) => {
        tileSize = size;
        wrapper.style.setProperty('--shortcut-size', `${size}px`);
        wrapper.classList.toggle('no-labels', !labels);
        layoutContainers();
        return wrapper.offsetHeight <= area.clientHeight;
    };

    const max = settings.tileSize;
    if (tryFit(max, settings.labels) || !settings.fitToScreen) return;

    for (const labels of settings.labels ? [true, false] : [false]) {
        let lo = Math.min(labels ? MIN_LABELLED_TILE : MIN_TILE, max);
        if (!tryFit(lo, labels)) continue;
        let hi = max; // lo kifér, hi nem
        while (hi - lo > 1) {
            const mid = (lo + hi) >> 1;
            if (tryFit(mid, labels)) lo = mid;
            else hi = mid;
        }
        tryFit(lo, labels);
        return;
    }
    tryFit(Math.min(MIN_TILE, max), false);
}

// CÉL: Újra-illesztés animálva (szerkesztő mód, beállítások, átrendezés után)
export function animateLayout(mutate) {
    flip(movables(), () => {
        mutate?.();
        fitShortcuts();
    });
}

// A rendelkezésre álló hely változásakor (ablak, alsó dokk) újra kell illeszteni
let lastArea = '';
new ResizeObserver(() => {
    const key = `${area.clientWidth}x${area.clientHeight}`;
    if (key !== lastArea) {
        lastArea = key;
        fitShortcuts();
    }
}).observe(area);

onSettingsChange((s, patch) => {
    if ('openInNewTab' in patch) wrapper.querySelectorAll('.shortcut').forEach(setLinkTarget);
    if ('tileSize' in patch || 'fitToScreen' in patch || 'labels' in patch || 'widgets' in patch) animateLayout();
});

// "6/12" -> "1/2", "12/12" -> "Full"
function fractionLabel(span) {
    if (span === COLUMNS) return 'Full';
    const gcd = (a, b) => (b ? gcd(b, a % b) : a);
    const d = gcd(span, COLUMNS);
    return `${span / d}/${COLUMNS / d}`;
}

/*
    CÉL: Konténer átméretezése a jobb oldali fogantyúval
    MEGJEGYZÉS:
     - 12-edekre "kattan", élő FLIP-előnézettel és méret-jelvénnyel;
       mentés csak a húzás végén, egyszer
*/
function startResize(e, containerEl) {
    e.preventDefault();
    e.stopPropagation();

    const handle = e.target.closest('.resize-handle');
    const data = containerEl.__data;
    const { gap, colWidth, minSpan } = gridMetrics();
    const startX = e.clientX;
    const startSpan = Math.max(minSpan, spanOf(data.width));

    handle.setPointerCapture(e.pointerId);
    containerEl.classList.add('resizing');
    containerEl.dataset.size = fractionLabel(startSpan);
    document.body.style.cursor = 'col-resize';

    const onMove = (ev) => {
        const span = Math.max(minSpan, Math.min(COLUMNS, Math.round(startSpan + (ev.clientX - startX) / (colWidth + gap))));
        if (span === Math.max(minSpan, spanOf(data.width))) return;
        data.width = Math.round((span / COLUMNS) * 10000) / 100; // 2 tizedes %
        containerEl.dataset.size = fractionLabel(span);
        flip(movables(), layoutContainers); // húzás közben csak csempéz, az ikonméret elengedéskor igazodik
    };
    const onUp = () => {
        handle.removeEventListener('pointermove', onMove);
        handle.removeEventListener('pointerup', onUp);
        handle.removeEventListener('pointercancel', onUp);
        containerEl.classList.remove('resizing');
        document.body.style.cursor = '';
        saveConfig();
        animateLayout();
    };

    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
}

//! ---------- MŰVELETEK ----------

function generateContainerId() {
    return 'container-' + Date.now() + '-' + Math.random().toString(36).slice(2, 11);
}

function addNewContainer() {
    const container = { id: generateContainerId(), name: 'New Container', width: 50, shortcuts: [] };
    shortcutsConfig.containers.push(container);
    saveConfig();

    const el = createContainerElement(container);
    el.classList.add('entering');
    animateLayout(() => wrapper.insertBefore(el, addContainerBtn));
}

async function deleteContainer(containerEl) {
    if (shortcutsConfig.containers.length <= 1) return;
    if (!confirm('Delete this container and all its shortcuts?')) return;

    shortcutsConfig.containers = shortcutsConfig.containers.filter((c) => c !== containerEl.__data);
    saveConfig();
    await animateOut(containerEl);
    animateLayout(() => containerEl.remove());
}

async function addShortcutTo(containerEl, button) {
    const link = await editLink({ name: '', url: '' }, button);
    if (!link || !containerEl.isConnected) return;

    containerEl.__data.shortcuts.push(link);
    saveConfig();

    const el = createShortcutElement(link);
    el.classList.add('entering');
    flip(movables(), () => {
        containerEl.querySelector('.shortcuts-grid').appendChild(el);
        fitShortcuts();
    });
}

async function editShortcut(tile) {
    const link = await editLink(tile.__data, tile);
    if (!link || !tile.isConnected) return;

    Object.assign(tile.__data, link); // ugyanaz az objektum él a config tömbjében is
    saveConfig();
    fillShortcutElement(tile);
}

async function deleteShortcut(tile) {
    const list = tile.closest('.shortcuts-container').__data.shortcuts;
    const index = list.indexOf(tile.__data);
    if (index < 0) return; // dupla kattintás egy már törlődő csempén

    list.splice(index, 1);
    saveConfig();
    await animateOut(tile);
    flip(movables(), () => {
        tile.remove();
        fitShortcuts();
    });
}

// CÉL: Húzás után az élő DOM-sorrend visszaírása az adatmodellbe
function commitOrder() {
    const containerEls = [...wrapper.querySelectorAll(':scope > .shortcuts-container')];
    containerEls.forEach((el) => {
        el.__data.shortcuts = [...el.querySelectorAll('.shortcut')].map((tile) => tile.__data);
    });
    shortcutsConfig.containers = containerEls.map((el) => el.__data);
    saveConfig();
    animateLayout();
}

//! ---------- ESEMÉNYEK (egyetlen delegált kezelő a wrapper-en) ----------

function bindEvents() {
    wrapper.addEventListener('click', (e) => {
        const t = e.target;
        if (t.closest('.add-container-btn')) return addNewContainer();

        const containerEl = t.closest('.shortcuts-container');
        if (!containerEl) return;
        if (t.closest('.delete-container-btn')) return deleteContainer(containerEl);

        const addBtn = t.closest('.add-shortcut-to-container');
        if (addBtn) return addShortcutTo(containerEl, addBtn);

        const tile = t.closest('.shortcut');
        if (!tile) return;
        if (t.closest('.delete-btn')) {
            e.preventDefault();
            return deleteShortcut(tile);
        }
        // Szerkesztő módban a kattintás nem navigál, hanem szerkeszt
        if (isEditing()) {
            e.preventDefault();
            editShortcut(tile);
        }
    });

    wrapper.addEventListener('pointerdown', (e) => {
        const containerEl = e.target.closest('.resize-handle') && e.target.closest('.shortcuts-container');
        if (containerEl && e.button === 0) startResize(e, containerEl);
    });

    // Csempék: konténeren belül ÉS konténerek között is húzhatók
    sortable(wrapper, {
        item: '.shortcut',
        list: '.shortcuts-grid',
        ignore: 'button',
        enabled: isEditing,
        movables,
        onDrop: commitOrder
    });

    // Konténerek: magán a kártyán (nem egy csempén/gombon) indított húzás
    sortable(wrapper, {
        item: '.shortcuts-container',
        list: '.shortcuts-wrapper',
        ignore: '.shortcut, button, .resize-handle',
        enabled: isEditing,
        movables,
        onMove: layoutContainers,
        onDrop: commitOrder
    });
}
