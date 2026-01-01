const btnSubmit = document.getElementById('btn-submit');
const sentenceInput = document.getElementById('sentence-input');
const logsContent = document.getElementById('logs-content');
const stagingArea = document.getElementById('staging-area');
const tabLog = document.getElementById('tab-log');
const tabHistory = document.getElementById('tab-history');
const tabVocab = document.getElementById('tab-vocab');
const historyContent = document.getElementById('history-content');
const historyHint = document.getElementById('history-hint');
const historyList = document.getElementById('history-list');
const historyStart = document.getElementById('history-start');
const historyEnd = document.getElementById('history-end');
const historyFilterBtn = document.getElementById('history-filter-btn');
const historyDownloadBtn = document.getElementById('history-download-btn');
const vocabContent = document.getElementById('vocab-content');
const vocabList = document.getElementById('vocab-list');
const vocabHint = document.getElementById('vocab-hint');
const vocabRefreshBtn = document.getElementById('vocab-refresh-btn');
let historyCache = [];
let vocabCache = [];

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeRegExp(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isValidMatch(phrase, matchedWord) {
    if (!phrase || !matchedWord) return false;
    const p = phrase.toLowerCase();
    const w = matchedWord.toLowerCase();
    if (!w.startsWith(p)) return false;
    if (w === p) return true;
    
    const suffix = w.substring(p.length);
    
    // Common suffixes list
    const suffixes = [
        's', 'es', 'd', 'ed', 'ing', 'ly', 'y', 
        'er', 'est', // Comparative
        'ion', 'tion', 'sion', // Noun
        'ness', 'ment', 'al', 'ity', 'ful', 'less', 'able', 'ible'
    ];
    
    if (suffixes.includes(suffix)) return true;
    
    return false;
}

function highlightSentence(sentence, words, wrapperFn) {
    if (!sentence) return '';
    
    // Helper to find the best matching substring
    const getBestMatch = (fullText, phrase) => {
        const check = (p) => {
            const escaped = escapeRegExp(p);
            // Allow suffix (greedy match for word chars)
            // Note: We use [a-zA-Z]* to capture potential suffixes
            const regex = new RegExp(`(^|[^A-Za-z0-9_])(${escaped}[a-zA-Z]*)(?=[^A-Za-z0-9_]|$)`, 'gi');
            
            let match;
            while ((match = regex.exec(fullText)) !== null) {
                // match[2] is the actual word found in text
                if (isValidMatch(p, match[2])) return true;
            }
            return false;
        };

        // 1. Exact match (or with suffix)
        if (check(phrase)) return phrase;

        // 2. Remove common prefixes
        const prefixes = ["one's ", "sb's ", "someone's ", "somebody's "];
        for (let pre of prefixes) {
            if (phrase.toLowerCase().startsWith(pre)) {
                let sub = phrase.substring(pre.length);
                if (check(sub)) return sub;
            }
        }

        // 3. Sub-phrases (n-grams)
        const tokens = phrase.split(/\s+/);
        if (tokens.length > 1) {
            // Try decreasing length
            for (let len = tokens.length - 1; len >= 1; len--) {
                 for (let i = 0; i <= tokens.length - len; i++) {
                    let sub = tokens.slice(i, i + len).join(' ');
                    // If single word, avoid too short/common matches
                    if (len === 1 && sub.length < 3) continue; 
                    if (check(sub)) return sub;
                }
            }
        }
        return null;
    };

    // 1. Identify ranges
    let ranges = [];
    const uniqueWords = [...new Set((Array.isArray(words) ? words : []).filter(Boolean))];
    
    uniqueWords.forEach(phrase => {
        const matchPhrase = getBestMatch(sentence, phrase);
        if (matchPhrase) {
             const escaped = escapeRegExp(matchPhrase);
             // Use same regex pattern as in check()
             const regex = new RegExp(`(^|[^A-Za-z0-9_])(${escaped}[a-zA-Z]*)(?=[^A-Za-z0-9_]|$)`, 'gi');
             let match;
             while ((match = regex.exec(sentence)) !== null) {
                 // Verify the match again to ensure we don't highlight invalid suffixes
                 if (isValidMatch(matchPhrase, match[2])) {
                     const start = match.index + match[1].length;
                     const end = start + match[2].length;
                     ranges.push({start, end});
                 }
             }
        }
    });

    // 2. Merge overlapping ranges
    ranges.sort((a, b) => a.start - b.start);
    let merged = [];
    if (ranges.length > 0) {
        let current = ranges[0];
        for (let i = 1; i < ranges.length; i++) {
            let next = ranges[i];
            if (next.start <= current.end) {
                current.end = Math.max(current.end, next.end);
            } else {
                merged.push(current);
                current = next;
            }
        }
        merged.push(current);
    }

    // 3. Construct HTML (escape parts outside highlights)
    let html = '';
    let lastIndex = 0;
    const wrap = wrapperFn || (text => `<span style="color:#0f0;font-weight:bold;">${text}</span>`);

    merged.forEach(r => {
        html += escapeHtml(sentence.substring(lastIndex, r.start));
        html += wrap(escapeHtml(sentence.substring(r.start, r.end)));
        lastIndex = r.end;
    });
    html += escapeHtml(sentence.substring(lastIndex));
    
    return html;
}

function initHistoryView() {
    if (!historyList || !historyStart || !historyEnd) return;
    if (!historyStart.value || !historyEnd.value) {
        const now = new Date();
        
        const startDate = new Date(now);
        startDate.setMonth(startDate.getMonth() - 1);
        startDate.setDate(startDate.getDate() - 1);
        
        const endDate = new Date(now);
        endDate.setDate(endDate.getDate() + 1);

        const toISODate = (d) => {
             const year = d.getFullYear();
             const month = String(d.getMonth() + 1).padStart(2, '0');
             const day = String(d.getDate()).padStart(2, '0');
             return `${year}-${month}-${day}`;
        };

        historyStart.value = toISODate(startDate);
        historyEnd.value = toISODate(endDate);
    }
    loadHistoryData();
}

function initVocabView() {
    loadVocabData();
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

async function loadVocabData() {
    if (!vocabList) return;
    vocabList.innerHTML = '<div style="color:#0f0;">Loading...</div>';
    try {
        const res = await fetch('/api/check_history');
        vocabCache = await res.json();
        renderVocabList(vocabCache);
        if (vocabHint) vocabHint.textContent = `共 ${vocabCache.length} 个生词`;
    } catch (err) {
        vocabList.innerHTML = `<div style="color:#f00;">Error: ${err.message}</div>`;
    }
}

let fullHistoryData = [];
let historyRenderedCount = 0;
const HISTORY_BATCH_SIZE = 20;
let historyObserver = null;

function setupHistoryObserver() {
    if (historyObserver) return;
    // Ensure historyList is the root for the observer
    if (!historyList) return;

    const options = {
        root: historyList,
        rootMargin: '200px',
        threshold: 0.1
    };
    
    historyObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                // Unobserve current sentinel to prevent multiple triggers
                historyObserver.unobserve(entry.target);
                appendHistoryBatch();
            }
        });
    }, options);
}

