/* ==========================================================================
   SEAT BELT WARNING SYSTEM - SIMULATOR CONTROLLER (script.js)
   ========================================================================== */

// Embedded Register States
let mcuPowered = true;
let seatOccupied = false;
let seatBelt = false;
let reqDelay = false;
let count = 0;

// Simulation Configuration
let warningDelay = 5; // In seconds (default 5s)
let timerInterval = null;

// Audio System (Web Audio API Piezo Synth)
let audioCtx = null;
let oscNode = null;
let gainNode = null;
let audioPulseTimer = null;
let isAudioPlaying = false;

// DOM Elements
const mcuPowerBtn = document.getElementById('mcuPowerBtn');
const mcuPowerIndicator = document.getElementById('mcuPowerIndicator');
const cabinVisualizer = document.getElementById('cabinVisualizer');

const seatBtn = document.getElementById('seatBtn');
const seatBtnState = document.getElementById('seatBtnState');
const beltBtn = document.getElementById('beltBtn');
const beltBtnState = document.getElementById('beltBtnState');

const seatClickZone = document.getElementById('seatClickZone');
const buckleClickZone = document.getElementById('buckleClickZone');

const visualLed = document.getElementById('visualLed');
const ledStatusLbl = document.getElementById('ledStatusLbl');
const timerRingFill = document.getElementById('timerRingFill');
const countdownText = document.getElementById('countdownText');
const buzzerStatusLbl = document.getElementById('buzzerStatusLbl');
const buzzerMeter = document.getElementById('buzzerMeter');

const serialTerminal = document.getElementById('serialTerminal');
const serialClearBtn = document.getElementById('serialClearBtn');
const serialAutoscroll = document.getElementById('serialAutoscroll');

// Settings Elements
const delayRange = document.getElementById('delayRange');
const delayValText = document.getElementById('delayValText');
const volumeRange = document.getElementById('volumeRange');
const volumeValText = document.getElementById('volumeValText');
const buzzerFrequency = document.getElementById('buzzerFrequency');
const freqValText = document.getElementById('freqValText');

// Progress Ring Circumference (r = 38, 2 * pi * r = 238.76)
const ringCircumference = 238.76;
timerRingFill.style.strokeDasharray = `${ringCircumference} ${ringCircumference}`;
timerRingFill.style.strokeDashoffset = ringCircumference;

/* ==========================================================================
   POWER CYCLE HANDLERS
   ========================================================================== */

mcuPowerBtn.addEventListener('change', (e) => {
    mcuPowered = e.target.checked;
    if (mcuPowered) {
        document.body.classList.remove('mcu-powered-off');
        mcuPowerIndicator.classList.remove('off');
        logSerial('SYSTEM', 'Power supply connected (5V). MCU booted.', 'system-msg');
        resetSystem();
    } else {
        logSerial('SYSTEM', 'Power supply disconnected. MCU offline.', 'system-msg');
        stopWarning();
        clearInterval(timerInterval);
        resetStates();
        updateHardwareVisuals();
        document.body.classList.add('mcu-powered-off');
        mcuPowerIndicator.classList.add('off');
    }
});

function resetStates() {
    seatOccupied = false;
    seatBelt = false;
    reqDelay = false;
    count = 0;
}

function resetSystem() {
    stopWarning();
    clearInterval(timerInterval);
    resetStates();
    updateHardwareVisuals();
    setTimerProgress(0);
    syncCSourceViewer('idle');
    logSerial('SYSTEM', 'Registers reset. Waiting for sensor logical change (INT0/INT1).', 'system-msg');
}

/* ==========================================================================
   INTERRUPT SENSOR TRIGGERS (INT0 & INT1)
   ========================================================================== */

// INT0 weight sensor handlers
seatBtn.addEventListener('click', triggerINT0);
seatClickZone.addEventListener('click', triggerINT0);

function triggerINT0() {
    if (!mcuPowered) return;
    initAudioContext();

    seatOccupied = !seatOccupied;
    
    // Animate C++ ISR execution line highlight
    flashCodeRow('row-11'); // main sei()
    
    if (seatOccupied) {
        logSerial('INT0 ISR', 'Logical Change: Pin 2 HIGH (Weight Detected)', 'info-line');
        cabinVisualizer.classList.add('occupied');
        beltBtn.removeAttribute('disabled');
        
        // Start countdown (AVR: timer0_init())
        startTimer0();
    } else {
        logSerial('INT0 ISR', 'Logical Change: Pin 2 LOW (Seat Empty)', 'info-line');
        logSerial('SERIAL', 'In else', 'system-msg');
        cabinVisualizer.classList.remove('occupied');
        cabinVisualizer.classList.remove('buckled');
        
        seatBelt = false;
        beltBtn.setAttribute('disabled', 'true');
        
        stopWarning();
    }
    updateHardwareVisuals();
}

