export class AudioProcessor {
  constructor() {
    this.audioContext = null;
    this.analyser = null;
    this.dataArray = null;
    this.source = null;
    this.isReady = false;

    // Частотные диапазоны (нормализованные 0.0 - 1.0)
    this.bands = {
      sub: 0,
      bass: 0,
      mid: 0,
      high: 0
    };

    // Сглаживание
    this.smoothFactor = 0.85;
  }

  async init(audioElement = null) {
    // Не блокируем повторную инициализацию флагом isReady, так как нам может потребоваться сменить источник
    // Но проверяем, не нужно ли просто возобновить контекст
    if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 2048;
        this.analyser.smoothingTimeConstant = 0.8;

        const bufferLength = this.analyser.frequencyBinCount;
        this.dataArray = new Uint8Array(bufferLength);
    }

    if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
    }

    // Если у нас уже был источник, отключаем его перед сменой (если это stream, останавливаем треки)
    if (this.source) {
        this.source.disconnect();
        // Примечание: для MediaStreamSource хорошим тоном было бы остановить треки микрофона,
        // но для простоты опустим, чтобы не усложнять логику хранения стрима.
    }

    try {
      if (audioElement) {
          // Режим плеера (MP3)
          // Важно: createMediaElementSource можно вызвать только ОДИН раз для элемента.
          // Проверяем, не сохранили ли мы его ранее (или кто-то другой)

          if (audioElement._visualizerSource) {
              this.source = audioElement._visualizerSource;
          } else {
              this.source = this.audioContext.createMediaElementSource(audioElement);
              audioElement._visualizerSource = this.source;
          }

          this.source.connect(this.analyser);
          this.source.connect(this.audioContext.destination);
      } else {
          // Режим микрофона
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          this.source = this.audioContext.createMediaStreamSource(stream);
          this.source.connect(this.analyser);
      }

      this.isReady = true;

    } catch (error) {
      console.error("Audio access denied or error:", error);
    }
  }

  update() {
    if (!this.isReady) return;

    this.analyser.getByteFrequencyData(this.dataArray);

    // Debug: Check if we are receiving any audio data
    if (Math.random() < 0.01) { // Log ~1% of frames
        let sum = 0;
        for(let i=0; i<100; i++) sum += this.dataArray[i];
        if (sum > 0) {
            console.log("[AudioProcessor] Audio data detected, sample sum:", sum);
        } else {
            console.log("[AudioProcessor] Silence / No Data");
        }
    }

    // Разделение на частотные диапазоны
    // FFT size 2048 -> frequencyBinCount 1024.
    // Sample rate ~44100Hz -> Каждый бин ~21.5Hz

    // Sub-bass: 0-60Hz (~0-3 bins)
    // Bass: 60-250Hz (~3-12 bins)
    // Mid: 250-2000Hz (~12-93 bins)
    // High: 2000-20000Hz (~93-1024 bins)

    let subSum = 0, bassSum = 0, midSum = 0, highSum = 0;

    // Оптимизированные циклы без создания лишних массивов
    for(let i = 0; i < 3; i++) subSum += this.dataArray[i];
    for(let i = 3; i < 12; i++) bassSum += this.dataArray[i];
    for(let i = 12; i < 93; i++) midSum += this.dataArray[i];
    for(let i = 93; i < 1024; i++) highSum += this.dataArray[i];

    // Нормализация и сглаживание
    const targetSub = subSum / (3 * 255);
    const targetBass = bassSum / (9 * 255);
    const targetMid = midSum / (81 * 255);
    const targetHigh = highSum / (931 * 255);

    this.bands.sub += (targetSub - this.bands.sub) * (1 - this.smoothFactor);
    this.bands.bass += (targetBass - this.bands.bass) * (1 - this.smoothFactor);
    this.bands.mid += (targetMid - this.bands.mid) * (1 - this.smoothFactor);
    this.bands.high += (targetHigh - this.bands.high) * (1 - this.smoothFactor);
  }

  getUniforms() {
    return [
      this.bands.sub,
      this.bands.bass,
      this.bands.mid,
      this.bands.high
    ];
  }
}
