import { domElements } from './dom.js';

const POPOVER_MARGIN = 12;
const POPOVER_GAP = 10;

let activeTrigger = null;
let activePanel = null;

function positionPopover(triggerEl, panelEl) {
    const rect = triggerEl.getBoundingClientRect();
    let left = Math.round(rect.left);

    panelEl.style.setProperty('--popover-top', `${Math.round(rect.bottom + POPOVER_GAP)}px`);
    panelEl.style.setProperty('--popover-left', `${left}px`);

    // After it paints at its natural width, pull it back on-screen if it overflows the right edge.
    requestAnimationFrame(() => {
        const panelRect = panelEl.getBoundingClientRect();
        const overflowRight = panelRect.right - (window.innerWidth - POPOVER_MARGIN);
        if (overflowRight > 0) {
            left = Math.max(POPOVER_MARGIN, left - overflowRight);
            panelEl.style.setProperty('--popover-left', `${left}px`);
        }
    });
}

function closeActivePopover() {
    activePanel?.classList.remove('popover-panel');
    activeTrigger?.classList.remove('active');
    activeTrigger = null;
    activePanel = null;
}

function openPopover(triggerEl, panelEl) {
    const reopeningSame = activePanel === panelEl;
    closeActivePopover();
    if (reopeningSame) return; // a second click on the same icon just closes it

    panelEl.classList.add('popover-panel');
    positionPopover(triggerEl, panelEl);
    triggerEl.classList.add('active');
    activeTrigger = triggerEl;
    activePanel = panelEl;
}

export function initializeQuickTools() {
    const triggers = [
        [document.getElementById('advanced-btn'), domElements.advancedSearch],
        [document.getElementById('quick-currency-btn'), document.querySelector('.currency-exchanger')],
        [document.getElementById('quick-time-btn'), document.querySelector('.time-tools')],
    ];

    triggers.forEach(([triggerEl, panelEl]) => {
        if (!triggerEl || !panelEl) return;
        triggerEl.addEventListener('click', (e) => {
            e.stopPropagation();
            openPopover(triggerEl, panelEl);
        });
    });

    document.addEventListener('click', (e) => {
        if (!activePanel) return;
        if (activePanel.contains(e.target) || activeTrigger?.contains(e.target)) return;
        closeActivePopover();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeActivePopover();
    });

    window.addEventListener('resize', closeActivePopover);
}