function renderHistoryList(data) {
    if (!historyList) return;
    historyList.innerHTML = '';
    
    // Reset observer
    if (historyObserver) {
        historyObserver.disconnect();
        historyObserver = null;
    }

    if (!data || data.length === 0) {
        historyList.innerHTML = '<div style="color:#aaa;">No records found.</div>';
        return;
    }
    
    // Sort data
    fullHistoryData = [...data].sort((a, b) => {
        const ta = new Date(a.timestamp).getTime() || a.timestamp;
        const tb = new Date(b.timestamp).getTime() || b.timestamp;
        return tb - ta;
    });
    
    historyRenderedCount = 0;
    setupHistoryObserver();
    appendHistoryBatch();
}

function appendHistoryBatch() {
    if (!historyList) return;
    
    const batch = fullHistoryData.slice(historyRenderedCount, historyRenderedCount + HISTORY_BATCH_SIZE);
    if (batch.length === 0) return;
    
    // Remove old sentinel if it exists
    const oldSentinel = document.getElementById('history-sentinel');
    if (oldSentinel) oldSentinel.remove();
    
    const fragment = document.createDocumentFragment();
    
    batch.forEach(entry => {
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
            words = [...entry.vocabulary];
        } else if (entry.vocabulary && typeof entry.vocabulary === 'object') {
            words = Object.keys(entry.vocabulary);
        }
        if (Array.isArray(entry.vocabulary)) {
            vocabHtml = entry.vocabulary.map(w => `<span style="color:#0f0;font-weight:bold;">${escapeHtml(w)}</span>`).join(', ');
        } else if (entry.vocabulary && typeof entry.vocabulary === 'object') {
            vocabHtml = Object.keys(entry.vocabulary).map(w => {
                const c = entry.vocabulary[w];
                return `<span style="color:#0f0;font-weight:bold;">${escapeHtml(w)}</span> (${c})`;
            }).join(', ');
        }
        const sentenceHtml = highlightSentence(entry.sentence || '', words);
        div.innerHTML = `
            <div style="color:#aaa;font-size:12px;margin-bottom:5px;display:flex;justify-content:space-between;border-bottom:1px dashed #030;padding-bottom:3px;">
                <span>Time: ${ts}</span>
                <span>Source: ${entry.source || 'Unknown'}</span>
            </div>
            <div style="color:#fff;font-size:14px;margin-bottom:5px;">${sentenceHtml}</div>
            <div style="color:#0f0;font-size:12px;">Vocabulary: ${vocabHtml || 'None'}</div>
        `;
        fragment.appendChild(div);
    });
    
    historyList.appendChild(fragment);
    historyRenderedCount += batch.length;
    
    // Add sentinel if more data exists
    if (historyRenderedCount < fullHistoryData.length) {
        const sentinel = document.createElement('div');
        sentinel.id = 'history-sentinel';
        sentinel.style.height = '20px';
        sentinel.style.textAlign = 'center';
        sentinel.style.color = '#050';
        sentinel.innerText = 'Loading more...';
        historyList.appendChild(sentinel);
        
        if (historyObserver) historyObserver.observe(sentinel);
    }
}

