# Seat Belt Warning System - Interactive Web Simulator

An interactive, high-fidelity web-based hardware simulator for the **Automotive Seat Belt Safety Warning System**. This project is designed to bridge the gap between embedded hardware development and web-based portfolio demonstrations, offering side-by-side synchronization of AVR C++ firmware and real-time cockpit graphics.

---

## 🚀 Key Features

*   **Interactive Cockpit Panel**: Toggle seat occupancy (Weight Sensor) and seat belt buckling (Latch Sensor) via high-fidelity, responsive SVG visual graphics.
*   **AVR Firmware Synchronization**: Line-by-line syntax-highlighted code editor that dynamically highlights the active lines of C++ code corresponding to the simulator's hardware state machine.
*   **Web Audio PWM Synthesizer**: Emulates a hardware piezo buzzer using the Web Audio API, generating a pulsed square wave mapped to the exact OCR timer values calculated in the AVR registers.
*   **Virtual MCU Serial Monitor**: A live developer console outputting timed diagnostic logs matching the `Serial.println()` streams from the microcontroller.
*   **Configurable Telemetry**: Adjust the warning delay duration (1s to 10s), piezo audio volume, and buzzer warning pitch.
*   **MCU Power Toggle**: Simulates an actual microcontroller hard power cycle, resetting hardware states and clearing memory registers.

---

## ⚙️ Firmware-to-Web Logic Mapping

The simulation behaves exactly like the microcontroller state machine compiled in [seatbeltwarningsystem.cpp](../seatbeltwarningsystem.cpp):

| Embedded Hardware (AVR C++) | Web Simulator Equivalent (JavaScript / DOM) |
| :--- | :--- |
| **INT0 Interrupt (`INT0_vect`)** | Triggers when the **Weight Sensor** toggles (clicking the seat or "Occupy Seat" button). Updates `seat_occupied`. |
| **INT1 Interrupt (`INT1_vect`)** | Triggers when the **Latch Sensor** toggles (clicking the buckle or "Fasten Belt" button). Updates `seat_belt`. |
| **Timer0 CTC Mode (`TIMER0_COMPA_vect`)** | A `setInterval` loop counting in 50ms steps. Triggers when the warning countdown completes (`req_delay = 1`). |
| **Digital Pin 7 (`PORTD & (1 << PD7)`)** | Glowing red LED output card (flashing dynamically during warning alarm active states). |
| **Timer1 PWM (`pwm_on()`)** | Web Audio API Oscillator generating an authentic pulsed square wave at piezo frequency. |
| **Serial Terminal (`Serial.println()`)** | Green-line console printing real-time diagnostic outputs with exact microsecond timestamps. |

---

## 🧮 Hardware PWM Frequency Calculation

The AVR C++ code configures Timer1 in **Clear Timer on Compare Match (CTC) Mode** using `OCR1A` as the top value:
```cpp
void pwm_init() {
    TCCR1B |= (1 << WGM12) | (1 << CS11) | (1 << CS10); // CTC Mode, Prescaler = 64
    OCR1A = 512;
}
```
When `pwm_on()` is called to active the warning chime:
```cpp
void pwm_on() {
    OCR1A = 256; // Top count
    OCR1B = 128; // Toggle duty boundary (50% duty cycle)
}
```
The Timer counts from `0` to `OCR1A` (256) at a rate scaled by the clock prescaler ($N = 64$). 
*   **Clock speed ($f_{clk}$)** = $16\text{ MHz}$ ($16,000,000\text{ Hz}$)
*   **Timer Frequency Formula**:
    $$f = \frac{f_{clk}}{N \cdot (1 + OCR1A)}$$
*   **Calculation**:
    $$f = \frac{16,000,000}{64 \cdot (1 + 256)} = \frac{16,000,000}{64 \cdot 257} \approx 972.76\text{ Hz}$$
*   The software PWM toggles the digital pin via Timer1 interrupts:
    *   `TIMER1_COMPA_vect` sets `PD7` HIGH (on count reset).
    *   `TIMER1_COMPB_vect` clears `PD7` LOW (at count 128).
    *   This creates a perfect 50% duty cycle square wave at **$\approx 973\text{ Hz}$** to drive the piezo buzzer.
*   The web simulator synthesizer emulates this exact physical acoustic frequency!

---

## 🛠️ Technology Stack

*   **Structure**: HTML5 (Semantic elements, inline custom SVGs)
*   **Styling**: Pure CSS3 (Glassmorphism layout, CSS grid, glowing box-shadows, animations, and keyframes)
*   **Logic**: Vanilla JavaScript ES6 (Web Audio API Synthesizer, State Machine synchronizer, event handlers)
*   **Assets**: SVG diagrams and icons

---

## 💻 Running Locally

1. Clone or download this project directory.
2. Navigate into `seat-belt-warning-system-web/` in your terminal.
3. Install dependencies (if not already done):
   ```bash
   npm install
   ```
4. Start the local development server:
   ```bash
   npm run dev
   ```
5. Open the local link (usually `http://localhost:5173`) in your web browser.
   *   *Note: To hear the buzzer sound, make sure to click "Occupy Seat" or "Fasten Belt" to activate the Web Audio Context, which browser security policies require.*

---

## 🌐 Deploying to GitHub Pages

To host this project online for free on your GitHub portfolio:
1. Create a new public repository on GitHub named `seat-belt-warning-system-web`.
2. Initialize git in the `seat-belt-warning-system-web/` directory:
   ```bash
   git init
   git add .
   git commit -m "Initial commit: High-fidelity seat belt warning system web simulator"
   ```
3. Link the repository and push to GitHub:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/seat-belt-warning-system-web.git
   git branch -M main
   git push -u origin main
   ```
4. On GitHub, navigate to **Settings** > **Pages**.
5. Under **Build and deployment**, select **Deploy from a branch**, set the branch to **`main`** (folder `/root`), and click **Save**.
6. Your live site will be ready at `https://YOUR_USERNAME.github.io/seat-belt-warning-system-web/` in under a minute!
