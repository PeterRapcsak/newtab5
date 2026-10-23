/*======================================================================
    timeTools.js - Stopper, Visszaszámláló, fülváltás (Time Tools kártya)
----------------------------------------------------------------------
     - Mindkét óra ABSZOLÚT időbélyeget ment (mikor indult / mikor ér
       véget), így újratöltés/fül-bezárás után is pontosan folytatódik
    TELJESÍTMÉNY (6.0):
     - Stopper: az 5.1 10 ms-onként (100x/mp) újraépítette a kijelző
       innerHTML-jét, akkor is, ha nem is látszott. Most requestAnimation-
       Frame, CSAK amíg fut ÉS látszik (IntersectionObserver), és csak a
       fix span-ok szövegét írja
     - Visszaszámláló: másodpercenként egyszer ébred, a másodperc-
       határra igazítva; a hátralévő idő a végidőpontból számolódik,
       így nem csúszik el akkor sem, ha a böngésző lassítja az időzítőket
======================================================================*/

import { initPomodoroPanel, toggleRunning as togglePomodoroRunning, resetTimer as resetPomodoro, isPomodoroRunning } from './pomodoro.js';
import { playChime } from './sound.js';
import { setText, setProgress } from './ui.js';

const STOPWATCH_STATE_KEY = 'stopwatchState';
const TIMER_STATE_KEY = 'timerState';
const ACTIVE_TOOL_KEY = 'activeTimeTool';
const TOOLS = ['stopwatch', 'timer', 'pomodoro'];

const pad2 = (n) => String(n).padStart(2, '0');

function readState(key) {
    try {
        return JSON.parse(localStorage.getItem(key)) || {};
    } catch {
        return {};
    }
}

//! ======================== STOPWATCH ========================

export class Stopwatch {
    constructor(display) {
        this.display = display;
        this.hoursGroup = display.querySelector('.sw-h');
        this.minutesGroup = display.querySelector('.sw-m');
        this.hoursDigit = this.hoursGroup.querySelector('.digit');
        this.minutesDigit = this.minutesGroup.querySelector('.digit');
        this.secondsDigit = display.querySelector('.sw-s');
        this.centisDigit = display.querySelector('.sw-cs');

        this.running = false;
        this.time = 0;       // eltelt ms (megállított állapotban)
        this.startedAt = 0;  // "mintha ekkor indult volna" horgony (futás közben)
        this.visible = false;
        this.frame = 0;

        const state = readState(STOPWATCH_STATE_KEY);
        this.time = state.time || 0;
        if (state.running && typeof state.startedAt === 'number') {
            this.running = true;
            this.startedAt = state.startedAt;
            display.classList.add('running');
        }
        this.render();

        // Rejtett panelen (másik fül, kis képernyő) nincs mit rajzolni
        new IntersectionObserver(([entry]) => {
            this.visible = entry.isIntersecting;
            this.loop();
        }).observe(display);
    }

    elapsed() {
        return this.running ? Date.now() - this.startedAt : this.time;
    }

    saveState() {
        localStorage.setItem(STOPWATCH_STATE_KEY, JSON.stringify({
            running: this.running,
            time: this.elapsed(),
            startedAt: this.running ? this.startedAt : null
        }));
    }

    // ~30 fps: a pörgő századmásodperc így is folyamatosnak látszik, fele annyi munkával
    loop() {
        cancelAnimationFrame(this.frame);
        if (!this.running || !this.visible) return;
        let last = 0;
        const tick = (now) => {
            if (now - last >= 32) {
                last = now;
                this.render();
            }
            this.frame = requestAnimationFrame(tick);
        };
        this.render();
        this.frame = requestAnimationFrame(tick);
    }

    start() {
        if (this.running) return;
        this.startedAt = Date.now() - this.time;
        this.running = true;
        this.display.classList.add('running');
        this.saveState();
        this.loop();
    }

    stop() {
        if (!this.running) return;
        this.time = this.elapsed();
        this.running = false;
        this.display.classList.remove('running');
        cancelAnimationFrame(this.frame);
        this.saveState();
        this.render();
    }

    reset() {
        this.stop();
        this.time = 0;
        this.saveState();
        this.render();
    }

    // Csak annyi egységet mutat, amennyi kell: "5.00", "1:05.00", "1:01:05.00"
    render() {
        const t = this.elapsed();
        const h = Math.floor(t / 3600000);
        const m = Math.floor((t % 3600000) / 60000);
        const s = Math.floor((t % 60000) / 1000);

        this.hoursGroup.hidden = h === 0;
        this.minutesGroup.hidden = h === 0 && m === 0;
        setText(this.hoursDigit, String(h));
        setText(this.minutesDigit, h ? pad2(m) : String(m));
        setText(this.secondsDigit, h || m ? pad2(s) : String(s));
        setText(this.centisDigit, pad2(Math.floor((t % 1000) / 10)));
    }
}

//! ======================== TIMER (visszaszámláló) ========================

