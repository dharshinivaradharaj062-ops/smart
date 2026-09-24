/**
 * SmartScan Barcode Scanner Engine (Shopper Mobile App)
 * Supports:
 * - HTML5 Camera Stream (Webcam / Back Camera)
 * - Laser aim reticle overlay & Torch flashlight
 * - Audio beep synthesizer & Haptic feedback
 * - File / Image photo barcode decoder
 */

class SmartBarcodeScanner {
  constructor(options = {}) {
    this.videoElementId = options.videoElementId || 'reader-container';
    this.onDetected = options.onDetected || (() => {});
    this.onError = options.onError || (() => {});
    this.onStatusChange = options.onStatusChange || (() => {});

    this.stream = null;
    this.videoTrack = null;
    this.html5QrCode = null;
    this.isScanning = false;
    this.isTorchOn = false;
    this.currentFacingMode = 'environment';
    this.availableCameras = [];
    this.activeCameraId = null;
    this.lastScannedCode = null;
    this.lastScannedTime = 0;
    this.scanCooldownMs = 1800;

    this.audioCtx = null;
  }

  initAudio() {
    try {
      if (!this.audioCtx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
          this.audioCtx = new AudioContext();
        }
      }
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
    } catch (e) {}
  }

  playScanBeep() {
    try {
      this.initAudio();
      if (!this.audioCtx) return;

      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1760, this.audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(2200, this.audioCtx.currentTime + 0.08);

      gain.gain.setValueAtTime(0.3, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.15);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start();
      osc.stop(this.audioCtx.currentTime + 0.16);
    } catch (e) {}

    if ('vibrate' in navigator) {
      try {
        navigator.vibrate([60, 40, 60]);
      } catch (err) {}
    }
  }

  async getAvailableCameras() {
    try {
      if (window.Html5Qrcode && Html5Qrcode.getCameras) {
        const cameras = await Html5Qrcode.getCameras();
        if (cameras && cameras.length > 0) {
          this.availableCameras = cameras;
          return cameras;
        }
      }
    } catch (e) {
      console.warn('[Camera Enum Warning]:', e.message);
    }

    try {
      if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(d => d.kind === 'videoinput');
        this.availableCameras = videoDevices.map((d, i) => ({
          id: d.deviceId,
          label: d.label || `Camera ${i + 1}`
        }));
        return this.availableCameras;
      }
    } catch (e) {}

    return [];
  }

  async start(containerElementId = this.videoElementId) {
    this.videoElementId = containerElementId;
    this.onStatusChange({ status: 'STARTING', message: 'Connecting to camera...' });

    await this.stop();

    const config = {
      fps: 15,
      qrbox: (viewfinderWidth, viewfinderHeight) => {
        const minDim = Math.min(viewfinderWidth, viewfinderHeight);
        return {
          width: Math.floor(minDim * 0.90),
          height: Math.floor(minDim * 0.60)
        };
      },
      aspectRatio: 1.0,
      formatsToSupport: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
    };

    if (window.Html5Qrcode) {
      try {
        this.html5QrCode = new Html5Qrcode(containerElementId, {
          verbose: false,
          experimentalFeatures: { useBarCodeDetectorIfSupported: true }
        });

        const cameras = await this.getAvailableCameras();

        if (cameras && cameras.length > 0) {
          let selectedCamera = cameras[0];
          const backCam = cameras.find(c => /back|rear|environment/i.test(c.label));
          if (backCam && this.currentFacingMode === 'environment') {
            selectedCamera = backCam;
          }

          this.activeCameraId = selectedCamera.id;
          await this.html5QrCode.start(
            selectedCamera.id,
            config,
            (decodedText, decodedResult) => this.handleScanSuccess(decodedText, decodedResult),
            (errorMessage) => {}
          );

          this.isScanning = true;
          this.onStatusChange({ status: 'ACTIVE', message: `Camera active: ${selectedCamera.label || 'Webcam'}` });
          this.captureVideoTrack();
          return;
        }
      } catch (err) {
        console.warn('[Html5Qrcode Direct Start Failed, falling back to facingMode]:', err.message);
      }

      // Fallback 1: Start with facingMode
      try {
        await this.html5QrCode.start(
          { facingMode: this.currentFacingMode },
          config,
          (decodedText, decodedResult) => this.handleScanSuccess(decodedText, decodedResult),
          (errorMessage) => {}
        );

        this.isScanning = true;
        this.onStatusChange({ status: 'ACTIVE', message: 'Camera active & scanning' });
        this.captureVideoTrack();
        return;
      } catch (fallbackErr) {
        console.warn('[Html5Qrcode facingMode fallback failed, trying user camera]:', fallbackErr.message);
      }

      // Fallback 2: Start with user facing mode (laptop webcam)
      try {
        await this.html5QrCode.start(
          { facingMode: 'user' },
          config,
          (decodedText, decodedResult) => this.handleScanSuccess(decodedText, decodedResult),
          (errorMessage) => {}
        );

        this.isScanning = true;
        this.currentFacingMode = 'user';
        this.onStatusChange({ status: 'ACTIVE', message: 'Webcam connected' });
        this.captureVideoTrack();
        return;
      } catch (userCamErr) {
        console.error('[All Html5Qrcode Start attempts failed]:', userCamErr.message);
        this.onError({ type: 'CAMERA_PERMISSION_OR_NOT_FOUND', error: userCamErr });
      }
    }

    this.onStatusChange({
      status: 'FALLBACK_READY',
      message: 'Camera unavailable. Use manual barcode entry or Quick Test chips.'
    });
  }

  captureVideoTrack() {
    try {
      const videoEl = document.querySelector(`#${this.videoElementId} video`);
      if (videoEl && videoEl.srcObject) {
        this.stream = videoEl.srcObject;
        const tracks = this.stream.getVideoTracks();
        if (tracks.length > 0) {
          this.videoTrack = tracks[0];
        }
      }
    } catch (e) {}
  }

  handleScanSuccess(decodedText, decodedResult) {
    const now = Date.now();
    if (this.lastScannedCode === decodedText && (now - this.lastScannedTime) < this.scanCooldownMs) {
      return;
    }

    this.lastScannedCode = decodedText;
    this.lastScannedTime = now;

    this.playScanBeep();
    this.triggerLaserFlash();

    if (this.onDetected) {
      this.onDetected(decodedText.trim(), decodedResult);
    }
  }

  triggerLaserFlash() {
    const laserBox = document.querySelector('.scanner-laser-box');
    if (laserBox) {
      laserBox.classList.add('scan-success-anim');
      setTimeout(() => {
        laserBox.classList.remove('scan-success-anim');
      }, 400);
    }
  }

  async scanFile(file) {
    if (!file) return;
    this.onStatusChange({ status: 'PROCESSING_IMAGE', message: 'Decoding barcode from photo...' });

    try {
      if (!this.html5QrCode) {
        this.html5QrCode = new Html5Qrcode(this.videoElementId, { verbose: false });
      }

      const decodedText = await this.html5QrCode.scanFile(file, true);
      this.handleScanSuccess(decodedText, { fileScan: true });
      this.onStatusChange({ status: 'ACTIVE', message: 'Barcode successfully read from photo!' });
    } catch (err) {
      this.onStatusChange({ status: 'ACTIVE', message: 'No barcode recognized in uploaded photo.' });
      this.onError({ type: 'FILE_SCAN_FAILED', error: err });
    }
  }

  async toggleTorch() {
    if (!this.videoTrack) return false;
    const capabilities = this.videoTrack.getCapabilities ? this.videoTrack.getCapabilities() : {};

    if (capabilities.torch) {
      try {
        this.isTorchOn = !this.isTorchOn;
        await this.videoTrack.applyConstraints({
          advanced: [{ torch: this.isTorchOn }]
        });
        return this.isTorchOn;
      } catch (err) {
        console.warn('Torch toggle failed:', err.message);
      }
    }
    return false;
  }

  async flipCamera() {
    this.currentFacingMode = this.currentFacingMode === 'environment' ? 'user' : 'environment';
    await this.start();
    return this.currentFacingMode;
  }

  async stop() {
    if (this.html5QrCode && this.isScanning) {
      try {
        await this.html5QrCode.stop();
      } catch (err) {}
    }
    this.isScanning = false;
    this.videoTrack = null;
    this.stream = null;
  }
}

window.SmartBarcodeScanner = SmartBarcodeScanner;
