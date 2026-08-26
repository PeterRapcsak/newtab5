// Pomodoro: work/break cycle timer, now a third mode inside the Time Tools
// card (alongside Stopwatch/Timer) rather than its own floating widget —
// timeTools.js drives the shared Start/Pause + Reset buttons and calls
// toggleRunning()/resetTimer()/isRunning() here for whichever tool is
// active. Survives newtab reloads by storing an absolute end timestamp
// (not a running interval) — the countdown is recomputed from real elapsed
// time on every load or tick, so closing and reopening the tab doesn't
// reset or desync it. When a phase ends it automatically advances to the
// next one (short break → work → short break → ... → long break) and
// keeps running, unless paused.

const STATE_KEY = 'pomodoroState';
const TICK_MS = 250;

const PHASE_LABELS = {
    work: 'FOCUS',
    shortBreak: 'SHORT BREAK',
    longBreak: 'LONG BREAK'
};

const PHASE_COLORS = {
    work: 'var(--accent-primary)',
    shortBreak: 'hsl(140 55% 55%)',
    longBreak: 'hsl(200 60% 60%)'
};

function defaultSettings() {
    return { workMin: 25, shortBreakMin: 5, longBreakMin: 15, sessionsUntilLong: 4 };
}

function defaultState() {
    const settings = defaultSettings();
    return {
        settings,
        phase: 'work',
        isRunning: false,
        endsAt: null,
        remainingMs: settings.workMin * 60000,
        sessionsCompleted: 0
    };
}

function loadState() {
    try {
        const raw = localStorage.getItem(STATE_KEY);
        if (!raw) return defaultState();
        const parsed = JSON.parse(raw);
        return {
            ...defaultState(),
            ...parsed,
            settings: { ...defaultSettings(), ...parsed.settings }
        };
    } catch {
        return defaultState();
    }
}

let state = loadState();
let tickHandle = null;
let audioCtx = null;

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
    if (state.phase === 'work') {
        state.sessionsCompleted += 1;
        if (state.sessionsCompleted >= state.settings.sessionsUntilLong) {
            state.sessionsCompleted = 0;
            return 'longBreak';
        }
        return 'shortBreak';
    }
    return 'work';
}

function playBeep() {
    try {
        audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
        const now = audioCtx.currentTime;
        // Two beeps back to back, scheduled on the audio clock (not
        // setTimeout) so the second one stays sample-accurate.
        [0, 0.45].forEach((offset) => {
            const start = now + offset;
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.frequency.value = 880;
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            gain.gain.setValueAtTime(0.0001, start);
            gain.gain.exponentialRampToValueAtTime(1, start + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.4);
            osc.start(start);
            osc.stop(start + 0.4);
        });
    } catch {
        // Audio isn't essential — a silent widget still works fine.
    }
}

// If the phase already ended (including while the tab was closed), advance
// once to the phase you'd be in next, rather than replaying every phase
// that would have elapsed in between.
function catchUp() {
    if (!state.isRunning || state.endsAt === null) return;
    if (Date.now() < state.endsAt) return;

    state.phase = nextPhase();
    state.endsAt = Date.now() + durationMs(state.phase);
    saveState();
    playBeep();
}

function remainingMs() {
    if (state.isRunning && state.endsAt !== null) {
        return Math.max(0, state.endsAt - Date.now());
    }
    return state.remainingMs;
}

// Same digit/time-segment markup the Timer uses, so the two counters are
// visually identical (tabular-nums digits, muted colon) rather than just
// sharing a font.
function formatTime(ms) {
    const totalSeconds = Math.ceil(ms / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `<span class="digit">${m.toString().padStart(2, '0')}</span><span class="time-segment">:</span><span class="digit">${s.toString().padStart(2, '0')}</span>`;
}

function getEls() {
    return {
        time: document.getElementById('pomodoro-time'),
        progressFill: document.getElementById('pomodoro-progress-fill'),
        phase: document.getElementById('pomodoro-phase')
    };
}

function render() {
    const els = getEls();
    if (!els.time) return;

    const total = durationMs(state.phase);
    const remaining = remainingMs();
    const remainingFraction = total > 0 ? remaining / total : 0;

    els.time.innerHTML = formatTime(remaining);
    els.phase.textContent = PHASE_LABELS[state.phase];
    els.phase.style.color = PHASE_COLORS[state.phase];

    els.progressFill.style.width = `${(1 - remainingFraction) * 100}%`;
}

function tick() {
    catchUp();
    render();
}

function startTicking() {
    if (tickHandle) return;
    tickHandle = setInterval(tick, TICK_MS);
}

export function isPomodoroRunning() {
    return state.isRunning;
}

export function toggleRunning() {
    if (state.isRunning) {
        state.remainingMs = remainingMs();
        state.isRunning = false;
        state.endsAt = null;
    } else {
        state.endsAt = Date.now() + state.remainingMs;
        state.isRunning = true;
    }
    saveState();
    render();
}

export function resetTimer() {
    state.phase = 'work';
    state.sessionsCompleted = 0;
    state.isRunning = false;
    state.endsAt = null;
    state.remainingMs = durationMs('work');
    saveState();
    render();
}

// ---------------------------------------------------------------------
// Settings popover (same chrome as shortcuts.js's edit popover)
// ---------------------------------------------------------------------
let settingsPopoverEl = null;

function getSettingsPopover() {
    if (settingsPopoverEl) return settingsPopoverEl;

    settingsPopoverEl = document.createElement('div');
    settingsPopoverEl.className = 'edit-shortcut-popover pomodoro-settings-popover glass-card';
    settingsPopoverEl.innerHTML = `
        <div class="endpoint-popover-title">Pomodoro settings</div>
        <label class="pomodoro-field">Focus (min)<input type="number" min="1" max="180" class="pomodoro-input-work"></label>
        <label class="pomodoro-field">Short break (min)<input type="number" min="1" max="60" class="pomodoro-input-short"></label>
        <label class="pomodoro-field">Long break (min)<input type="number" min="1" max="90" class="pomodoro-input-long"></label>
        <label class="pomodoro-field">Sessions before long break<input type="number" min="1" max="12" class="pomodoro-input-sessions"></label>
        <div class="edit-shortcut-actions pomodoro-settings-actions">
            <button type="button" class="pomodoro-settings-defaults action-btn" title="Reset to defaults">Reset</button>
            <button type="button" class="pomodoro-settings-cancel action-btn">Cancel</button>
            <button type="button" class="pomodoro-settings-save btn-primary">Save</button>
        </div>
    `;
    document.body.appendChild(settingsPopoverEl);

    settingsPopoverEl.addEventListener('click', (e) => e.stopPropagation());
    settingsPopoverEl.querySelector('.pomodoro-settings-cancel').addEventListener('click', closeSettingsPopover);
    settingsPopoverEl.querySelector('.pomodoro-settings-save').addEventListener('click', saveSettings);
    settingsPopoverEl.querySelector('.pomodoro-settings-defaults').addEventListener('click', () => fillSettingsForm(defaultSettings()));
    settingsPopoverEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); saveSettings(); }
        else if (e.key === 'Escape') closeSettingsPopover();
    });

    return settingsPopoverEl;
}

