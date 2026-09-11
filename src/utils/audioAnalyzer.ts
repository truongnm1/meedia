let audioContext: AudioContext | null = null;
let analyserNode: AnalyserNode | null = null;
let gainNode: GainNode | null = null;
let currentVolume = 1.0;
let sourceNode: MediaElementAudioSourceNode | null = null;
let freqDataArray: Uint8Array<ArrayBuffer> | null = null;
let timeDataArray: Uint8Array<ArrayBuffer> | null = null;
let isConnected = false;
let currentAudioElement: HTMLAudioElement | null = null;

export function setMasterVolume(vol: number): void {
  currentVolume = Math.max(0, Math.min(1, vol));
  if (gainNode && audioContext) {
    gainNode.gain.setValueAtTime(currentVolume, audioContext.currentTime);
  }
}

export function getMasterVolume(): number {
  return currentVolume;
}

type ReadyCallback = (source: MediaElementAudioSourceNode, ctx: AudioContext) => void;
const readyListeners: ReadyCallback[] = [];

export function onAudioSourceReady(callback: ReadyCallback): () => void {
  if (sourceNode && audioContext) {
    try {
      callback(sourceNode, audioContext);
    } catch (e) {
      console.warn('onAudioSourceReady immediate callback notice:', e);
    }
  }
  readyListeners.push(callback);
  return () => {
    const idx = readyListeners.indexOf(callback);
    if (idx >= 0) readyListeners.splice(idx, 1);
  };
}

export function initAudioAnalyzer(audioElement: HTMLAudioElement): AnalyserNode | null {
  try {
    currentAudioElement = audioElement;
    if (!audioContext) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioContext = new AudioCtx();
    }

    if (audioContext.state === 'suspended') {
      audioContext.resume().catch(() => {});
    }

    if (!gainNode) {
      gainNode = audioContext.createGain();
      gainNode.gain.setValueAtTime(currentVolume, audioContext.currentTime);
      gainNode.connect(audioContext.destination);
    }

    if (!analyserNode) {
      analyserNode = audioContext.createAnalyser();
      analyserNode.fftSize = 2048; // 1024 distinct frequency bins for high-resolution band separation
      analyserNode.smoothingTimeConstant = 0.75; // Snappy, responsive studio DSP damping
      analyserNode.minDecibels = -85;
      analyserNode.maxDecibels = -18;
      freqDataArray = new Uint8Array(analyserNode.frequencyBinCount);
      timeDataArray = new Uint8Array(analyserNode.fftSize);
    }

    if (!isConnected && audioElement) {
      try {
        sourceNode = audioContext.createMediaElementSource(audioElement);
        sourceNode.connect(analyserNode);
        analyserNode.connect(gainNode);
        isConnected = true;

        readyListeners.forEach((cb) => {
          try {
            cb(sourceNode!, audioContext!);
          } catch (err) {
            console.warn('Audio source listener notice:', err);
          }
        });
      } catch (err) {
        console.warn('createMediaElementSource notice:', err);
      }
    }

    return analyserNode;
  } catch (err) {
    console.warn('AudioAnalyzer setup warning:', err);
    return analyserNode;
  }
}

export function getAudioContext(): AudioContext | null {
  return audioContext;
}

export function getSourceNode(): MediaElementAudioSourceNode | null {
  return sourceNode;
}

export function getAudioElement(): HTMLAudioElement | null {
  return currentAudioElement;
}

export function ensureConnected(): void {
  if (sourceNode && analyserNode && audioContext) {
    try {
      sourceNode.connect(analyserNode);
    } catch {}
    if (gainNode) {
      try {
        analyserNode.connect(gainNode);
      } catch {}
      try {
        gainNode.connect(audioContext.destination);
      } catch {}
    } else {
      try {
        analyserNode.connect(audioContext.destination);
      } catch {}
    }
  }
}

export function resumeAudioContext(): void {
  if (audioContext && audioContext.state === 'suspended') {
    audioContext.resume().catch(() => {});
  }
  ensureConnected();
}

export function getAudioFrequencyData(): Uint8Array | null {
  if (!analyserNode || !freqDataArray) return null;
  analyserNode.getByteFrequencyData(freqDataArray);
  return freqDataArray;
}

export function getAudioTimeDomainData(): Uint8Array | null {
  if (!analyserNode || !timeDataArray) return null;
  analyserNode.getByteTimeDomainData(timeDataArray);
  return timeDataArray;
}

export function getAnalyserNode(): AnalyserNode | null {
  return analyserNode;
}

export function resetAudioAnalyzer(): void {
  if (freqDataArray) {
    freqDataArray.fill(0);
  }
  if (timeDataArray) {
    timeDataArray.fill(128);
  }
}
