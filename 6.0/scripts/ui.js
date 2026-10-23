/*======================================================================
    ui.js - Közös UI-építőkövek
----------------------------------------------------------------------
     - Popover-kezelő: EGY verem (stack) minden lebegő panelhez — közös
       pozicionálás, nyitás/zárás animáció, kívülre kattintás / Escape /
       ablak-átméretezés -> zárás. Egymásba ágyazva is működik (pld. a
       Pomodoro beállítások a Time Tools popoveren belülről nyílik)
     - flip(): FLIP-animáció DOM-átrendezéshez (az elemek a régi helyükről
       csúsznak az újra, transform-mal -> csak a compositor dolgozik)
     - editLink(): közös név + URL szerkesztő (shortcut-ok + bottom bar)
======================================================================*/

import { settings } from './settings.js';

export const svgIcon = (name) => `<svg class="i"><use href="#i-${name}"/></svg>`;
export const isEditing = () => document.documentElement.classList.contains('editing');

const reducedMotionQuery = matchMedia('(prefers-reduced-motion: reduce)');
export const reducedMotion = () => reducedMotionQuery.matches || settings.animationSpeed === 'off' || document.documentElement.classList.contains('low-detail');

// CÉL: JS-animációk hossza a beállított sebességgel szorozva
export const ms = (base) => base * (globalThis.MOTION_FACTORS[settings.animationSpeed] ?? 1);

const EASE_OUT = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

// CÉL: textContent írása csak ha tényleg változott (nincs felesleges stílus-invalidálás)
export function setText(el, text) {
    if (el.textContent !== text) el.textContent = text;
}

// CÉL: Haladás-sáv beállítása; a ms a következő frissítésig hátralévő idő,
// így a sáv folyamatosan csúszik, nem másodpercenként ugrik
export function setProgress(fillEl, fraction, ms = 300) {
    fillEl.style.transitionDuration = `${Math.max(0, ms)}ms`;
    fillEl.style.transform = `scaleX(${Math.min(1, Math.max(0, fraction))})`;
}

//! ---------- FLIP ANIMÁCIÓ ----------

/*
    CÉL: Elemek átrendezése úgy, hogy a régi helyükről csússzanak az újra
    BE: elements - a mozgó elemek; mutate - a tényleges DOM-módosítás
    MEGJEGYZÉS:
     - Egymásba ágyazott elemeknél (konténer + benne a csempék) a gyerek
       a SZÜLŐHÖZ képesti elmozdulását kapja, különben duplán mozogna
*/
export function flip(elements, mutate, duration = 260) {
    if (reducedMotion()) {
        mutate();
        return;
    }

    const els = [...elements];
    const first = els.map((el) => el.getBoundingClientRect());
    mutate();

    // Előbb MINDEN futó flip-et leállítunk, csak utána mérünk: egy félúton
    // lévő szülő-animáció elrontaná a gyerekek "utolsó" pozícióját
    els.forEach((el) => el.getAnimations().forEach((a) => a.id === 'flip' && a.cancel()));

    const delta = new Map();
    els.forEach((el, i) => {
        if (!el.isConnected) return;
        const last = el.getBoundingClientRect();
        delta.set(el, [first[i].left - last.left, first[i].top - last.top]);
    });

    for (const [el, [dx, dy]] of delta) {
        let parent = el.parentElement;
        while (parent && !delta.has(parent)) parent = parent.parentElement;
        const [px, py] = parent ? delta.get(parent) : [0, 0];
        const x = dx - px;
        const y = dy - py;
        if (Math.abs(x) < 0.5 && Math.abs(y) < 0.5) continue;

        el.animate(
            [{ transform: `translate(${x}px, ${y}px)` }, { transform: 'none' }],
            { duration: ms(duration), easing: EASE_OUT }
        ).id = 'flip';
    }
}

// CÉL: Elem eltüntetése (zsugorodás + elhalványulás), mielőtt kivesszük a DOM-ból
export function animateOut(el) {
    if (reducedMotion()) return Promise.resolve();
    return el.animate(
        [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.8)' }],
        { duration: ms(160), easing: 'ease-in', fill: 'forwards' }
    ).finished.catch(() => {});
}

//! ---------- POPOVER-KEZELŐ ----------

