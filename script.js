document.addEventListener('DOMContentLoaded', () => {
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

    // --- 1. Initialization ---
    btnLoad.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

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
    }

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

        // Calculate 50% length
        const demoLength = Math.floor(audioBuffer.length / 2);

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
        a.download = 'mastered_demo_50percent.wav';
        a.click();

        btnExport.textContent = 'EXPORT DEMO (50%)';
        btnExport.disabled = false;
    });

    // --- Helper: AudioBuffer to WAV ---
    function bufferToWave(abuffer, len) {
        let numOfChan = abuffer.numberOfChannels,
            length = len * numOfChan * 2 + 44,
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
