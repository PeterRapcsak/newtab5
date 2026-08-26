import { initPomodoroPanel, toggleRunning as togglePomodoroRunning, resetTimer as resetPomodoro, isPomodoroRunning } from './pomodoro.js';

const STOPWATCH_STATE_KEY = 'stopwatchState';
const TIMER_STATE_KEY = 'timerState';

export class Stopwatch {
    constructor(displayElement) {
        this.display = displayElement;
        this.running = false;
        this.time = 0;
        this.interval = null;
        this.display.contentEditable = false;
        this.loadState();
        this.updateDisplay();
        if (this.running) this.resumeInterval();
    }

    // Stores an absolute "if it had started at this timestamp" anchor
    // rather than the running interval itself — a reload can't preserve a
    // live setInterval, but it can recompute elapsed time from that anchor,
    // same approach pomodoro.js uses for its own persistence.
    loadState() {
        try {
            const raw = localStorage.getItem(STOPWATCH_STATE_KEY);
            if (!raw) return;
            const state = JSON.parse(raw);
            this.time = state.time || 0;
            this.running = !!state.running;
            if (this.running && typeof state.startedAt === 'number') {
                this.time = Date.now() - state.startedAt;
            }
        } catch {
            // Corrupt/missing state — just start fresh.
        }
    }

    saveState() {
        localStorage.setItem(STOPWATCH_STATE_KEY, JSON.stringify({
            running: this.running,
            time: this.time,
            startedAt: this.running ? Date.now() - this.time : null
        }));
    }

    resumeInterval() {
        this.display.classList.add('running');
        const startTime = Date.now() - this.time;
        this.interval = setInterval(() => {
            this.time = Date.now() - startTime;
            this.updateDisplay();
        }, 10);
    }

    start() {
        if (!this.running) {
            this.running = true;
            this.saveState();
            this.resumeInterval();
        }
    }

    stop() {
        if (this.running) {
            clearInterval(this.interval);
            this.running = false;
            this.display.classList.remove('running');
            this.saveState();
        }
    }

    reset() {
        this.stop();
        this.time = 0;
        this.saveState();
        this.updateDisplay();
    }

    updateDisplay() {
        const totalMilliseconds = this.time;

        const hours = Math.floor(totalMilliseconds / 3600000);
        const minutes = Math.floor((totalMilliseconds % 3600000) / 60000);
        const seconds = Math.floor((totalMilliseconds % 60000) / 1000);
        const centiseconds = Math.floor((totalMilliseconds % 1000) / 10);

        const formattedCentiseconds = `<span class="digit">${String(centiseconds).padStart(2, '0')}</span>`;
        let mainDisplayHtml = '';

        if (hours > 0) {
            // Show H:MM:SS
            const formattedMinutes = String(minutes).padStart(2, '0');
            const formattedSeconds = String(seconds).padStart(2, '0');
            mainDisplayHtml = `<span class="digit">${hours}</span><span class="time-segment">:</span><span class="digit">${formattedMinutes}</span><span class="time-segment">:</span><span class="digit">${formattedSeconds}</span>`;
        } else if (minutes > 0) {
            // Show M:SS
            const formattedSeconds = String(seconds).padStart(2, '0');
            mainDisplayHtml = `<span class="digit">${minutes}</span><span class="time-segment">:</span><span class="digit">${formattedSeconds}</span>`;
        } else {
            // Show S
            mainDisplayHtml = `<span class="digit">${seconds}</span>`;
        }

        this.display.innerHTML = `${mainDisplayHtml}<span class="time-segment">.</span>${formattedCentiseconds}`;
    }
}

