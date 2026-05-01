let audioCtx: AudioContext | null = null;

// ─── DUOLINGO HOVER CHIME (WEB AUDIO API) ───
export const playDuolingoHoverSound = () => {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    
    // Reuse context to comply with autoplay policy and prevent memory leaks
    if (!audioCtx) {
      audioCtx = new AudioContextClass();
    }
    
    // Resume context if suspended (common browser policy)
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const now = audioCtx.currentTime;

    // Note 1: B5 (approx 987.77 Hz)
    const osc1 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(987.77, now);
    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(0.1, now + 0.02);
    gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
    osc1.connect(gain1);
    gain1.connect(audioCtx.destination);
    osc1.start(now);
    osc1.stop(now + 0.1);

    // Note 2: D#6 (approx 1244.51 Hz)
    const osc2 = audioCtx.createOscillator();
    const gain2 = audioCtx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1244.51, now + 0.1);
    gain2.gain.setValueAtTime(0, now + 0.1);
    gain2.gain.linearRampToValueAtTime(0.1, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
    osc2.connect(gain2);
    gain2.connect(audioCtx.destination);
    osc2.start(now + 0.1);
    osc2.stop(now + 0.4);
  } catch (e) {
    console.warn('Audio playback prevented by browser policy');
  }
};

// ─── PREMIUM SUCCESS CHIME (WEB AUDIO API) ───
// A layered, smooth harmonic sound designed to feel high-end
export const playPremiumSuccessSound = () => {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    
    if (!audioCtx) {
      audioCtx = new AudioContextClass();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const now = audioCtx.currentTime;
    
    const playNote = (freq: number, startTime: number, duration: number, volume: number) => {
      const osc = audioCtx!.createOscillator();
      const gain = audioCtx!.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);
      
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(volume, startTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      
      osc.connect(gain);
      gain.connect(audioCtx!.destination);
      
      osc.start(startTime);
      osc.stop(startTime + duration);
    };

    // A pleasant "G# Major 7" inspired harmonic stack
    // Layer 1: Fundamental (warm)
    playNote(415.30, now, 1.2, 0.15); // G#4
    
    // Layer 2: Perfect Fifth (shimmer)
    playNote(622.25, now + 0.05, 1.0, 0.1); // D#5
    
    // Layer 3: Major Seventh (sophisticated)
    playNote(783.99, now + 0.1, 0.8, 0.08); // G5 (G# Major 7 flavor)
    
    // Layer 4: High sparkle
    playNote(1244.51, now + 0.15, 0.6, 0.05); // D#6
    
  } catch (e) {
    console.warn('Audio playback prevented by browser policy');
  }
};