let fullVocabData = [];
let vocabRenderedCount = 0;
const VOCAB_BATCH_SIZE = 50;
let vocabObserver = null;

function setupVocabObserver() {
    if (vocabObserver) return;
    if (!vocabList) return;

    const options = {
        root: vocabList,
        rootMargin: '200px',
        threshold: 0.1
    };
    
    vocabObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                vocabObserver.unobserve(entry.target);
                appendVocabBatch();
            }
        });
    }, options);
}

function renderVocabList(data) {
    if (!vocabList) return;
    vocabList.innerHTML = '';
    
    if (vocabObserver) {
        vocabObserver.disconnect();
        vocabObserver = null;
    }

    if (!data || data.length === 0) {
        vocabList.innerHTML = '<div style="color:#aaa;">No words found.</div>';
        return;
    }

    fullVocabData = [...data];
    vocabRenderedCount = 0;
    setupVocabObserver();
    appendVocabBatch();
}

function appendVocabBatch() {
    if (!vocabList) return;
    
    const batch = fullVocabData.slice(vocabRenderedCount, vocabRenderedCount + VOCAB_BATCH_SIZE);
    if (batch.length === 0) return;

    const oldSentinel = document.getElementById('vocab-sentinel');
    if (oldSentinel) oldSentinel.remove();

    const fragment = document.createDocumentFragment();

    batch.forEach(item => {
        const word = item && item.word ? String(item.word) : '';
        const count = item && item.count !== undefined ? item.count : '';
        if (!word) return;

        const row = document.createElement('div');
        row.className = 'vocabbook-row';

        const btn = document.createElement('button');
        btn.className = 'vocabbook-trash vocab-delete-btn';
        btn.type = 'button';
        btn.title = 'Delete';
        btn.dataset.word = word;

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('focusable', 'false');

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', 'M9 3h6l1 2h5v2H3V5h5l1-2zm1 6h2v10h-2V9zm4 0h2v10h-2V9zM7 9h2v10H7V9zM6 7h12l-1 14H7L6 7z');
        svg.appendChild(path);
        btn.appendChild(svg);

        const wordSpan = document.createElement('span');
        wordSpan.className = 'vocabbook-word';
        wordSpan.textContent = word;

        const countSpan = document.createElement('span');
        countSpan.className = 'vocabbook-count';
        countSpan.textContent = `(${count})`;

        row.appendChild(btn);
        row.appendChild(wordSpan);
        row.appendChild(countSpan);
        fragment.appendChild(row);
    });

    vocabList.appendChild(fragment);
    vocabRenderedCount += batch.length;

    if (vocabRenderedCount < fullVocabData.length) {
        const sentinel = document.createElement('div');
        sentinel.id = 'vocab-sentinel';
        sentinel.style.height = '20px';
        sentinel.style.textAlign = 'center';
        sentinel.style.color = '#050';
        sentinel.innerText = 'Loading more...';
        vocabList.appendChild(sentinel);
        
        if (vocabObserver) vocabObserver.observe(sentinel);
    }
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

if (vocabRefreshBtn) {
    vocabRefreshBtn.addEventListener('click', loadVocabData);
}

if (vocabList) {
    vocabList.addEventListener('click', async (e) => {
        const btn = e.target && e.target.closest ? e.target.closest('.vocab-delete-btn') : null;
        if (!btn) return;
        const word = (btn.dataset && btn.dataset.word) ? btn.dataset.word : '';
        if (!word) return;
        btn.disabled = true;
        try {
            const res = await fetch('/api/delete_word', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ word })
            });
            const data = await res.json();
            if (!res.ok) {
                alert(data && data.error ? data.error : 'Delete failed');
                return;
            }
            await loadVocabData();
            if (historyContent && historyContent.style.display !== 'none') {
                await loadHistoryData();
            }
        } catch (err) {
            alert(err.message);
        } finally {
            btn.disabled = false;
        }
    });
}