// INT1 seatbelt buckle handlers
beltBtn.addEventListener('click', triggerINT1);
buckleClickZone.addEventListener('click', triggerINT1);

function triggerINT1() {
    if (!mcuPowered || !seatOccupied) return;
    initAudioContext();

    seatBelt = !seatBelt;
    
    // Animate C++ ISR execution line highlight
    flashCodeRow('row-13'); // init_interrupts()

    if (seatBelt) {
        logSerial('INT1 ISR', 'Logical Change: Pin 3 HIGH (Buckle Latched)', 'info-line');
        logSerial('SERIAL', 'seat belt on', 'success-line');
        cabinVisualizer.classList.add('buckled');
        stopWarning();
    } else {
        logSerial('INT1 ISR', 'Logical Change: Pin 3 LOW (Buckle Unlatched)', 'warn-line');
        cabinVisualizer.classList.remove('buckled');
        startTimer0();
    }
    updateHardwareVisuals();
}

/* ==========================================================================
   TIMER0 SUBSYSTEM (CTC Mode Countdown)
   ========================================================================== */

function startTimer0() {
    clearInterval(timerInterval);
    reqDelay = false;
    count = 0;
    
    logSerial('SERIAL', ' seat occupied', 'system-msg');
    
    // 50ms ticks. 5 seconds = 100 ticks.
    const thresholdTicks = warningDelay * 20;

    timerInterval = setInterval(() => {
        if (!mcuPowered) {
            clearInterval(timerInterval);
            return;
        }

        count++;
        
        // Calculate percentages
        const percent = (count / thresholdTicks) * 100;
        setTimerProgress(percent);
        
        // Update timer text
        const elapsed = ((count * 50) / 1000).toFixed(1);
        countdownText.innerText = `${elapsed}s`;

        // Sync Code editor highlights
        syncCSourceViewer('timer-counting');

        if (count >= thresholdTicks) {
            clearInterval(timerInterval);
            reqDelay = true;
            
            logSerial('Timer0 Match A', `Compare Match reached. req_delay = 1 (${warningDelay}s)`, 'warn-line');
            
            if (seatOccupied && !seatBelt) {
                turnOnAlarm();
            }
        }
    }, 50);
}

function setTimerProgress(percent) {
    const offset = ringCircumference - (percent / 100) * ringCircumference;
    timerRingFill.style.strokeDashoffset = offset;
    
    if (percent >= 100) {
        timerRingFill.style.stroke = 'var(--danger)';
    } else if (percent > 0) {
        timerRingFill.style.stroke = 'var(--warning)';
    } else {
        timerRingFill.style.stroke = 'var(--primary)';
    }
}

/* ==========================================================================
   ALARM HARDWARE PWM EMULATION (Timer1 PWM & PD7 Pin)
   ========================================================================== */

function turnOnAlarm() {
    if (!mcuPowered) return;
    
    logSerial('SERIAL', 'buzzer ON', 'alarm-line');
    
    // Update dashboard gauges
    visualLed.parentElement.classList.add('led-active');
    ledStatusLbl.innerText = 'LED HIGH (5V)';
    ledStatusLbl.style.color = 'var(--danger)';
    
    buzzerMeter.classList.add('buzzer-active');
    buzzerStatusLbl.innerText = `${freqValText.innerText} ACTIVE`;
    buzzerStatusLbl.style.color = 'var(--warning)';

    // Play synthesized piezo chime
    startPiezoSynth();
    
    // Highlight warning code branch
    syncCSourceViewer('alarm-sounding');
}

function stopWarning() {
    // Turn off outputs
    visualLed.parentElement.classList.remove('led-active');
    ledStatusLbl.innerText = 'LED OFF';
    ledStatusLbl.style.color = '';
    
    buzzerMeter.classList.remove('buzzer-active');
    buzzerStatusLbl.innerText = 'SILENT';
    buzzerStatusLbl.style.color = '';
    
    // Stop timers
    clearInterval(timerInterval);
    setTimerProgress(0);
    countdownText.innerText = '0.0s';
    count = 0;
    reqDelay = false;
    
    // Mute synthesizer
    stopPiezoSynth();
    
    // Sync Code highlights
    if (mcuPowered) {
        if (seatOccupied && seatBelt) {
            syncCSourceViewer('safety-buckled');
        } else {
            syncCSourceViewer('idle');
        }
    } else {
        clearCodeAnnotations();
    }
}

function initAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
}

function startPiezoSynth() {
    if (isAudioPlaying || !audioCtx) return;
    isAudioPlaying = true;
    
    const volume = volumeRange.value / 100;
    const toneVal = buzzerFrequency.value;
    
    oscNode = audioCtx.createOscillator();
    gainNode = audioCtx.createGain();
    
    // Configure oscillator to square wave to match microcontroller digital pin switching
    oscNode.type = 'square';
    
    if (toneVal === 'dual') {
        oscNode.frequency.setValueAtTime(2000, audioCtx.currentTime);
    } else {
        oscNode.frequency.setValueAtTime(parseInt(toneVal), audioCtx.currentTime);
    }
    
    gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
    
    oscNode.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    oscNode.start();
    
    let isBeep = false;
    
    function pulseAlert() {
        if (!isAudioPlaying) return;
        isBeep = !isBeep;
        const now = audioCtx.currentTime;
        
        if (isBeep) {
            gainNode.gain.cancelScheduledValues(now);
            gainNode.gain.linearRampToValueAtTime(volume * 0.6, now + 0.04);
            
            if (toneVal === 'dual') {
                oscNode.frequency.setValueAtTime(2200, now);
            }
        } else {
            gainNode.gain.cancelScheduledValues(now);
            gainNode.gain.linearRampToValueAtTime(0, now + 0.12);
            
            if (toneVal === 'dual') {
                oscNode.frequency.setValueAtTime(1700, now);
            }
        }
        
        audioPulseTimer = setTimeout(pulseAlert, 320);
    }
    pulseAlert();
}

function stopPiezoSynth() {
    isAudioPlaying = false;
    clearTimeout(audioPulseTimer);
    
    if (oscNode) {
        try {
            oscNode.stop();
            oscNode.disconnect();
        } catch(e) {}
        oscNode = null;
    }
    if (gainNode) {
        try {
            gainNode.disconnect();
        } catch(e) {}
        gainNode = null;
    }
}

/* ==========================================================================
   DYNAMIC C++ CODE VIEW ALIGNMENT & EXECUTION ARROWS
   ========================================================================== */

function clearCodeAnnotations() {
    // Remove highlighted lines
    const rows = document.querySelectorAll('.code-row');
    rows.forEach(r => {
        r.classList.remove('highlight-success', 'highlight-timer', 'highlight-alarm');
    });
    
    // Remove arrow pointers
    const ptrs = document.querySelectorAll('.pointer-slot');
    ptrs.forEach(p => {
        p.className = 'pointer-slot';
    });
}

function flashCodeRow(rowId) {
    const row = document.getElementById(rowId);
    if (!row) return;
    
    row.style.backgroundColor = 'rgba(255, 255, 255, 0.15)';
    setTimeout(() => {
        row.style.backgroundColor = '';
    }, 350);
}

function setExecutionArrow(lineIndex, classType = 'active-arrow') {
    const slot = document.getElementById(`ptr-${lineIndex}`);
    if (slot) {
        slot.className = `pointer-slot ${classType}`;
    }
}

function syncCSourceViewer(state) {
    clearCodeAnnotations();
    
    switch(state) {
        case 'idle':
            // Highlighting idle polling state
            document.getElementById('row-16').classList.add('highlight-success'); // check seat
            document.getElementById('row-28').classList.add('highlight-success'); // else block
            document.getElementById('row-29').classList.add('highlight-success'); // LED off
            document.getElementById('row-30').classList.add('highlight-success'); // timer off
            document.getElementById('row-31').classList.add('highlight-success'); // pwm off
            
            setExecutionArrow(16, 'active-arrow');
            break;
            
        case 'timer-counting':
            // Highlighting active countdown timing
            document.getElementById('row-16').classList.add('highlight-timer'); // occupied check
            document.getElementById('row-17').classList.add('highlight-timer'); // buckle check
            document.getElementById('row-18').classList.add('highlight-timer'); // timer0_init()
            document.getElementById('row-19').classList.add('highlight-timer'); // req_delay check
            
            setExecutionArrow(18, 'active-arrow-timer');
            break;
            
        case 'alarm-sounding':
            // Highlighting alarm active lines
            document.getElementById('row-19').classList.add('highlight-alarm'); // req_delay check
            document.getElementById('row-20').classList.add('highlight-alarm'); // LED ON
            document.getElementById('row-21').classList.add('highlight-alarm'); // pwm_on()
            
            setExecutionArrow(21, 'active-arrow-alarm');
            break;
            
        case 'safety-buckled':
            // Highlighting safe buckled logic
            document.getElementById('row-16').classList.add('highlight-success'); // check seat
            document.getElementById('row-17').classList.add('highlight-success'); // check belt
            document.getElementById('row-24').classList.add('highlight-success'); // LED OFF
            document.getElementById('row-25').classList.add('highlight-success'); // timer_off
            document.getElementById('row-26').classList.add('highlight-success'); // pwm_off
            
            setExecutionArrow(24, 'active-arrow');
            break;
    }
}

