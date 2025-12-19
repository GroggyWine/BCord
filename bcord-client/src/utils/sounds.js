// BCord Sound Effects using Web Audio API

let audioContext = null;

function getAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  // Resume if suspended (browser autoplay policy)
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }
  return audioContext;
}

// Helper to create an oscillator with envelope
function playTone(frequency, duration, type = 'sine', volume = 0.3, delay = 0) {
  const ctx = getAudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  
  osc.type = type;
  osc.frequency.value = frequency;
  osc.connect(gain);
  gain.connect(ctx.destination);
  
  const startTime = ctx.currentTime + delay;
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(volume, startTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  
  osc.start(startTime);
  osc.stop(startTime + duration);
}

// 1. INVITATION CHIME - sparkly notification bell
export function playInviteChime() {
  try {
    // Three ascending tones for a pleasant chime
    playTone(880, 0.15, 'sine', 0.2, 0);       // A5
    playTone(1108.73, 0.15, 'sine', 0.2, 0.1); // C#6
    playTone(1318.51, 0.25, 'sine', 0.25, 0.2); // E6
  } catch (e) {
    console.warn('Sound error:', e);
  }
}

// 2. LOGIN SOUND - B#/C guitar chord (C major chord with harmonics)
export function playLoginChord() {
  try {
    // C major chord frequencies (C is enharmonic to B#)
    const frequencies = [
      261.63,  // C4
      329.63,  // E4
      392.00,  // G4
      523.25,  // C5
    ];
    
    frequencies.forEach((freq, i) => {
      // Main tone
      playTone(freq, 1.5, 'triangle', 0.15, i * 0.02);
      // Harmonic for guitar-like richness
      playTone(freq * 2, 1.0, 'sine', 0.05, i * 0.02);
    });
  } catch (e) {
    console.warn('Sound error:', e);
  }
}

// 3. DM DOORBELL - classic ding-dong
export function playDoorbellDingDong() {
  try {
    // Ding (higher pitch)
    playTone(659.25, 0.4, 'sine', 0.3, 0);      // E5
    playTone(1318.51, 0.3, 'sine', 0.1, 0);     // E6 harmonic
    
    // Dong (lower pitch)
    playTone(523.25, 0.5, 'sine', 0.3, 0.35);   // C5
    playTone(1046.50, 0.4, 'sine', 0.1, 0.35);  // C6 harmonic
  } catch (e) {
    console.warn('Sound error:', e);
  }
}

// 4. MESSAGE SENT - subtle whoosh/click
export function playMessageSent() {
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.1);
    
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  } catch (e) {
    console.warn('Sound error:', e);
  }
}

// 5. NEW MESSAGE - subtle ping for channel messages
export function playNewMessage() {
  try {
    playTone(1000, 0.1, 'sine', 0.15, 0);
  } catch (e) {
    console.warn('Sound error:', e);
  }
}

// 6. ERROR/WARNING - low buzz
export function playError() {
  try {
    playTone(200, 0.15, 'square', 0.1, 0);
    playTone(180, 0.15, 'square', 0.1, 0.1);
  } catch (e) {
    console.warn('Sound error:', e);
  }
}

// 7. USER ONLINE - gentle pop
export function playUserOnline() {
  try {
    playTone(800, 0.08, 'sine', 0.1, 0);
    playTone(1200, 0.1, 'sine', 0.15, 0.05);
  } catch (e) {
    console.warn('Sound error:', e);
  }
}

// 8. MENTION - attention-grabbing double ping
export function playMention() {
  try {
    playTone(880, 0.1, 'sine', 0.2, 0);
    playTone(880, 0.1, 'sine', 0.2, 0.15);
    playTone(1100, 0.15, 'sine', 0.25, 0.3);
  } catch (e) {
    console.warn('Sound error:', e);
  }
}

// 9. SERVER JOINED - triumphant little fanfare
export function playServerJoined() {
  try {
    playTone(523.25, 0.15, 'triangle', 0.2, 0);     // C5
    playTone(659.25, 0.15, 'triangle', 0.2, 0.12);  // E5
    playTone(783.99, 0.3, 'triangle', 0.25, 0.24);  // G5
  } catch (e) {
    console.warn('Sound error:', e);
  }
}

// 10. LOGOUT - descending tone
export function playLogout() {
  try {
    playTone(600, 0.2, 'sine', 0.15, 0);
    playTone(400, 0.3, 'sine', 0.1, 0.15);
  } catch (e) {
    console.warn('Sound error:', e);
  }
}

export default {
  playInviteChime,
  playLoginChord,
  playDoorbellDingDong,
  playMessageSent,
  playNewMessage,
  playError,
  playUserOnline,
  playMention,
  playServerJoined,
  playLogout
};