function closeSettingsPopover() {
    if (settingsPopoverEl) settingsPopoverEl.classList.remove('open');
}

function positionPopover(popover, clickEvent) {
    const margin = 12;
    popover.style.left = `${clickEvent.clientX}px`;
    popover.style.top = `${clickEvent.clientY}px`;

    requestAnimationFrame(() => {
        const rect = popover.getBoundingClientRect();
        let left = clickEvent.clientX;
        let top = clickEvent.clientY;

        const overflowRight = rect.right - (window.innerWidth - margin);
        if (overflowRight > 0) left -= overflowRight;
        const overflowBottom = rect.bottom - (window.innerHeight - margin);
        if (overflowBottom > 0) top -= rect.height + 24; // flip above the cursor

        popover.style.left = `${Math.max(margin, left)}px`;
        popover.style.top = `${Math.max(margin, top)}px`;
    });
}

function fillSettingsForm(settings) {
    const popover = getSettingsPopover();
    popover.querySelector('.pomodoro-input-work').value = settings.workMin;
    popover.querySelector('.pomodoro-input-short').value = settings.shortBreakMin;
    popover.querySelector('.pomodoro-input-long').value = settings.longBreakMin;
    popover.querySelector('.pomodoro-input-sessions').value = settings.sessionsUntilLong;
}

function openSettingsPopover(clickEvent) {
    const popover = getSettingsPopover();
    fillSettingsForm(state.settings);
    popover.classList.add('open');
    positionPopover(popover, clickEvent);
    popover.querySelector('.pomodoro-input-work').focus();
}

// Shared by the settings popover's Save button and the Import All flow —
// both just need "here are new settings, validate and apply them".
function applySettings(settings) {
    const { workMin, shortBreakMin, longBreakMin, sessionsUntilLong } = settings;
    if ([workMin, shortBreakMin, longBreakMin, sessionsUntilLong].some((n) => !Number.isFinite(n) || n < 1)) {
        return false;
    }

    state.settings = { workMin, shortBreakMin, longBreakMin, sessionsUntilLong };
    // Changing settings mid-countdown restarts the current phase fresh
    // rather than trying to preserve a fractional elapsed proportion.
    state.remainingMs = durationMs(state.phase);
    if (state.isRunning) state.endsAt = Date.now() + state.remainingMs;
    saveState();
    render();
    return true;
}

function saveSettings() {
    const popover = getSettingsPopover();
    const settings = {
        workMin: parseInt(popover.querySelector('.pomodoro-input-work').value, 10),
        shortBreakMin: parseInt(popover.querySelector('.pomodoro-input-short').value, 10),
        longBreakMin: parseInt(popover.querySelector('.pomodoro-input-long').value, 10),
        sessionsUntilLong: parseInt(popover.querySelector('.pomodoro-input-sessions').value, 10)
    };

    if (!applySettings(settings)) {
        alert('Please enter valid positive numbers.');
        return;
    }
    closeSettingsPopover();
}

// Used by Export All / Import All in main.js, so Pomodoro's focus/break
// lengths travel with the rest of the settings instead of being silently
// left behind on the old browser/profile.
export function getPomodoroSettings() {
    return { ...state.settings };
}

export function setPomodoroSettings(settings) {
    applySettings({ ...defaultSettings(), ...settings });
}

document.addEventListener('click', (e) => {
    if (settingsPopoverEl && settingsPopoverEl.classList.contains('open') && !settingsPopoverEl.contains(e.target)) {
        closeSettingsPopover();
    }
});

export function initPomodoroPanel() {
    const els = getEls();
    if (!els.time) return;

    catchUp();
    render();
    startTicking();

    document.getElementById('pomodoro-settings-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        openSettingsPopover(e);
    });
}
