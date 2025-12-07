// wizard.js - lógica del asistente de presets (chatbot simulado)

let presets = [];

// Intentar cargar presets desde presets.json; si falla (ej. file://) usar fallback embebido
async function loadPresets() {
    try {
        const res = await fetch('presets.json');
        if (!res.ok) throw new Error('No se pudo cargar presets.json');
        const data = await res.json();
        presets = data;
    } catch (err) {
        console.error('presets.json load failed, using fallback:', err);
        // Fallback sencillo para que el wizard funcione sin servidor
        presets = [
            { id: 'rock‑tight', name: 'Rock – Tight', genre: 'Rock', description: 'Punchy low‑end, bright highs, +2 dB loudness.', tags: ['rock','energetic','drums'] },
            { id: 'pop‑airy', name: 'Pop – Airy', genre: 'Pop', description: 'Wide stereo, gentle tape saturation, +1.5 dB loudness.', tags: ['pop','vocal','bright'] },
            { id: 'hiphop‑bass', name: 'Hip‑Hop – Bass‑Heavy', genre: 'Hip‑Hop', description: 'Deep sub‑bass, tight mids, +3 dB loudness.', tags: ['hiphop','bass','urban'] },
            { id: 'classical‑warm', name: 'Clásica – Warm', genre: 'Clásica', description: 'Natural dynamics, subtle warmth, no limit clipping.', tags: ['classical','orchestral','dynamic'] }
        ];
    }
}

loadPresets();

const state = {
    step: 0,
    answers: {},
    candidates: []
};

let aiInterval = null; // referencia para cancelar la simulación de análisis

const steps = [
    {
        question: '¿Qué género describe mejor tu pista?',
        options: ['Rock', 'Pop', 'Hip‑Hop', 'Clásica', 'Otro'],
        handler: answer => {
            state.answers.genre = answer;
            state.candidates = presets.filter(p => p.genre.toLowerCase() === answer.toLowerCase());
            if (state.candidates.length === 0) state.candidates = presets;
        }
    },
    {
        question: '¿Cuál es el objetivo principal del sonido?',
        options: ['Más potencia en bajos', 'Voces más claras', 'Mayor amplitud estéreo', 'Mantener dinámica natural'],
        handler: answer => {
            state.answers.goal = answer;
            const map = {
                'bajos': ['bass', 'hiphop'],
                'claras': ['vocal', 'pop'],
                'estéreo': ['air', 'pop', 'rock'],
                'dinámica': ['classical', 'warm']
            };
            const keywords = Object.entries(map)
                .filter(([k]) => answer.toLowerCase().includes(k))
                .flatMap(([, v]) => v);
            if (keywords.length) {
                state.candidates = state.candidates.filter(p =>
                    keywords.some(k => p.tags.includes(k))
                );
            }
        }
    },
    {
        question: '¿Qué nivel de loudness buscas?',
        options: ['Máximo (radio)', 'Moderado (streaming)', 'Dinámico (álbum)'],
        handler: answer => {
            state.answers.loudness = answer;
            if (answer === 'Máximo (radio)') {
                state.candidates = state.candidates.filter(p =>
                    /\+\d/.test(p.description) && parseInt(p.description.match(/\+(\d)/)[1]) >= 2
                );
            } else if (answer === 'Dinámico (álbum)') {
                state.candidates = state.candidates.filter(p =>
                    /natural|no limit/i.test(p.description)
                );
            }
        }
    }
];

const bodyEl = document.getElementById('wizard-body');
const optsEl = document.getElementById('wizard-options');

function addMessage(text, from = 'bot') {
    const div = document.createElement('div');
    div.className = `message ${from}`;
    div.textContent = text;
    bodyEl.appendChild(div);
    bodyEl.scrollTop = bodyEl.scrollHeight;
}

function renderOptions(options) {
    optsEl.innerHTML = '';
    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.textContent = opt;
        btn.onclick = () => handleAnswer(opt);
        optsEl.appendChild(btn);
    });
}

function startWizard() {
    // Reiniciar estado y UI
    state.step = 0;
    state.answers = {};
    state.candidates = presets;
    bodyEl.innerHTML = '';
    optsEl.innerHTML = '';

    const first = steps[0];
    addMessage(first.question);
    renderOptions(first.options);
}

function handleAnswer(answer) {
    addMessage(answer, 'user');
    const cur = steps[state.step];
    cur.handler(answer);
    state.step++;
    if (state.step < steps.length) {
        const next = steps[state.step];
        setTimeout(() => {
            addMessage(next.question);
            renderOptions(next.options);
        }, 300);
    } else {
        setTimeout(showResult, 400);
    }
}

// Wizard toggle logic
const widget = document.getElementById('wizard-widget');
const toggleBtn = document.getElementById('wizard-toggle');

toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    widget.classList.toggle('minimized');
    toggleBtn.textContent = widget.classList.contains('minimized') ? 'maximizar' : '_';
});
// Allow maximizing by clicking the header when minimized
widget.querySelector('.wizard-header').addEventListener('click', () => {
    if (widget.classList.contains('minimized')) {
        widget.classList.remove('minimized');
        toggleBtn.textContent = '_';
    }
});

function showResult() {
    optsEl.innerHTML = '';

    // Si no hay audio cargado, pedir al usuario que cargue uno y ofrecer botón
    if (!(window && typeof window.isAudioLoaded === 'function' && window.isAudioLoaded())) {
        addMessage('No detecto audio cargado. Por favor carga tu pista para que pueda analizarla.');
        const loadBtn = document.createElement('button');
        loadBtn.className = 'option-btn';
        loadBtn.textContent = 'Cargar audio';
        loadBtn.onclick = () => {
            if (window && typeof window.openFilePicker === 'function') window.openFilePicker();
            addMessage('Abriendo selector de archivos...');
        };
        optsEl.appendChild(loadBtn);
        return;
    }

    // Simulate AI processing
    const processingHTML = `
        <div class="ai-progress-container" id="ai-loader">
            <div class="ai-status-text" id="ai-status">Analizando audio...</div>
            <div class="progress-bar-bg">
                <div class="progress-bar-fill" id="ai-progress-fill"></div>
            </div>
        </div>
    `;
    bodyEl.insertAdjacentHTML('beforeend', processingHTML);
    bodyEl.scrollTop = bodyEl.scrollHeight;

    const progressBar = document.getElementById('ai-progress-fill');
    const statusText = document.getElementById('ai-status');

    const steps = [
        { pct: '30%', text: 'Detectando género...' },
        { pct: '60%', text: 'Optimizando rango dinámico...' },
        { pct: '85%', text: 'Ajustando imagen estéreo...' },
        { pct: '100%', text: '¡Configuración completada!' }
    ];

    let stepIndex = 0;

    // Guardar la referencia del intervalo para poder cancelarlo si el usuario reinicia
    if (aiInterval) clearInterval(aiInterval);
    aiInterval = setInterval(() => {
        if (stepIndex >= steps.length) {
            clearInterval(aiInterval);
            aiInterval = null;
            // Remove loader and show final result
            const loader = document.getElementById('ai-loader');
            if (loader) loader.remove();
            renderFinalCard();
        } else {
            const s = steps[stepIndex];
            progressBar.style.width = s.pct;
            statusText.textContent = s.text;
            stepIndex++;
        }
    }, 800);
}

function renderFinalCard() {
    const best = state.candidates[0] || presets[0];
    const html = `
    <div class="result-card">
      <h2>✅ Preset recomendado</h2>
      <p><strong>${best.name}</strong> – ${best.description}</p>
            <button class="option-btn" id="accept-btn" style="margin-top:10px; width:100%;">Usar este preset</button>
            <button class="option-btn" id="reject-btn" style="margin-top:8px; width:100%;">No me gusta — Reiniciar asistente</button>
    </div>
  `;
    bodyEl.insertAdjacentHTML('beforeend', html);
    bodyEl.scrollTop = bodyEl.scrollHeight;

    document.getElementById('accept-btn').onclick = () => {
        // Aplicar preset al UI usando la función expuesta por script.js (si existe)
        if (window && typeof window.applyPresetByGenre === 'function') {
            window.applyPresetByGenre(best.genre || best.name);
            addMessage('Preset aplicado al panel. Puedes reproducir para escuchar los cambios.', 'bot');
        } else {
            addMessage('Preset seleccionado. Continúa con el pago.', 'bot');
        }
        document.getElementById('accept-btn').disabled = true;
        document.getElementById('accept-btn').textContent = 'Seleccionado';
    };

    // Botón para reiniciar si al usuario no le gusta la recomendación
    const rej = document.getElementById('reject-btn');
    if (rej) {
        rej.onclick = () => {
            addMessage('Reiniciando asistente...', 'bot');
            resetWizard();
        };
    }
}

function resetWizard() {
    // Cancelar simulación AI si está corriendo
    try {
        if (aiInterval) {
            clearInterval(aiInterval);
            aiInterval = null;
        }
        const loader = document.getElementById('ai-loader');
        if (loader) loader.remove();
    } catch (e) { /* ignore */ }

    // Limpiar UI y estado
    bodyEl.innerHTML = '';
    optsEl.innerHTML = '';
    state.step = 0;
    state.answers = {};
    state.candidates = presets;

    // Reiniciar conversación
    setTimeout(() => startWizard(), 150);
}

// Hook para el botón de reinicio en la cabecera
const resetBtn = document.getElementById('wizard-reset');
if (resetBtn) {
    resetBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        addMessage('Reiniciando asistente...', 'bot');
        resetWizard();
    });
}

// Start wizard only if not already started (guard for multiple loads)
if (!state.started) {
    state.started = true;
    window.addEventListener('load', startWizard);
}