export class Timer {
    constructor(displayElement, progressFillElement) {
        this.display = displayElement;
        this.progressFill = progressFillElement;
        this.running = false;
        this.remainingTime = 0;
        this.totalTime = 0;
        this.interval = null;
        // Which segment (hours/minutes/seconds) a click has armed for typing,
        // and the raw digits typed into it since that click — see
        // handleUnitClick()/handleUnitInput() below.
        this.activeUnit = null;
        this.editBuffer = '';
        this.alarmAudio = null;
        this.alarmInterval = null;
        this.isAlarmRinging = false;
        this.finishedWhileAway = false;
        this.display.setAttribute('tabindex', '0');

        this.display.addEventListener('click', (e) => this.handleUnitClick(e));

        this.display.addEventListener('keydown', (e) => {
            if (this.running || !this.activeUnit) {
                e.preventDefault();
                return;
            }
            if (/[0-9]/.test(e.key)) {
                e.preventDefault();
                this.handleUnitInput(e.key);
            } else if (e.key === 'Backspace') {
                e.preventDefault();
                this.editBuffer = this.editBuffer.slice(0, -1);
                this.applyUnitEdit(this.activeUnit, this.editBuffer ? parseInt(this.editBuffer, 10) : 0);
            } else if (e.key === 'Enter' || e.key === 'Escape' || e.key === 'Tab') {
                e.preventDefault();
                this.exitUnitEdit();
            } else {
                e.preventDefault();
            }
        });

        // Clicking anywhere outside the display commits whatever was typed
        // and drops the "which segment is armed" highlight.
        document.addEventListener('click', (e) => {
            if (this.activeUnit && !this.display.contains(e.target)) {
                this.exitUnitEdit();
            }
        });

        this.loadState();
        this.updateDisplayFromSeconds();
        this.initAlarm();

        if (this.running) {
            this.resumeCountdown(); // sets this.running = true itself
        } else if (this.finishedWhileAway) {
            this.display.classList.add('finished');
        }
    }

