export class EngineAudio {
  constructor() {
    this.audioContext = null;
    this.oscillator = null;
    this.gainNode = null;
    this.masterGain = null;
    this.started = false;
  }

  async start() {
    if (this.started) {
      return;
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      return;
    }

    this.audioContext = new AudioContextClass();
    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }

    this.oscillator = this.audioContext.createOscillator();
    this.gainNode = this.audioContext.createGain();
    this.masterGain = this.audioContext.createGain();

    this.oscillator.type = "sawtooth";
    this.oscillator.frequency.value = 90;
    this.gainNode.gain.value = 0.02;
    this.masterGain.gain.value = 0.25;

    this.oscillator.connect(this.gainNode);
    this.gainNode.connect(this.masterGain);
    this.masterGain.connect(this.audioContext.destination);
    this.oscillator.start();
    this.started = true;
  }

  setIntensity(speedRatio, boosting = false) {
    if (!this.started || !this.oscillator || !this.gainNode) {
      return;
    }

    const safeRatio = Number.isFinite(speedRatio) ? Math.max(0, Math.min(1.5, speedRatio)) : 0;
    const targetFreq = 90 + safeRatio * 200 + (boosting ? 50 : 0);
    const targetGain = 0.015 + safeRatio * 0.035 + (boosting ? 0.02 : 0);
    const now = this.audioContext.currentTime;

    this.oscillator.frequency.setTargetAtTime(targetFreq, now, 0.05);
    this.gainNode.gain.setTargetAtTime(targetGain, now, 0.05);
  }

  stop() {
    if (!this.started) {
      return;
    }

    try {
      this.oscillator?.stop();
      this.oscillator?.disconnect();
      this.gainNode?.disconnect();
      this.masterGain?.disconnect();
      this.audioContext?.close();
    } catch (_error) {
      // no-op
    }

    this.audioContext = null;
    this.oscillator = null;
    this.gainNode = null;
    this.masterGain = null;
    this.started = false;
  }
}
