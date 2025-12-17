// Mr.Jiang Audio Stream Client

const btnPlay = document.getElementById('btn-play');
const btnStop = document.getElementById('btn-stop');
const latencyVal = document.getElementById('latency-val');
const canvas = document.getElementById('visualizer');
// Safe context retrieval
const canvasCtx = canvas ? canvas.getContext('2d') : null;

let audioCtx = null;
let workletNode = null;
let scriptProcessor = null;
let ws = null;
let isPlaying = false;
let analyser = null;
let drawVisual = null;
let queue = [];
let buffer = new Float32Array(0);
let lastTimestamp = 0;
const maxQueueLength = 10;

const btnSubmit = document.getElementById('btn-submit');
const sentenceInput = document.getElementById('sentence-input');
const logsContent = document.getElementById('logs-content');
const stagingArea = document.getElementById('staging-area');
const tabLog = document.getElementById('tab-log');
const tabHistory = document.getElementById('tab-history');
const historyContent = document.getElementById('history-content');
const historyHint = document.getElementById('history-hint');
const historyList = document.getElementById('history-list');
const historyStart = document.getElementById('history-start');
const historyEnd = document.getElementById('history-end');
const historyFilterBtn = document.getElementById('history-filter-btn');
const historyDownloadBtn = document.getElementById('history-download-btn');
let historyCache = [];

function initHistoryView() {
    if (!historyList || !historyStart || !historyEnd) return;
    if (!historyStart.value || !historyEnd.value) {
        const today = new Date();
        const lastMonth = new Date();
        lastMonth.setDate(today.getDate() - 30);
        historyEnd.valueAsDate = today;
        historyStart.valueAsDate = lastMonth;
    }
    loadHistoryData();
}

async function loadHistoryData() {
    if (!historyList || !historyStart || !historyEnd) return;
    const start = historyStart.value;
    const end = historyEnd.value;
    historyList.innerHTML = '<div style="color:#0f0;">Loading...</div>';
    try {
        const res = await fetch(`/api/history?start_date=${start}&end_date=${end}`);
        historyCache = await res.json();
        renderHistoryList(historyCache);
        if (historyHint) historyHint.textContent = `共 ${historyCache.length} 条历史记录`;
    } catch (err) {
        historyList.innerHTML = `<div style="color:#f00;">Error: ${err.message}</div>`;
    }
}

function renderHistoryList(data) {
    if (!historyList) return;
    historyList.innerHTML = '';
    if (!data || data.length === 0) {
        historyList.innerHTML = '<div style="color:#aaa;">No records found.</div>';
        return;
    }
    const sorted = [...data].sort((a, b) => {
        const ta = new Date(a.timestamp).getTime() || a.timestamp;
        const tb = new Date(b.timestamp).getTime() || b.timestamp;
        return tb - ta;
    });
    sorted.forEach(entry => {
        const div = document.createElement('div');
        div.style.border = '1px solid #050';
        div.style.marginBottom = '10px';
        div.style.padding = '10px';
        let ts = entry.timestamp;
        if (typeof ts === 'number') {
            ts = new Date(ts * 1000).toLocaleString();
        }
        let vocabHtml = '';
        let words = [];
        if (Array.isArray(entry.vocabulary)) {
            vocabHtml = entry.vocabulary.join(', ');
            words = [...entry.vocabulary];
        } else if (entry.vocabulary && typeof entry.vocabulary === 'object') {
            vocabHtml = Object.keys(entry.vocabulary).map(w => `${w} (${entry.vocabulary[w]})`).join(', ');
            words = Object.keys(entry.vocabulary);
        }
        let sentenceHtml = entry.sentence || '';
        words.sort((a, b) => b.length - a.length);
        words.forEach(word => {
            if (!word) return;
            const escaped = word.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');
            const regex = new RegExp(`\\\\b${escaped}\\\\b`, 'gi');
            sentenceHtml = sentenceHtml.replace(regex, `<span style=\"color: #0f0; font-weight: bold;\">$&</span>`);
        });
        div.innerHTML = `
            <div style="color:#aaa;font-size:12px;margin-bottom:5px;display:flex;justify-content:space-between;border-bottom:1px dashed #030;padding-bottom:3px;">
                <span>Time: ${ts}</span>
                <span>Source: ${entry.source || 'Unknown'}</span>
            </div>
            <div style="color:#fff;font-size:14px;margin-bottom:5px;">${sentenceHtml}</div>
            <div style="color:#0f0;font-size:12px;">Vocabulary: ${vocabHtml || 'None'}</div>
        `;
        historyList.appendChild(div);
    });
}

