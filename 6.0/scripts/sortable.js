/*======================================================================
    sortable.js - Húzással átrendezés (shortcut-ok, konténerek, bottom bar)
----------------------------------------------------------------------
     - Pointer Events alapú, NEM a natív HTML5 drag & drop: a "szellem"
       (ghost) transform-mal követi az egeret (compositor, nincs layout),
       és egérrel, tollal, érintéssel is ugyanúgy működik
     - Élő előnézet: a húzott elem ténylegesen átkerül a DOM-ban, a
       többiek FLIP-pel csúsznak a helyükre -> amit látsz, az lesz a
       végeredmény. Escape = visszavonás
     - A rés (gap) fölött sem ugrál: a LEGKÖZELEBBI elemhez képest dönt
======================================================================*/

import { flip, reducedMotion, ms } from './ui.js';

const DRAG_THRESHOLD = 6; // px - ennél kisebb mozgás még kattintás

/*
    CÉL: Átrendezés bekötése egy gyökérelemre (eseménydelegálással,
    így az újrarajzolt gyerekeken is működik, újrakötés nélkül)
    BE:
     - item: a húzható elemek szelektora
     - list: a listák szelektora, amik közt mozoghatnak az elemek
     - ignore: ahonnan NEM indulhat húzás (gombok, beágyazott elemek)
     - enabled(): épp engedélyezett-e (szerkesztő mód)
     - movables(): az elemek, amiket FLIP-pel animálni kell
     - onMove(): minden átrendezés után (pld. újra-csempézés)
     - onDrop(el): sikeres elengedés után (mentés)
*/
export function sortable(root, { item, list, ignore, enabled, movables, onMove, onDrop }) {

    // Szerkesztéskor a linkek/képek natív húzása ne zavarjon be
    root.addEventListener('dragstart', (e) => {
        if (enabled()) e.preventDefault();
    });

    root.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || !enabled()) return;
        if (ignore && e.target.closest(ignore)) return;
        const el = e.target.closest(item);
        if (!el || !root.contains(el)) return;

        const startX = e.clientX;
        const startY = e.clientY;
        let x = startX;
        let y = startY;
        let drag = null;
        let frame = 0;

        const begin = () => {
            const rect = el.getBoundingClientRect();
            const ghost = el.cloneNode(true);
            ghost.classList.add('drag-ghost');
            ghost.classList.remove('active');
            Object.assign(ghost.style, {
                left: `${rect.left}px`,
                top: `${rect.top}px`,
                width: `${rect.width}px`,
                height: `${rect.height}px`
            });
            document.body.appendChild(ghost);
            el.classList.add('drag-source');
            document.documentElement.classList.add('dragging');
            getSelection()?.removeAllRanges();
            return { ghost, rect, home: [el.parentNode, el.nextSibling] };
        };

        const update = () => {
            frame = 0;
            drag.ghost.style.transform = `translate3d(${x - startX}px, ${y - startY}px, 0) scale(1.04)`;
            reposition();
        };

        // CÉL: A húzott elem áthelyezése oda, ahova az elengedés tenné
        const reposition = () => {
            const targetList = document.elementFromPoint(x, y)?.closest(list);
            if (!targetList || !root.contains(targetList)) return;

            const others = [...targetList.children].filter((c) => c !== el && c.matches(item));
            let ref;

            if (others.length === 0) {
                ref = targetList.querySelector(':scope > .sort-end'); // pld. "+ Add" gomb elé
            } else {
                let nearest = null;
                let nearestRect = null;
                let best = Infinity;
                for (const other of others) {
                    const r = layoutRect(other);
                    const d = Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2));
                    if (d < best) {
                        best = d;
                        nearest = other;
                        nearestRect = r;
                    }
                }
                const after = x > nearestRect.left + nearestRect.width / 2;
                ref = after ? nearest.nextElementSibling : nearest;
            }

            // Már pontosan ott van -> nincs mit mozgatni (ez akadályozza meg az oda-vissza ugrálást is)
            if (ref === el || (el.parentNode === targetList && el.nextElementSibling === ref)) return;

            flip(movables(), () => {
                targetList.insertBefore(el, ref);
                onMove?.();
            });
        };

        const finish = (commit) => {
            removeEventListener('pointermove', onPointerMove);
            removeEventListener('pointerup', onPointerUp);
            removeEventListener('pointercancel', onCancel);
            removeEventListener('keydown', onKey, true);
            cancelAnimationFrame(frame);
            if (!drag) return;

            if (!commit) {
                const [parent, next] = drag.home;
                flip(movables(), () => {
                    parent.insertBefore(el, next);
                    onMove?.();
                });
            }

            // A ghost "beleúszik" a végleges helyére, csak utána tűnik el
            const { ghost, rect } = drag;
            const to = layoutRect(el);
            const done = () => {
                ghost.remove();
                el.classList.remove('drag-source');
            };
            if (reducedMotion()) done();
            else {
                ghost.animate(
                    [{ transform: ghost.style.transform }, { transform: `translate3d(${to.left - rect.left}px, ${to.top - rect.top}px, 0)` }],
                    { duration: ms(180), easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'forwards' }
                ).finished.then(done, done);
            }

            document.documentElement.classList.remove('dragging');
            suppressNextClick();
            if (commit) onDrop(el);
        };

        const onPointerMove = (ev) => {
            x = ev.clientX;
            y = ev.clientY;
            if (!drag) {
                if (Math.hypot(x - startX, y - startY) < DRAG_THRESHOLD) return;
                drag = begin();
            }
            frame ||= requestAnimationFrame(update); // képkockánként legfeljebb egyszer
        };
        const onPointerUp = () => finish(true);
        const onCancel = () => finish(false);
        const onKey = (ev) => {
            if (ev.key !== 'Escape' || !drag) return;
            ev.preventDefault();
            ev.stopPropagation();
            finish(false);
        };

        addEventListener('pointermove', onPointerMove);
        addEventListener('pointerup', onPointerUp);
        addEventListener('pointercancel', onCancel);
        addEventListener('keydown', onKey, true);
    });
}

// CÉL: Az elem "végleges" helye, egy épp futó FLIP-animáció eltolása nélkül
// (különben a csúszó elemek miatt oda-vissza dönthetne a hely-keresés)
function layoutRect(el) {
    const r = el.getBoundingClientRect();
    if (!el.getAnimations().length) return r;
    const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
    return { left: r.left - m.e, top: r.top - m.f, width: r.width, height: r.height };
}

// A húzás végén a pointerup egy click-et is generál -> az ne nyisson meg
// semmit (linket, szerkesztő popovert)
function suppressNextClick() {
    const block = (e) => {
        e.preventDefault();
        e.stopPropagation();
    };
    addEventListener('click', block, { capture: true, once: true });
    setTimeout(() => removeEventListener('click', block, true), 0);
}
