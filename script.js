document.addEventListener('DOMContentLoaded', () => {
    // --- 0. PRO MODE / URL CLEANER ---
    const urlParams = new URLSearchParams(window.location.search);
    const SECRET_KEY = 'cliente_vip_enero_2026';
    const hasUrlAccess = urlParams.get('access') === SECRET_KEY;
    const hasStoredAccess = localStorage.getItem('steve_pro_membership') === SECRET_KEY;

    if (hasUrlAccess || hasStoredAccess) {
        document.body.classList.add('full-access');
        if (hasUrlAccess) {
            localStorage.setItem('steve_pro_membership', SECRET_KEY);
            window.history.replaceState({}, document.title, window.location.pathname);
            setTimeout(() => alert('¡Pago confirmado! Modo PRO desbloqueado.'), 500);
        }
        const logoTitle = document.querySelector('.logo h1');
        if (logoTitle) logoTitle.innerHTML = 'MASTERING<span class="highlight">STEVE</span> <span style="font-size: 0.5em; color: #4ade80; vertical-align: super;">PRO+MIX</span>';

        const btnBuy = document.getElementById('btn-buy');
        if (btnBuy) btnBuy.style.display = 'none';

        const btnExport = document.getElementById('btn-export');
        if (btnExport) btnExport.textContent = 'EXPORT FULL TRACK (WAV)';
    }

    window.enterProCode = function () {
        let input = prompt("Pega aquí el Link final o tu código:");
        if (!input) return;
        if (input.includes('access=')) {
            const match = input.match(/access=([^&]*)/);
            if (match && match[1]) input = match[1];
        }
        if (input.trim() === SECRET_KEY) {
            localStorage.setItem('steve_pro_membership', SECRET_KEY);
            alert("✅ Validado. ¡Acceso PRO activado!");
            location.reload();
        } else {
            alert("❌ Código no válido.");
        }
    };

    // --- GLOBAL AUDIO STATE ---
    let audioCtx;
    let isPlaying = false;
    let startTime = 0;
    let pauseTime = 0;
    let appMode = 'mastering'; // 'mastering' | 'mixing'

    // Defines the "Active" FX Chain currently being controlled by the Rack
    let activeTrack = null;

    // MASTERING Mode State
    let masteringTrack = null;

    // MIXING Mode State
    let mixTracks = [];
    let mixMasterNode = null; // Bus summing node
    let selectedMixTrackId = null; // ID of the track currently selected in UI
    let multiSelectedTrackIds = new Set(); // Persistente: tracks seleccionadas (Shift+Click)

    // --- UI ELEMENTS ---
    const fileInput = document.getElementById('audio-upload');
    const btnLoad = document.getElementById('btn-load');
    const btnPlay = document.getElementById('btn-play'); // Global play (mastering)
    const btnExport = document.getElementById('btn-export');

    // Mode Switcher
    const btnModeMastering = document.getElementById('mode-mastering');
    const btnModeMixing = document.getElementById('mode-mixing');
    const masteringUI = document.getElementById('mastering-ui');
    const mixingUI = document.getElementById('mixing-ui');

    // Mixer UI
    const mixerContainer = document.getElementById('mixing-ui');
    const btnAddTrack = document.getElementById('btn-add-track');
    // Global Mixing Transport
    const globalTransport = document.getElementById('global-transport');
    const btnMixPlay = document.getElementById('global-play');
    const btnMixStop = document.getElementById('global-stop');
    const btnMixExport = document.getElementById('global-export');
    const rackTitle = document.querySelector('.rack'); // To insert header active track info

    // Session buttons (will be inserted into transport when available)
    const btnSaveSession = document.createElement('button');
    btnSaveSession.id = 'btn-save-session';
    btnSaveSession.className = 'btn-primary';
    btnSaveSession.textContent = '💾 Guardar sesión';
    btnSaveSession.style.marginLeft = '8px';

    const btnLoadSession = document.createElement('button');
    btnLoadSession.id = 'btn-load-session';
    btnLoadSession.className = 'btn-primary';
    btnLoadSession.textContent = '📂 Cargar sesión';
    btnLoadSession.style.marginLeft = '6px';

    if (globalTransport) {
        // Insert before export button if exists
        try {
            globalTransport.insertBefore(btnSaveSession, btnMixExport);
            globalTransport.insertBefore(btnLoadSession, btnMixExport);
        } catch (e) {
            // Fallback append
            globalTransport.appendChild(btnSaveSession);
            globalTransport.appendChild(btnLoadSession);
        }
    }

    btnSaveSession.addEventListener('click', () => saveSession());
    btnLoadSession.addEventListener('click', () => loadSession());

    // --- HELP / GUIDE UI ---
    const btnHelp = document.createElement('button');
    btnHelp.id = 'btn-show-help';
    btnHelp.className = 'btn-primary';
    btnHelp.textContent = '❔ Ayuda';
    btnHelp.style.marginLeft = '6px';

    if (globalTransport) {
        try { globalTransport.insertBefore(btnHelp, btnMixExport); } catch (e) { globalTransport.appendChild(btnHelp); }
    } else {
        document.body.appendChild(btnHelp);
    }

    // Modal
    const helpModal = document.createElement('div');
    helpModal.id = 'help-modal';
    Object.assign(helpModal.style, { position: 'fixed', left: 0, top: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'none', zIndex: 2000, padding: '30px', overflow: 'auto' });

    const helpCard = document.createElement('div');
    Object.assign(helpCard.style, { maxWidth: '900px', margin: '40px auto', background: '#0b1220', color: '#e5e7eb', padding: '18px', borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.6)', fontFamily: 'system-ui, sans-serif' });

    helpCard.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <h2 style="margin:0;">Cómo usar la Consola / Atajos</h2>
            <button id="help-close" style="background:#111; color:#fff; border:none; padding:6px 10px; border-radius:6px;">Cerrar</button>
        </div>
        <p>Resumen rápido de controles y flujo de trabajo:</p>
        <ul>
            <li><strong>Seleccionar pistas:</strong> Click = seleccionar pista única. <strong>Shift+Click</strong> = alterna selección persistente (puedes seleccionar varias pistas).</li>
            <li><strong>Subir/Bajar faders por pista:</strong> Teclas por pista: <em>z/s</em> (pista 1), <em>x/d</em> (pista 2), <em>c/f</em> (pista 3), <em>v/g</em> (pista 4), <em>b/h</em> (pista 5), <em>n/j</em> (pista 6), etc.</li>
            <li><strong>Operar sobre selección:</strong> Si tienes pistas seleccionadas persistentes, las teclas de ajuste afectarán primero a esas pistas. Si no hay selección, la tecla afectará la pista mapeada.</li>
            <li><strong>Master fader:</strong> Usa <em>q</em> para subir y <em>a</em> para bajar el fader maestro. Mantén <em>Shift</em> para pasos grandes.</li>
            <li><strong>S/Z:</strong> Aumentar/disminuir (también mapeadas); si hay pistas seleccionadas se aplican a ellas; <strong>Ctrl+S/Z</strong> aplica a TODAS las pistas.</li>
            <li><strong>Presets por pista:</strong> Usa los botones <em>Estilo</em> / <em>Instrumento</em> en cada tira para aplicar presets.</li>
            <li><strong>Guardar/Cargar sesión:</strong> Usa los botones <em>💾 Guardar sesión</em> y <em>📂 Cargar sesión</em> en el transporte para exportar/importar la sesión (opción de incluir audio).</li>
        </ul>
        <h3>Mapa de teclas (resumen)</h3>
        <pre style="background:#071022; padding:10px; border-radius:6px; color:#9ca3af;">z / s  → Pista 1  |  x / d  → Pista 2  |  c / f  → Pista 3
v / g  → Pista 4  |  b / h  → Pista 5  |  n / j  → Pista 6
q / a  → Fader Maestro (Shift = paso grande)
Shift+Click → Selección múltiple persistente
S / Z (o teclas mapeadas) → Ajustan pistas seleccionadas si existen, sino la pista mapeada</pre>
        <p style="opacity:0.9;">Atajo para abrir esta ayuda: presiona <strong>?</strong></p>
    `;

    helpModal.appendChild(helpCard);
    document.body.appendChild(helpModal);

    btnHelp.addEventListener('click', () => { helpModal.style.display = 'block'; });
    document.getElementById('help-close').addEventListener('click', () => { helpModal.style.display = 'none'; });
    helpModal.addEventListener('click', (ev) => { if (ev.target === helpModal) helpModal.style.display = 'none'; });

    // Toggle with ? key (avoid when typing)
    window.addEventListener('keydown', (ev) => {
        const tag = (document.activeElement && document.activeElement.tagName) ? document.activeElement.tagName.toLowerCase() : '';
        if (tag === 'input' || tag === 'textarea' || document.activeElement.isContentEditable) return;
        if ((ev.key || '') === '?') {
            helpModal.style.display = helpModal.style.display === 'block' ? 'none' : 'block';
        }
    });

    // --- PRESET DATA ---
    const genrePresets = {
        rock: { subtractive_eq: { low_cut: 40, mid_dip: -2, high_cut: 19000 }, additive_eq: { low_boost: 3, presence: 2, air: 2 }, compression: { threshold: -18, ratio: 4, makeup: 3 }, saturation: { drive: 30, type: 'tube' }, limiter: { ceiling: -0.2, gain: 2 }, delay: { time: 250, feedback: 30, mix: 0 }, reverb: { size: 2.0, mix: 0 } },
        pop: { subtractive_eq: { low_cut: 30, mid_dip: -1, high_cut: 20000 }, additive_eq: { low_boost: 2, presence: 3, air: 4 }, compression: { threshold: -20, ratio: 2.5, makeup: 2 }, saturation: { drive: 15, type: 'tape' }, limiter: { ceiling: -0.1, gain: 3 }, delay: { time: 250, feedback: 30, mix: 0 }, reverb: { size: 1.5, mix: 5 } },
        metal: { subtractive_eq: { low_cut: 30, mid_dip: -3, high_cut: 16000 }, additive_eq: { low_boost: 2, presence: 1, air: 0 }, compression: { threshold: -12, ratio: 6, makeup: 4 }, saturation: { drive: 35, type: 'tube' }, limiter: { ceiling: -0.2, gain: 2 }, delay: { time: 200, feedback: 20, mix: 0 }, reverb: { size: 1.5, mix: 1 } },
        punk: { subtractive_eq: { low_cut: 40, mid_dip: -2, high_cut: 18000 }, additive_eq: { low_boost: 3, presence: 2, air: 1 }, compression: { threshold: -15, ratio: 4, makeup: 2 }, saturation: { drive: 25, type: 'tape' }, limiter: { ceiling: -0.5, gain: 1 }, delay: { time: 120, feedback: 10, mix: 0 }, reverb: { size: 1.0, mix: 0 } },
        country: { subtractive_eq: { low_cut: 45, mid_dip: -1.5, high_cut: 18000 }, additive_eq: { low_boost: 2, presence: 3.5, air: 1.5 }, compression: { threshold: -15, ratio: 3, makeup: 2 }, saturation: { drive: 20, type: 'tube' }, limiter: { ceiling: -0.5, gain: 2 }, delay: { time: 250, feedback: 30, mix: 0 }, reverb: { size: 2.5, mix: 10 } },
        reggaeton: { subtractive_eq: { low_cut: 25, mid_dip: 0, high_cut: 18500 }, additive_eq: { low_boost: 5, presence: 1, air: 2 }, compression: { threshold: -22, ratio: 3.5, makeup: 3 }, saturation: { drive: 40, type: 'tape' }, limiter: { ceiling: -0.1, gain: 4 }, delay: { time: 250, feedback: 30, mix: 0 }, reverb: { size: 1.0, mix: 2 } },
        youtube: { subtractive_eq: { low_cut: 90, mid_dip: -2, high_cut: 16000 }, additive_eq: { low_boost: 1, presence: 4, air: 1 }, compression: { threshold: -24, ratio: 4, makeup: 4 }, saturation: { drive: 10, type: 'tape' }, limiter: { ceiling: -1.0, gain: 3 }, delay: { time: 250, feedback: 30, mix: 0 }, reverb: { size: 1.0, mix: 5 } }
    };

    const instrumentPresets = {
        kick: { subtractive_eq: { low_cut: 30, mid_dip: -3, high_cut: 15000 }, additive_eq: { low_boost: 4, presence: 0, air: 0 }, compression: { threshold: -18, ratio: 4, makeup: 2 }, saturation: { drive: 30, type: 'tape' }, limiter: { ceiling: -0.1, gain: 0 }, delay: { time: 250, feedback: 0, mix: 0 }, reverb: { size: 1.0, mix: 0 } },
        snare: { subtractive_eq: { low_cut: 100, mid_dip: 0, high_cut: 18000 }, additive_eq: { low_boost: 1, presence: 3, air: 2 }, compression: { threshold: -20, ratio: 6, makeup: 3 }, saturation: { drive: 40, type: 'tube' }, limiter: { ceiling: -0.1, gain: 0 }, delay: { time: 150, feedback: 20, mix: 0 }, reverb: { size: 2.5, mix: 15 } },
        hihat: { subtractive_eq: { low_cut: 300, mid_dip: 0, high_cut: 20000 }, additive_eq: { low_boost: 0, presence: 0, air: 6 }, compression: { threshold: -25, ratio: 2, makeup: 1 }, saturation: { drive: 5, type: 'tape' }, limiter: { ceiling: -0.1, gain: 0 }, delay: { time: 250, feedback: 0, mix: 0 }, reverb: { size: 1.0, mix: 0 } },
        bass: { subtractive_eq: { low_cut: 40, mid_dip: -2, high_cut: 5000 }, additive_eq: { low_boost: 3, presence: 1, air: 0 }, compression: { threshold: -15, ratio: 8, makeup: 4 }, saturation: { drive: 50, type: 'tube' }, limiter: { ceiling: -0.1, gain: 0 }, delay: { time: 250, feedback: 0, mix: 0 }, reverb: { size: 1.0, mix: 0 } },
        vocal: { subtractive_eq: { low_cut: 120, mid_dip: -1, high_cut: 18000 }, additive_eq: { low_boost: 0, presence: 4, air: 3 }, compression: { threshold: -22, ratio: 3, makeup: 4 }, saturation: { drive: 20, type: 'tape' }, limiter: { ceiling: -0.5, gain: 1 }, delay: { time: 250, feedback: 30, mix: 10 }, reverb: { size: 3.0, mix: 20 } },
        guitars: { subtractive_eq: { low_cut: 100, mid_dip: 0, high_cut: 14000 }, additive_eq: { low_boost: 1, presence: 3, air: 1 }, compression: { threshold: -20, ratio: 3, makeup: 2 }, saturation: { drive: 25, type: 'tube' }, limiter: { ceiling: -0.1, gain: 0 }, delay: { time: 350, feedback: 20, mix: 5 }, reverb: { size: 2.0, mix: 15 } },
        keys: { subtractive_eq: { low_cut: 80, mid_dip: -2, high_cut: 16000 }, additive_eq: { low_boost: 2, presence: 2, air: 2 }, compression: { threshold: -18, ratio: 2, makeup: 2 }, saturation: { drive: 10, type: 'tape' }, limiter: { ceiling: -0.1, gain: 0 }, delay: { time: 400, feedback: 40, mix: 10 }, reverb: { size: 4.0, mix: 20 } }
    };

    window.genrePresets = genrePresets; // Expose for wizard

    // --- CLASS DEFINITIONS ---

    class FXChain {
        constructor(ctx) {
            this.ctx = ctx;

            // Nodes
            this.subLow = ctx.createBiquadFilter(); this.subLow.type = 'highpass';
            this.subMid = ctx.createBiquadFilter(); this.subMid.type = 'peaking'; this.subMid.frequency.value = 500;
            this.subHigh = ctx.createBiquadFilter(); this.subHigh.type = 'lowpass';

            this.addLow = ctx.createBiquadFilter(); this.addLow.type = 'lowshelf'; this.addLow.frequency.value = 100;
            this.addMid = ctx.createBiquadFilter(); this.addMid.type = 'peaking'; this.addMid.frequency.value = 2500;
            this.addHigh = ctx.createBiquadFilter(); this.addHigh.type = 'highshelf'; this.addHigh.frequency.value = 10000;

            this.compressor = ctx.createDynamicsCompressor();
            this.saturation = ctx.createWaveShaper(); makeDistortionCurve(0, this.saturation);

            // New Mixing FX
            this.delayNode = ctx.createDelay(5.0);
            this.delayFeedback = ctx.createGain();
            this.delayGain = ctx.createGain(); // Wet level
            this.delayDry = ctx.createGain(); // Dry level (usually 1, unless pure wet) - actually use Wet/Dry mix approach

            this.reverbNode = ctx.createConvolver();
            this.reverbGain = ctx.createGain(); // Wet
            // this.reverbDry = ctx.createGain(); // Dry handled by main path if parallel? 
            // Design: Series Chain: Sat -> [Delay Wet | Pass] -> [Reverb Wet | Pass] -> Limiter
            // Actually, simpler: Sat -> Delay/Reverb inputs (Send style) or Insert style?
            // "Insert with Mix knob" is safest for single chain.

            this.delayInput = ctx.createGain();
            this.reverbInput = ctx.createGain();

            this.limiter = ctx.createDynamicsCompressor();
            this.limiter.ratio.value = 20; this.limiter.attack.value = 0.001;

            this.gain = ctx.createGain(); // Output Level
            this.analyser = ctx.createAnalyser(); this.analyser.fftSize = 256;

            // --- Routing Scheme (Insert with Mix) ---
            // Flow: ... Sat -> PreFXGain -> [DelayPath + DryPath] -> [ReverbPath + DryPath] -> Limiter
            // To simplify, let's just do Series with Wet/Dry implementation at node level?
            // WebAudio doesn't have native Wet/Dry nodes.
            // We use:
            // Sat -> NodeA
            // NodeA -> DelayInput -> Delay -> DelayGain -> NodeB
            // NodeA -> DelayDry (Gain) -> NodeB
            // ... same for Reverb.

            // Delay Structure
            this.paramDelayTime = 0.25;
            this.paramDelayFeedback = 0.3;
            this.paramDelayMix = 0.0;

            this.delayNode.delayTime.value = this.paramDelayTime;
            this.delayFeedback.gain.value = this.paramDelayFeedback;
            this.delayNode.connect(this.delayFeedback);
            this.delayFeedback.connect(this.delayNode);

            this.delayDryNode = ctx.createGain();
            this.delayWetNode = ctx.createGain();

            // Reverb Structure
            this.reverbDryNode = ctx.createGain();
            this.reverbWetNode = ctx.createGain();
            // Reverb impulse
            this.reverbBuffer = makeImpulseResponse(ctx, 2.0, 2.0);
            this.reverbNode.buffer = this.reverbBuffer;

            // Connections
            // 1. Up to Saturation is same
            this.subLow.connect(this.subMid);
            this.subMid.connect(this.subHigh);
            this.subHigh.connect(this.addLow);
            this.addLow.connect(this.addMid);
            this.addMid.connect(this.addHigh);
            this.addHigh.connect(this.compressor);
            this.compressor.connect(this.saturation);

            // 2. Delay Stage
            this.saturation.connect(this.delayDryNode);
            this.saturation.connect(this.delayNode);
            this.delayNode.connect(this.delayWetNode);

            // 3. Reverb Stage (Join Delay Output)
            this.delayOut = ctx.createGain(); // Sum of Delay Dry/Wet
            this.delayDryNode.connect(this.delayOut);
            this.delayWetNode.connect(this.delayOut);

            this.delayOut.connect(this.reverbDryNode);
            this.delayOut.connect(this.reverbNode);
            this.reverbNode.connect(this.reverbWetNode);

            // 4. Limiter Stage (Join Reverb Output)
            this.reverbOut = ctx.createGain();
            this.reverbDryNode.connect(this.reverbOut);
            this.reverbWetNode.connect(this.reverbOut);

            this.reverbOut.connect(this.limiter);
            this.limiter.connect(this.gain);
            this.gain.connect(this.analyser);

            // Input Node
            this.input = this.subLow;

            // Settings State (for UI recall)
            this.settings = {
                subLow: 80, subMid: -3, subHigh: 18000,
                addLow: 2, addMid: 1.5, addHigh: 3,
                compThresh: -20, compRatio: 2, compMakeup: 2,
                satDrive: 25, satType: 'tape',

                // New params
                delayTime: 250, delayFeedback: 30, delayMix: 0,
                verbSize: 2.0, verbMix: 0,

                limCeiling: -0.1, limGain: 0
            };
        }

        connect(dest) {
            this.analyser.connect(dest);
        }

        disconnect() {
            this.analyser.disconnect();
        }
    }

    class AudioTrack {
        constructor(ctx, name) {
            this.id = Date.now() + Math.random();
            this.ctx = ctx;
            this.name = name;
            this.fx = new FXChain(ctx);

            // Source Handling
            this.sourceNode = null;
            this.buffer = null;

            // Additional channel strip controls
            this.panNode = ctx.createStereoPanner();
            this.muteNode = ctx.createGain();
            this.faderNode = ctx.createGain(); // Fader volume

            // Connect FX Chain Output -> Fader -> Mute -> Pan -> Output
            // Note: FX Chain ends at this.fx.analyser
            this.fx.analyser.connect(this.faderNode);
            this.faderNode.connect(this.muteNode);
            this.muteNode.connect(this.panNode);

            this.isMuted = false;
            this.isSoloed = false;

            // Defaults
            this.faderNode.gain.value = 1.0;
        }

        connect(dest) {
            this.panNode.connect(dest);
        }

        disconnect() {
            this.panNode.disconnect();
        }

        async loadFile(file) {
            const arrayBuffer = await file.arrayBuffer();
            this.buffer = await this.ctx.decodeAudioData(arrayBuffer);
            return this.buffer;
        }

        play(offset) {
            if (!this.buffer) return;
            if (this.sourceNode) { try { this.sourceNode.stop(); } catch (e) { } }

            this.sourceNode = this.ctx.createBufferSource();
            this.sourceNode.buffer = this.buffer;
            this.sourceNode.connect(this.fx.input);
            this.sourceNode.start(0, offset % this.buffer.duration);
        }

        stop() {
            if (this.sourceNode) {
                try { this.sourceNode.stop(); } catch (e) { }
                this.sourceNode = null;
            }
        }
    }

    // --- HELPER FUNCTIONS ---
    function makeDistortionCurve(amount, node) {
        // Shared distortion generator
        const k = typeof amount === 'number' ? amount : 0;
        const n_samples = 44100;
        const curve = new Float32Array(n_samples);
        const deg = Math.PI / 180;
        for (let i = 0; i < n_samples; ++i) {
            const x = (i * 2) / n_samples - 1;
            curve[i] = (3 + k) * x * 20 * deg / (Math.PI + k * Math.abs(x));
        }
        if (node) node.curve = curve;
        return curve;
    }

    function makeImpulseResponse(ctx, duration, decay) {
        const rate = ctx.sampleRate;
        const length = rate * duration;
        const impulse = ctx.createBuffer(2, length, rate);
        const left = impulse.getChannelData(0);
        const right = impulse.getChannelData(1);

        for (let i = 0; i < length; i++) {
            const n = i; // (length - i) / length;
            // Simple decay noise
            left[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
            right[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
        }
        return impulse;
    }

    function initAudioContext() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            mixMasterNode = audioCtx.createGain();
            mixMasterNode.connect(audioCtx.destination);

            // Init Mastering Track
            masteringTrack = new AudioTrack(audioCtx, "Master");
            masteringTrack.connect(audioCtx.destination); // Direct to out in mastering mode

            activeTrack = masteringTrack; // Default
        }
    }

    // --- MODE SWITCHER LOGIC ---
    btnModeMastering.addEventListener('click', () => setMode('mastering'));
    btnModeMixing.addEventListener('click', () => setMode('mixing'));

    function setMode(mode) {
        // Stop playback before switching
        if (isPlaying) {
            btnPlay.click(); // Toggles stop
        }

        initAudioContext();
        appMode = mode;
        updatePresetDropdown(mode);

        if (mode === 'mastering') {
            btnModeMastering.classList.add('active');
            btnModeMixing.classList.remove('active');
            masteringUI.style.display = 'block';
            mixingUI.style.display = 'none';
            if (globalTransport) globalTransport.style.display = 'none';

            // Audio Routing
            mixTracks.forEach(t => t.disconnect());
            masteringTrack.connect(audioCtx.destination);

            activeTrack = masteringTrack;
            updateRackTrackName("MASTER OUT");
            loadSettingsToUI(activeTrack.fx.settings);
            // Hide Mixing Only Modules
            document.querySelectorAll('.mixing-only-module').forEach(el => el.classList.add('hidden'));

        } else {
            btnModeMixing.classList.add('active');
            btnModeMastering.classList.remove('active');
            masteringUI.style.display = 'none';
            mixingUI.style.display = 'flex';
            if (globalTransport) globalTransport.style.display = 'flex';

            // Show Mixing Only Modules
            document.querySelectorAll('.mixing-only-module').forEach(el => el.classList.remove('hidden'));

            // Audio Routing
            masteringTrack.disconnect();
            mixTracks.forEach(t => t.connect(mixMasterNode));

            if (mixTracks.length > 0) {
                if (!selectedMixTrackId) selectMixTrack(mixTracks[0].id);
                else selectMixTrack(selectedMixTrackId);
            } else {
                updateRackTrackName("(Select a Track)");
            }
        }
    }

    function updateRackTrackName(name) {
        // Insert or update a header above the rack
        let header = document.getElementById('rack-active-track-label');
        if (!header) {
            header = document.createElement('div');
            header.id = 'rack-active-track-label';
            header.style.textAlign = 'center';
            header.style.padding = '10px';
            header.style.background = '#222';
            header.style.borderBottom = '1px solid #444';
            header.style.marginBottom = '10px';
            header.style.borderRadius = '8px';
            header.style.color = '#4ade80';
            header.style.fontWeight = 'bold';
            const rack = document.querySelector('.rack');
            if (rack) rack.insertBefore(header, rack.firstChild);
        }
        header.innerHTML = `🎛️ ADJUSTING FX FOR: <span style="font-size:1.2em; color:white; text-transform:uppercase;">${name}</span>`;
    }

    const genreSelect = document.getElementById('genre-select');
    function updatePresetDropdown(mode) {
        if (!genreSelect) return;
        genreSelect.innerHTML = '<option value="default">Load Preset...</option>';
        if (mode === 'mastering') {
            for (const [key, _] of Object.entries(genrePresets)) {
                genreSelect.innerHTML += `<option value="${key}">🎵 ${key.charAt(0).toUpperCase() + key.slice(1)}</option>`;
            }
        } else {
            for (const [key, _] of Object.entries(instrumentPresets)) {
                genreSelect.innerHTML += `<option value="${key}">🎹 ${key.charAt(0).toUpperCase() + key.slice(1)}</option>`;
            }
        }
        genreSelect.innerHTML += '<option value="upload">📂 Cargar mi propio Preset (.json)</option>';
    }

    // --- MIXER UI LOGIC ---
    btnAddTrack.addEventListener('click', () => {
        initAudioContext();
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'audio/*';
        input.onchange = async (e) => {
            if (e.target.files.length > 0) {
                const name = e.target.files[0].name;
                const newTrack = new AudioTrack(audioCtx, name);
                await newTrack.loadFile(e.target.files[0]);

                mixTracks.push(newTrack);
                newTrack.connect(mixMasterNode); // Connect to mix bus

                renderMixer();
                selectMixTrack(newTrack.id);
            }
        };
        input.click();
    });

    function renderMixer() {
        // Clear existing strips except add button
        const strips = Array.from(document.querySelectorAll('.channel-strip'));
        strips.forEach(s => s.remove());

        // Master fader strip (mix bus)
        if (mixMasterNode) {
            const masterStrip = document.createElement('div');
            masterStrip.className = 'channel-strip master-strip';
            masterStrip.dataset.trackId = 'mix-master';
            masterStrip.innerHTML = `
                <div class="channel-name">MASTER</div>
                <div style="height:8px;"></div>
                <div class="channel-fader-wrapper">
                    <input type="range" class="master-fader v-fader" min="0" max="2" step="0.01" value="${mixMasterNode.gain.value}">
                </div>
            `;

            const mf = masterStrip.querySelector('.master-fader');
            mf.addEventListener('input', (e) => {
                const v = parseFloat(e.target.value);
                try { mixMasterNode.gain.value = v; } catch (err) {}
            });

            mixerContainer.insertBefore(masterStrip, btnAddTrack);
        }

        mixTracks.forEach(track => {
                const strip = document.createElement('div');
                const isSelectedClass = track.id === selectedMixTrackId ? 'selected' : '';
                const isMultiClass = multiSelectedTrackIds.has(track.id) ? 'multi-selected' : '';
                strip.className = `channel-strip ${isSelectedClass} ${isMultiClass}`;
                strip.dataset.trackId = track.id;
            strip.innerHTML = `
                <div class="channel-name" title="${track.name}">${track.name}</div>
                <div class="channel-controls">
                    <button class="btn-mute ${track.isMuted ? 'active' : ''}">M</button>
                    <button class="btn-solo ${track.isSoloed ? 'active' : ''}">S</button>
                </div>
                <div class="preset-inline" style="margin-top:6px; display:flex; gap:6px; align-items:center; flex-wrap:wrap; width:100%; box-sizing:border-box; overflow:hidden;">
                    <button class="btn-style" ${track.buffer ? '' : 'disabled'} style="padding:4px 6px; font-size:0.75em; max-width:90px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">Estilo</button>
                    <button class="btn-instr" ${track.buffer ? '' : 'disabled'} style="padding:4px 6px; font-size:0.75em; max-width:90px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">Instrumento</button>
                    <div class="preset-labels" style="color:#9ca3af; font-size:0.72em; margin-left:6px; flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${track._styleLabel || ''}${track._instrLabel ? ' | ' + track._instrLabel : ''}</div>
                </div>
                <!-- Pan -->
                <input type="range" min="-1" max="1" step="0.1" value="${track.panNode.pan.value}" class="knob-pan" style="width:100%; height:10px; margin-bottom:5px;">
                <div class="channel-fader-wrapper">
                    <input type="range" class="v-fader" min="0" max="1.5" step="0.01" value="${track.faderNode.gain.value}">
                </div>
                <button class="btn-select">EDIT FX</button>
            `;

            // Bind Events
            const btnMute = strip.querySelector('.btn-mute');
            btnMute.onclick = (e) => {
                e.stopPropagation(); // Prevent strip click (optional, but cleaner for buttons)
                // Actually, we probably WANT to select the track when muting?
                // Let's manually select to be sure, then mute.
                if (selectedMixTrackId !== track.id) selectMixTrack(track.id);

                track.isMuted = !track.isMuted;
                track.muteNode.gain.value = track.isMuted ? 0 : 1;
                renderMixer();
            };

            const btnSolo = strip.querySelector('.btn-solo');
            btnSolo.onclick = (e) => {
                e.stopPropagation();
                if (selectedMixTrackId !== track.id) selectMixTrack(track.id);

                // Simplified Solo: Just outline it, real solo logic needs muting others
                track.isSoloed = !track.isSoloed;
                // Enfornce solo logic on all tracks
                const anySolo = mixTracks.some(t => t.isSoloed);
                mixTracks.forEach(t => {
                    if (anySolo) {
                        t.muteNode.gain.value = t.isSoloed ? 1 : 0;
                    } else {
                        t.muteNode.gain.value = t.isMuted ? 0 : 1;
                    }
                });
                renderMixer();
            };

            const fader = strip.querySelector('.v-fader');
            fader.oninput = (e) => {
                const val = parseFloat(e.target.value);
                track.faderNode.gain.value = val;
                track.volume = val;
            };

            const pan = strip.querySelector('.knob-pan');
            pan.oninput = (e) => {
                track.panNode.pan.value = parseFloat(e.target.value);
            };

            // Allow selecting by clicking anywhere on the strip
            strip.addEventListener('click', (e) => {
                // If clicked on an input (fader/pan) or a button, still handle selection but avoid interfering with drag
                const isInteractive = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' || (e.target.closest && e.target.closest('button')));

                // Shift+Click: toggle persistent multi-selection
                if (e.shiftKey) {
                    if (multiSelectedTrackIds.has(track.id)) {
                        multiSelectedTrackIds.delete(track.id);
                    } else {
                        multiSelectedTrackIds.add(track.id);
                    }
                    // Keep the clicked track as the active one for Rack editing
                    selectedMixTrackId = track.id;
                    activeTrack = track;
                    loadSettingsToUI(track.fx.settings);
                    renderMixer();
                    return;
                }

                // Normal click: select single (clear multi-selection)
                multiSelectedTrackIds = new Set([track.id]);
                selectMixTrack(track.id);
            });

            const btnSel = strip.querySelector('.btn-select');
            btnSel.onclick = (e) => {
                e.stopPropagation(); // Prevent double trigger
                selectMixTrack(track.id);
            };

            // --- Preset Menus (inline) ---
            const btnStyle = strip.querySelector('.btn-style');
            const btnInstr = strip.querySelector('.btn-instr');

            // Build style menu
            const styleMenu = document.createElement('div');
            Object.assign(styleMenu.style, { position: 'absolute', background: '#111', border: '1px solid #333', padding: '8px', borderRadius: '6px', display: 'none', zIndex: 1200, maxWidth: '220px', overflowY: 'auto', maxHeight: '220px' });
            const styleList = Object.keys(genrePresets);
            styleList.forEach(k => {
                const b = document.createElement('button');
                b.textContent = k.charAt(0).toUpperCase() + k.slice(1);
                b.style = 'display:block; width:100%; margin-bottom:6px; background:#1f2937; color:#fff; border:none; padding:6px; text-align:left;'
                b.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    applyStylePresetToTrack(track, k);
                    styleMenu.style.display = 'none';
                    // update label
                    track._styleLabel = k.charAt(0).toUpperCase() + k.slice(1);
                    strip.querySelector('.preset-labels').textContent = `${track._styleLabel}${track._instrLabel ? ' | ' + track._instrLabel : ''}`;
                });
                styleMenu.appendChild(b);
            });

            // Build instrument menu
            const instrMenu = document.createElement('div');
            Object.assign(instrMenu.style, { position: 'absolute', background: '#111', border: '1px solid #333', padding: '8px', borderRadius: '6px', display: 'none', zIndex: 1200, maxWidth: '220px', overflowY: 'auto', maxHeight: '220px' });
            const instrList = Object.keys(instrumentPresets);
            instrList.forEach(k => {
                const b = document.createElement('button');
                const lbl = k === 'vocal' ? 'Voz' : (k === 'guitars' ? 'Guitarra' : (k === 'hihat' ? 'HiHat' : (k === 'keys' ? 'Teclas' : (k.charAt(0).toUpperCase() + k.slice(1)))));
                b.textContent = lbl;
                b.style = 'display:block; width:100%; margin-bottom:6px; background:#1f2937; color:#fff; border:none; padding:6px; text-align:left;'
                b.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    applyInstrumentPresetToTrack(track, k);
                    instrMenu.style.display = 'none';
                    track._instrLabel = lbl;
                    strip.querySelector('.preset-labels').textContent = `${track._styleLabel ? track._styleLabel : ''}${track._instrLabel ? (track._styleLabel ? ' | ' : '') + track._instrLabel : ''}`;
                });
                instrMenu.appendChild(b);
            });

            // Attach menus to strip
            strip.style.position = 'relative';
            strip.appendChild(styleMenu);
            strip.appendChild(instrMenu);

            btnStyle && btnStyle.addEventListener('click', (ev) => {
                ev.stopPropagation();
                // disable if no buffer
                if (!track.buffer) return alert('Carga un archivo en la pista primero.');
                // position menu under the button
                styleMenu.style.display = styleMenu.style.display === 'none' ? 'block' : 'none';
                instrMenu.style.display = 'none';
            });

            btnInstr && btnInstr.addEventListener('click', (ev) => {
                ev.stopPropagation();
                if (!track.buffer) return alert('Carga un archivo en la pista primero.');
                instrMenu.style.display = instrMenu.style.display === 'none' ? 'block' : 'none';
                styleMenu.style.display = 'none';
            });

            // Close menus when clicking outside
            document.addEventListener('click', () => {
                styleMenu.style.display = 'none';
                instrMenu.style.display = 'none';
            });

            mixerContainer.insertBefore(strip, btnAddTrack);
        });
    }

    function selectMixTrack(id) {
        selectedMixTrackId = id;
        const track = mixTracks.find(t => t.id === id);
        if (track) {
            activeTrack = track;
            loadSettingsToUI(track.fx.settings);
            updateRackTrackName(track.name);
            renderMixer(); // Update selected visual
        }
    }

    // --- RACK CONTROL LOGIC ---
    // Update activeTrack params from UI
    function updateAudioParams() {
        if (!activeTrack || !activeTrack.fx) return;
        const s = activeTrack.fx.settings; // Pointers to setting obj
        const nodes = activeTrack.fx;

        // Check Bypass States directly from DOM
        const isEqSubBypassed = document.getElementById('subtractive-eq').classList.contains('disabled');
        const isEqAddBypassed = document.getElementById('additive-eq').classList.contains('disabled');
        const isCompBypassed = document.getElementById('compression').classList.contains('disabled');
        const isSatBypassed = document.getElementById('saturation').classList.contains('disabled');
        const isLimBypassed = document.getElementById('limiter').classList.contains('disabled');

        // Read UI & Apply (or Bypass)
        s.subLow = document.getElementById('sub-low-freq').value;
        s.subMid = document.getElementById('sub-mid-gain').value;
        s.subHigh = document.getElementById('sub-high-freq').value;

        if (isEqSubBypassed) {
            nodes.subLow.frequency.value = 10;
            nodes.subMid.gain.value = 0;
            nodes.subHigh.frequency.value = 22000;
        } else {
            nodes.subLow.frequency.value = s.subLow;
            nodes.subMid.gain.value = s.subMid;
            nodes.subHigh.frequency.value = s.subHigh;
        }

        s.addLow = document.getElementById('add-low-gain').value;
        s.addMid = document.getElementById('add-mid-gain').value;
        s.addHigh = document.getElementById('add-high-gain').value;

        if (isEqAddBypassed) {
            nodes.addLow.gain.value = 0;
            nodes.addMid.gain.value = 0;
            nodes.addHigh.gain.value = 0;
        } else {
            nodes.addLow.gain.value = s.addLow;
            nodes.addMid.gain.value = s.addMid;
            nodes.addHigh.gain.value = s.addHigh;
        }

        s.compThresh = document.getElementById('comp-thresh').value;
        s.compRatio = document.getElementById('comp-ratio').value;

        if (isCompBypassed) {
            nodes.compressor.threshold.value = 0;
            nodes.compressor.ratio.value = 1;
        } else {
            nodes.compressor.threshold.value = s.compThresh;
            nodes.compressor.ratio.value = s.compRatio;
        }

        s.satDrive = document.getElementById('sat-drive').value;
        if (isSatBypassed) {
            makeDistortionCurve(0, nodes.saturation);
        } else {
            makeDistortionCurve(parseFloat(s.satDrive), nodes.saturation);
        }

        s.limCeiling = document.getElementById('lim-ceiling').value;
        s.limGain = parseFloat(document.getElementById('lim-gain').value);
        s.compMakeup = parseFloat(document.getElementById('comp-makeup').value);

        if (isLimBypassed) {
            nodes.limiter.threshold.value = 0;
            // Note: Output gain is part of Limiter module in UI but often treated as Master Gain
            // We will let Gain work even if Limiter is bypassed, OR bypass gain too.
            // Usually Gain is output stage. Let's keep Gain active or reset to Unity?
            // "Gain" knob is in Limiter section. Let's reset to unity if bypassed.
            nodes.gain.gain.value = 1.0;
        } else {
            nodes.limiter.threshold.value = s.limCeiling;
            const totalGainDb = s.limGain + s.compMakeup; // Makeup is in Comp section but applied here? 
            // Wait, previous code applied makeup globally at end. 
            // Let's respect sections. If Comp is bypassed, Makeup should ideally be 0?
            // But Makeup is calculated into totalGainDb.

            let effectiveMakeup = isCompBypassed ? 0 : s.compMakeup;
            let effectiveLimGain = isLimBypassed ? 0 : s.limGain;

            // If Limiter is NOT bypassed, we apply gain.
            // My conditional above handled Limiter threshold. 
            // Let's refine gain calc:
            const finalGainDb = effectiveLimGain + effectiveMakeup;
            nodes.gain.gain.value = Math.pow(10, finalGainDb / 20);
        }

        // New Mixing FX Updates (Only if they exist in the chain)
        if (nodes.delayNode) {
            s.delayTime = document.getElementById('delay-time').value;
            s.delayFeedback = document.getElementById('delay-feedback').value;
            s.delayMix = document.getElementById('delay-mix').value;

            const isDelayMod = document.getElementById('delay-module');
            const isDelayBypassed = isDelayMod && isDelayMod.classList.contains('disabled');

            if (isDelayBypassed) {
                nodes.delayWetNode.gain.value = 0;
                nodes.delayDryNode.gain.value = 1;
            } else {
                nodes.delayNode.delayTime.value = s.delayTime / 1000;
                nodes.delayFeedback.gain.value = s.delayFeedback / 100;
                const dMix = s.delayMix / 100;
                nodes.delayWetNode.gain.value = dMix;
                nodes.delayDryNode.gain.value = 1 - (dMix * 0.5);
            }
        }

        if (nodes.reverbNode) {
            s.verbSize = document.getElementById('verb-size').value;
            s.verbMix = document.getElementById('verb-mix').value;

            const isVerbMod = document.getElementById('reverb-module');
            const isVerbBypassed = isVerbMod && isVerbMod.classList.contains('disabled');

            // Note: Reverb buffer update handled by 'change' event listener, not here.

            if (isVerbBypassed) {
                nodes.reverbWetNode.gain.value = 0;
                nodes.reverbDryNode.gain.value = 1;
            } else {
                const rMix = s.verbMix / 100;
                nodes.reverbWetNode.gain.value = rMix;
                nodes.reverbDryNode.gain.value = 1 - (rMix * 0.5);
            }
        }

        // Save if in mastering mode
        if (appMode === 'mastering') saveMasterSettings();
    }
    window.updateAudioParams = updateAudioParams;

    function loadSettingsToUI(s) {
        document.getElementById('sub-low-freq').value = s.subLow;
        document.getElementById('sub-mid-gain').value = s.subMid;
        document.getElementById('sub-high-freq').value = s.subHigh;

        document.getElementById('add-low-gain').value = s.addLow;
        document.getElementById('add-mid-gain').value = s.addMid;
        document.getElementById('add-high-gain').value = s.addHigh;

        document.getElementById('comp-thresh').value = s.compThresh;
        document.getElementById('comp-ratio').value = s.compRatio;
        document.getElementById('comp-makeup').value = s.compMakeup;

        document.getElementById('sat-drive').value = s.satDrive;

        // New Vals
        document.getElementById('delay-time').value = s.delayTime || 250;
        document.getElementById('delay-feedback').value = s.delayFeedback || 30;
        document.getElementById('delay-mix').value = s.delayMix || 0;

        document.getElementById('verb-size').value = s.verbSize || 2.0;
        document.getElementById('verb-mix').value = s.verbMix || 0;

        document.getElementById('lim-ceiling').value = s.limCeiling;
        document.getElementById('lim-gain').value = s.limGain;

        // Visual updates
        document.querySelectorAll('input[type="range"]').forEach(input => updateValueDisplay(input));

        // Bypass Restoration (ensure UI modules reflect saved bypass states)
        setBypassState('subtractive-eq', s.bypassSub);
        setBypassState('additive-eq', s.bypassAdd);
        setBypassState('compression', s.bypassComp);
        setBypassState('saturation', s.bypassSat);
        setBypassState('limiter', s.bypassLim);
        setBypassState('delay-module', s.bypassDelay);
        setBypassState('reverb-module', s.bypassVerb);
    }

    function setBypassState(id, isBypassed) {
        const el = document.getElementById(id);
        if (!el) return;
        const btn = el.querySelector('.power-btn');
        if (!btn) return;

        // Normalize values that may come as booleans, strings or numbers
        const bypass = (isBypassed === true || isBypassed === 'true' || isBypassed === 1 || isBypassed === '1');

        if (bypass) {
            el.classList.add('disabled');
            btn.classList.remove('active');
        } else {
            el.classList.remove('disabled');
            btn.classList.add('active');
        }
    }

    // Bind input 'change' specifically for heavy computations (Reverb Buffer)
    const verbSizeInput = document.getElementById('verb-size');
    if (verbSizeInput) {
        verbSizeInput.addEventListener('change', (e) => {
            const val = parseFloat(e.target.value);
            if (activeTrack && activeTrack.fx) {
                const newBuf = makeImpulseResponse(audioCtx, val, val);
                activeTrack.fx.reverbNode.buffer = newBuf;
                activeTrack.fx.settings.verbSize = val;
            }
        });
    }

    // Bind Rack Inputs
    document.querySelectorAll('input[type="range"]').forEach(input => {
        input.addEventListener('input', (e) => {
            updateValueDisplay(e.target);
            if (audioCtx) updateAudioParams();
        });
    });

    // --- Keyboard Shortcuts: Fader adjustments ---
    // Mapping: pairs of keys per track: lowerKey / raiseKey
    const faderKeyMap = {
        'z': { idx: 0, delta: -0.02 }, 's': { idx: 0, delta: 0.02 },
        'x': { idx: 1, delta: -0.02 }, 'd': { idx: 1, delta: 0.02 },
        'c': { idx: 2, delta: -0.02 }, 'f': { idx: 2, delta: 0.02 },
        'v': { idx: 3, delta: -0.02 }, 'g': { idx: 3, delta: 0.02 },
        'b': { idx: 4, delta: -0.02 }, 'h': { idx: 4, delta: 0.02 },
        'n': { idx: 5, delta: -0.02 }, 'j': { idx: 5, delta: 0.02 }
    };

    // Adjust fader helper
    function adjustFaderByIndex(index, delta, largeStep) {
        if (!mixTracks || mixTracks.length === 0) return;
        if (index < 0 || index >= mixTracks.length) return;
        const track = mixTracks[index];
        if (!track) return;

        const step = largeStep ? Math.abs(delta) * 2 : Math.abs(delta);
        const newVal = Math.max(0, Math.min(1.5, track.faderNode.gain.value + (delta < 0 ? -step : step)));
        track.faderNode.gain.value = newVal;
        track.volume = newVal;

        // Update DOM fader if present
        const strip = document.querySelector(`.channel-strip[data-track-id='${track.id}']`);
        if (strip) {
            const fader = strip.querySelector('.v-fader');
            if (fader) fader.value = newVal;
        }

        // If this track is active, reflect in rack UI
        if (activeTrack && activeTrack.id === track.id) loadSettingsToUI(track.fx.settings);
    }

    document.addEventListener('keydown', (e) => {
        // Ignore when focusing inputs
        const tag = (document.activeElement && document.activeElement.tagName) ? document.activeElement.tagName.toLowerCase() : '';
        if (tag === 'input' || tag === 'textarea' || document.activeElement.isContentEditable) return;

        const key = (e.key || '').toLowerCase();
        const mapping = faderKeyMap[key];

        // Helper: if selected tracks exist, apply delta to them
        function applyToSelected(delta, largeStep) {
            if (!multiSelectedTrackIds || multiSelectedTrackIds.size === 0) return false;
            multiSelectedTrackIds.forEach(id => {
                const idx = mixTracks.findIndex(t => t.id === id);
                if (idx >= 0) adjustFaderByIndex(idx, delta, largeStep);
            });
            return true;
        }

        // Master fader shortcuts: 'q' = subir, 'a' = bajar (Shift = paso mayor)
        if (key === 'q' || key === 'a') {
            if (mixMasterNode) {
                const step = e.shiftKey ? 0.06 : 0.02;
                const up = key === 'q';
                let cur = typeof mixMasterNode.gain.value === 'number' ? mixMasterNode.gain.value : 1;
                let next = up ? Math.min(2, cur + step) : Math.max(0, cur - step);
                try { mixMasterNode.gain.value = next; } catch (err) {}
                const mf = document.querySelector('.master-fader');
                if (mf) mf.value = next;
                e.preventDefault();
                return;
            }
        }

        // Special behavior for s/z: prefer adjusting persistently selected tracks; if none selected, fallback to mapped index. Ctrl still applies to all.
        if (key === 's' || key === 'z') {
            const delta = mapping ? mapping.delta : (key === 's' ? 0.02 : -0.02);

            if (e.ctrlKey) {
                // Ctrl + s/z => apply to all tracks
                mixTracks.forEach((t, i) => adjustFaderByIndex(i, delta, e.shiftKey));
            } else {
                // No Ctrl: if there are persistently selected tracks, apply to them; else use mapped index
                const applied = applyToSelected(delta, e.shiftKey);
                if (!applied) {
                    if (mapping) adjustFaderByIndex(mapping.idx, mapping.delta, e.shiftKey);
                }
            }

            e.preventDefault();
            return;
        }

        // For other mapped keys, keep previous behavior: mapped index or Ctrl=all
        if (!mapping) return;

        if (e.ctrlKey) {
            mixTracks.forEach((t, i) => adjustFaderByIndex(i, mapping.delta, e.shiftKey));
        } else {
            // If user has a multi-selection active, prefer adjusting those instead of the single mapped track
            const didApply = applyToSelected(mapping.delta, e.shiftKey);
            if (!didApply) adjustFaderByIndex(mapping.idx, mapping.delta, e.shiftKey);
        }

        e.preventDefault();
    });

    // Bypass Buttons Logic
    const powerBtns = document.querySelectorAll('.power-btn');
    powerBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            btn.classList.toggle('active');
            const module = btn.closest('.module');
            if (btn.classList.contains('active')) {
                module.classList.remove('disabled');
            } else {
                module.classList.add('disabled');
            }
            updateAudioParams(); // Re-calc with new bypass state
        });
    });

    // Switch Buttons logic (Sat Type)
    const switchBtns = document.querySelectorAll('.switch-btn');
    switchBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const parent = btn.parentElement;
            parent.querySelectorAll('.switch-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            // Update active track setting for continuity
            if (activeTrack) {
                activeTrack.fx.settings.satType = btn.dataset.val;
            }
        });
    });

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
            } else {
                if (btn.classList.contains('active')) {
                    mod.classList.remove('disabled');
                } else {
                    mod.classList.add('disabled');
                }
            }
        });
        updateAudioParams();
    });

    // Preset Listener
    if (genreSelect) {
        genreSelect.addEventListener('change', (e) => {
            const val = e.target.value;
            if (val === 'default') return;
            if (val === 'upload') {
                document.getElementById('preset-upload-input').click();
                e.target.value = 'default';
                return;
            }

            const preset = (appMode === 'mastering') ? genrePresets[val] : instrumentPresets[val];
            if (preset) {
                const s = activeTrack.fx.settings;
                // Map...
                s.subLow = preset.subtractive_eq.low_cut;
                s.subMid = preset.subtractive_eq.mid_dip;
                s.subHigh = preset.subtractive_eq.high_cut;
                s.addLow = preset.additive_eq.low_boost;
                s.addMid = preset.additive_eq.presence;
                s.addHigh = preset.additive_eq.air;
                s.compThresh = preset.compression.threshold;
                s.compRatio = preset.compression.ratio;
                s.compMakeup = preset.compression.makeup;
                s.satDrive = preset.saturation.drive;
                s.limCeiling = preset.limiter.ceiling;
                s.limGain = preset.limiter.gain;

                loadSettingsToUI(s);
                updateAudioParams();
                // Set visual labels
                if (appMode === 'mastering') {
                    if (activeTrack) activeTrack._styleLabel = val.charAt(0).toUpperCase() + val.slice(1);
                } else {
                    if (activeTrack) activeTrack._instrLabel = val.charAt(0).toUpperCase() + val.slice(1);
                }
                renderMixer();
            }
        });
    }

    function updateValueDisplay(input) {
        const display = input.parentElement.querySelector('.value-display');
        if (!display) return;
        let value = input.value;
        const id = input.id;
        if (id.includes('freq')) value = value >= 1000 ? (value / 1000).toFixed(1) + ' kHz' : value + ' Hz';
        else if (id.includes('gain') || id.includes('thresh') || id.includes('ceiling') || id.includes('makeup')) value = (value > 0 ? '+' : '') + value + ' dB';
        else if (id.includes('ratio')) value = value + ':1';
        else if (id.includes('drive')) value = value + '%';
        display.textContent = value;
    }
    window.updateValueDisplay = updateValueDisplay;

    // --- PLAYBACK LOGIC ---
    // --- PLAYBACK LOGIC ---
    function togglePlayback() {
        initAudioContext();
        if (isPlaying) {
            // STOP
            if (appMode === 'mastering') {
                if (masteringTrack) masteringTrack.stop();
            } else {
                mixTracks.forEach(t => t.stop());
            }
            pauseTime = audioCtx.currentTime - startTime;
            isPlaying = false;
            btnPlay.textContent = 'PLAY';
            if (btnMixPlay) btnMixPlay.textContent = 'PLAY MIX';
        } else {
            // PLAY
            if (audioCtx.state === 'suspended') audioCtx.resume();

            if (appMode === 'mastering') {
                if (masteringTrack) masteringTrack.play(pauseTime);
            } else {
                mixTracks.forEach(t => t.play(pauseTime));
            }

            startTime = audioCtx.currentTime - pauseTime;
            isPlaying = true;
            btnPlay.textContent = 'PAUSE';
            if (btnMixPlay) btnMixPlay.textContent = 'PAUSE MIX';
        }
    }

    btnPlay.addEventListener('click', togglePlayback);
    if (btnMixPlay) btnMixPlay.addEventListener('click', togglePlayback);
    if (btnMixStop) {
        btnMixStop.addEventListener('click', () => {
            if (isPlaying) togglePlayback();
            pauseTime = 0; // Full stop reset
            startTime = 0;
        });
    }

    // --- MASTERING FILE INPUT ---
    // Correction: Ensure btnLoad triggers the file picker
    if (btnLoad) {
        btnLoad.addEventListener('click', () => {
            fileInput.click();
        });
    }

    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        initAudioContext();
        btnLoad.textContent = 'LOADING...';
        try {
            await masteringTrack.loadFile(file);
            btnLoad.textContent = 'LOAD TRACK';
            btnPlay.disabled = false;
            btnExport.disabled = false;

            // Connect mastering track if we are in mastering mode
            if (appMode === 'mastering') {
                masteringTrack.connect(audioCtx.destination);
            }

            // Reset Wizard if needed
            if (window.resetWizard) window.resetWizard();
        } catch (err) {
            console.error("Error loading file:", err);
            btnLoad.textContent = 'ERROR';
            setTimeout(() => btnLoad.textContent = 'LOAD TRACK', 2000);
        }
    });

    // --- EXPORT logic ---
    // --- EXPORT logic ---
    if (btnExport) {
        btnExport.addEventListener('click', () => {
            startExport();
        });
    }

    if (btnMixExport) {
        btnMixExport.addEventListener('click', () => {
            startExport();
        });
    }

    async function startExport() {
        if (appMode === 'mastering' && (!masteringTrack || !masteringTrack.buffer)) return alert("Carga una canción primero.");
        if (appMode === 'mixing' && mixTracks.length === 0) return alert("Agrega pistas al mixer primero.");

        const originalBtnText = appMode === 'mastering' ? btnExport.textContent : btnMixExport.textContent;
        const btn = appMode === 'mastering' ? btnExport : btnMixExport;

        btn.textContent = "RENDERIZANDO...";
        btn.disabled = true;

        try {
            // Determine duration
            let duration = 0;
            if (appMode === 'mastering') {
                duration = masteringTrack.buffer.duration;
            } else {
                mixTracks.forEach(t => {
                    if (t.buffer && t.buffer.duration > duration) duration = t.buffer.duration;
                });
            }

            // Create Offline Context
            const offlineCtx = new OfflineAudioContext(2, duration * 44100, 44100);

            // Re-create Graph in Offline Context
            if (appMode === 'mastering') {
                await renderTrackToContext(offlineCtx, masteringTrack, offlineCtx.destination);
            } else {
                // Mix Bus for offline
                const mixBus = offlineCtx.createGain();
                mixBus.connect(offlineCtx.destination);

                for (const track of mixTracks) {
                    await renderTrackToContext(offlineCtx, track, mixBus);
                }
            }

            // Render
            const renderedBuffer = await offlineCtx.startRendering();

            // Encode WAV & Download
            const wavData = audioBufferToWav(renderedBuffer);
            const blob = new Blob([new DataView(wavData)], { type: 'audio/wav' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = (appMode === 'mastering') ? 'Mastered_Track_Steve.wav' : 'Mix_Session_Steve.wav';
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);

            alert("✅ Exportación completada con éxito.");

        } catch (e) {
            console.error(e);
            alert("Error durante la exportación: " + e.message);
        } finally {
            btn.textContent = originalBtnText;
            btn.disabled = false;
        }
    }

    async function renderTrackToContext(ctx, sourceTrack, destNode) {
        if (!sourceTrack.buffer) return;

        // 1. Source
        const source = ctx.createBufferSource();
        source.buffer = sourceTrack.buffer;

        // 2. Re-build FX Chain in Offline CTX
        // We need a helper to clone settings to new nodes
        // Since we can't reuse valid AudioNodes in another context, we must instantiate new ones.
        // This effectively duplicates the code in FXChain constructor but parameterized.

        const chain = new FXChain(ctx);
        // Apply Settings
        const s = sourceTrack.fx.settings;

        chain.subLow.frequency.value = s.subLow;
        chain.subMid.gain.value = s.subMid;
        chain.subHigh.frequency.value = s.subHigh;

        chain.addLow.gain.value = s.addLow;
        chain.addMid.gain.value = s.addMid;
        chain.addHigh.gain.value = s.addHigh;

        chain.compressor.threshold.value = s.compThresh;
        chain.compressor.ratio.value = s.compRatio;

        // Saturation
        makeDistortionCurve(parseFloat(s.satDrive), chain.saturation);

        // Delay
        if (chain.delayNode && s.delayTime) {
            chain.delayNode.delayTime.value = s.delayTime / 1000;
            chain.delayFeedback.gain.value = s.delayFeedback / 100;
            const dMix = s.delayMix / 100;
            chain.delayWetNode.gain.value = dMix;
            chain.delayDryNode.gain.value = 1 - (dMix * 0.5);
        }

        // Reverb
        if (chain.reverbNode && s.verbSize) {
            // Need to generate impulse synchronously
            const newBuf = makeImpulseResponse(ctx, s.verbSize, s.verbSize);
            chain.reverbNode.buffer = newBuf;

            const rMix = s.verbMix / 100;
            chain.reverbWetNode.gain.value = rMix;
            chain.reverbDryNode.gain.value = 1 - (rMix * 0.5);
        }

        chain.limiter.threshold.value = s.limCeiling;

        // Gain
        const totalGainDb = s.limGain + s.compMakeup;
        chain.gain.gain.value = Math.pow(10, totalGainDb / 20);

        // Connect Source -> Chain Input
        source.connect(chain.input);

        // 3. Track Controls (Pan, Fader, Mute) - Only for mixing mode tracks basically
        // But mastering track has them too in class, though unused.

        const fader = ctx.createGain();
        fader.gain.value = sourceTrack.faderNode.gain.value;

        const mute = ctx.createGain();
        // Check if muted logic applies?
        // In mixing mode, we need to respect 'isMuted' property of the track object
        mute.gain.value = sourceTrack.isMuted ? 0 : 1;
        // Also Solo logic? If anySolo is true and track !isSoloed -> mute.
        const anySolo = mixTracks.some(t => t.isSoloed);
        if (appMode === 'mixing' && anySolo && !sourceTrack.isSoloed) {
            mute.gain.value = 0;
        }

        const pan = ctx.createStereoPanner();
        pan.pan.value = sourceTrack.panNode.pan.value;

        // Chain Output -> Fader -> Mute -> Pan -> Dest
        // chain.analyser is end of chain
        chain.analyser.connect(fader);
        fader.connect(mute);
        mute.connect(pan);
        pan.connect(destNode);

        source.start(0);
    }

    // WAV Encoder Helper
    function audioBufferToWav(buffer) {
        const numChannels = buffer.numberOfChannels;
        const sampleRate = buffer.sampleRate;
        const format = 1; // PCM
        const bitDepth = 16;

        let result;
        if (numChannels === 2) {
            result = interleave(buffer.getChannelData(0), buffer.getChannelData(1));
        } else {
            result = buffer.getChannelData(0);
        }

        return encodeWAV(result, numChannels, sampleRate, bitDepth);
    }

    function interleave(inputL, inputR) {
        const length = inputL.length + inputR.length;
        const result = new Float32Array(length);
        let index = 0;
        let inputIndex = 0;

        while (index < length) {
            result[index++] = inputL[inputIndex];
            result[index++] = inputR[inputIndex];
            inputIndex++;
        }
        return result;
    }

    function encodeWAV(samples, numChannels, sampleRate, bitDepth) {
        const buffer = new ArrayBuffer(44 + samples.length * 2);
        const view = new DataView(buffer);

        // RIFF chunk descriptor
        writeString(view, 0, 'RIFF');
        view.setUint32(4, 36 + samples.length * 2, true);
        writeString(view, 8, 'WAVE');
        // fmt sub-chunk
        writeString(view, 12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true); // format (1 = PCM)
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * numChannels * 2, true); // byte rate
        view.setUint16(32, numChannels * 2, true); // block align
        view.setUint16(34, 16, true); // bits per sample
        // data sub-chunk
        writeString(view, 36, 'data');
        view.setUint32(40, samples.length * 2, true);

        // write samples
        floatTo16BitPCM(view, 44, samples);

        return buffer;
    }

    function writeString(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }

    function floatTo16BitPCM(output, offset, input) {
        for (let i = 0; i < input.length; i++, offset += 2) {
            const s = Math.max(-1, Math.min(1, input[i]));
            output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        }
    }

    // --- PRESETS & WIZARD HOOKS ---
    window.isAudioLoaded = () => {
        if (appMode === 'mastering') return !!(masteringTrack && masteringTrack.buffer);
        return mixTracks.length > 0;
    };

    window.openFilePicker = () => {
        if (appMode === 'mastering') fileInput.click();
        else btnAddTrack.click();
    };

    window.applyPresetByGenre = function (genre) {
        if (!activeTrack) return;
        // Try instrument match first if in mixing mode
        let preset;
        if (appMode === 'mixing') {
            // Basic naive mapping of genre string to instrument key if possible
            // But wizard sends 'pop', 'rock'. 
            // If user asks for "Kick", the wizard might send "kick" if updated.
            preset = instrumentPresets[genre] || genrePresets[genre] || genrePresets['pop'];
        } else {
            preset = genrePresets[genre] || genrePresets['pop'];
        }

        const s = activeTrack.fx.settings;
        s.subLow = preset.subtractive_eq.low_cut;
        s.subMid = preset.subtractive_eq.mid_dip;
        s.subHigh = preset.subtractive_eq.high_cut;
        s.addLow = preset.additive_eq.low_boost;
        s.addMid = preset.additive_eq.presence;
        s.addHigh = preset.additive_eq.air;
        s.compThresh = preset.compression.threshold;
        s.compRatio = preset.compression.ratio;
        s.compMakeup = preset.compression.makeup;
        s.satDrive = preset.saturation.drive;
        s.limCeiling = preset.limiter.ceiling;
        s.limGain = preset.limiter.gain;

        loadSettingsToUI(s);
        updateAudioParams();
    };

    function applyStylePresetToTrack(track, styleKey) {
        if (!track || !track.fx) return;
        const preset = genrePresets[styleKey];
        if (!preset) return;

        const s = track.fx.settings;
        s.subLow = preset.subtractive_eq.low_cut;
        s.subMid = preset.subtractive_eq.mid_dip;
        s.subHigh = preset.subtractive_eq.high_cut;
        s.addLow = preset.additive_eq.low_boost;
        s.addMid = preset.additive_eq.presence;
        s.addHigh = preset.additive_eq.air;
        s.compThresh = preset.compression.threshold;
        s.compRatio = preset.compression.ratio;
        s.compMakeup = preset.compression.makeup;
        s.satDrive = preset.saturation.drive;
        s.limCeiling = preset.limiter.ceiling;
        s.limGain = preset.limiter.gain;

        if (preset.delay) {
            s.delayTime = preset.delay.time;
            s.delayFeedback = preset.delay.feedback;
            s.delayMix = preset.delay.mix;
            if (s.delayMix > 0) s.bypassDelay = false;
        }
        if (preset.reverb) {
            s.verbSize = preset.reverb.size;
            s.verbMix = preset.reverb.mix;
            if (s.verbMix > 0) s.bypassVerb = false;
        }

        // Update visual label
        track._styleLabel = styleKey.charAt(0).toUpperCase() + styleKey.slice(1);

        // Apply settings to live FX nodes
        try { applySettingsToFX(track); } catch (e) { console.error('applySettingsToFX error', e); }

        // If this track is currently selected in rack, update UI
        if (activeTrack && (activeTrack.id === track.id)) {
            loadSettingsToUI(s);
            updateAudioParams();
        }

        // Ensure mixer UI reflects label change
        try { renderMixer(); } catch (e) {}
    }

    function applyInstrumentPresetToTrack(track, instrKey) {
        if (!track || !track.fx) return;
        const preset = instrumentPresets[instrKey];
        if (!preset) return;

        const s = track.fx.settings;
        s.subLow = preset.subtractive_eq.low_cut;
        s.subMid = preset.subtractive_eq.mid_dip;
        s.subHigh = preset.subtractive_eq.high_cut;
        s.addLow = preset.additive_eq.low_boost;
        s.addMid = preset.additive_eq.presence;
        s.addHigh = preset.additive_eq.air;
        s.compThresh = preset.compression.threshold;
        s.compRatio = preset.compression.ratio;
        s.compMakeup = preset.compression.makeup;
        s.satDrive = preset.saturation.drive;
        s.limCeiling = preset.limiter.ceiling;
        s.limGain = preset.limiter.gain;

        if (preset.delay) {
            s.delayTime = preset.delay.time;
            s.delayFeedback = preset.delay.feedback;
            s.delayMix = preset.delay.mix;
            if (s.delayMix > 0) s.bypassDelay = false;
        }
        if (preset.reverb) {
            s.verbSize = preset.reverb.size;
            s.verbMix = preset.reverb.mix;
            if (s.verbMix > 0) s.bypassVerb = false;
        }

        // Update visual label
        const lbl = instrKey === 'vocal' ? 'Voz' : (instrKey === 'guitars' ? 'Guitarra' : (instrKey === 'hihat' ? 'HiHat' : (instrKey === 'keys' ? 'Teclas' : (instrKey.charAt(0).toUpperCase() + instrKey.slice(1)))));
        track._instrLabel = lbl;

        // Apply settings to live FX nodes
        try { applySettingsToFX(track); } catch (e) { console.error('applySettingsToFX error', e); }

        if (activeTrack && (activeTrack.id === track.id)) {
            loadSettingsToUI(s);
            updateAudioParams();
        }

        // Ensure mixer UI reflects label change
        try { renderMixer(); } catch (e) {}
    }

    function applySettingsToFX(track) {
        if (!track || !track.fx) return;
        const nodes = track.fx;
        const s = nodes.settings || {};

        function isBypassedFlag(v) {
            return v === true || v === 'true' || v === 1 || v === '1';
        }

        // Subtractive EQ
        const isSubBypassed = isBypassedFlag(s.bypassSub);
        nodes.subLow.frequency.value = isSubBypassed ? 10 : (s.subLow || 80);
        nodes.subMid.gain.value = isSubBypassed ? 0 : (s.subMid || 0);
        nodes.subHigh.frequency.value = isSubBypassed ? 22000 : (s.subHigh || 18000);

        // Additive EQ
        const isAddBypassed = isBypassedFlag(s.bypassAdd);
        nodes.addLow.gain.value = isAddBypassed ? 0 : (s.addLow || 0);
        nodes.addMid.gain.value = isAddBypassed ? 0 : (s.addMid || 0);
        nodes.addHigh.gain.value = isAddBypassed ? 0 : (s.addHigh || 0);

        // Compressor
        const isCompBypassed = isBypassedFlag(s.bypassComp);
        nodes.compressor.threshold.value = isCompBypassed ? 0 : (s.compThresh || -20);
        nodes.compressor.ratio.value = isCompBypassed ? 1 : (s.compRatio || 2);

        // Saturation
        const isSatBypassed = isBypassedFlag(s.bypassSat);
        if (isSatBypassed) makeDistortionCurve(0, nodes.saturation);
        else makeDistortionCurve(parseFloat(s.satDrive || 0), nodes.saturation);

        // Delay
        if (nodes.delayNode) {
            const isDelayBypassed = isBypassedFlag(s.bypassDelay);
            nodes.delayNode.delayTime.value = (s.delayTime || 250) / 1000;
            nodes.delayFeedback.gain.value = (s.delayFeedback || 0) / 100;
            const dMix = (s.delayMix || 0) / 100;
            if (isDelayBypassed) {
                nodes.delayWetNode.gain.value = 0;
                nodes.delayDryNode.gain.value = 1;
            } else {
                nodes.delayWetNode.gain.value = dMix;
                nodes.delayDryNode.gain.value = 1 - (dMix * 0.5);
            }
        }

        // Reverb
        if (nodes.reverbNode) {
            const isVerbBypassed = isBypassedFlag(s.bypassVerb);
            if (s.verbSize) {
                try { nodes.reverbNode.buffer = makeImpulseResponse(audioCtx, s.verbSize, s.verbSize); } catch (e) {}
            }
            const rMix = (s.verbMix || 0) / 100;
            if (isVerbBypassed) {
                nodes.reverbWetNode.gain.value = 0;
                nodes.reverbDryNode.gain.value = 1;
            } else {
                nodes.reverbWetNode.gain.value = rMix;
                nodes.reverbDryNode.gain.value = 1 - (rMix * 0.5);
            }
        }

        // Limiter/Gain
        const isLimBypassed = isBypassedFlag(s.bypassLim);
        if (isLimBypassed) nodes.gain.gain.value = 1.0;
        else {
            const effLimGain = s.limGain || 0;
            const effCompMakeup = s.compMakeup && !isCompBypassed ? s.compMakeup : 0;
            const totalGainDb = effLimGain + effCompMakeup;
            nodes.gain.gain.value = Math.pow(10, totalGainDb / 20);
        }
    }

    // --- VISUALIZATION MASTER ---
    const meterL = document.getElementById('master-out-l');
    const meterR = document.getElementById('master-out-r');

    function animate() {
        if (isPlaying && activeTrack) {
            const analyser = activeTrack.fx.analyser;
            const array = new Uint8Array(analyser.frequencyBinCount);
            analyser.getByteFrequencyData(array);
            let sum = 0;
            for (let i = 0; i < array.length; i++) sum += array[i];
            const avg = sum / array.length;
            const level = Math.min(100, (avg / 128) * 100);
            if (meterL) meterL.style.width = level + "%";
            if (meterR) meterR.style.width = (level * 0.95) + "%";
        }
        requestAnimationFrame(animate);
    }
    animate();

    // Init storage (Legacy support)
    function saveMasterSettings() {
        if (activeTrack !== masteringTrack) return;
        localStorage.setItem('masteringSteveSettings', JSON.stringify(activeTrack.fx.settings));
    }

    // --- Session Save / Load ---
    function arrayBufferToBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    function base64ToArrayBuffer(base64) {
        const binary_string = atob(base64);
        const len = binary_string.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binary_string.charCodeAt(i);
        }
        return bytes.buffer;
    }

    async function saveSession() {
        if (mixTracks.length === 0) return alert('No hay pistas en la sesión para guardar.');
        const includeAudio = confirm('¿Incluir los archivos de audio en el archivo de sesión? (El archivo será más grande)');

        const session = {
            createdAt: Date.now(),
            appMode: appMode,
            tracks: []
        };

        // Build session data
        for (const t of mixTracks) {
            const tr = {
                id: t.id,
                name: t.name,
                volume: t.volume || t.faderNode.gain.value,
                pan: t.panVal || t.panNode.pan.value,
                settings: t.fx ? t.fx.settings : null,
                styleLabel: t._styleLabel || null,
                instrLabel: t._instrLabel || null,
                audioData: null
            };

            if (includeAudio && t.buffer) {
                try {
                    const wav = audioBufferToWav(t.buffer);
                    const b64 = arrayBufferToBase64(wav);
                    tr.audioData = b64;
                } catch (e) {
                    console.error('Error serializing track audio:', e);
                }
            }

            session.tracks.push(tr);
        }

        const blob = new Blob([JSON.stringify(session)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'mix_session_' + Date.now() + '.json';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        // Also save to localStorage (only metadata)
        try { localStorage.setItem('lastMixSession', JSON.stringify(session)); } catch (e) { }
        alert('Sesión exportada. Si incluiste audio el archivo puede ser grande.');
    }

    async function loadSession() {
        initAudioContext();

        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json';
        input.onchange = async (e) => {
            if (e.target.files.length === 0) return;
            const file = e.target.files[0];
            try {
                const txt = await file.text();
                const session = JSON.parse(txt);

                // Reset current mix
                mixTracks.forEach(t => t.disconnect());
                mixTracks = [];

                for (const tr of session.tracks) {
                    const newTrack = new AudioTrack(audioCtx, tr.name || 'Track');
                    // Apply settings metadata
                    if (tr.settings && newTrack.fx) {
                        newTrack.fx.settings = Object.assign({}, newTrack.fx.settings, tr.settings);
                    }
                    // Apply settings to live FX nodes so loaded session reflects them
                    try { applySettingsToFX(newTrack); } catch (e) { console.error('applySettingsToFX on load error', e); }
                    // Restore visual labels if present
                    if (tr.styleLabel) newTrack._styleLabel = tr.styleLabel;
                    if (tr.instrLabel) newTrack._instrLabel = tr.instrLabel;
                    newTrack.volume = tr.volume || 1.0;
                    newTrack.faderNode.gain.value = newTrack.volume;
                    newTrack.panVal = tr.pan || 0;
                    newTrack.panNode.pan.value = newTrack.panVal;

                    // If audio data embedded, decode and assign buffer
                    if (tr.audioData) {
                        try {
                            const ab = base64ToArrayBuffer(tr.audioData);
                            const decoded = await audioCtx.decodeAudioData(ab.slice(0));
                            newTrack.buffer = decoded;
                        } catch (err) {
                            console.error('Error decoding embedded audio for track', tr.name, err);
                        }
                    }

                    mixTracks.push(newTrack);
                    newTrack.connect(mixMasterNode);
                }

                renderMixer();
                if (mixTracks.length > 0) selectMixTrack(mixTracks[0].id);
                alert('Sesión cargada. Si algunas pistas no contienen audio, carga los archivos manualmente en esas pistas.');
            } catch (err) {
                console.error('Error loading session:', err);
                alert('Error al cargar la sesión. Revisa la consola.');
            }
        };
        input.click();
    }

    // Default init
    initAudioContext();
    updatePresetDropdown('mastering');
});