export class Timer {
    constructor(display, progressFill) {
        this.display = display;
        this.progressFill = progressFill;
        this.digits = {
            hours: display.querySelector('.hours'),
            minutes: display.querySelector('.minutes'),
            seconds: display.querySelector('.seconds')
        };

        this.running = false;
        this.remainingTime = 0; // hátralévő MÁSODPERC (megállított állapotban)
        this.totalTime = 0;     // a beállított teljes hossz (a haladás-sáv 100%-a)
        this.endsAt = null;     // ABSZOLÚT végidőpont (futás közben)
        this.timeout = 0;
        this.activeUnit = null; // a kattintással "felfegyverzett" szegmens
        this.editBuffer = '';
        this.alarmInterval = 0;
        this.isAlarmRinging = false;

        display.addEventListener('click', (e) => this.handleUnitClick(e));
        display.addEventListener('keydown', (e) => this.handleKey(e));
        document.addEventListener('click', (e) => {
            if (this.activeUnit && !display.contains(e.target)) this.exitUnitEdit();
        });

        const state = readState(TIMER_STATE_KEY);
        this.totalTime = state.totalTime || 0;
        this.remainingTime = state.remainingTime || 0;
        if (state.running && typeof state.endsAt === 'number') {
            if (state.endsAt > Date.now()) {
                this.endsAt = state.endsAt;
                this.running = true;
                display.classList.add('running');
                this.tick();
                return;
            }
            // A fül bezárása közben járt le: csak a "kész" állapot, hang
            // NÉLKÜL — a riasztás egy olyan pillanatból jönne, amikor a
            // felhasználó nem is volt itt
            this.remainingTime = 0;
            this.saveState();
            display.classList.add('finished');
        }
        this.render();
    }

    secondsLeft() {
        return this.running ? Math.max(0, Math.ceil((this.endsAt - Date.now()) / 1000)) : this.remainingTime;
    }

    saveState() {
        localStorage.setItem(TIMER_STATE_KEY, JSON.stringify({
            totalTime: this.totalTime,
            remainingTime: this.secondsLeft(),
            running: this.running,
            endsAt: this.running ? this.endsAt : null
        }));
    }

    // Egy tick a következő másodperc-határra időzítve (nem fix 1000 ms-onként)
    tick() {
        clearTimeout(this.timeout);
        if (!this.running) return;

        if (this.secondsLeft() <= 0) {
            this.stop();
            this.remainingTime = 0;
            this.saveState();
            this.render();
            this.startAlarm();
            this.onFinish?.();
            return;
        }

        const msToNext = ((this.endsAt - Date.now()) % 1000) || 1000;
        this.render(msToNext);
        this.timeout = setTimeout(() => this.tick(), msToNext + 5);
    }

    start() {
        if (this.running || this.remainingTime <= 0) return;
        this.exitUnitEdit();
        this.endsAt = Date.now() + this.remainingTime * 1000;
        this.running = true;
        this.display.classList.add('running');
        this.saveState();
        this.tick();
    }

    stop() {
        if (this.running) {
            this.remainingTime = this.secondsLeft();
            this.running = false;
            this.endsAt = null;
            clearTimeout(this.timeout);
            this.display.classList.remove('running');
            this.saveState();
        }
        this.stopAlarm();
    }

    reset() {
        this.stop();
        this.remainingTime = 0;
        this.totalTime = 0;
        this.activeUnit = null;
        this.editBuffer = '';
        this.display.classList.remove('finished');
        this.saveState();
        this.render();
    }

    startAlarm() {
        if (this.isAlarmRinging) return;
        this.isAlarmRinging = true;
        this.display.classList.add('finished');
        const ring = () => playChime(100, [880, 1046.5], 0.15, 0.15);
        ring();
        this.alarmInterval = setInterval(ring, 1000);
    }

    stopAlarm() {
        this.isAlarmRinging = false;
        clearInterval(this.alarmInterval);
        this.display.classList.remove('finished');
    }

    // msToNext: a sáv a KÖVETKEZŐ tick pillanatának állapotába csúszik, pont addig
    render(msToNext = 0) {
        const left = this.secondsLeft();
        setText(this.digits.hours, pad2(Math.floor(left / 3600)));
        setText(this.digits.minutes, pad2(Math.floor((left % 3600) / 60)));
        setText(this.digits.seconds, pad2(left % 60));
        for (const [unit, el] of Object.entries(this.digits)) el.classList.toggle('editing', this.activeUnit === unit);

        if (!this.totalTime) {
            setProgress(this.progressFill, 0);
        } else if (this.running) {
            const remainingAtNext = (this.endsAt - Date.now() - msToNext) / 1000;
            setProgress(this.progressFill, 1 - remainingAtNext / this.totalTime, msToNext);
        } else {
            setProgress(this.progressFill, 1 - left / this.totalTime);
        }
    }

    //! ---------- Számjegyek szerkesztése kattintással/gépeléssel ----------

