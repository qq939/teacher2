// ==========================================
// Audio / Visualizer Logic (Ref: transport_sound)
// ==========================================
const canvas = document.getElementById('visualizer');
const ctx = canvas ? canvas.getContext('2d') : null;
const btnPlay = document.getElementById('btn-play');
const btnStop = document.getElementById('btn-stop');
const latencyVal = document.getElementById('latency-val');

let audioContext;
let audioWorkletNode;
let analyser;
let ws;
let isAudioStarted = false;
let isManuallyStopped = false;

function resizeCanvas() {
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = 200;
}

if (canvas) {
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();
}

async function initAudio() {
    if (isAudioStarted) return;
    
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        audioContext = new AudioContext({
            sampleRate: 44100, // Match server
            latencyHint: 'interactive'
        });

        await audioContext.audioWorklet.addModule('/static/worklet-processor.js');
        
        audioWorkletNode = new AudioWorkletNode(audioContext, 'pcm-player');
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048;
        
        audioWorkletNode.connect(analyser);
        analyser.connect(audioContext.destination);
        
        isAudioStarted = true;
        isManuallyStopped = false;
        updateButtonState(true);
        connectWebSocket();
        drawVisualizer();
        
    } catch (e) {
        console.error("Audio init failed", e);
        alert("Audio init failed: " + e.message);
    }
}

function updateButtonState(playing) {
    if (!btnPlay || !btnStop || !latencyVal) return;
    
    if (playing) {
        btnPlay.disabled = true;
        btnStop.disabled = false;
        btnPlay.innerText = "RECEIVING...";
    } else {
        btnPlay.disabled = false;
        btnStop.disabled = true;
        btnPlay.innerText = "[ RECEIVE STREAM ]";
        latencyVal.innerText = "--";
    }
}

function stopAudio() {
    isManuallyStopped = true;
    if (ws) {
        ws.close();
        ws = null;
    }
    if (audioContext) {
        audioContext.close();
        audioContext = null;
    }
    isAudioStarted = false;
    audioWorkletNode = null;
    updateButtonState(false);
}

function connectWebSocket() {
    if (isManuallyStopped) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}/audio`);
    ws.binaryType = 'arraybuffer';
    
    ws.onopen = () => {
        console.log("WS Connected");
    };
    
    ws.onclose = () => {
        if (!isManuallyStopped) {
            console.log("WS Closed, retrying...");
            setTimeout(connectWebSocket, 2000);
        }
    };
    
    ws.onerror = (e) => {
        console.error("WS Error", e);
    };
    
    ws.onmessage = (event) => {
        if (!isAudioStarted || !audioWorkletNode) return;
        
        const rawData = event.data;
        if (rawData.byteLength <= 8) return; 
        
        const dataView = new DataView(rawData);
        const serverTime = dataView.getFloat64(0, true);
        const clientTime = Date.now() / 1000.0;
        const latency = clientTime - serverTime;
        
        if (Math.random() < 0.1 && latencyVal) {
             const ms = (latency * 1000).toFixed(0);
             latencyVal.innerText = ms;
             if (latency > 0.7) {
                 latencyVal.style.color = '#f00';
             } else {
                 latencyVal.style.color = '#0f0';
             }
        }
        
        const int16Data = new Int16Array(rawData.slice(8));
        const float32Data = new Float32Array(int16Data.length);
        
        for (let i = 0; i < int16Data.length; i++) {
            float32Data[i] = int16Data[i] / 32768.0;
        }
        
        audioWorkletNode.port.postMessage({
            timestamp: serverTime,
            audioData: float32Data
        });
    };
}

function drawVisualizer() {
    if (!isAudioStarted) return;
    requestAnimationFrame(drawVisualizer);
    
    if (!analyser || !ctx || !canvas) return;
    
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    analyser.getByteTimeDomainData(dataArray);
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#0f0';
    ctx.beginPath();
    
    const sliceWidth = canvas.width * 1.0 / bufferLength;
    let x = 0;
    
    for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = v * canvas.height / 2;
        
        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
        
        x += sliceWidth;
    }
    
    ctx.lineTo(canvas.width, canvas.height / 2);
    ctx.stroke();
}

if (btnPlay) {
    btnPlay.addEventListener('click', async () => {
        await initAudio();
    });
}

if (btnStop) {
    btnStop.addEventListener('click', () => {
        stopAudio();
    });
}

updateButtonState(false);


// ==========================================
// Submit Sentence Logic
// ==========================================
const btnSubmit = document.getElementById('btn-submit');
const sentenceInput = document.getElementById('sentence-input');
const logsContent = document.getElementById('logs-content');

if (btnSubmit) {
    btnSubmit.addEventListener('click', submitSentence);
}

if (sentenceInput) {
    sentenceInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') submitSentence();
    });
}

async function submitSentence() {
    const sentence = sentenceInput.value.trim();
    if (!sentence) return;

    if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.innerText = "[ Processing... ]";
    }

    try {
        const response = await fetch('/api/analyze', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ sentence: sentence })
        });

        const data = await response.json();
        
        if (data.error) {
            alert('Error: ' + data.error);
        } else {
            addLogEntry(data);
            sentenceInput.value = '';
        }
    } catch (error) {
        console.error('Error:', error);
        alert('An error occurred while processing the request.');
    } finally {
        if (btnSubmit) {
            btnSubmit.disabled = false;
            btnSubmit.innerText = "[ 提交识别 ]";
        }
    }
}

function addLogEntry(data) {
    const entryDiv = document.createElement('div');
    entryDiv.className = 'log-entry';
    
    // Highlight vocabulary in sentence
    let sentenceHtml = data.sentence;
    const vocab = data.vocabulary || {};
    // Handle both dict and list for compatibility
    const vocabList = Array.isArray(vocab) ? vocab : Object.keys(vocab);
    
    // Sort by length desc to avoid partial matches inside longer words
    vocabList.sort((a, b) => b.length - a.length);
    
    vocabList.forEach(word => {
        // Escape special regex chars
        const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\b${escapedWord}\\b`, 'gi');
        sentenceHtml = sentenceHtml.replace(regex, `<span style="color: #0f0; font-weight: bold;">$&</span>`);
    });

    const vocabString = vocabList.join(', ');

    entryDiv.innerHTML = `
        <div class="log-sentence">${sentenceHtml}</div>
        <div class="vocab-list">Vocabulary: ${vocabString}</div>
        <div class="history-info">Source: ${data.source || 'Unknown'}</div>
    `;

    // Prepend to logs content
    if (logsContent) {
        logsContent.insertBefore(entryDiv, logsContent.firstChild);
    }
}