    initAlarm() {
        // Create alarm sound using Web Audio API
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
            this.audioContext = new AudioContext();
        }
    }

    playAlarmSound() {
        if (!this.audioContext) return;
        
        // Create a louder, more prominent Google-like chirping alarm sound
        // This creates a pleasant two-tone beep pattern with increased volume
        const duration = 0.15;
        const frequency1 = 880; // A5 note
        const frequency2 = 1046.5; // C6 note
        
        // Play first tone with louder volume
        const oscillator1 = this.audioContext.createOscillator();
        const gainNode1 = this.audioContext.createGain();
        
        oscillator1.connect(gainNode1);
        gainNode1.connect(this.audioContext.destination);
        
        oscillator1.type = 'sine';
        oscillator1.frequency.setValueAtTime(frequency1, this.audioContext.currentTime);
        
        // Increased gain from 0.3 to 0.6 for louder volume
        gainNode1.gain.setValueAtTime(0, this.audioContext.currentTime);
        gainNode1.gain.linearRampToValueAtTime(3, this.audioContext.currentTime + 0.01);
        gainNode1.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);
        
        oscillator1.start(this.audioContext.currentTime);
        oscillator1.stop(this.audioContext.currentTime + duration);
        
        // Play second tone slightly after with louder volume
        setTimeout(() => {
            if (!this.isAlarmRinging) return;
            
            const oscillator2 = this.audioContext.createOscillator();
            const gainNode2 = this.audioContext.createGain();
            
            oscillator2.connect(gainNode2);
            gainNode2.connect(this.audioContext.destination);
            
            oscillator2.type = 'sine';
            oscillator2.frequency.setValueAtTime(frequency2, this.audioContext.currentTime);
            
            // Increased gain from 0.3 to 0.6 for louder volume
            gainNode2.gain.setValueAtTime(0, this.audioContext.currentTime);
            gainNode2.gain.linearRampToValueAtTime(0.6, this.audioContext.currentTime + 0.01);
            gainNode2.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);
            
            oscillator2.start(this.audioContext.currentTime);
            oscillator2.stop(this.audioContext.currentTime + duration);
        }, 150);
    }

    startAlarm() {
        if (this.isAlarmRinging) return;
        
        this.isAlarmRinging = true;
        this.display.classList.add('finished');
        
        // Play alarm sound immediately
        this.playAlarmSound();
        
        // Continue playing alarm every 1 second until stopped
        this.alarmInterval = setInterval(() => {
            if (this.isAlarmRinging) {
                this.playAlarmSound();
            }
        }, 1000);
    }

    stopAlarm() {
        this.isAlarmRinging = false;
        if (this.alarmInterval) {
            clearInterval(this.alarmInterval);
            this.alarmInterval = null;
        }
        this.display.classList.remove('finished');
    }

    // Same absolute-anchor persistence approach as Stopwatch/pomodoro: store
    // the timestamp the countdown will *end* at, not a live interval, so a
    // reload can recompute exactly how much time actually passed.
    loadState() {
        try {
            const raw = localStorage.getItem(TIMER_STATE_KEY);
            if (!raw) return;
            const state = JSON.parse(raw);
            this.totalTime = state.totalTime || 0;
            this.remainingTime = state.remainingTime || 0;
            this.running = !!state.running;

            if (this.running && typeof state.endsAt === 'number') {
                const secondsLeft = Math.ceil((state.endsAt - Date.now()) / 1000);
                if (secondsLeft > 0) {
                    this.remainingTime = secondsLeft;
                } else {
                    // It finished while the tab was closed. Show the
                    // finished state, but don't blast the alarm the instant
                    // the page opens — that came from a moment you weren't
                    // here for.
                    this.remainingTime = 0;
                    this.running = false;
                    this.finishedWhileAway = true;
                }
            }
        } catch {
            // Corrupt/missing state — just start fresh.
        }
    }

    saveState() {
        localStorage.setItem(TIMER_STATE_KEY, JSON.stringify({
            totalTime: this.totalTime,
            remainingTime: this.remainingTime,
            running: this.running,
            endsAt: this.running ? Date.now() + this.remainingTime * 1000 : null
        }));
    }

    resumeCountdown() {
        this.running = true;
        this.display.classList.add('running');
        this.interval = setInterval(() => {
            if (--this.remainingTime <= 0) {
                this.stop();
                this.remainingTime = 0;
                this.startAlarm();
            }
            this.updateDisplayFromSeconds();
        }, 1000);
    }

    start() {
        if (this.remainingTime > 0 && !this.running) {
            this.resumeCountdown();
            this.saveState();
        }
    }

    stop() {
        if (this.running) {
            clearInterval(this.interval);
            this.running = false;
            this.display.classList.remove('running');
            this.saveState();
        }
        // Stop alarm when pausing
        this.stopAlarm();
    }

    reset() {
        this.stop();
        this.remainingTime = 0;
        this.totalTime = 0;
        this.activeUnit = null;
        this.editBuffer = '';
        this.stopAlarm();
        this.saveState();
        this.updateDisplayFromSeconds();
    }

    setTime(seconds) {
        this.remainingTime = seconds;
        this.totalTime = seconds;
        this.saveState();
        this.updateDisplayFromSeconds();
    }

    updateDisplayFromSeconds() {
        const hours = Math.floor(this.remainingTime / 3600);
        const minutes = Math.floor((this.remainingTime % 3600) / 60);
        const seconds = this.remainingTime % 60;
        const digitSpan = (unit, value) => {
            const editing = this.activeUnit === unit ? ' editing' : '';
            return `<span class="digit ${unit}${editing}">${String(value).padStart(2, '0')}</span>`;
        };
        this.display.innerHTML =
            digitSpan('hours', hours) +
            '<span class="time-segment">:</span>' +
            digitSpan('minutes', minutes) +
            '<span class="time-segment">:</span>' +
            digitSpan('seconds', seconds);
        if (this.progressFill) {
            const elapsedFraction = this.totalTime > 0 ? 1 - (this.remainingTime / this.totalTime) : 0;
            this.progressFill.style.width = `${elapsedFraction * 100}%`;
        }
    }

    // Click a digit pair to arm it for typing — e.g. click "minutes" and
    // type "30" to get 00:30:00, or "80" to carry into hours (01:20:00),
    // without touching whichever units you didn't click.
    handleUnitClick(e) {
        if (this.running) return;
        const digitEl = e.target.closest('.digit');
        const unit = ['hours', 'minutes', 'seconds'].find((u) => digitEl?.classList.contains(u));
        if (!unit) return;
        // Stop here, before updateDisplayFromSeconds() below detaches
        // e.target — the document-level "click outside" listener otherwise
        // sees a now-detached target and immediately un-arms the unit this
        // same click just armed.
        e.stopPropagation();
        this.activeUnit = unit;
        this.editBuffer = '';
        this.updateDisplayFromSeconds();
    }

    handleUnitInput(digit) {
        this.editBuffer = (this.editBuffer + digit).slice(-3);
        this.applyUnitEdit(this.activeUnit, parseInt(this.editBuffer, 10));
    }

    exitUnitEdit() {
        this.activeUnit = null;
        this.editBuffer = '';
        this.updateDisplayFromSeconds();
    }

    // Sets just the clicked unit to `value`, carrying any overflow (e.g. 80
    // minutes) up into the next unit rather than clamping it away.
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
        hours += Math.floor(minutes / 60);
        minutes = minutes % 60;
        hours = Math.min(hours, 99);

        this.remainingTime = hours * 3600 + minutes * 60 + seconds;
        this.totalTime = this.remainingTime;
        this.saveState();
        this.updateDisplayFromSeconds();
    }
}