if (historyFilterBtn) {
    historyFilterBtn.addEventListener('click', loadHistoryData);
}

if (historyDownloadBtn) {
    historyDownloadBtn.addEventListener('click', () => {
        if (!historyCache || historyCache.length === 0) {
            alert('No data to download!');
            return;
        }
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(historyCache, null, 2));
        const a = document.createElement('a');
        a.setAttribute('href', dataStr);
        a.setAttribute('download', 'history_export.json');
        document.body.appendChild(a);
        a.click();
        a.remove();
    });
}

// Quiz State
let currentQuizData = null;
let currentQuizResults = [];
let currentWordIndex = 0;

// Adjust canvas size
function resizeCanvas() {
    if (!canvas || !canvas.parentElement) return;
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
}
if (canvas) {
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();
}

if (btnPlay) btnPlay.addEventListener('click', startStream);
if (btnStop) btnStop.addEventListener('click', stopStream);

// New Event Listeners for Assistant
if (btnSubmit) {
    btnSubmit.addEventListener('click', submitSentence);
}
if (sentenceInput) {
    sentenceInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            submitSentence();
        }
    });
}

if (tabLog && tabHistory && logsContent && historyContent) {
    tabLog.addEventListener('click', () => {
        tabLog.style.borderColor = '#0f0';
        tabLog.style.color = '#0f0';
        tabHistory.style.borderColor = '#050';
        tabHistory.style.color = '#050';
        logsContent.style.display = 'block';
        historyContent.style.display = 'none';
        if (historyHint) historyHint.textContent = '';
    });
    tabHistory.addEventListener('click', () => {
        tabLog.style.borderColor = '#050';
        tabLog.style.color = '#050';
        tabHistory.style.borderColor = '#0f0';
        tabHistory.style.color = '#0f0';
        logsContent.style.display = 'none';
        historyContent.style.display = 'flex';
        historyContent.style.flexDirection = 'column';
        if (historyHint) historyHint.textContent = '加载最近30天历史记录中...';
        initHistoryView();
    });
}

// Check for autoSentence from server
if (window.autoSentence === undefined || window.autoSentence === null) {
    const autoSentenceScript = document.getElementById('auto-sentence');
    if (autoSentenceScript) {
        try {
            window.autoSentence = JSON.parse(autoSentenceScript.textContent || 'null');
        } catch (e) {
            window.autoSentence = null;
        }
    } else {
        const autoSentenceMeta = document.querySelector('meta[name="auto-sentence"]');
        if (autoSentenceMeta) {
            try {
                window.autoSentence = JSON.parse(autoSentenceMeta.getAttribute('content') || 'null');
            } catch (e) {
                window.autoSentence = null;
            }
        }
    }
}
if (window.autoSentence === undefined || window.autoSentence === null || window.autoSentence === '') {
    try {
        const params = new URLSearchParams(window.location.search);
        let urlSentence = params.get('auto_sentence');
        if (!urlSentence) urlSentence = params.get('auto_sentance');
        if (urlSentence) window.autoSentence = urlSentence;
    } catch (e) {
        // ignore
    }
}
if (window.autoSentence && sentenceInput && !window.__autoSentenceDidSubmit) {
    window.__autoSentenceDidSubmit = true;
    sentenceInput.value = String(window.autoSentence).replace(/[\r\n]+/g, ' ').trim();
    sentenceInput.focus();
    setTimeout(() => {
        if (btnSubmit) {
            btnSubmit.click();
        } else {
            submitSentence();
        }
    }, 0);
}

async function submitSentence() {
    if (!sentenceInput) return;
    const sentence = sentenceInput.value.trim();
    if (!sentence) return;

    // UI Feedback
    if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = '[ 分析中... ]';
    }
    
    // Show staging area
    if (stagingArea) {
        stagingArea.style.display = 'block';
        stagingArea.textContent = sentence;
        stagingArea.style.color = '#0f0'; // Normal color
    }
    
    // Clear log area
    if (logsContent) logsContent.innerHTML = '';
    
    // Clear token stats if any
    const existingStats = document.getElementById('token-stats');
    if (existingStats) existingStats.remove();

    try {
        const response = await fetch('/api/analyze', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ sentence: sentence })
        });

        const data = await response.json();
        
        if (response.ok) {
            if (data.error) {
                addLogEntry("Error: " + data.error, "system");
            } else {
                // Show Token Stats
                if (data.token_usage) {
                    showTokenStats(data.token_usage);
                }
                startQuiz(data);
            }
        } else {
            addLogEntry("Server Error: " + (data.error || response.statusText), "system");
        }

    } catch (err) {
        console.error("Submission error:", err);
        addLogEntry("Network Error: " + err.message, "system");
    } finally {
        // Reset UI
        if (btnSubmit) {
            btnSubmit.disabled = false;
            btnSubmit.innerHTML = '[ 提交识别 ]';
        }
        if (sentenceInput) sentenceInput.value = '';
    }
}