// Quiz State
let currentQuizData = null;
let currentQuizResults = [];
let currentWordIndex = 0;

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

if (tabLog && tabHistory && tabVocab && logsContent && historyContent && vocabContent) {
    const logArea = document.getElementById('log-area');

    tabLog.addEventListener('click', () => {
        tabLog.style.borderColor = '#0f0';
        tabLog.style.color = '#0f0';
        tabHistory.style.borderColor = '#050';
        tabHistory.style.color = '#050';
        tabVocab.style.borderColor = '#050';
        tabVocab.style.color = '#050';
        logsContent.style.display = 'block';
        historyContent.style.display = 'none';
        vocabContent.style.display = 'none';
        if (historyHint) historyHint.textContent = '';
        if (vocabHint) vocabHint.textContent = '';
        
        // Reset layout to default (6:1:7)
        if (stagingArea) stagingArea.style.flex = "6 1 0";
        if (logArea) logArea.style.flex = "7 1 0";
    });
    tabHistory.addEventListener('click', () => {
        tabLog.style.borderColor = '#050';
        tabLog.style.color = '#050';
        tabHistory.style.borderColor = '#0f0';
        tabHistory.style.color = '#0f0';
        tabVocab.style.borderColor = '#050';
        tabVocab.style.color = '#050';
        logsContent.style.display = 'none';
        historyContent.style.display = 'flex';
        historyContent.style.flexDirection = 'column';
        vocabContent.style.display = 'none';
        if (historyHint) historyHint.textContent = '加载最近30天历史记录中...';
        
        // Adjust layout for History (1:1:8)
        if (stagingArea) stagingArea.style.flex = "1 1 0";
        if (logArea) logArea.style.flex = "8 1 0";
        
        initHistoryView();
    });
    tabVocab.addEventListener('click', () => {
        tabLog.style.borderColor = '#050';
        tabLog.style.color = '#050';
        tabHistory.style.borderColor = '#050';
        tabHistory.style.color = '#050';
        tabVocab.style.borderColor = '#0f0';
        tabVocab.style.color = '#0f0';
        logsContent.style.display = 'none';
        historyContent.style.display = 'none';
        vocabContent.style.display = 'flex';
        vocabContent.style.flexDirection = 'column';
        if (historyHint) historyHint.textContent = '';
        if (vocabHint) vocabHint.textContent = '加载生词本中...';
        
        // Adjust layout for Vocab (1:1:8)
        if (stagingArea) stagingArea.style.flex = "1 1 0";
        if (logArea) logArea.style.flex = "8 1 0";
        
        initVocabView();
    });
}

// Drag Resizer Logic
const inputArea = document.getElementById('input-area');
const mainPanels = document.getElementById('main-panels'); // Ensure we have reference to container if needed

if (inputArea && stagingArea && logsContent) {
    let isDragging = false;
    let startY = 0;
    let startHeight = 0;

    inputArea.addEventListener('mousedown', (e) => {
        // Prevent drag if clicking on input or button
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') {
            return;
        }
        
        isDragging = true;
        startY = e.clientY;
        // Get current computed height of staging area
        const rect = stagingArea.getBoundingClientRect();
        startHeight = rect.height;
        
        // Disable text selection during drag
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'row-resize';
        
        // Switch flex mode to fixed height mode
        stagingArea.style.flex = 'none';
        stagingArea.style.height = `${startHeight}px`;
        
        // Ensure log area takes the rest
        const logArea = document.getElementById('log-area');
        if (logArea) logArea.style.flex = '1 1 0';
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        
        const deltaY = e.clientY - startY;
        const newHeight = startHeight + deltaY;
        
        // Min height constraints (e.g. 50px)
        if (newHeight > 50 && newHeight < (window.innerHeight - 150)) {
            stagingArea.style.height = `${newHeight}px`;
        }
    });

    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
        }
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
        let sentence = currentQuizData.sentence || '';
        const wrongWords = currentQuizResults.filter(r => !r.isCorrect).map(r => r.word);
        
        // Use the smart highlight logic (supports red style via wrapperFn)
        const wrapper = (text) => `<span style="color:#f00; border-bottom:1px dashed #f00;">${text}</span>`;
        const sentenceHtml = highlightSentence(sentence, wrongWords, wrapper);
        
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
            
            const style = isWrong ? 'color:#f00; border-bottom:1px solid #f00; font-weight:bold;' : 'color:#0f0; font-weight:bold;';
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