const stack = []; // [{ el, anchor, onClose, transient }] - a legfelső a legutóbb nyitott

/*
    CÉL: Popover elhelyezése az anchor (elem vagy {clientX, clientY}) alá,
    a képernyőn belül tartva; ha lent nem fér el, az anchor FÖLÉ nyílik
*/
function place(el, anchor) {
    const margin = 12;
    const gap = 8;
    const r = anchor.getBoundingClientRect
        ? anchor.getBoundingClientRect()
        : { left: anchor.clientX, right: anchor.clientX, top: anchor.clientY, bottom: anchor.clientY };

    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const left = Math.max(margin, Math.min(r.left, innerWidth - margin - w));
    let top = r.bottom + gap;
    const above = top + h > innerHeight - margin;
    if (above) top = Math.max(margin, r.top - gap - h);

    el.style.left = `${Math.round(left)}px`;
    // Fölé nyíló popover az ALJÁHOZ rögzítve: ha nő (pld. fülváltás), felfelé nő, nem lóg ki alul
    if (above) {
        el.style.top = 'auto';
        el.style.bottom = `${Math.round(innerHeight - r.top + gap)}px`;
        el.style.maxHeight = `${Math.round(r.top - gap - margin)}px`;
    } else {
        el.style.bottom = 'auto';
        el.style.top = `${Math.round(top)}px`;
        el.style.maxHeight = `${Math.round(innerHeight - top - margin)}px`;
    }
    // Az animáció az anchor felől "nő ki"
    el.style.transformOrigin = `${Math.round(r.left + (r.right - r.left) / 2 - left)}px ${above ? '100%' : '0'}`;
}

export const isOpen = (el) => stack.some((p) => p.el === el);

/*
    CÉL: Popover megnyitása
    BE:
     - el: a panel; anchor: amihez igazodik (gomb, csempe, vagy egy esemény)
     - transient: a panel alapból a lap része (pld. valutaváltó), csak
       nyitás idejére kapja meg a .popover osztályt
     - onClose: bezáráskor (bármi okból) hívódik
*/
export function openPopover(el, anchor, { onClose, transient = false } = {}) {
    if (isOpen(el)) closePopover(el);

    if (transient) el.classList.add('popover');
    el.classList.remove('closing');
    el.classList.add('open');
    anchor.classList?.add('active');
    place(el, anchor);
    stack.push({ el, anchor, onClose, transient });
}

// CÉL: Nyitás, VAGY ha ugyanarról az anchorról már nyitva van, zárás
// KI: true, ha most nyílt meg
export function togglePopover(el, anchor, options) {
    const entry = stack.find((p) => p.el === el);
    if (entry && entry.anchor === anchor) {
        closePopover(el);
        return false;
    }
    openPopover(el, anchor, options);
    return true;
}

// CÉL: Egy popover bezárása — a fölötte lévő (belőle nyitott) popoverekkel együtt
export function closePopover(el) {
    const i = stack.findIndex((p) => p.el === el);
    if (i >= 0) stack.splice(i).reverse().forEach(dismiss);
}

export function closeAllPopovers() {
    stack.splice(0).reverse().forEach(dismiss);
}

function dismiss({ el, anchor, onClose, transient }) {
    anchor.classList?.remove('active');

    const finish = (e) => {
        if (e && e.target !== el) return; // egy gyerekelem animationend-je buborékolt fel
        el.removeEventListener('animationend', finish);
        if (!el.classList.contains('closing')) return; // közben újranyitották
        el.classList.remove('open', 'closing');
        if (transient) el.classList.remove('popover');
    };

    el.classList.add('closing');
    if (reducedMotion()) finish();
    else el.addEventListener('animationend', finish);

    onClose?.();
}

// Kívülre kattintás: felülről lefelé zárjuk a veremből azokat, amikbe
// NEM kattintottak bele. pointerdown (nem click) -> azonnal reagál
document.addEventListener('pointerdown', (e) => {
    while (stack.length) {
        const top = stack[stack.length - 1];
        if (top.el.contains(e.target) || top.anchor.contains?.(e.target)) break;
        dismiss(stack.pop());
    }
}, true);

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && stack.length) {
        e.preventDefault();
        dismiss(stack.pop());
    }
});

