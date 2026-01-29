export class Stopwatch {
    constructor(displayElement) {
        this.display = displayElement;
        this.running = false;
        this.time = 0;
        this.interval = null;
        this.display.contentEditable = false;
        this.updateDisplay();
    }

    start() {
        if (!this.running) {
            this.running = true;
            this.display.classList.add('running');
            const startTime = Date.now() - this.time;
            this.interval = setInterval(() => {
                this.time = Date.now() - startTime;
                this.updateDisplay();
            }, 10);
        }
    }

    stop() {
        if (this.running) {
            clearInterval(this.interval);
            this.running = false;
            this.display.classList.remove('running');
        }
    }

    reset() {
        this.stop();
        this.time = 0;
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
    constructor(displayElement) {
        this.display = displayElement;
        this.running = false;
        this.remainingTime = 0;
        this.interval = null;
        this.inputBuffer = '';
        this.alarmAudio = null;
        this.alarmInterval = null;
        this.isAlarmRinging = false;
        this.display.setAttribute('tabindex', '0');
        this.display.contentEditable = false;
        this.display.setAttribute('aria-readonly', 'true');
        this.display.addEventListener('keydown', (e) => {
            if (this.running) {
                e.preventDefault();
                return;
            }
            if (/[0-9]/.test(e.key)) {
                e.preventDefault();
                this.handleInput(e.key);
            } else {
                e.preventDefault();
            }
        });

        this.display.addEventListener('input', (e) => {
            e.preventDefault();
            this.updateDisplayFromSeconds();
        });

        this.display.addEventListener('paste', (e) => e.preventDefault());
        this.display.addEventListener('cut', (e) => e.preventDefault());

        this.updateDisplayFromSeconds();
        this.initAlarm();
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

    start() {
        if (this.remainingTime > 0 && !this.running) {
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
    }

    stop() {
        if (this.running) {
            clearInterval(this.interval);
            this.running = false;
            this.display.classList.remove('running');
        }
        // Stop alarm when pausing
        this.stopAlarm();
    }

    reset() {
        this.stop();
        this.remainingTime = 0;
        this.inputBuffer = '';
        this.stopAlarm();
        this.updateDisplayFromSeconds();
    }

    setTime(seconds) {
        this.remainingTime = seconds;
        this.updateDisplayFromSeconds();
    }

    updateDisplayFromSeconds() {
        const hours = Math.floor(this.remainingTime / 3600);
        const minutes = Math.floor((this.remainingTime % 3600) / 60);
        const seconds = this.remainingTime % 60;
        this.display.innerHTML = `
            <span class="digit hours">${String(hours).padStart(2, '0')}</span><span class="time-segment">:</span>
            <span class="digit minutes">${String(minutes).padStart(2, '0')}</span><span class="time-segment">:</span>
            <span class="digit seconds">${String(seconds).padStart(2, '0')}</span>
        `;
    }

    handleInput(value) {
        if (this.running) return;
        this.inputBuffer = (this.inputBuffer + value).slice(-6);
        const padded = this.inputBuffer.padStart(6, '0');
        let hours = parseInt(padded.slice(0, 2)) || 0;
        let minutes = parseInt(padded.slice(2, 4)) || 0;
        let seconds = parseInt(padded.slice(4, 6)) || 0;
        hours = Math.min(hours, 99);
        minutes = Math.min(minutes, 59);
        seconds = Math.min(seconds, 59);
        this.remainingTime = hours * 3600 + minutes * 60 + seconds;
        this.updateDisplayFromSeconds();
    }
}

export let stopwatch;
export let timer;
export let activeTool = 'stopwatch';

export function initializeTimeTools() {
    const stopwatchDisplay = document.querySelector('.stopwatch .display');
    stopwatch = new Stopwatch(stopwatchDisplay);

    const timerDisplay = document.querySelector('.timer .display');
    timer = new Timer(timerDisplay);

    const hoursEl = timerDisplay.querySelector('.hours');
    const minutesEl = timerDisplay.querySelector('.minutes');
    const secondsEl = timerDisplay.querySelector('.seconds');

    const toggleButtons = document.querySelectorAll('.toggle-btn');
    const startStopBtn = document.querySelector('.controls .start-stop');
    const resetBtn = document.querySelector('.controls .reset');

    function updateUI() {
        const icon = startStopBtn.querySelector('i');
        const isRunning = activeTool === 'stopwatch' ? stopwatch.running : timer.running;
        icon.classList.toggle('fa-play', !isRunning);
        icon.classList.toggle('fa-pause', isRunning);
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
                toggleButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                document.querySelector('.stopwatch').classList.toggle('active', target === 'stopwatch');
                document.querySelector('.timer').classList.toggle('active', target === 'timer');
                if (activeTool === 'stopwatch') {
                    stopwatch.updateDisplay();
                } else {
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
        } else {
            if (timer.running) timer.stop();
            else timer.start();
        }
        updateUI();
    });

    resetBtn.addEventListener('click', () => {
        if (activeTool === 'stopwatch') {
            stopwatch.reset();
        } else {
            timer.reset();
        }
        updateUI();
    });

    document.querySelector('.toggle-btn[data-target="stopwatch"]').classList.add('active');
    document.querySelector('.stopwatch').classList.add('active');
    updateUI();
}