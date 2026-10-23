/*======================================================================
    bottomBar.js - Alsó eszköztár (szekciókba rendezett tool-linkek)
----------------------------------------------------------------------
     - bottomBarConfig betöltése/mentése, kirajzolása
     - Szerkesztő módban: tool hozzáadása/szerkesztése/törlése, húzással
       átrendezés akár szekciók KÖZÖTT is (sortable.js), szekció
       létrehozása/törlése — mind célzott DOM-módosítással + FLIP-pel
    ADATSZERKEZET (változatlan):
     - bottomBarConfig.sections = [ { id, name, items: [ {name, url} ] } ]
======================================================================*/

import { applyIcon } from './icons.js';
import { flip, animateOut, editLink, isEditing, svgIcon } from './ui.js';
import { sortable } from './sortable.js';
import { settings, onSettingsChange } from './settings.js';

const STORAGE_KEY = 'bottomBarConfig';

export let bottomBarConfig = { sections: [] };

const bottomSection = document.querySelector('.bottom-section');
let newSectionBtn = null;
let eventsBound = false;

//! ---------- BETÖLTÉS / MENTÉS ----------

function saveConfig() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bottomBarConfig));
}

// CÉL: Betöltés; a 4.x-es formátumot (langTools/aiTools) egy szekcióba olvasztja
export function loadBottomBarConfig() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        const parsed = stored ? JSON.parse(stored) : defaultConfig();
        bottomBarConfig = parsed.langTools || parsed.aiTools
            ? { sections: [{ id: 'section-1', name: 'Section 1', items: [...(parsed.langTools || []), ...(parsed.aiTools || [])] }] }
            : parsed;
    } catch (error) {
        console.error('Error parsing bottomBarConfig:', error);
        bottomBarConfig = defaultConfig();
    }
    saveConfig();

    if (!eventsBound) {
        bindEvents();
        eventsBound = true;
    }
    renderBottomBar();
}

// A projekt szerzőjének saját, alapból szállított linkgyűjteménye (csak adat)
function defaultConfig() {
    return {
        sections: [
            {
                id: "section-1761226485837",
                name: "Section 5",
                items: [
                    { name: "Earth", url: "https://earth.google.com/web/@47.04592194,16.20642682,-763.5078726a,3083269.01714981d,35y,0h,0t,0r/data=CgRCAggBOgMKATBCAggASg0I____________ARAA?authuser=0" },
                    { name: "Maps", url: "https://www.google.com/maps/@47.4735991,19.0548695,15.75z?entry=ttu&g_ep=EgoyMDI1MTAyMC4wIKXMDSoASAFQAw%3D%3D" },
                    { name: "Calendar", url: "https://calendar.google.com/calendar/u/0/r" },
                    { name: "Photos", url: "https://photos.google.com/" }
                ]
            },
            {
                id: "section-1761228949885",
                name: "Section 6",
                items: [
                    { name: "ChatGPT", url: "https://chatgpt.com/" },
                    { name: "Gemini", url: "https://gemini.google.com/app" },
                    { name: "AI studio", url: "https://aistudio.google.com/prompts/new_chat?model=gemini-2.5-pro" },
                    { name: "MGX", url: "https://mgx.dev/" },
                    { name: "Grok", url: "https://grok.com/" },
                    { name: "Blackbox", url: "https://www.blackbox.ai/" },
                    { name: "Perplexity", url: "https://www.perplexity.ai/" }
                ]
            },
            {
                id: "section-1761229476710",
                name: "Section 7",
                items: [
                    { name: "DeepL", url: "https://www.deepl.com/en/translator/q/en/litigate/de/prozessieren/products/api?utm_term=&utm_campaign=HU%7CPMAX%7CC%7CEnglish&utm_source=google&utm_medium=paid&hsa_acc=1083354268&hsa_cam=21569274213&hsa_grp=&hsa_ad=&hsa_src=x&hsa_tgt=&hsa_kw=&hsa_mt=&hsa_net=adwords&hsa_ver=3&gad_source=1&gad_campaignid=21575949062&gbraid=0AAAAABbqoWDXnt7BK9xrINXFxyNO5vvCq&gclid=CjwKCAjwpOfHBhAxEiwAm1SwEkNvRVNoapiK8CRj5V8zDMQmsgpOAO5KMTfMJ4YsVzw3ZAR7aBSRKBoCmDUQAvD_BwE" },
                    { name: "Quillbot", url: "https://quillbot.com/paraphrasing-tool" }
                ]
            }
        ]
    };
}

//! ---------- KIRAJZOLÁS ----------

export function renderBottomBar() {
    newSectionBtn = document.createElement('button');
    newSectionBtn.className = 'new-section-btn ghost-btn edit-only';
    newSectionBtn.textContent = '+ New Section';

    bottomSection.replaceChildren(...bottomBarConfig.sections.map(createSectionElement), newSectionBtn);
    updateCompact();
}

function createSectionElement(section) {
    const el = document.createElement('div');
    el.className = 'bottom-bar-section';
    el.__data = section;
    el.innerHTML = `<div class="section-items"><button type="button" class="delete-btn delete-section-btn edit-only" title="Delete section">${svgIcon('x')}</button><button type="button" class="add-tool-btn ghost-btn sort-end edit-only">+ Add</button></div>`;
    const items = el.querySelector('.section-items');
    items.lastElementChild.before(...section.items.map(createToolElement));
    return el;
}