// Átméretezéskor a kiszámolt pozíciók elavulnak -> egyszerűbb bezárni
addEventListener('resize', closeAllPopovers);

//! ---------- NÉV + URL SZERKESZTŐ ----------

/*
    CÉL: URL validálása; a hiányzó "https://"-t pótolja
    KI: a (kiegészített) URL, vagy null, ha érvénytelen
*/
export function normalizeUrl(raw) {
    let url = raw.trim();
    if (!url) return null;
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    try {
        // A Chrome URL-parsere a szóközös hostot is elfogadja ("https://not a url")
        const { hostname } = new URL(url);
        return hostname && !/\s|%20/.test(hostname) ? url : null;
    } catch {
        return null;
    }
}

// CÉL: Mező hibásnak jelölése (piros keret + rázkódás), alert() helyett
export function markInvalid(input) {
    input.classList.remove('invalid');
    void input.offsetWidth; // reflow -> az animáció újraindul, ha már rajta volt
    input.classList.add('invalid');
    input.focus();
}

let linkEditor = null;
let linkResolve = null;

function getLinkEditor() {
    if (linkEditor) return linkEditor;

    linkEditor = document.createElement('form');
    linkEditor.className = 'link-editor popover';
    linkEditor.noValidate = true;
    linkEditor.innerHTML = `
        <input type="text" name="name" placeholder="Name" autocomplete="off" aria-label="Name">
        <input type="text" name="url" placeholder="URL (e.g. github.com)" autocomplete="off" spellcheck="false" aria-label="URL">
        <div class="field-label">Icon background</div>
        <div class="chip-group" role="radiogroup" aria-label="Icon background">
            <label class="chip" title="Light plate only for dark icons (detected by Refresh Icons)"><input type="radio" name="iconBg" value="auto">Auto</label>
            <label class="chip"><input type="radio" name="iconBg" value="none">None</label>
            <label class="chip"><input type="radio" name="iconBg" value="light">Light</label>
            <label class="chip"><input type="radio" name="iconBg" value="dark">Dark</label>
        </div>
        <div class="popover-actions">
            <button type="button" class="action-btn" data-cancel>Cancel</button>
            <button type="submit" class="btn-primary">Save</button>
        </div>
    `;
    document.body.appendChild(linkEditor);

    const { name, url } = linkEditor.elements;
    linkEditor.addEventListener('input', (e) => e.target.classList.remove('invalid'));
    linkEditor.querySelector('[data-cancel]').addEventListener('click', () => closePopover(linkEditor));

    linkEditor.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!linkResolve) return; // már bezárt szerkesztő
        const cleanName = name.value.trim();
        const cleanUrl = normalizeUrl(url.value);
        if (!cleanName) return markInvalid(name);
        if (!cleanUrl) return markInvalid(url);

        const resolve = linkResolve;
        linkResolve = null; // a closePopover onClose-a már ne null-lal oldja fel
        // Az "auto" az alapérték -> nem kerül a mentett adatba (undefined-et a JSON kihagyja)
        const iconBg = linkEditor.elements.iconBg.value;
        resolve({ name: cleanName, url: cleanUrl, iconBg: iconBg === 'auto' ? undefined : iconBg });
        closePopover(linkEditor);
    });

    return linkEditor;
}

/*
    CÉL: Név + URL bekérése egy, az anchor mellé nyíló popoverben
    BE: initial - {name, url} kezdőértékek; anchor - gomb/csempe
    KI: Promise<{name, url} | null> - null, ha bezárták mentés nélkül
*/
export function editLink(initial, anchor) {
    const form = getLinkEditor();
    form.elements.name.value = initial.name || '';
    form.elements.url.value = initial.url || '';
    form.elements.iconBg.value = initial.iconBg || 'auto';
    form.querySelectorAll('.invalid').forEach((el) => el.classList.remove('invalid'));

    return new Promise((resolve) => {
        const opened = togglePopover(form, anchor, {
            onClose: () => {
                linkResolve?.(null);
                linkResolve = null;
            }
        });
        if (!opened) return resolve(null);

        linkResolve = resolve;
        form.elements.name.focus({ preventScroll: true });
    });
}
