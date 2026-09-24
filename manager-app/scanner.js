/**
 * SmartScan Security Gate QR Scanner Engine
 * Fast & High Accuracy QR / Barcode Decoding for Guard Exit Gates
 */

class SmartGuardScanner {
  constructor(options = {}) {
    this.videoElementId = options.videoElementId || 'guard-reader-container';
    this.onDetected = options.onDetected || (() => {});
    this.onError = options.onError || (() => {});
    this.onStatusChange = options.onStatusChange || (() => {});

    this.html5QrCode = null;
    this.isScanning = false;
    this.lastScannedCode = null;
    this.lastScannedTime = 0;
    this.scanCooldownMs = 2500;
  }

  playBeep(type = 'success') {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      if (type === 'success') {
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.22);
      } else {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, ctx.currentTime);
        osc.frequency.setValueAtTime(180, ctx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.4, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.36);
      }
    } catch (e) {}
  }

  async start() {
    this.onStatusChange({ status: 'STARTING', message: 'Connecting to gate camera...' });
    await this.stop();

    if (!window.Html5Qrcode) {
      this.onStatusChange({ status: 'ERROR', message: 'Barcode engine not loaded.' });
      return;
    }

    try {
      this.html5QrCode = new Html5Qrcode(this.videoElementId, { verbose: false });
      const cameras = await Html5Qrcode.getCameras().catch(() => []);

      const config = {
        fps: 15,
        qrbox: { width: 220, height: 220 }
      };

      if (cameras && cameras.length > 0) {
        await this.html5QrCode.start(
          cameras[0].id,
          config,
          (decodedText) => this.handleDecoded(decodedText),
          () => {}
        );
      } else {
        await this.html5QrCode.start(
          { facingMode: 'user' },
          config,
          (decodedText) => this.handleDecoded(decodedText),
          () => {}
        );
      }

      this.isScanning = true;
      this.onStatusChange({ status: 'ACTIVE', message: 'Exit Gate Camera Ready' });
    } catch (err) {
      this.onStatusChange({ status: 'FALLBACK', message: 'Webcam not found. Use manual token check or simulated scan.' });
      this.onError(err);
    }
  }

  handleDecoded(decodedText) {
    const now = Date.now();
    if (this.lastScannedCode === decodedText && (now - this.lastScannedTime) < this.scanCooldownMs) {
      return;
    }
    this.lastScannedCode = decodedText;
    this.lastScannedTime = now;

    if (this.onDetected) {
      this.onDetected(decodedText.trim());
    }
  }

  async stop() {
    if (this.html5QrCode && this.isScanning) {
      try {
        await this.html5QrCode.stop();
      } catch (e) {}
    }
    this.isScanning = false;
  }
}

window.SmartGuardScanner = SmartGuardScanner;