const ACTIVE_TOOL_KEY = 'activeTimeTool';
const VALID_TOOLS = ['stopwatch', 'timer', 'pomodoro'];

export let stopwatch;
export let timer;
export let activeTool = 'stopwatch';

export function initializeTimeTools() {
    const stopwatchDisplay = document.querySelector('.stopwatch .display');
    stopwatch = new Stopwatch(stopwatchDisplay);

    const timerDisplay = document.querySelector('.timer .display');
    const timerProgressFill = document.getElementById('timer-progress-fill');
    timer = new Timer(timerDisplay, timerProgressFill);

    initPomodoroPanel();

    const toggleButtons = document.querySelectorAll('.mode-tabs .toggle-btn');
    const startStopBtn = document.querySelector('.controls .start-stop');
    const resetBtn = document.querySelector('.controls .reset');

    function isRunningFor(tool) {
        if (tool === 'stopwatch') return stopwatch.running;
        if (tool === 'timer') return timer.running;
        return isPomodoroRunning();
    }

    function updateUI() {
        const icon = startStopBtn.querySelector('i');
        const label = startStopBtn.querySelector('span');
        const isRunning = isRunningFor(activeTool);
        icon.classList.toggle('fa-play', !isRunning);
        icon.classList.toggle('fa-pause', isRunning);
        if (label) label.textContent = isRunning ? 'Pause' : 'Start';
        startStopBtn.setAttribute('aria-label', isRunning ? 'Pause' : 'Start');
    }

    toggleButtons.forEach(button => {
        button.addEventListener('click', () => {
            const target = button.dataset.target;
            if (activeTool !== target) {
                // Stop alarm when switching from timer to stopwatch
                if (activeTool === 'timer' && timer.isAlarmRinging) {
                    timer.stopAlarm();
                }

                activeTool = target;
                localStorage.setItem(ACTIVE_TOOL_KEY, activeTool);
                toggleButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                document.querySelector('.stopwatch').classList.toggle('active', target === 'stopwatch');
                document.querySelector('.timer').classList.toggle('active', target === 'timer');
                document.querySelector('.pomodoro-panel').classList.toggle('active', target === 'pomodoro');
                if (activeTool === 'stopwatch') {
                    stopwatch.updateDisplay();
                } else if (activeTool === 'timer') {
                    timer.updateDisplayFromSeconds();
                }
                updateUI();
            }
        });
    });

    startStopBtn.addEventListener('click', () => {
        if (activeTool === 'stopwatch') {
            if (stopwatch.running) stopwatch.stop();
            else stopwatch.start();
        } else if (activeTool === 'timer') {
            if (timer.running) timer.stop();
            else timer.start();
        } else {
            togglePomodoroRunning();
        }
        updateUI();
    });

    resetBtn.addEventListener('click', () => {
        if (activeTool === 'stopwatch') {
            stopwatch.reset();
        } else if (activeTool === 'timer') {
            timer.reset();
        } else {
            resetPomodoro();
        }
        updateUI();
    });

    // Restore whichever tab was showing before reload — a Timer/Pomodoro
    // that's still silently counting down in the background shouldn't
    // surface behind a "Stopwatch, not running" tab that says otherwise.
    const savedTool = localStorage.getItem(ACTIVE_TOOL_KEY);
    activeTool = VALID_TOOLS.includes(savedTool) ? savedTool : 'stopwatch';

    toggleButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.target === activeTool));
    document.querySelector('.stopwatch').classList.toggle('active', activeTool === 'stopwatch');
    document.querySelector('.timer').classList.toggle('active', activeTool === 'timer');
    document.querySelector('.pomodoro-panel').classList.toggle('active', activeTool === 'pomodoro');
    updateUI();
}