function showTokenStats(usage) {
    // usage: { total_tokens, completion_tokens, prompt_tokens }
    // Insert next to "日志" label in #log-area
    
    // Find the log area header div
    const logHeader = document.querySelector('#log-area > div:first-child');
    if (logHeader) {
        // Create stats span
        const statsSpan = document.createElement('span');
        statsSpan.id = 'token-stats';
        statsSpan.style.float = 'right';
        statsSpan.style.fontSize = '12px';
        statsSpan.style.color = '#aaa';
        
        statsSpan.innerHTML = `Tokens: Total ${usage.total_tokens || 0} (Prompt ${usage.prompt_tokens || 0}, Completion ${usage.completion_tokens || 0})`;
        
        logHeader.appendChild(statsSpan);
    }
}

function startQuiz(data) {
    currentQuizData = data;
    currentQuizResults = [];
    currentWordIndex = 0;
    
    // data structure: { words: [{word, meaning, options}], source: "", timestamp: ..., sentence: "" }
    
    if (!data.words || data.words.length === 0) {
        // No difficult words, directly finish
        finishQuiz();
        return;
    }
    
    showNextWordCard();
}

function showNextWordCard() {
    if (!logsContent) return;
    if (currentWordIndex >= currentQuizData.words.length) {
        finishQuiz();
        return;
    }
    
    const wordInfo = currentQuizData.words[currentWordIndex];
    const options = shuffleArray([...wordInfo.options]);
    
    // Create Card UI in logsContent
    const card = document.createElement('div');
    card.className = 'log-entry';
    card.style.border = '1px solid #0f0';
    card.style.padding = '10px';
    card.style.margin = '10px 0';
    
    let html = `<div style="font-size: 20px; color: #fff; margin-bottom: 10px;">Quiz: ${wordInfo.word}</div>`;
    html += `<div style="font-size: 14px; color: #aaa; margin-bottom: 10px;">Select the correct meaning:</div>`;
    
    // Options
    options.forEach((opt, idx) => {
        html += `<button class="quiz-option" data-opt="${opt}" style="display:block; width:100%; text-align:left; margin:5px 0; padding:8px; border:1px solid #050; background:transparent; color:#0f0; cursor:pointer;">${idx + 1}. ${opt}</button>`;
    });
    
    logsContent.innerHTML = ''; // Clear previous
    logsContent.appendChild(card);
    card.innerHTML = html;
    
    // Add listeners
    const btns = card.querySelectorAll('.quiz-option');
    btns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const selected = e.target.getAttribute('data-opt');
            const isCorrect = selected === wordInfo.meaning;
            
            currentQuizResults.push({
                word: wordInfo.word,
                isCorrect: isCorrect,
                selected: selected,
                correctMeaning: wordInfo.meaning
            });
            
            // Feedback
            if (isCorrect) {
                e.target.style.background = '#050';
                e.target.innerHTML += ' ✅';
            } else {
                e.target.style.background = '#500';
                e.target.innerHTML += ' ❌';
                // Highlight correct one
                btns.forEach(b => {
                    if (b.getAttribute('data-opt') === wordInfo.meaning) {
                        b.style.background = '#050';
                        b.style.innerHTML += ' (Correct)';
                    }
                });
            }
            
            // Disable all
            btns.forEach(b => b.disabled = true);
            
            // Next after delay
            setTimeout(() => {
                currentWordIndex++;
                showNextWordCard();
            }, 1500);
        });
    });
}

async function finishQuiz() {
    // Calculate results
    const resultsPayload = {
        sentence: currentQuizData.sentence,
        source: currentQuizData.source,
        timestamp: currentQuizData.timestamp,
        results: currentQuizResults.map(r => ({
            word: r.word,
            is_correct: r.isCorrect
        }))
    };
    
    if (logsContent) logsContent.innerHTML = '<div class="log-entry" style="color:#0f0;">Submitting results...</div>';
    
    try {
        const response = await fetch('/api/submit_quiz', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(resultsPayload)
        });
        
        const data = await response.json();
        
        // Show Final Summary
        displayFinalSummary(data);
        
    } catch (err) {
        console.error("Quiz submission error:", err);
        addLogEntry("Quiz Submission Error: " + err.message, "system");
    }
}

