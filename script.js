
// Configuration Supabase
const SUPABASE_URL = 'https://dcwwyzvlqwrpwpeyfzhv.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRjd3d5enZscXdycHdwZXlmemh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0MzE1NTYsImV4cCI6MjA4NzAwNzU1Nn0.HLC46MtdgUM21yOzGXfkZzuuzyR3BqOKZ-GrzrxA88k';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
        persistSession: false
    }
});
let globalRankingData = [];
let pendingSyncData = [];

document.addEventListener('DOMContentLoaded', () => {
    // Check for Admin Mode (?admin=true in URL)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('admin') === 'true') {
        document.getElementById('dropZone').style.display = 'flex';
    }

    // 1. Fetch from Supabase
    fetchFromSupabase();

    // Setup Drag & Drop & Sync Button
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const btnSync = document.getElementById('btnSync');

    dropZone.addEventListener('click', (e) => {
        if (e.target !== btnSync) fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) handleFile(e.target.files[0]);
    });

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
    });

    btnSync.addEventListener('click', () => {
        if (pendingSyncData.length > 0) {
            uploadToSupabase(pendingSyncData);
        } else {
            alert('Nenhum dado para enviar.');
        }
    });
});

async function fetchFromSupabase() {
    try {
        const { data, error } = await supabaseClient
            .from('delivery_rankings')
            .select('*')
            .limit(10000);

        if (error) throw error;

        if (data && data.length > 0) {
            console.log('Dados carregados do Supabase:', data.length);

            // KEY FIX: Use 'receiver' as the display name, group by 'receiver'
            globalRankingData = processSupabaseData(data);
            renderRanking(globalRankingData);
        } else {
            console.log('Banco de dados vazio.');
            document.getElementById('rankingList').innerHTML = '<div style="text-align:center; color: #94a3b8; padding: 2rem;">Banco de dados vazio.</div>';
        }
    } catch (err) {
        console.error('Erro ao conectar Supabase:', err);
    }
}

// Process Supabase data: group by RECEIVER (name), sum VALUE
function processSupabaseData(data) {
    const totals = {};

    data.forEach(row => {
        const name = row.receiver || row.courier_id || 'Desconhecido';
        const value = parseFloat(row.value) || 0;

        if (totals[name]) {
            totals[name] += value;
        } else {
            totals[name] = value;
        }
    });

    const rankingArray = Object.keys(totals).map(name => ({
        id: name,
        total: totals[name]
    }));

    rankingArray.sort((a, b) => b.total - a.total);
    return rankingArray;
}

function handleFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const buffer = e.target.result;
        const workbook = XLSX.read(buffer, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

        const normalizedData = jsonData.map(row => {
            const keys = Object.keys(row);

            // Look for Name/Receiver column for display
            const nameKey = keys.find(k =>
                k.toLowerCase().includes('recebedor') ||
                k.toLowerCase().includes('nome') ||
                k.toLowerCase().includes('cliente') ||
                k.toLowerCase().includes('entregador')
            );
            const idKey = keys.find(k => k.toLowerCase().includes('id'));
            const valKey = keys.find(k => k.toLowerCase().includes('valor'));

            const displayKey = nameKey || idKey;

            if (displayKey && valKey) {
                return {
                    courier_id: idKey ? String(row[idKey]) : String(row[displayKey]),
                    receiver: nameKey ? String(row[nameKey]) : String(row[displayKey]),
                    value: parseValue(row[valKey])
                };
            }
            return null;
        }).filter(item => item !== null);

        if (normalizedData.length > 0) {
            // Preview locally using receiver as display name
            const previewTotals = {};
            normalizedData.forEach(item => {
                const name = item.receiver || item.courier_id;
                previewTotals[name] = (previewTotals[name] || 0) + item.value;
            });

            globalRankingData = Object.keys(previewTotals).map(name => ({
                id: name,
                total: previewTotals[name]
            })).sort((a, b) => b.total - a.total);

            renderRanking(globalRankingData);

            pendingSyncData = normalizedData;
            document.getElementById('btnSync').style.display = 'block';
        } else {
            alert('Não encontrei as colunas esperadas (Nome/ID, Valor).');
        }
    };
    reader.readAsArrayBuffer(file);
}

