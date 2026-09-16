/**
 * SmartScan Barcode Engine & Hardware Interface
 * Handles:
 * - HTML5 Camera Stream (Universal Laptop Webcam & Mobile Back Camera Support)
 * - Automatic Device Enumeration & Fallback (attempts environment -> user/webcam -> any available device)
 * - Real-time barcode & QR decoding (Html5Qrcode & BarcodeDetector API)
 * - Audio beep synthesizer (Web Audio API) & Haptic feedback
 * - Barcode Image Upload Scanner (scan from photo/screenshot without camera)
 * - Comprehensive camera permission diagnostics
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

    // Web Audio Context for checkout chime
    this.audioCtx = null;
  }

  // Initialize Web Audio API
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

  // Play crisp supermarket checkout beep
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

  // Enumerate cameras and find best match for laptop vs mobile
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

  // Start the camera scanner with multi-tier fallbacks
  async start(containerElementId = this.videoElementId) {
    this.videoElementId = containerElementId;
    this.onStatusChange({ status: 'STARTING', message: 'Connecting to camera...' });

    // Clean up prior instance if any
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

    // Attempt 1: Html5Qrcode with available camera device list
    if (window.Html5Qrcode) {
      try {
        this.html5QrCode = new Html5Qrcode(containerElementId, {
          verbose: false,
          experimentalFeatures: { useBarCodeDetectorIfSupported: true }
        });

        const cameras = await this.getAvailableCameras();

        if (cameras && cameras.length > 0) {
          // On mobile, pick rear camera if available; on laptop, pick default webcam
          let selectedCamera = cameras[0];
          const backCam = cameras.find(c => /back|rear|environment/i.test(c.label));
          if (backCam && this.currentFacingMode === 'environment') {
            selectedCamera = backCam;
          }

          this.activeCameraId = selectedCamera.id;
          await this.html5QrCode.start(
            selectedCamera.id,
            config,
            (text, result) => this.handleSuccessfulScan(text, result),
            () => {}
          );

          this.isScanning = true;
          this.onStatusChange({ status: 'SCANNING', message: `Camera active: ${selectedCamera.label || 'Webcam'}` });
          setTimeout(() => this.captureActiveVideoTrack(), 800);
          return true;
        } else {
          // Try with facingMode: 'user' (Laptop webcam fallback) or 'environment'
          try {
            await this.html5QrCode.start(
              { facingMode: this.currentFacingMode },
              config,
              (text, result) => this.handleSuccessfulScan(text, result),
              () => {}
            );
            this.isScanning = true;
            this.onStatusChange({ status: 'SCANNING', message: 'Camera active' });
            setTimeout(() => this.captureActiveVideoTrack(), 800);
            return true;
          } catch (facingErr) {
            // Retry with facingMode: 'user' for laptop webcam
            console.log('[Camera fallback] Retrying with webcam mode (user)...');
            await this.html5QrCode.start(
              { facingMode: 'user' },
              config,
              (text, result) => this.handleSuccessfulScan(text, result),
              () => {}
            );
            this.currentFacingMode = 'user';
            this.isScanning = true;
            this.onStatusChange({ status: 'SCANNING', message: 'Laptop Webcam Active' });
            setTimeout(() => this.captureActiveVideoTrack(), 800);
            return true;
          }
        }
      } catch (err) {
        console.warn('[Html5Qrcode Start Failed, trying Native Video]:', err);
      }
    }

    // Attempt 2: Native HTML5 getUserMedia Video Stream
    try {
      return await this.startNativeVideo(containerElementId);
    } catch (nativeErr) {
      console.error('[All Camera Strategies Failed]:', nativeErr);
      
      let errorType = 'CAMERA_ACCESS_DENIED';
      let message = 'Laptop camera access was not granted or blocked by browser settings.';

      if (window.location.protocol === 'file:') {
        message = 'Camera access is restricted under file:// protocol. Please click "Start Test Server" or allow camera access in browser site settings.';
      } else if (nativeErr.name === 'NotFoundError') {
        message = 'No webcam or optical camera detected on your laptop.';
      }

      this.onError({
        ok: false,
        type: errorType,
        message,
        originalError: nativeErr
      });
      return false;
    }
  }

  // Native fallback video capture
  async startNativeVideo(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return false;

    container.innerHTML = '';
    const video = document.createElement('video');
    video.id = 'native-scanner-video';
    video.setAttribute('playsinline', 'true');
    video.setAttribute('autoplay', 'true');
    video.setAttribute('muted', 'true');
    video.style.width = '100%';
    video.style.height = '100%';
    video.style.objectFit = 'cover';
    container.appendChild(video);

    // Try laptop webcam friendly constraints
    let stream = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });
    } catch (e) {
      // Simplest constraint
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    }

    this.stream = stream;
    video.srcObject = stream;
    await video.play();
    this.videoTrack = stream.getVideoTracks()[0];
    this.isScanning = true;

    // Barcode detector
    if ('BarcodeDetector' in window) {
      try {
        const barcodeDetector = new BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code']
        });

        const scanLoop = async () => {
          if (!this.isScanning) return;
          try {
            const barcodes = await barcodeDetector.detect(video);
            if (barcodes && barcodes.length > 0) {
              this.handleSuccessfulScan(barcodes[0].rawValue, barcodes[0]);
            }
          } catch (e) {}
          if (this.isScanning) requestAnimationFrame(scanLoop);
        };
        requestAnimationFrame(scanLoop);
      } catch (e) {}
    }

    this.onStatusChange({ status: 'SCANNING', message: 'Laptop Webcam active' });
    return true;
  }

  // Scan directly from an uploaded image file (Desktop / Laptop helper)
  async scanImageFile(file) {
    if (!file) return;
    try {
      this.onStatusChange({ status: 'PROCESSING', message: 'Scanning image barcode...' });
      if (this.html5QrCode) {
        const decodedText = await this.html5QrCode.scanFile(file, true);
        this.handleSuccessfulScan(decodedText);
        return decodedText;
      }
    } catch (err) {
      this.onError({
        ok: false,
        type: 'UNSCANNABLE_IMAGE',
        message: 'Could not detect a clear barcode in the uploaded image. Please try another image or use the Quick Test buttons.'
      });
    }
  }

  captureActiveVideoTrack() {
    try {
      const videoEl = document.querySelector(`#${this.videoElementId} video`);
      if (videoEl && videoEl.srcObject) {
        const tracks = videoEl.srcObject.getVideoTracks();
        if (tracks && tracks.length > 0) {
          this.videoTrack = tracks[0];
        }
      }
    } catch (e) {}
  }

  handleSuccessfulScan(code, rawResult) {
    if (!code) return;
    const now = Date.now();
    if (code === this.lastScannedCode && (now - this.lastScannedTime) < this.scanCooldownMs) {
      return;
    }

    this.lastScannedCode = code;
    this.lastScannedTime = now;

    this.playScanBeep();
    this.onDetected(code.trim(), rawResult);
  }

  async toggleTorch() {
    if (!this.videoTrack) this.captureActiveVideoTrack();
    if (!this.videoTrack) {
      return { supported: false, message: 'Flashlight is only available on physical mobile devices.' };
    }

    try {
      const capabilities = this.videoTrack.getCapabilities ? this.videoTrack.getCapabilities() : {};
      if (!capabilities.torch) {
        return { supported: false, message: 'Flashlight not supported on this laptop webcam.' };
      }

      this.isTorchOn = !this.isTorchOn;
      await this.videoTrack.applyConstraints({ advanced: [{ torch: this.isTorchOn }] });
      return { supported: true, isOn: this.isTorchOn };
    } catch (err) {
      return { supported: false, message: 'Flashlight unavailable.' };
    }
  }

  async flipCamera(containerId = this.videoElementId) {
    this.currentFacingMode = this.currentFacingMode === 'environment' ? 'user' : 'environment';
    await this.start(containerId);
    return this.currentFacingMode;
  }

  async stop() {
    this.isScanning = false;
    this.isTorchOn = false;

    if (this.html5QrCode) {
      try {
        await this.html5QrCode.stop();
      } catch (e) {}
    }

    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    if (this.videoTrack) {
      this.videoTrack.stop();
      this.videoTrack = null;
    }

    this.onStatusChange({ status: 'STOPPED', message: 'Camera idle' });
  }
}

window.SmartBarcodeScanner = SmartBarcodeScanner;
