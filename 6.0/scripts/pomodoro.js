/*======================================================================
    pomodoro.js - Pomodoro (munka/szünet ciklus) — a Time Tools 3. füle
----------------------------------------------------------------------
     - ABSZOLÚT végidőbélyeget tárol -> túléli az újratöltést
     - Fázis végén automatikusan lép: munka -> rövid szünet -> ... ->
       hosszú szünet, és fut tovább
    TELJESÍTMÉNY (6.0):
     - Az 5.1 250 ms-onként tickelt, ÖRÖKKÉ (megállítva is). Most csak
       futás közben, másodpercenként egyszer, a másodperc-határra igazítva
======================================================================*/

import { playChime } from './sound.js';
import { closePopover, togglePopover, setText, setProgress, markInvalid } from './ui.js';

const STATE_KEY = 'pomodoroState';

const PHASE_LABELS = { work: 'FOCUS', shortBreak: 'SHORT BREAK', longBreak: 'LONG BREAK' };
const PHASE_COLORS = { work: 'var(--accent-primary)', shortBreak: 'hsl(140 55% 55%)', longBreak: 'hsl(200 60% 60%)' };

//! ---------- ÁLLAPOT ----------

function defaultSettings() {
    return { workMin: 25, shortBreakMin: 5, longBreakMin: 15, sessionsUntilLong: 4, volume: 100 };
}

function defaultState() {
    const settings = defaultSettings();
    return {
        settings,
        phase: 'work',
        isRunning: false,
        endsAt: null,                          // futás közben a mérvadó
        remainingMs: settings.workMin * 60000, // megállítva a mérvadó
        sessionsCompleted: 0
    };
}

function loadState() {
    try {
        const parsed = JSON.parse(localStorage.getItem(STATE_KEY));
        if (!parsed) return defaultState();
        // Kétszintű összefésülés: egy régebbi mentésből hiányzó mező se okozzon hibát
        return { ...defaultState(), ...parsed, settings: { ...defaultSettings(), ...parsed.settings } };
    } catch {
        return defaultState();
    }
}

let state = loadState();
let tickHandle = 0;
let els = null;

