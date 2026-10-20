// Browser voice, in and out.
//
// Text to speech uses the Web Speech API that already ships with the browser.
//
// Speech to text we do entirely ourselves, and there is a good reason. The
// browser's own SpeechRecognition asks Google to turn audio into text. On some
// networks - Brave, VPNs, locked-down offices - that service is blocked and it
// fails with the error "network", so the whole call stops working. Instead we
// open one microphone stream, watch how loud it is to find where the customer's
// sentences start and end, and send each clip to our own backend for Whisper to
// transcribe. It works in every browser, and because we are always watching the
// loudness we can also tell the moment the customer interrupts Aria.

// --- Text to speech: Aria's voice -----------------------------------------

let voices = [];

function loadVoices() {
  voices = window.speechSynthesis?.getVoices() ?? [];
}

if (window.speechSynthesis) {
  // Chrome fills the voice list asynchronously, so read it now and again once
  // the browser tells us the list is ready.
  loadVoices();
  window.speechSynthesis.onvoiceschanged = loadVoices;
}

// Aria is a woman. Every machine has a different voice list and the Web Speech
// API has no gender field, so instead of asking for a voice by name we score
// them all and take the best.
const FEMALE_HINTS = [
  "female",
  "zira",
  "heera",
  "neerja",
  "swara",
  "veena",
  "kalpana",
  "priya",
];

function voiceScore(voice) {
  const name = (voice.name || "").toLowerCase();
  const lang = (voice.lang || "").toLowerCase();

  let score = 0;
  if (FEMALE_HINTS.some((hint) => name.includes(hint))) score += 4; // a woman's voice
  if (lang.startsWith("en-in")) score += 3; // Indian English
  else if (lang.startsWith("en")) score += 1; // any other English
  if (name.includes("natural") || name.includes("online")) score += 1; // nicer, newer voices
  return score;
}

function pickVoice() {
  if (!voices.length) loadVoices();

  let best = null;
  let bestScore = 0;
  for (const voice of voices) {
    const score = voiceScore(voice);
    if (score > bestScore) {
      best = voice;
      bestScore = score;
    }
  }
  return best; // null means "no opinion - let the browser choose"
}

export function speak(text, onEnd) {
  const synth = window.speechSynthesis;
  if (!synth || !text) {
    onEnd?.();
    return;
  }

  synth.cancel(); // never let two replies talk over each other

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-IN";
  utterance.rate = 1;
  utterance.pitch = 1;

  const voice = pickVoice();
  if (voice) utterance.voice = voice;

  utterance.onend = () => onEnd?.();
  utterance.onerror = () => onEnd?.();

  synth.speak(utterance);
}

export function stopSpeaking() {
  window.speechSynthesis?.cancel();
}

// --- Speech to text: one microphone stream that we control ----------------

// How loud a sound must be to count as a voice rather than room noise.
const SPEECH_LEVEL = 0.02;
// This much quiet means the customer has finished their sentence.
const SILENCE_MS = 800;
// A sound shorter than this was a cough, not a sentence.
const MIN_SPEECH_MS = 400;
// While Aria is talking the customer has to clearly speak over her before we
// call it an interruption, so she cannot be cut off by her own voice bouncing
// off the walls.
const BARGE_IN_LEVEL = 1.8;
// How often we measure the microphone.
const TICK_MS = 50;
// How many loud readings mean "this really is a voice".
const LOUD_TICKS_TO_START = 3;
const LOUD_TICKS_TO_BARGE = 4;
// A word starts quietly and then gets louder. If we wait until it is
// unmistakably loud before we start recording, the first syllable is already
// gone - and a lost syllable cannot be recovered: "ORD-102" arrives as "102",
// "kahan" arrives as "han". So we begin recording at the faintest hint of a
// voice, this fraction of the normal threshold, and decide afterwards whether
// it really was one.
const PREROLL_LEVEL = 0.6;
// If the sound has not turned into real speech within this long, it was a
// cough, a chair or a door, and we throw the clip away.
const PREROLL_MS = 500;

const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;

export const micSupported = Boolean(
  window.MediaRecorder &&
    AudioContextClass &&
    navigator.mediaDevices?.getUserMedia,
);

/**
 * Opens the microphone and starts watching it.
 *
 * handlers.onSpeechStart()        - the customer has begun a sentence
 * handlers.onUtterance(blob)      - they finished it; here is the audio
 * handlers.onError(message)       - we could not start listening
 *
 * Returns an object with setMode("off" | "guarded" | "listening") and close().
 */