async function uploadToSupabase(data) {
    const btn = document.getElementById('btnSync');
    btn.textContent = 'Enviando... ⏳';
    btn.disabled = true;

    try {
        const CHUNK_SIZE = 500;
        for (let i = 0; i < data.length; i += CHUNK_SIZE) {
            const chunk = data.slice(i, i + CHUNK_SIZE);
            const { error } = await supabaseClient
                .from('delivery_rankings')
                .insert(chunk);

            if (error) throw error;

            const progress = Math.min(100, Math.round(((i + chunk.length) / data.length) * 100));
            btn.textContent = `Enviando... ${progress}%`;
        }

        alert('Sucesso! Dados enviados para o Supabase. 🚀');
        btn.style.display = 'none';
        fetchFromSupabase();

    } catch (err) {
        console.error('Erro no upload:', err);
        alert('Erro ao enviar dados. Verifique o console.');
        btn.textContent = 'Tentar Novamente';
        btn.disabled = false;
    }
}

function parseValue(rawVal) {
    if (typeof rawVal === 'number') return rawVal;
    if (typeof rawVal === 'string') {
        rawVal = rawVal.replace(/[R$\s]/g, '');
        if (rawVal.includes(',') && !rawVal.includes('.')) {
            return parseFloat(rawVal.replace(',', '.'));
        } else if (rawVal.includes(',') && rawVal.includes('.')) {
            return parseFloat(rawVal.replace(/\./g, '').replace(',', '.'));
        }
        return parseFloat(rawVal);
    }
    return 0;
}

function renderRanking(data) {
    const listElement = document.getElementById('rankingList');
    listElement.innerHTML = '';

    if (data.length === 0) {
        listElement.innerHTML = '<div style="text-align:center; color: #94a3b8; padding: 2rem;">Nenhum dado encontrado.</div>';
        return;
    }

    data.forEach((item, index) => {
        const rank = index + 1;
        let rankClass = '';
        if (rank === 1) rankClass = 'top-1';
        else if (rank === 2) rankClass = 'top-2';
        else if (rank === 3) rankClass = 'top-3';

        const card = document.createElement('div');
        card.className = `rank-card ${rankClass}`;

        const formattedValue = new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(item.total);

        card.innerHTML = `
            <div class="rank-info">
                <div class="rank-position">${rank}º</div>
                <div class="rank-details">
                    <h3>${item.id}</h3>
                </div>
            </div>
            <div class="rank-value">${formattedValue}</div>
        `;

        listElement.appendChild(card);
    });
}

function filterRanking() {
    const input = document.getElementById('searchInput');
    const filter = input.value.trim().toLowerCase();

    if (filter === "") {
        renderRanking(globalRankingData);
        return;
    }

    const rankedWithIndex = globalRankingData.map((item, index) => ({
        ...item,
        realRank: index + 1
    }));

    const filtered = rankedWithIndex.filter(item => item.id.toString().toLowerCase().includes(filter));
    renderFiltered(filtered);
}

function renderFiltered(data) {
    const listElement = document.getElementById('rankingList');
    listElement.innerHTML = '';

    if (data.length === 0) {
        listElement.innerHTML = '<div style="text-align:center; color: #94a3b8; padding: 2rem;">Nenhum resultado.</div>';
        return;
    }

    data.forEach(item => {
        let rankClass = '';
        if (item.realRank === 1) rankClass = 'top-1';
        else if (item.realRank === 2) rankClass = 'top-2';
        else if (item.realRank === 3) rankClass = 'top-3';

        const card = document.createElement('div');
        card.className = `rank-card ${rankClass}`;

        const formattedValue = new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(item.total);

        card.innerHTML = `
            <div class="rank-info">
                <div class="rank-position">${item.realRank}º</div>
                <div class="rank-details">
                    <h3>${item.id}</h3>
                </div>
            </div>
            <div class="rank-value">${formattedValue}</div>
        `;

        listElement.appendChild(card);
    });
}