function displayFinalSummary(responseData) {
    if (!logsContent) return;
    logsContent.innerHTML = '';
    
    // 1. Show Sentence in logs
    addLogEntry(currentQuizData.sentence, "user");
    
    // 2. Show Staging Area (highlight wrong words if any)
    if (stagingArea) {
        let sentenceHtml = currentQuizData.sentence;
        const wrongWords = currentQuizResults.filter(r => !r.isCorrect).map(r => r.word);
        
        // Simple replace for highlighting (case insensitive)
        wrongWords.forEach(w => {
            const regex = new RegExp(`\\b${w}\\b`, 'gi');
            sentenceHtml = sentenceHtml.replace(regex, `<span style="color:#f00; border-bottom:1px dashed #f00;">$&</span>`);
        });
        
        stagingArea.innerHTML = sentenceHtml;
        stagingArea.style.color = wrongWords.length > 0 ? '#fff' : '#0f0';
    }
    
    // 3. Show Result Log
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    
    let html = `<div class="log-sentence" style="color: #fff;">Analysis Result:</div>`;
    
    if (currentQuizData.words.length > 0) {
        html += `<div class="vocab-list">Difficult Words (IELTS): `;
        currentQuizData.words.forEach(w => {
            // Find if this word was answered incorrectly
            // But currentQuizResults might not have it if quiz was interrupted or something
            // But we assume full completion here.
            const result = currentQuizResults.find(r => r.word === w.word);
            const isWrong = result && !result.isCorrect;
            
            const style = isWrong ? 'color:#f00; border-bottom:1px solid #f00;' : 'color:#0f0;';
            html += `<span class="vocab-item" style="${style}" title="${w.meaning}">${w.word}</span>`;
        });
        html += `</div>`;
    } else {
        html += `<div class="vocab-list">No difficult words found.</div>`;
    }
    
    if (currentQuizData.source && currentQuizData.source !== "Unknown") {
         html += `<div class="history-info">Guessed Source Style: ${currentQuizData.source}</div>`;
    }
    
    if (responseData.message) {
        html += `<div class="history-info" style="margin-top:10px;">Server: ${responseData.message}</div>`;
    }
    
    entry.innerHTML = html;
    logsContent.appendChild(entry);
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function addLogEntry(text, type) {
    if (!logsContent) return;
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    
    if (type === "user") {
        entry.innerHTML = `<div class="log-sentence" style="color: #0f0;">> ${text}</div>`;
    } else {
        entry.innerHTML = `<div class="log-sentence" style="color: #f00;">System: ${text}</div>`;
    }
    
    logsContent.prepend(entry);
}

// ... Audio functions ...
async function startStream() {
    if (isPlaying) return;

    // Reset state variables
    queue = [];
    buffer = new Float32Array(0);
    lastTimestamp = 0;

    try {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: 44100,
                latencyHint: 'interactive'
            });
        }
        
        if (audioCtx.state === 'suspended') {
            await audioCtx.resume();
        }

        let useWorklet = false;
        try {
            await audioCtx.audioWorklet.addModule('/static/worklet-processor.js');
            workletNode = new AudioWorkletNode(audioCtx, 'pcm-player');
            useWorklet = true;
        } catch (e) {
            scriptProcessor = audioCtx.createScriptProcessor(2048, 1, 1);
            scriptProcessor.onaudioprocess = (ev) => {
                const out = ev.outputBuffer.getChannelData(0);
                let offset = 0;
                while (offset < out.length) {
                    if (buffer.length === 0) {
                        if (queue.length === 0) {
                            for (let i = 0; i < out.length; i++) out[i] = 0;
                            break;
                        } else {
                            buffer = queue.shift();
                        }
                    }
                    const need = out.length - offset;
                    const avail = buffer.length;
                    const n = Math.min(need, avail);
                    out.set(buffer.subarray(0, n), offset);
                    buffer = buffer.subarray(n);
                    offset += n;
                }
            };
        }
        
        // Create Analyser for visualization
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 2048;
        
        if (workletNode) {
            workletNode.connect(analyser);
        } else if (scriptProcessor) {
            scriptProcessor.connect(analyser);
        }
        analyser.connect(audioCtx.destination);

        // Start Visualization
        visualize();

        // Connect WebSocket
        let httpOrigin = (window.location.protocol === 'http:' || window.location.protocol === 'https:') ? window.location.origin : '';
        if (!httpOrigin) {
            try {
                const baseUrl = new URL(document.baseURI);
                if (baseUrl.protocol === 'http:' || baseUrl.protocol === 'https:') {
                    httpOrigin = baseUrl.origin;
                }
            } catch (e) {
                httpOrigin = '';
            }
        }
        if (!httpOrigin) {
            throw new Error('Missing server origin');
        }

        const protocol = httpOrigin.startsWith('https:') ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${new URL(httpOrigin).host}/audio`;
        
        ws = new WebSocket(wsUrl);
        ws.binaryType = 'arraybuffer';
        
        ws.onopen = () => {
            console.log('Connected to server');
            isPlaying = true;
            updateUI(true);
        };
        
        ws.onmessage = (event) => {
            if (!isPlaying) return;
            
            // Parse payload: 8 bytes timestamp + Audio Data
            const arrayBuffer = event.data;
            const dataView = new DataView(arrayBuffer);
            const timestamp = dataView.getFloat64(0, true); // Little Endian
            
            // Audio data starts at offset 8
            // It's Int16, so we need to convert to Float32 [-1.0, 1.0]
            const audioInt16 = new Int16Array(arrayBuffer, 8);
            const audioFloat32 = new Float32Array(audioInt16.length);
            
            for (let i = 0; i < audioInt16.length; i++) {
                audioFloat32[i] = audioInt16[i] / 32768.0;
            }
            
            if (workletNode) {
                if (timestamp < lastTimestamp) {
                    return;
                }
                lastTimestamp = timestamp;
                workletNode.port.postMessage({ timestamp, audioData: audioFloat32 });
            } else if (scriptProcessor) {
                if (timestamp < lastTimestamp) {
                    return;
                }
                lastTimestamp = timestamp;
                queue.push(audioFloat32);
                if (queue.length > maxQueueLength) {
                    const dropCount = queue.length - 2;
                    queue = queue.slice(dropCount);
                }
            }
            
            // Calculate Latency (assuming synchronized clocks or localhost)
            // timestamp is in seconds (float)
            const now = Date.now() / 1000.0;
            const latency = (now - timestamp) * 1000; // ms
            
            if (latencyVal) {
                latencyVal.textContent = latency.toFixed(1);
                
                // Color code latency
                if (latency < 700) {
                    latencyVal.style.color = '#0f0';
                } else {
                    latencyVal.style.color = '#f00';
                }
            }
        };
        
        ws.onclose = () => {
            console.log('Disconnected');
            stopStream();
        };
        
        ws.onerror = (err) => {
            console.error('WebSocket Error:', err);
            stopStream();
        };

    } catch (err) {
        console.error('Error starting stream:', err);
        alert('Failed to start audio stream. See console for details.');
    }
}

function stopStream() {
    if (!isPlaying) return;
    
    if (ws) {
        ws.close();
        ws = null;
    }
    
    if (workletNode) {
        workletNode.disconnect();
        workletNode = null;
    }
    if (scriptProcessor) {
        scriptProcessor.disconnect();
        scriptProcessor.onaudioprocess = null;
        scriptProcessor = null;
    }
    
    if (analyser) {
        analyser.disconnect();
        analyser = null;
    }
    
    if (audioCtx) {
        audioCtx.close().catch(err => console.error("Error closing AudioContext:", err));
        audioCtx = null;
    }
    
    isPlaying = false;
    updateUI(false);
    
    // Clear canvas
    if (canvasCtx) canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
    if (drawVisual) {
        cancelAnimationFrame(drawVisual);
    }
    if (latencyVal) latencyVal.textContent = '--';
}

function updateUI(playing) {
    if (btnPlay) {
        btnPlay.disabled = playing;
        if (playing) {
            btnPlay.innerHTML = '[ STREAMING... ]';
        } else {
            btnPlay.innerHTML = '[ RECEIVE STREAM ]';
        }
    }
    if (btnStop) {
        btnStop.disabled = !playing;
    }
}

function visualize() {
    if (!analyser || !canvasCtx || !canvas) return;
    
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    function draw() {
        if (!isPlaying) return;
        
        drawVisual = requestAnimationFrame(draw);
        
        analyser.getByteTimeDomainData(dataArray);
        
        canvasCtx.fillStyle = '#000'; // Black background
        canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
        
        canvasCtx.lineWidth = 2;
        canvasCtx.strokeStyle = '#0f0'; // Green line
        
        canvasCtx.beginPath();
        
        const sliceWidth = canvas.width * 1.0 / bufferLength;
        let x = 0;
        
        for(let i = 0; i < bufferLength; i++) {
            const v = dataArray[i] / 128.0;
            const y = v * canvas.height / 2;
            
            if(i === 0) {
                canvasCtx.moveTo(x, y);
            } else {
                canvasCtx.lineTo(x, y);
            }
            
            x += sliceWidth;
        }
        
        canvasCtx.lineTo(canvas.width, canvas.height/2);
        canvasCtx.stroke();
    }
    
    draw();
}