function saveState() {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

function durationMs(phase) {
    const { settings } = state;
    if (phase === 'work') return settings.workMin * 60000;
    if (phase === 'shortBreak') return settings.shortBreakMin * 60000;
    return settings.longBreakMin * 60000;
}

function nextPhase() {
    if (state.phase !== 'work') return 'work';
    state.sessionsCompleted += 1;
    if (state.sessionsCompleted >= state.settings.sessionsUntilLong) {
        state.sessionsCompleted = 0;
        return 'longBreak';
    }
    return 'shortBreak';
}

const remainingMs = () => (state.isRunning && state.endsAt !== null ? Math.max(0, state.endsAt - Date.now()) : state.remainingMs);

/*
    CÉL: Ha a fázis lejárt (akár csukott fül mellett is), EGYET lép
    — nem pörgeti végig az összes közben "eltelt" fázist (3 nap után
    visszanyitva sem akarunk 200 csippanást)
*/
function catchUp() {
    if (!state.isRunning || state.endsAt === null || Date.now() < state.endsAt) return;
    state.phase = nextPhase();
    state.endsAt = Date.now() + durationMs(state.phase);
    saveState();
    playChime(state.settings.volume);
}

//! ---------- MEGJELENÍTÉS ----------

function render(msToNext = 0) {
    const total = durationMs(state.phase);
    const remaining = remainingMs();
    const totalSeconds = Math.ceil(remaining / 1000); // "0:01" csak a tényleges végén vált "0:00"-ra

    setText(els.minutes, String(Math.floor(totalSeconds / 60)).padStart(2, '0'));
    setText(els.seconds, String(totalSeconds % 60).padStart(2, '0'));
    setText(els.phase, PHASE_LABELS[state.phase]);
    els.phase.style.color = PHASE_COLORS[state.phase];
    els.display.classList.toggle('running', state.isRunning);

    if (total <= 0) return;
    setProgress(els.progressFill, 1 - Math.max(0, remaining - msToNext) / total, state.isRunning ? msToNext : 300);
}

function tick() {
    clearTimeout(tickHandle);
    catchUp();
    if (!state.isRunning) return render();

    const msToNext = (remainingMs() % 1000) || 1000;
    render(msToNext);
    tickHandle = setTimeout(tick, msToNext + 5);
}

//! ---------- VEZÉRLÉS (timeTools.js hívja) ----------

export const isPomodoroRunning = () => state.isRunning;

export function toggleRunning() {
    if (state.isRunning) {
        state.remainingMs = remainingMs(); // MÉG az isRunning átállítása előtt
        state.isRunning = false;
        state.endsAt = null;
    } else {
        state.endsAt = Date.now() + state.remainingMs;
        state.isRunning = true;
    }
    saveState();
    tick();
}

export function resetTimer() {
    Object.assign(state, { phase: 'work', sessionsCompleted: 0, isRunning: false, endsAt: null, remainingMs: durationMs('work') });
    saveState();
    tick();
}

//! ---------- BEÁLLÍTÁSOK ----------

/*
    CÉL: Új beállítások validálása és alkalmazása (Save gomb + Import All)
    KI: true, ha sikerült; a folyamatban lévő fázis frissen újraindul
*/
function applySettings(settings) {
    const { workMin, shortBreakMin, longBreakMin, sessionsUntilLong, volume } = settings;
    if ([workMin, shortBreakMin, longBreakMin, sessionsUntilLong].some((n) => !Number.isFinite(n) || n < 1)) return false;
    if (!Number.isFinite(volume) || volume < 0 || volume > 100) return false;

    state.settings = { workMin, shortBreakMin, longBreakMin, sessionsUntilLong, volume };
    state.remainingMs = durationMs(state.phase);
    if (state.isRunning) state.endsAt = Date.now() + state.remainingMs;
    saveState();
    if (els) tick();
    return true;
}

export const getPomodoroSettings = () => ({ ...state.settings });

export function setPomodoroSettings(settings) {
    applySettings({ ...defaultSettings(), ...settings });
}

let settingsPopover = null;

const FIELDS = [
    ['workMin', 'Focus (min)', 180],
    ['shortBreakMin', 'Short break (min)', 60],
    ['longBreakMin', 'Long break (min)', 90],
    ['sessionsUntilLong', 'Sessions before long break', 12]
];

function getSettingsPopover() {
    if (settingsPopover) return settingsPopover;

    settingsPopover = document.createElement('form');
    settingsPopover.className = 'pomodoro-settings popover';
    settingsPopover.noValidate = true;
    settingsPopover.innerHTML = `
        <div class="popover-title">Pomodoro settings</div>
        ${FIELDS.map(([name, label, max]) => `<label class="pomodoro-field">${label}<input type="number" name="${name}" min="1" max="${max}"></label>`).join('')}
        <label class="pomodoro-field">Notification volume<span class="pomodoro-volume-control"><input type="range" name="volume" min="0" max="100" step="5"><span class="pomodoro-volume-value"></span></span></label>
        <div class="popover-actions">
            <button type="button" class="action-btn" data-defaults title="Reset to defaults">Reset</button>
            <button type="button" class="action-btn" data-cancel>Cancel</button>
            <button type="submit" class="btn-primary">Save</button>
        </div>
    `;
    document.body.appendChild(settingsPopover);

    const volume = settingsPopover.elements.volume;
    const volumeLabel = settingsPopover.querySelector('.pomodoro-volume-value');
    const syncVolumeLabel = () => { volumeLabel.textContent = `${volume.value}%`; };

    volume.addEventListener('input', syncVolumeLabel);
    volume.addEventListener('change', () => playChime(Number(volume.value))); // elengedéskor előhallgatás
    settingsPopover.addEventListener('input', (e) => e.target.classList.remove('invalid'));
    settingsPopover.querySelector('[data-cancel]').addEventListener('click', () => closePopover(settingsPopover));
    settingsPopover.querySelector('[data-defaults]').addEventListener('click', () => {
        fillForm(defaultSettings()); // csak a mezőket tölti, menteni a Save-vel kell
    });

    settingsPopover.addEventListener('submit', (e) => {
        e.preventDefault();
        const values = Object.fromEntries([...FIELDS.map(([name]) => name), 'volume'].map((name) => [name, parseInt(settingsPopover.elements[name].value, 10)]));
        const bad = FIELDS.find(([name]) => !(values[name] >= 1));
        if (bad) return markInvalid(settingsPopover.elements[bad[0]]);
        if (applySettings(values)) closePopover(settingsPopover);
    });

    function fillForm(settings) {
        for (const [name] of FIELDS) settingsPopover.elements[name].value = settings[name];
        volume.value = settings.volume;
        syncVolumeLabel();
    }
    settingsPopover.fillForm = fillForm;
    return settingsPopover;
}

//! ---------- INICIALIZÁLÁS ----------

export function initPomodoroPanel() {
    const time = document.getElementById('pomodoro-time');
    const [minutes, seconds] = time.querySelectorAll('.digit');
    els = {
        minutes,
        seconds,
        display: time.parentElement,
        phase: document.getElementById('pomodoro-phase'),
        progressFill: document.getElementById('pomodoro-progress-fill')
    };

    tick(); // pótolja, ami a fül bezárása alatt történt, és ha fut, tickel tovább

    const gear = document.getElementById('pomodoro-settings-btn');
    gear.addEventListener('click', () => {
        const popover = getSettingsPopover();
        popover.fillForm(state.settings);
        if (togglePopover(popover, gear)) popover.elements.workMin.focus({ preventScroll: true });
    });
}