function createToolElement(tool) {
    // Igazi <a>: működik a középső gombos megnyitás, link másolása, stb.
    const el = document.createElement('a');
    el.className = 'ai-tool';
    el.__data = tool;
    el.innerHTML = `<img alt="" draggable="false"><span></span><button type="button" class="delete-btn edit-only" title="Remove">${svgIcon('x')}</button>`;
    fillToolElement(el);
    return el;
}

function fillToolElement(el) {
    const { name, url } = el.__data;
    el.href = url;
    el.title = name; // kompakt (csak ikon) módban ez a felirat
    if (settings.openInNewTab) {
        el.target = '_blank';
        el.rel = 'noopener';
    } else {
        el.removeAttribute('target');
    }
    el.querySelector('span').textContent = name;
    applyIcon(el.querySelector('img'), url, name, el.__data.iconBg);
}

const movables = () => bottomSection.querySelectorAll('.bottom-bar-section, .ai-tool, .add-tool-btn, .new-section-btn');

/*
    CÉL: A dokk sűrűségének megválasztása — a nevek a lehető legtovább
    maradnak: normal -> dense (szűkebb, kisebb betű) -> icons (csak ikon)
    LOGIKA:
     - Legfeljebb 2 sor fér bele (alacsony ablakban csak 1), és a
       következő fokozatra csak akkor lép, ha így sem fér el
*/
const DENSITIES = ['normal', 'dense', 'icons'];

function updateCompact() {
    const rowHeight = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--bottom-bar-row')) || 52;
    const maxRows = innerHeight < 560 ? 1 : 2;
    const limit = rowHeight * maxRows + 8 * (maxRows - 1) + 4;
    for (const density of DENSITIES) {
        bottomSection.dataset.density = density;
        if (bottomSection.offsetHeight <= limit) return;
    }
}

let lastDockSize = '';
new ResizeObserver(() => {
    const size = `${bottomSection.parentElement.clientWidth}x${innerHeight}`;
    if (size !== lastDockSize) {
        lastDockSize = size;
        updateCompact();
    }
}).observe(bottomSection.parentElement);

onSettingsChange((s, patch) => {
    if ('openInNewTab' in patch) bottomSection.querySelectorAll('.ai-tool').forEach(fillToolElement);
});

// Szerkesztő mód ki/be: az üres szekciók és a "+" gombok megjelennek/eltűnnek
export const refreshBottomBar = updateCompact;

//! ---------- MŰVELETEK ----------

async function addTool(sectionEl, button) {
    const link = await editLink({ name: '', url: '' }, button);
    if (!link || !sectionEl.isConnected) return;

    sectionEl.__data.items.push(link);
    saveConfig();

    const el = createToolElement(link);
    el.classList.add('entering');
    flip(movables(), () => {
        button.before(el);
        updateCompact();
    });
}

async function editTool(el) {
    const link = await editLink(el.__data, el);
    if (!link || !el.isConnected) return;

    Object.assign(el.__data, link);
    saveConfig();
    fillToolElement(el);
}

async function deleteTool(el) {
    const items = el.closest('.bottom-bar-section').__data.items;
    const index = items.indexOf(el.__data);
    if (index < 0) return;

    items.splice(index, 1);
    saveConfig();
    await animateOut(el);
    flip(movables(), () => {
        el.remove();
        updateCompact();
    });
}

// CÉL: Új szekció; neve a legnagyobb "Section N" + 1 (törlések után sem ütközik)
function addNewSection() {
    const max = Math.max(0, ...bottomBarConfig.sections.map((s) => Number(s.name.match(/Section (\d+)/)?.[1]) || 0));
    const section = { id: `section-${Date.now()}`, name: `Section ${max + 1}`, items: [] };
    bottomBarConfig.sections.push(section);
    saveConfig();

    const el = createSectionElement(section);
    el.classList.add('entering');
    flip(movables(), () => {
        newSectionBtn.before(el);
        updateCompact();
    });
}

async function deleteSection(sectionEl) {
    if (bottomBarConfig.sections.length <= 1) return;
    if (!confirm(`Delete section "${sectionEl.__data.name}"?`)) return;

    bottomBarConfig.sections = bottomBarConfig.sections.filter((s) => s !== sectionEl.__data);
    saveConfig();
    await animateOut(sectionEl);
    flip(movables(), () => {
        sectionEl.remove();
        updateCompact();
    });
}

function commitOrder() {
    bottomSection.querySelectorAll('.bottom-bar-section').forEach((sectionEl) => {
        sectionEl.__data.items = [...sectionEl.querySelectorAll('.ai-tool')].map((el) => el.__data);
    });
    saveConfig();
}

//! ---------- ESEMÉNYEK ----------

function bindEvents() {
    bottomSection.addEventListener('click', (e) => {
        const t = e.target;
        if (t.closest('.new-section-btn')) return addNewSection();

        const sectionEl = t.closest('.bottom-bar-section');
        if (!sectionEl) return;
        if (t.closest('.delete-section-btn')) return deleteSection(sectionEl);

        const addBtn = t.closest('.add-tool-btn');
        if (addBtn) return addTool(sectionEl, addBtn);

        const tool = t.closest('.ai-tool');
        if (!tool) return;
        if (t.closest('.delete-btn')) {
            e.preventDefault(); // ne navigáljon el a körbeölelő <a> miatt
            return deleteTool(tool);
        }
        if (isEditing()) {
            e.preventDefault();
            editTool(tool);
        }
    });

    sortable(bottomSection, {
        item: '.ai-tool',
        list: '.section-items',
        ignore: 'button',
        enabled: isEditing,
        movables,
        onDrop: commitOrder
    });
}
