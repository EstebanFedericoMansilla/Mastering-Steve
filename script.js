document.addEventListener('DOMContentLoaded', () => {
    // --- 0. PRO MODE / URL CLEANER (Logic to unlock & hide key) ---
    // --- 0. PRO MODE / URL CLEANER (Logic to unlock & hide key) ---
    const urlParams = new URLSearchParams(window.location.search);
    const SECRET_KEY = 'cliente_vip_febrero_2026'; // Tu "Contraseña" maestra

    // Check URL param OR LocalStorage
    const hasUrlAccess = urlParams.get('access') === SECRET_KEY;
    const hasStoredAccess = localStorage.getItem('steve_pro_membership') === SECRET_KEY;

    if (hasUrlAccess || hasStoredAccess) {
        // 1. Activate PRO Mode
        document.body.classList.add('full-access');

        // 1.5 Save to Memory (Persistence)
        if (hasUrlAccess) {
            localStorage.setItem('steve_pro_membership', SECRET_KEY);
            // Security: Clean URL
            window.history.replaceState({}, document.title, window.location.pathname);
            // Notify first time
            setTimeout(() => alert('¡Pago confirmado! Modo PRO desbloqueado y guardado en este navegador.'), 500);
        }

        // 2. UI Updates for PRO mode
        const logoTitle = document.querySelector('.logo h1');
        if (logoTitle) logoTitle.innerHTML = 'MASTERING<span class="highlight">STEVE</span> <span style="font-size: 0.5em; color: #4ade80; vertical-align: super;">PRO</span>';

        const btnBuy = document.getElementById('btn-buy');
        if (btnBuy) btnBuy.style.display = 'none';

        const btnExport = document.getElementById('btn-export');
        if (btnExport) btnExport.textContent = 'EXPORT FULL MASTER (WAV)';
    }

    // --- Manual Code Entry (For "Already have a code") ---
    // --- Manual Code Entry (Smart Parser) ---
    window.enterProCode = function () {
        let input = prompt("Pega aquí el Link final que te dio Mercado Pago (o tu código):");
        if (!input) return;

        // Smart cleanup: Si pegan el link entero, extraemos solo el código
        if (input.includes('access=')) {
            const match = input.match(/access=([^&]*)/);
            if (match && match[1]) {
                input = match[1];
            }
        }

        if (input.trim() === SECRET_KEY) {
            localStorage.setItem('steve_pro_membership', SECRET_KEY);
            alert("✅ Dispositivo Validado. ¡Acceso PRO activado!");
            location.reload();
        } else {
            alert("❌ Código no válido. Asegúrate de copiar el link final después del pago.");
        }
    };

    // --- Audio Context & Nodes ---
    let audioCtx;
    let sourceNode;
    let masterGain;
    let audioBuffer;
    let isPlaying = false;
    let startTime = 0;
    let pauseTime = 0;

    // Nodes
    let subLowFilter, subMidFilter, subHighFilter;
    let addLowFilter, addMidFilter, addHighFilter;
    let compressor;
    let saturation;
    let limiter;
    let analyser;

    // UI Elements
    const fileInput = document.getElementById('audio-upload');
    const btnLoad = document.getElementById('btn-load');
    const btnPlay = document.getElementById('btn-play');
    const btnExport = document.getElementById('btn-export');
    const btnSavePreset = document.getElementById('btn-save-preset');
    const btnBuy = document.getElementById('btn-buy');
    const paymentModal = document.getElementById('payment-modal');
    const closeModal = document.querySelector('.close-modal');
    const meterL = document.getElementById('master-out-l');
    const meterR = document.getElementById('master-out-r');
    const grVisual = document.getElementById('gr-visual');

    // Funciones expuestas para que el wizard pueda comprobar/abrir selector de audio
    window.isAudioLoaded = function () {
        return !!audioBuffer;
    };

    window.openFilePicker = function () {
        // abre el input file para cargar audio
        try { fileInput.click(); } catch (err) { console.error('openFilePicker error', err); }
    };

    // --- Payment Modal Logic ---
    btnBuy.addEventListener('click', () => {
        paymentModal.style.display = 'block';
    });

    closeModal.addEventListener('click', () => {
        paymentModal.style.display = 'none';
    });

    window.addEventListener('click', (e) => {
        if (e.target === paymentModal) {
            paymentModal.style.display = 'none';
        }
    });

    // --- Save Preset ---
    btnSavePreset.addEventListener('click', () => {
        const preset = {
            target_platform: document.getElementById('target-select').value,
            subtractive_eq: {
                low_cut: document.getElementById('sub-low-freq').value,
                mid_dip: document.getElementById('sub-mid-gain').value,
                high_cut: document.getElementById('sub-high-freq').value
            },
            additive_eq: {
                low_boost: document.getElementById('add-low-gain').value,
                presence: document.getElementById('add-mid-gain').value,
                air: document.getElementById('add-high-gain').value
            },
            compression: {
                threshold: document.getElementById('comp-thresh').value,
                ratio: document.getElementById('comp-ratio').value,
                makeup: document.getElementById('comp-makeup').value
            },
            saturation: {
                drive: document.getElementById('sat-drive').value,
                type: document.querySelector('.switch-btn.active').dataset.val
            },
            limiter: {
                ceiling: document.getElementById('lim-ceiling').value,
                gain: document.getElementById('lim-gain').value
            }
        };

        const blob = new Blob([JSON.stringify(preset, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'mastering_preset.json';
        a.click();
        URL.revokeObjectURL(url);
    });

    // --- Genre Presets Logic ---
    const genreSelect = document.getElementById('genre-select');
    // Genre Presets Object Definitions...
    const genrePresets = {
        // ... (keeping existing presets)
        rock: {
            subtractive_eq: { low_cut: 40, mid_dip: -2, high_cut: 19000 },
            additive_eq: { low_boost: 3, presence: 2, air: 2 },
            compression: { threshold: -18, ratio: 4, makeup: 3 },
            saturation: { drive: 30, type: 'tube' },
            limiter: { ceiling: -0.2, gain: 2 }
        },
        pop: {
            subtractive_eq: { low_cut: 30, mid_dip: -1, high_cut: 20000 },
            additive_eq: { low_boost: 2, presence: 3, air: 4 },
            compression: { threshold: -20, ratio: 2.5, makeup: 2 },
            saturation: { drive: 15, type: 'tape' },
            limiter: { ceiling: -0.1, gain: 3 }
        },
        country: {
            subtractive_eq: { low_cut: 45, mid_dip: -1.5, high_cut: 18000 },
            additive_eq: { low_boost: 2, presence: 3.5, air: 1.5 },
            compression: { threshold: -15, ratio: 3, makeup: 2 },
            saturation: { drive: 20, type: 'tube' },
            limiter: { ceiling: -0.5, gain: 2 }
        },
        reggaeton: {
            subtractive_eq: { low_cut: 25, mid_dip: 0, high_cut: 18500 },
            additive_eq: { low_boost: 5, presence: 1, air: 2 },
            compression: { threshold: -22, ratio: 3.5, makeup: 3 },
            saturation: { drive: 40, type: 'tape' },
            limiter: { ceiling: -0.1, gain: 4 }
        },
        classical: {
            subtractive_eq: { low_cut: 20, mid_dip: 0, high_cut: 20000 },
            additive_eq: { low_boost: 0, presence: 1, air: 1 },
            compression: { threshold: -10, ratio: 1.5, makeup: 1 },
            saturation: { drive: 0, type: 'tube' },
            limiter: { ceiling: -0.5, gain: 0.5 }
        },
        youtube: { // Clean voice focused
            subtractive_eq: { low_cut: 90, mid_dip: -2, high_cut: 16000 },
            additive_eq: { low_boost: 1, presence: 4, air: 1 },
            compression: { threshold: -24, ratio: 4, makeup: 4 },
            saturation: { drive: 10, type: 'tape' },
            limiter: { ceiling: -1.0, gain: 3 }
        }
    };

    // Hacer accesible el objeto de presets al wizard y otras utilidades externas
    window.genrePresets = genrePresets;

    const presetUploadInput = document.getElementById('preset-upload-input');
    const btnLoadPreset = document.getElementById('btn-load-preset');

    // Handle File Upload for Custom Preset
    presetUploadInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const p = JSON.parse(event.target.result);

                // 1. Safe mapping: Check properties before assigning
                if (p.target_platform) {
                    document.getElementById('target-select').value = p.target_platform;
                }
                if (p.subtractive_eq) {
                    document.getElementById('sub-low-freq').value = p.subtractive_eq.low_cut;
                    document.getElementById('sub-mid-gain').value = p.subtractive_eq.mid_dip;
                    document.getElementById('sub-high-freq').value = p.subtractive_eq.high_cut;
                }
                if (p.additive_eq) {
                    document.getElementById('add-low-gain').value = p.additive_eq.low_boost;
                    document.getElementById('add-mid-gain').value = p.additive_eq.presence;
                    document.getElementById('add-high-gain').value = p.additive_eq.air;
                }
                if (p.compression) {
                    document.getElementById('comp-thresh').value = p.compression.threshold;
                    document.getElementById('comp-ratio').value = p.compression.ratio;
                    document.getElementById('comp-makeup').value = p.compression.makeup;
                }
                if (p.saturation) {
                    document.getElementById('sat-drive').value = p.saturation.drive;
                    const satType = p.saturation.type;
                    document.querySelectorAll('.switch-btn').forEach(btn => {
                        if (btn.dataset.val === satType) btn.classList.add('active');
                        else btn.classList.remove('active');
                    });
                }
                if (p.limiter) {
                    document.getElementById('lim-ceiling').value = p.limiter.ceiling;
                    document.getElementById('lim-gain').value = p.limiter.gain;
                }

                // 2. Update all visual numbers
                document.querySelectorAll('input[type="range"]').forEach(input => {
                    updateValueDisplay(input);
                });

                // 3. Update Audio Engine
                if (audioCtx) updateAudioParams();

                // 4. Save to Auto-Save
                saveSettings();

                alert('¡Preset cargado con éxito!');
            } catch (err) {
                console.error(err);
                alert('Error al leer el archivo de preset. Asegúrate de que sea un .json válido.');
            } finally {
                // Reset input to allow reloading same file
                e.target.value = '';
            }
        };
        reader.readAsText(file);
    });

    // Connect Button to Input
    btnLoadPreset.addEventListener('click', () => presetUploadInput.click());

    genreSelect.addEventListener('change', (e) => {
        const genre = e.target.value;

        // Custom Preset Upload Logic
        if (genre === 'upload') {
            presetUploadInput.click();
            e.target.value = 'default'; // Reset select
            return;
        }

        if (genre === 'default' || !genrePresets[genre]) return;

        const p = genrePresets[genre];

        // Apply values to DOM
        document.getElementById('sub-low-freq').value = p.subtractive_eq.low_cut;
        document.getElementById('sub-mid-gain').value = p.subtractive_eq.mid_dip;
        document.getElementById('sub-high-freq').value = p.subtractive_eq.high_cut;

        document.getElementById('add-low-gain').value = p.additive_eq.low_boost;
        document.getElementById('add-mid-gain').value = p.additive_eq.presence;
        document.getElementById('add-high-gain').value = p.additive_eq.air;

        document.getElementById('comp-thresh').value = p.compression.threshold;
        document.getElementById('comp-ratio').value = p.compression.ratio;
        document.getElementById('comp-makeup').value = p.compression.makeup;

        document.getElementById('sat-drive').value = p.saturation.drive;
        // Update Saturation Type UI
        const satType = p.saturation.type;
        document.querySelectorAll('.switch-btn').forEach(btn => {
            if (btn.dataset.val === satType) btn.classList.add('active');
            else btn.classList.remove('active');
        });

        document.getElementById('lim-ceiling').value = p.limiter.ceiling;
        document.getElementById('lim-gain').value = p.limiter.gain;

        // Update Displays
        document.querySelectorAll('input[type="range"]').forEach(input => {
            updateValueDisplay(input);
        });

        // Update Audio Engine
        if (audioCtx) updateAudioParams();

        // genreSelect.value = 'default'; 
    });

    // --- Target Platform Logic ---
    // --- Target Platform Logic (Smart Gain Staging) ---
    const targetSelect = document.getElementById('target-select');
    targetSelect.addEventListener('change', (e) => {
        const target = e.target.value;
        const limCeiling = document.getElementById('lim-ceiling');
        const limGain = document.getElementById('lim-gain');
        const compThresh = document.getElementById('comp-thresh');

        // Valores estimados basados en una mezcla promedio (-18 LUFS entrada)
        if (target === 'default') {
            // "Volver a la normalidad" -> Reset a valores seguros por defecto
            limCeiling.value = -0.1;
            limGain.value = 0;
            // No tocamos compThresh aquí para respetar si el usuario ya comprimió a su gusto

        } else if (target === 'spotify' || target === 'youtube') {
            // Target: -14 LUFS (Estándar Streaming)
            // Ceiling: -1.0 dB (True Peak Safe)
            // Gain: Moderada para preservar dinámica
            limCeiling.value = -1.0;
            limGain.value = 4.0; // +4dB boost aprox

        } else if (target === 'apple') {
            // Target: -16 LUFS (Más dinámico)
            limCeiling.value = -1.0;
            limGain.value = 2.5; // +2.5dB boost suave

        } else if (target === 'cd') {
            // Target: -9 LUFS (Club / Muy fuerte)
            // Ceiling: -0.1 dB (Max volume)
            // Gain: Agresiva
            limCeiling.value = -0.1;
            limGain.value = 9.0; // +9dB boost agresivo

            // Empujar el compresor también
            if (parseFloat(compThresh.value) > -15) compThresh.value = -20;
        }

        updateValueDisplay(limCeiling);
        updateValueDisplay(limGain);
        updateValueDisplay(compThresh);
        if (audioCtx) updateAudioParams();

        // Guardar cambios
        saveSettings();
    });

    // --- 1. Initialization ---
    // Load Settings from LocalStorage if available
    loadSettings();

    btnLoad.addEventListener('click', () => fileInput.click());

    // ... (rest of fileInput listener)

    // --- Auto-Save & Load Logic ---
    function saveSettings() {
        const settings = {
            targetPlatform: document.getElementById('target-select').value,
            subLow: document.getElementById('sub-low-freq').value,
            subMid: document.getElementById('sub-mid-gain').value,
            subHigh: document.getElementById('sub-high-freq').value,
            addLow: document.getElementById('add-low-gain').value,
            addMid: document.getElementById('add-mid-gain').value,
            addHigh: document.getElementById('add-high-gain').value,
            compThresh: document.getElementById('comp-thresh').value,
            compRatio: document.getElementById('comp-ratio').value,
            compMakeup: document.getElementById('comp-makeup').value,
            satDrive: document.getElementById('sat-drive').value,
            satType: document.querySelector('.switch-btn.active').dataset.val,
            limCeiling: document.getElementById('lim-ceiling').value,
            limGain: document.getElementById('lim-gain').value
        };
        localStorage.setItem('masteringSteveSettings', JSON.stringify(settings));
    }

    function loadSettings() {
        const saved = localStorage.getItem('masteringSteveSettings');
        if (!saved) return;

        try {
            const s = JSON.parse(saved);
            if (s.targetPlatform) document.getElementById('target-select').value = s.targetPlatform;

            if (s.subLow) document.getElementById('sub-low-freq').value = s.subLow;
            if (s.subMid) document.getElementById('sub-mid-gain').value = s.subMid;
            if (s.subHigh) document.getElementById('sub-high-freq').value = s.subHigh;

            if (s.addLow) document.getElementById('add-low-gain').value = s.addLow;
            if (s.addMid) document.getElementById('add-mid-gain').value = s.addMid;
            if (s.addHigh) document.getElementById('add-high-gain').value = s.addHigh;

            if (s.compThresh) document.getElementById('comp-thresh').value = s.compThresh;
            if (s.compRatio) document.getElementById('comp-ratio').value = s.compRatio;
            if (s.compMakeup) document.getElementById('comp-makeup').value = s.compMakeup;

            if (s.satDrive) document.getElementById('sat-drive').value = s.satDrive;

            if (s.satType) {
                document.querySelectorAll('.switch-btn').forEach(btn => {
                    if (btn.dataset.val === s.satType) btn.classList.add('active');
                    else btn.classList.remove('active');
                });
            }

            if (s.limCeiling) document.getElementById('lim-ceiling').value = s.limCeiling;
            if (s.limGain) document.getElementById('lim-gain').value = s.limGain;

            // Update UI Displays
            document.querySelectorAll('input[type="range"]').forEach(input => {
                updateValueDisplay(input);
            });

        } catch (e) { console.error('Error loading settings', e); }
    }

    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Si hay una fuente previa reproduciéndose, la detenemos y reiniciamos estado
        if (sourceNode) {
            try { sourceNode.stop(); } catch (err) { /* ignore */ }
            try { sourceNode.disconnect(); } catch (err) { /* ignore */ }
            sourceNode = null;
        }
        isPlaying = false;
        pauseTime = 0;
        btnPlay.textContent = 'PLAY';

        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }

        btnLoad.textContent = 'LOADING...';
        btnLoad.disabled = true;

        try {
            const arrayBuffer = await file.arrayBuffer();
            audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

            setupAudioGraph();

            btnLoad.textContent = 'LOAD TRACK';
            btnLoad.disabled = false;
            btnPlay.disabled = false;
            btnExport.disabled = false;
            btnSavePreset.disabled = false;
            btnPlay.textContent = 'PLAY';
            pauseTime = 0;

            // Reiniciar el wizard si existe para que re-analice el audio nuevo
            if (window.resetWizard) {
                window.resetWizard();
            }
        } catch (err) {
            console.error(err);
            alert('Error loading audio file.');
            btnLoad.textContent = 'LOAD TRACK';
            btnLoad.disabled = false;
        }
    });

    function setupAudioGraph() {
        // Create Nodes
        subLowFilter = audioCtx.createBiquadFilter();
        subLowFilter.type = 'highpass';

        subMidFilter = audioCtx.createBiquadFilter();
        subMidFilter.type = 'peaking';

        subHighFilter = audioCtx.createBiquadFilter();
        subHighFilter.type = 'lowpass';

        addLowFilter = audioCtx.createBiquadFilter();
        addLowFilter.type = 'lowshelf';

        addMidFilter = audioCtx.createBiquadFilter();
        addMidFilter.type = 'peaking';

        addHighFilter = audioCtx.createBiquadFilter();
        addHighFilter.type = 'highshelf';

        compressor = audioCtx.createDynamicsCompressor();

        saturation = audioCtx.createWaveShaper();
        makeDistortionCurve(0);

        limiter = audioCtx.createDynamicsCompressor();
        limiter.ratio.value = 20;
        limiter.attack.value = 0.001;

        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;

        masterGain = audioCtx.createGain();

        updateAudioParams();
    }

    function connectGraph(source, destinationCtx) {
        source.connect(subLowFilter);
        subLowFilter.connect(subMidFilter);
        subMidFilter.connect(subHighFilter);

        subHighFilter.connect(addLowFilter);
        addLowFilter.connect(addMidFilter);
        addMidFilter.connect(addHighFilter);

        addHighFilter.connect(compressor);
        compressor.connect(saturation);
        saturation.connect(limiter);

        limiter.connect(masterGain);
        masterGain.connect(analyser);

        if (destinationCtx) {
            analyser.connect(destinationCtx.destination);
        } else {
            analyser.connect(audioCtx.destination);
        }
    }

    function updateAudioParams() {
        if (!subLowFilter) return;

        subLowFilter.frequency.value = document.getElementById('sub-low-freq').value;
        subMidFilter.gain.value = document.getElementById('sub-mid-gain').value;
        subMidFilter.frequency.value = 500;
        subHighFilter.frequency.value = document.getElementById('sub-high-freq').value;

        addLowFilter.gain.value = document.getElementById('add-low-gain').value;
        addLowFilter.frequency.value = 100;
        addMidFilter.gain.value = document.getElementById('add-mid-gain').value;
        addMidFilter.frequency.value = 2500;
        addHighFilter.gain.value = document.getElementById('add-high-gain').value;
        addHighFilter.frequency.value = 10000;

        compressor.threshold.value = document.getElementById('comp-thresh').value;
        compressor.ratio.value = document.getElementById('comp-ratio').value;

        const drive = document.getElementById('sat-drive').value;
        makeDistortionCurve(drive);

        limiter.threshold.value = document.getElementById('lim-ceiling').value;

        const limGain = parseFloat(document.getElementById('lim-gain').value);
        const compMakeup = parseFloat(document.getElementById('comp-makeup').value);
        const totalGainDb = limGain + compMakeup;
        masterGain.gain.value = Math.pow(10, totalGainDb / 20);

        // Auto-save on change
        saveSettings();
    }

    // Exponer función para que otros módulos (ej. wizard.js) puedan forzar actualización
    window.updateAudioParams = updateAudioParams;

    function makeDistortionCurve(amount) {
        const k = typeof amount === 'number' ? amount : 0;
        const n_samples = 44100;
        const curve = new Float32Array(n_samples);
        const deg = Math.PI / 180;

        for (let i = 0; i < n_samples; ++i) {
            const x = (i * 2) / n_samples - 1;
            curve[i] = (3 + k) * x * 20 * deg / (Math.PI + k * Math.abs(x));
        }
        if (saturation) saturation.curve = curve;
    }

    // --- 2. Playback Control ---
    btnPlay.addEventListener('click', () => {
        if (!audioBuffer) return;

        if (isPlaying) {
            sourceNode.stop();
            pauseTime = audioCtx.currentTime - startTime;
            isPlaying = false;
            btnPlay.textContent = 'PLAY';
        } else {
            if (audioCtx.state === 'suspended') audioCtx.resume();

            sourceNode = audioCtx.createBufferSource();
            sourceNode.buffer = audioBuffer;

            connectGraph(sourceNode);

            sourceNode.start(0, pauseTime % audioBuffer.duration);
            startTime = audioCtx.currentTime - pauseTime;

            isPlaying = true;
            btnPlay.textContent = 'PAUSE';

            sourceNode.onended = () => {
                if (isPlaying) {
                    isPlaying = false;
                    btnPlay.textContent = 'PLAY';
                    pauseTime = 0;
                }
            };
        }
    });

    // --- 3. Export DEMO (50% length) ---
    btnExport.addEventListener('click', async () => {
        if (!audioBuffer) return;

        btnExport.textContent = 'RENDERING...';
        btnExport.disabled = true;

        // Calculate length: Check if full access is enabled
        const isFullVersion = document.body.classList.contains('full-access');
        const demoLength = isFullVersion ? audioBuffer.length : Math.min(audioBuffer.length, audioBuffer.sampleRate * 60);

        const offlineCtx = new OfflineAudioContext(
            2,
            demoLength,
            audioBuffer.sampleRate
        );

        const offSource = offlineCtx.createBufferSource();
        offSource.buffer = audioBuffer;

        const offSubLow = offlineCtx.createBiquadFilter();
        offSubLow.type = 'highpass';
        offSubLow.frequency.value = subLowFilter.frequency.value;

        const offSubMid = offlineCtx.createBiquadFilter();
        offSubMid.type = 'peaking';
        offSubMid.gain.value = subMidFilter.gain.value;
        offSubMid.frequency.value = 500;

        const offSubHigh = offlineCtx.createBiquadFilter();
        offSubHigh.type = 'lowpass';
        offSubHigh.frequency.value = subHighFilter.frequency.value;

        const offAddLow = offlineCtx.createBiquadFilter();
        offAddLow.type = 'lowshelf';
        offAddLow.gain.value = addLowFilter.gain.value;
        offAddLow.frequency.value = 100;

        const offAddMid = offlineCtx.createBiquadFilter();
        offAddMid.type = 'peaking';
        offAddMid.gain.value = addMidFilter.gain.value;
        offAddMid.frequency.value = 2500;

        const offAddHigh = offlineCtx.createBiquadFilter();
        offAddHigh.type = 'highshelf';
        offAddHigh.gain.value = addHighFilter.gain.value;
        offAddHigh.frequency.value = 10000;

        const offComp = offlineCtx.createDynamicsCompressor();
        offComp.threshold.value = compressor.threshold.value;
        offComp.ratio.value = compressor.ratio.value;

        const offSat = offlineCtx.createWaveShaper();
        offSat.curve = saturation.curve;

        const offLim = offlineCtx.createDynamicsCompressor();
        offLim.ratio.value = 20;
        offLim.attack.value = 0.001;
        offLim.threshold.value = limiter.threshold.value;

        const offMaster = offlineCtx.createGain();
        offMaster.gain.value = masterGain.gain.value;

        offSource.connect(offSubLow);
        offSubLow.connect(offSubMid);
        offSubMid.connect(offSubHigh);
        offSubHigh.connect(offAddLow);
        offAddLow.connect(offAddMid);
        offAddMid.connect(offAddHigh);
        offAddHigh.connect(offComp);
        offComp.connect(offSat);
        offSat.connect(offLim);
        offLim.connect(offMaster);
        offMaster.connect(offlineCtx.destination);

        offSource.start();

        const renderedBuffer = await offlineCtx.startRendering();

        const wavBlob = bufferToWave(renderedBuffer, renderedBuffer.length);
        const url = URL.createObjectURL(wavBlob);

        const a = document.createElement('a');
        a.href = url;
        a.download = isFullVersion ? 'mastered_full_track.wav' : 'mastered_demo_60_Segundos.wav';
        a.click();

        btnExport.textContent = isFullVersion ? 'EXPORT FULL MASTER (WAV)' : 'EXPORT DEMO (60 Segundos)';
        btnExport.disabled = false;
    });

    // --- Helper: AudioBuffer to WAV ---
    function bufferToWave(abuffer, len) {
        // Limit length if not full version
        const isFullVersion = document.body.classList.contains('full-access');
        const maxLen = isFullVersion ? len : Math.min(len, abuffer.sampleRate * 60);
        let numOfChan = abuffer.numberOfChannels,
            length = maxLen * numOfChan * 2 + 44,
            buffer = new ArrayBuffer(length),
            view = new DataView(buffer),
            channels = [], i, sample,
            offset = 0,
            pos = 0;

        setUint32(0x46464952);
        setUint32(length - 8);
        setUint32(0x45564157);

        setUint32(0x20746d66);
        setUint32(16);
        setUint16(1);
        setUint16(numOfChan);
        setUint32(abuffer.sampleRate);
        setUint32(abuffer.sampleRate * 2 * numOfChan);
        setUint16(numOfChan * 2);
        setUint16(16);

        setUint32(0x61746164);
        setUint32(length - pos - 4);

        for (i = 0; i < abuffer.numberOfChannels; i++)
            channels.push(abuffer.getChannelData(i));

        while (pos < length) {
            for (i = 0; i < numOfChan; i++) {
                sample = Math.max(-1, Math.min(1, channels[i][offset]));
                sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
                view.setInt16(pos, sample, true);
                pos += 2;
            }
            offset++
        }

        return new Blob([buffer], { type: "audio/wav" });

        function setUint16(data) {
            view.setUint16(pos, data, true);
            pos += 2;
        }

        function setUint32(data) {
            view.setUint32(pos, data, true);
            pos += 4;
        }
    }

    // --- 4. UI Updates & Bypass Logic ---
    const inputs = document.querySelectorAll('input[type="range"]');
    inputs.forEach(input => {
        input.addEventListener('input', (e) => {
            updateValueDisplay(e.target);
            if (audioCtx) updateAudioParams();
        });
    });

    function updateValueDisplay(input) {
        const display = input.parentElement.querySelector('.value-display');
        if (!display) return;
        let value = input.value;
        const id = input.id;
        if (id.includes('freq')) {
            value = value >= 1000 ? (value / 1000).toFixed(1) + ' kHz' : value + ' Hz';
        } else if (id.includes('gain') || id.includes('thresh') || id.includes('ceiling') || id.includes('makeup')) {
            value = (value > 0 ? '+' : '') + value + ' dB';
        } else if (id.includes('ratio')) {
            value = value + ':1';
        } else if (id.includes('drive')) {
            value = value + '%';
        }
        display.textContent = value;
    }

    // Exponer updateValueDisplay para uso externo (wizard)
    window.updateValueDisplay = updateValueDisplay;

    // Aplicar preset por género reutilizando los presets ya definidos
    window.applyPresetByGenre = function (genre) {
        if (!genre) return;
        const key = genre.toLowerCase();
        const p = window.genrePresets && window.genrePresets[key];
        if (!p) return;

        document.getElementById('sub-low-freq').value = p.subtractive_eq.low_cut;
        document.getElementById('sub-mid-gain').value = p.subtractive_eq.mid_dip;
        document.getElementById('sub-high-freq').value = p.subtractive_eq.high_cut;

        document.getElementById('add-low-gain').value = p.additive_eq.low_boost;
        document.getElementById('add-mid-gain').value = p.additive_eq.presence;
        document.getElementById('add-high-gain').value = p.additive_eq.air;

        document.getElementById('comp-thresh').value = p.compression.threshold;
        document.getElementById('comp-ratio').value = p.compression.ratio;
        document.getElementById('comp-makeup').value = p.compression.makeup;

        document.getElementById('sat-drive').value = p.saturation.drive;
        // Update Saturation Type UI
        const satType = p.saturation.type;
        document.querySelectorAll('.switch-btn').forEach(btn => {
            if (btn.dataset.val === satType) btn.classList.add('active');
            else btn.classList.remove('active');
        });

        document.getElementById('lim-ceiling').value = p.limiter.ceiling;
        document.getElementById('lim-gain').value = p.limiter.gain;

        // Actualizar displays
        document.querySelectorAll('input[type="range"]').forEach(input => {
            window.updateValueDisplay(input);
        });

        // Aplicar al motor de audio si ya existe
        if (audioCtx) window.updateAudioParams();
    };

    // Bypass Buttons
    const powerBtns = document.querySelectorAll('.power-btn');
    powerBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            btn.classList.toggle('active');
            const module = btn.closest('.module');

            if (btn.classList.contains('active')) {
                module.classList.remove('disabled');
                updateBypassedState(module, false);
            } else {
                module.classList.add('disabled');
                updateBypassedState(module, true);
            }
        });
    });

    function updateBypassedState(module, isBypassed) {
        if (!audioCtx) return;
        const id = module.id;

        if (isBypassed) {
            if (id === 'subtractive-eq') {
                subLowFilter.frequency.value = 10;
                subMidFilter.gain.value = 0;
                subHighFilter.frequency.value = 22000;
            } else if (id === 'additive-eq') {
                addLowFilter.gain.value = 0;
                addMidFilter.gain.value = 0;
                addHighFilter.gain.value = 0;
            } else if (id === 'compression') {
                compressor.threshold.value = 0;
                compressor.ratio.value = 1;
            } else if (id === 'saturation') {
                makeDistortionCurve(0);
            } else if (id === 'limiter') {
                limiter.threshold.value = 0;
            }
        } else {
            updateAudioParams();
        }
    }

    // Global Bypass
    const bypassAllBtn = document.getElementById('bypass-all');
    let allBypassed = false;
    bypassAllBtn.addEventListener('click', () => {
        allBypassed = !allBypassed;
        bypassAllBtn.style.background = allBypassed ? 'var(--accent-lim)' : 'transparent';
        bypassAllBtn.style.color = allBypassed ? '#000' : 'var(--accent-lim)';

        const modules = document.querySelectorAll('.module');
        modules.forEach(mod => {
            const btn = mod.querySelector('.power-btn');
            if (allBypassed) {
                mod.classList.add('disabled');
                updateBypassedState(mod, true);
            } else {
                if (btn.classList.contains('active')) {
                    mod.classList.remove('disabled');
                    updateBypassedState(mod, false);
                } else {
                    mod.classList.add('disabled');
                    updateBypassedState(mod, true);
                }
            }
        });
    });

    // Switch Buttons
    const switchBtns = document.querySelectorAll('.switch-btn');
    switchBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const parent = btn.parentElement;
            parent.querySelectorAll('.switch-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    // Visualization Loop
    function animateMeters() {
        if (isPlaying && analyser) {
            const array = new Uint8Array(analyser.frequencyBinCount);
            analyser.getByteFrequencyData(array);

            let sum = 0;
            for (let i = 0; i < array.length; i++) {
                sum += array[i];
            }
            const average = sum / array.length;

            const level = Math.min(100, (average / 128) * 100);

            meterL.style.width = level + '%';
            meterR.style.width = (level * 0.95) + '%';

            const compModule = document.getElementById('compression');
            const compActive = compModule.querySelector('.power-btn').classList.contains('active');

            if (compActive) {
                const thresh = compressor.threshold.value;
                const gr = (average > Math.abs(thresh)) ? (average - Math.abs(thresh)) / 5 : 0;
                if (grVisual) grVisual.style.width = Math.min(100, gr) + '%';
            } else {
                if (grVisual) grVisual.style.width = '0%';
            }

        } else {
            meterL.style.width = '0%';
            meterR.style.width = '0%';
            if (grVisual) grVisual.style.width = '0%';
        }
        requestAnimationFrame(animateMeters);
    }
    animateMeters();
});