    // Kattints pld. a percre, gépeld be "80" -> 01:20:00 (túlcsordulás átvitellel)
    handleUnitClick(e) {
        if (this.running) return;
        const unit = Object.keys(this.digits).find((u) => this.digits[u] === e.target.closest('.digit'));
        if (!unit) return;
        this.activeUnit = unit;
        this.editBuffer = '';
        this.display.focus({ preventScroll: true });
        this.render();
    }

    handleKey(e) {
        if (this.running || !this.activeUnit) return;
        e.preventDefault(); // semmi más ne kerüljön a kijelzőbe

        if (/^[0-9]$/.test(e.key)) {
            this.editBuffer = (this.editBuffer + e.key).slice(-3);
            this.applyUnitEdit(this.activeUnit, parseInt(this.editBuffer, 10));
        } else if (e.key === 'Backspace') {
            this.editBuffer = this.editBuffer.slice(0, -1);
            this.applyUnitEdit(this.activeUnit, this.editBuffer ? parseInt(this.editBuffer, 10) : 0);
        } else if (e.key === 'Enter' || e.key === 'Escape' || e.key === 'Tab') {
            this.exitUnitEdit();
        }
    }

    exitUnitEdit() {
        if (!this.activeUnit) return;
        this.activeUnit = null;
        this.editBuffer = '';
        this.render();
    }

    applyUnitEdit(unit, value) {
        let hours = Math.floor(this.remainingTime / 3600);
        let minutes = Math.floor((this.remainingTime % 3600) / 60);
        let seconds = this.remainingTime % 60;

        if (unit === 'seconds') {
            seconds = value % 60;
            minutes += Math.floor(value / 60);
        } else if (unit === 'minutes') {
            minutes = value % 60;
            hours += Math.floor(value / 60);
        } else {
            hours = value;
        }
        hours = Math.min(hours + Math.floor(minutes / 60), 99);
        minutes %= 60;

        this.remainingTime = hours * 3600 + minutes * 60 + seconds;
        this.totalTime = this.remainingTime;
        this.display.classList.remove('finished');
        this.saveState();
        this.render();
    }
}

//! ======================== FÜLVÁLTÁS ÉS KÖZÖS VEZÉRLŐK ========================

export let stopwatch;
export let timer;
export let activeTool = 'stopwatch';

export function initializeTimeTools() {
    stopwatch = new Stopwatch(document.querySelector('.stopwatch .display'));
    timer = new Timer(document.querySelector('.timer .display'), document.getElementById('timer-progress-fill'));
    initPomodoroPanel();

    const tabs = document.querySelector('.mode-tabs');
    const tabButtons = [...tabs.querySelectorAll('.toggle-btn')];
    const panels = TOOLS.map((tool) => document.querySelector(tool === 'pomodoro' ? '.pomodoro-panel' : `.${tool}`));
    const startStopBtn = document.querySelector('.controls .start-stop');
    const startStopIcon = startStopBtn.querySelector('use');
    const startStopLabel = startStopBtn.querySelector('span');

    const isRunning = () => (activeTool === 'stopwatch' ? stopwatch.running : activeTool === 'timer' ? timer.running : isPomodoroRunning());

    function updateUI() {
        const running = isRunning();
        startStopIcon.setAttribute('href', running ? '#i-pause' : '#i-play');
        startStopLabel.textContent = running ? 'Pause' : 'Start';
        startStopBtn.setAttribute('aria-label', running ? 'Pause' : 'Start');
    }

    function selectTool(tool) {
        activeTool = tool;
        const index = TOOLS.indexOf(tool);
        tabs.style.setProperty('--i', index); // a csúszó pill pozíciója (CSS)
        tabButtons.forEach((btn, i) => btn.classList.toggle('active', i === index));
        panels.forEach((panel, i) => panel.classList.toggle('active', i === index));
        updateUI();
    }

    tabButtons.forEach((button) => {
        button.addEventListener('click', () => {
            const target = button.dataset.target;
            if (target === activeTool) return;
            if (timer.isAlarmRinging) timer.stopAlarm();
            localStorage.setItem(ACTIVE_TOOL_KEY, target);
            selectTool(target);
        });
    });

    startStopBtn.addEventListener('click', () => {
        if (activeTool === 'stopwatch') {
            stopwatch.running ? stopwatch.stop() : stopwatch.start();
        } else if (activeTool === 'timer') {
            if (timer.isAlarmRinging) timer.stopAlarm(); // csengés közben a gomb némít
            else timer.running ? timer.stop() : timer.start();
        } else {
            togglePomodoroRunning();
        }
        updateUI();
    });

    document.querySelector('.controls .reset').addEventListener('click', () => {
        if (activeTool === 'stopwatch') stopwatch.reset();
        else if (activeTool === 'timer') timer.reset();
        else resetPomodoro();
        updateUI();
    });

    // A Timer magától is megállhat (lejár) -> a gomb kövesse
    timer.onFinish = updateUI;

    const saved = localStorage.getItem(ACTIVE_TOOL_KEY);
    selectTool(TOOLS.includes(saved) ? saved : 'stopwatch');
}
