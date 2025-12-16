// History Logic
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