/* ==========================================================================
   SETTINGS & SLIDER TRIGGERS
   ========================================================================== */

delayRange.addEventListener('input', (e) => {
    warningDelay = parseInt(e.target.value);
    delayValText.innerText = `${warningDelay} seconds`;
    
    logSerial('CONFIG', `Timer0 Match count adjusted to threshold: ${warningDelay * 20} ticks (${warningDelay}s)`, 'system-msg');
    
    // Hot reload countdown timer with new limit if ticking
    if (seatOccupied && !seatBelt && !reqDelay) {
        startTimer0();
    }
});

volumeRange.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    volumeValText.innerText = `${val}%`;
    
    if (isAudioPlaying && gainNode) {
        const now = audioCtx.currentTime;
        gainNode.gain.setValueAtTime((val / 100) * 0.6, now);
    }
});

buzzerFrequency.addEventListener('change', (e) => {
    const val = e.target.value;
    if (val === 'dual') {
        freqValText.innerText = 'Dual-Tone';
    } else {
        freqValText.innerText = `${(parseInt(val)/1000).toFixed(1)} kHz`;
    }
    
    logSerial('CONFIG', `Timer1 PWM frequency configured to drive ${val === 'dual' ? 'Dual-Tone' : val + ' Hz'} piezo buzzer`, 'system-msg');
    
    if (isAudioPlaying && oscNode && val !== 'dual') {
        const now = audioCtx.currentTime;
        oscNode.frequency.setValueAtTime(parseInt(val), now);
    }
});

/* ==========================================================================
   UI STATUS STATE UPDATER
   ========================================================================== */

function updateHardwareVisuals() {
    // Update Button Labels and Indicators
    if (seatOccupied) {
        seatBtnState.className = 'indicator-dot occupied';
        seatBtn.classList.remove('btn-secondary');
        seatBtn.classList.add('btn-primary');
    } else {
        seatBtnState.className = 'indicator-dot empty';
        seatBtn.classList.remove('btn-primary');
        seatBtn.classList.add('btn-secondary');
    }
    
    if (seatBelt) {
        beltBtnState.className = 'indicator-dot buckled';
        beltBtn.classList.remove('btn-primary');
        beltBtn.classList.add('btn-secondary');
        beltBtn.querySelector('.lbl').innerText = 'Release Belt (INT1)';
    } else {
        beltBtnState.className = 'indicator-dot unbuckled';
        beltBtn.classList.remove('btn-secondary');
        beltBtn.classList.add('btn-primary');
        beltBtn.querySelector('.lbl').innerText = 'Fasten Belt (INT1)';
    }
    
    // Update Infotainment Status Banner
    const systemState = document.getElementById('systemStateText');
    if (!seatOccupied) {
        systemState.innerText = 'PARKED';
        systemState.className = 'status-indicator';
    } else if (seatOccupied && !seatBelt) {
        systemState.innerText = 'BELT ALERT';
        systemState.className = 'status-indicator text-red';
    } else {
        systemState.innerText = 'SAFE DRIVE';
        systemState.className = 'status-indicator text-green';
    }
}

/* ==========================================================================
   UART SERIAL LOGGER
   ========================================================================== */

function logSerial(source, message, styleClass = '') {
    const now = new Date();
    const time = now.toTimeString().split(' ')[0];
    const ms = String(now.getMilliseconds()).padStart(3, '0');
    
    const line = document.createElement('div');
    line.className = `terminal-line ${styleClass}`;
    line.innerText = `[${time}.${ms}] [${source}] ${message}`;
    
    serialTerminal.appendChild(line);
    
    while (serialTerminal.children.length > 80) {
        serialTerminal.removeChild(serialTerminal.firstChild);
    }
    
    if (serialAutoscroll.checked) {
        serialTerminal.scrollTop = serialTerminal.scrollHeight;
    }
}

serialClearBtn.addEventListener('click', () => {
    serialTerminal.innerHTML = '<div class="terminal-line system-msg">[SYSTEM] Logs cleared.</div>';
});

// Boot Setup
window.onload = () => {
    resetSystem();
};