export async function startMicrophone(handlers) {
  if (!micSupported) {
    handlers.onError?.(
      "This browser cannot record audio. Please use Chrome, Edge or Brave, or type below.",
    );
    return null;
  }

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      // echoCancellation keeps Aria's own voice out of what we capture, which
      // is what makes interrupting her work.
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
  } catch {
    handlers.onError?.(
      "Could not open the microphone. Allow microphone access, then reload the page.",
    );
    return null;
  }

  const context = new AudioContextClass();
  if (context.state === "suspended") await context.resume();

  const analyser = context.createAnalyser();
  analyser.fftSize = 512;
  context.createMediaStreamSource(stream).connect(analyser);

  const samples = new Uint8Array(analyser.fftSize);
  let mode = "off"; // of the three modes, we start switched off
  let floor = 0.01; // the room's background noise, learnt as we go
  let utteranceFrames = 0; // ticks since we started capturing
  let loudFrames = 0; // ...and how many of those were loud enough
  let silenceFrames = 0;
  let confirmed = false; // have we decided this clip really is a voice?
  let recorder = null;
  let chunks = [];

  // How loud the microphone is right now, as a number around 0 to 1.
  function loudness() {
    analyser.getByteTimeDomainData(samples);
    let sum = 0;
    for (const value of samples) {
      const centred = (value - 128) / 128; // the data runs 0..255 around 128
      sum += centred * centred;
    }
    return Math.sqrt(sum / samples.length); // RMS, i.e. loudness
  }

  function beginRecording() {
    chunks = [];
    utteranceFrames = 0;
    loudFrames = 0;
    silenceFrames = 0;
    // Not confirmed yet. Only once loudFrames says so do we tell the app, so
    // a cough cannot interrupt Aria.
    confirmed = false;
    recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.start();
  }

  // The sound never grew into speech: throw the clip away and go back to
  // waiting. Nothing is sent to the backend.
  function discardRecording() {
    const abandoned = recorder;
    recorder = null;
    if (!abandoned) return;
    abandoned.onstop = null;
    abandoned.stop();
    chunks = [];
  }

  function finishRecording() {
    const finished = recorder;
    recorder = null;
    confirmed = false;
    if (!finished) return;

    const longEnough = utteranceFrames * TICK_MS >= MIN_SPEECH_MS;
    finished.onstop = () => {
      if (!longEnough) return; // it was a cough or a door slam
      const blob = new Blob(chunks, { type: finished.mimeType || "audio/webm" });
      if (blob.size > 0) handlers.onUtterance?.(blob);
    };
    finished.stop();
  }

  const timer = setInterval(() => {
    // Nothing to do while we are switched off and not mid-sentence.
    if (mode === "off" && !recorder) return;

    const level = loudness();
    const guarded = mode === "guarded";
    const threshold =
      Math.max(SPEECH_LEVEL, floor * 2) * (guarded ? BARGE_IN_LEVEL : 1);

    if (!recorder) {
      // Waiting for a sentence to begin. We learn the room's noise floor from
      // quiet moments only, and never while Aria is speaking: the microphone
      // hears her too, and if we learnt from that the bar for interrupting her
      // would climb out of reach.
      if (!guarded && level < threshold) floor = floor * 0.9 + level * 0.1;

      if (level >= threshold * PREROLL_LEVEL) beginRecording();
      return;
    }

    // Capturing. Note that we started before we were sure, so the clip so far
    // may still turn out to be nothing.
    utteranceFrames += 1;
    if (level >= threshold) {
      loudFrames += 1;
      silenceFrames = 0;
    } else {
      silenceFrames += 1;
    }

    if (!confirmed) {
      const needed = guarded ? LOUD_TICKS_TO_BARGE : LOUD_TICKS_TO_START;
      if (loudFrames >= needed) {
        // It is a voice. Telling the app is what cuts Aria off mid-sentence.
        confirmed = true;
        handlers.onSpeechStart?.();
      } else if (utteranceFrames * TICK_MS >= PREROLL_MS) {
        discardRecording();
      }
      return;
    }

    // A real sentence: send it once the customer stops talking.
    if (silenceFrames * TICK_MS >= SILENCE_MS) finishRecording();
  }, TICK_MS);

  return {
    // "off" while Aria is thinking or we are already capturing, "guarded"
    // while she is speaking, "listening" the rest of the time.
    setMode(next) {
      mode = next;
      silenceFrames = 0;
    },
    close() {
      clearInterval(timer);
      if (recorder) {
        recorder = null; // dropping it is enough; we do not want the clip
      }
      stream.getTracks().forEach((track) => track.stop()); // mic light off
      context.close();
    },
  };
}