// ==========================================
// History Logic
// ==========================================
const btnFilter = document.getElementById('btn-filter');
const btnDownload = document.getElementById('btn-download');
const listArea = document.getElementById('history-list');
const startDateInput = document.getElementById('start-date');
const endDateInput = document.getElementById('end-date');

if (btnFilter) {
    // Set default dates (last 30 days)
    const today = new Date();
    const lastMonth = new Date();
    lastMonth.setDate(today.getDate() - 30);
    
    endDateInput.valueAsDate = today;
    startDateInput.valueAsDate = lastMonth;

    btnFilter.addEventListener('click', loadHistory);
    btnDownload.addEventListener('click', downloadHistory);
}

let currentHistoryData = [];

function switchTab(tab) {
    const logsContent = document.getElementById('logs-content');
    const historyContent = document.getElementById('history-content');
    const btns = document.querySelectorAll('.tab-btn');
    
    if (tab === 'current') {
        logsContent.style.display = 'block';
        historyContent.style.display = 'none';
        btns[0].classList.add('active');
        btns[1].classList.remove('active');
    } else {
        logsContent.style.display = 'none';
        historyContent.style.display = 'block';
        btns[0].classList.remove('active');
        btns[1].classList.add('active');
        // Auto load history if empty
        if (currentHistoryData.length === 0) {
            loadHistory();
        }
    }
}

async function loadHistory() {
    const start = startDateInput.value;
    const end = endDateInput.value;
    
    listArea.innerHTML = '<div style="color:#0f0;">Loading...</div>';

    try {
        const res = await fetch(`/api/history?start_date=${start}&end_date=${end}`);
        currentHistoryData = await res.json();
        renderHistory(currentHistoryData);
    } catch (err) {
        listArea.innerHTML = `<div style="color:#f00;">Error: ${err.message}</div>`;
    }
}

function renderHistory(data) {
    listArea.innerHTML = '';
    if (!data || data.length === 0) {
        listArea.innerHTML = '<div style="color:#aaa;">No records found.</div>';
        return;
    }

    // Sort by timestamp desc
    data.sort((a, b) => {
        const ta = new Date(a.timestamp).getTime() || a.timestamp;
        const tb = new Date(b.timestamp).getTime() || b.timestamp;
        return tb - ta;
    });

    data.forEach(entry => {
        const div = document.createElement('div');
        div.className = 'history-entry';
        
        let ts = entry.timestamp;
        if (typeof ts === 'number') {
            ts = new Date(ts * 1000).toLocaleString();
        }

        let vocabHtml = '';
        let wordsToHighlight = [];
        
        // Vocabulary can be dict (new) or list (old)
        if (Array.isArray(entry.vocabulary)) {
            // Old format: List[str]
            vocabHtml = entry.vocabulary.join(', ');
            wordsToHighlight = [...entry.vocabulary];
        } else if (entry.vocabulary && typeof entry.vocabulary === 'object') {
            // New format: Dict[word, count]
            vocabHtml = Object.keys(entry.vocabulary).map(w => `${w} (${entry.vocabulary[w]})`).join(', ');
            wordsToHighlight = Object.keys(entry.vocabulary);
        }

        // Highlight words in sentence
        let sentenceHtml = entry.sentence;
        // Sort by length desc to avoid partial replacement issues
        wordsToHighlight.sort((a, b) => b.length - a.length);
        
        wordsToHighlight.forEach(word => {
            if (!word) return;
            // Escape special chars for regex
            const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            // Try to match whole word
            const regex = new RegExp(`\\b${escapedWord}\\b`, 'gi');
            sentenceHtml = sentenceHtml.replace(regex, `<span style="color: #0f0; font-weight: bold;">$&</span>`);
        });

        div.innerHTML = `
            <div class="entry-header">
                <span>Time: ${ts}</span>
                <span>Source: ${entry.source || 'Unknown'}</span>
            </div>
            <div class="entry-sentence">${sentenceHtml}</div>
            <div class="entry-vocab">Vocabulary: ${vocabHtml || 'None'}</div>
        `;
        listArea.appendChild(div);
    });
}

function downloadHistory() {
    if (!currentHistoryData || currentHistoryData.length === 0) {
        alert("No data to download!");
        return;
    }
    
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(currentHistoryData, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "history_export.json");
    document.body.appendChild(downloadAnchorNode); // required for firefox
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
}
