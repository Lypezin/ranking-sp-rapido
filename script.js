
// Configuration Supabase - Credentials provided by User
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
    // 1. Try to fetch from Supabase first (Online Source Control)
    fetchFromSupabase();

    // Setup Drag & Drop & Sync Button
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const btnSync = document.getElementById('btnSync');

    // Click to upload
    dropZone.addEventListener('click', (e) => {
        if (e.target !== btnSync) fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) handleFile(e.target.files[0]);
    });

    // Drag & Drop
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

    // Sync Button
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
            .select('*');

        if (error) throw error;

        if (data && data.length > 0) {
            console.log('Dados carregados do Supabase:', data.length);
            // Map keys Supabase (snake_case) to app logic
            const mappedData = data.map(item => ({
                id_da_pessoa_entregadora: item.courier_id,
                recebedor: item.receiver,
                valor: item.value
            }));

            globalRankingData = processData(mappedData);
            renderRanking(globalRankingData);
            document.querySelector('header p').textContent = 'Dados atualizados do Banco de Dados Online.';
        } else {
            console.log('Banco de dados vazio.');
            document.getElementById('rankingList').innerHTML = '<div style="text-align:center; color: #94a3b8;">Banco de dados vazio. Arraste sua planilha para preencher!</div>';
        }
    } catch (err) {
        console.error('Erro ao conectar Supabase:', err);
        // Fallback or alert?
        // document.getElementById('rankingList').innerHTML = '<div style="text-align:center; color: red;">Erro ao conectar ao banco de dados.</div>';
    }
}

function handleFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const buffer = e.target.result;
        const workbook = XLSX.read(buffer, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        // Convert to JSON
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

        // Normalize
        const normalizedData = jsonData.map(row => {
            const keys = Object.keys(row);
            const idKey = keys.find(k => k.toLowerCase().includes('id') || k.toLowerCase().includes('entregador'));
            const valKey = keys.find(k => k.toLowerCase().includes('valor'));
            const recKey = keys.find(k => k.toLowerCase().includes('recebedor') || k.toLowerCase().includes('cliente'));

            if (idKey && valKey) {
                return {
                    courier_id: String(row[idKey]),
                    receiver: recKey ? String(row[recKey]) : '',
                    value: parseValue(row[valKey])
                };
            }
            return null;
        }).filter(item => item !== null);

        if (normalizedData.length > 0) {
            // Preview locally
            const previewData = normalizedData.map(item => ({
                id_da_pessoa_entregadora: item.courier_id,
                recebedor: item.receiver,
                valor: item.value
            }));

            globalRankingData = processData(previewData);
            renderRanking(globalRankingData);

            // Show Sync Button
            pendingSyncData = normalizedData;
            document.getElementById('btnSync').style.display = 'block';
            document.querySelector('header p').textContent = `Pré-visualização de ${normalizedData.length} registros. Clique em "Enviar" para salvar online.`;
        } else {
            alert('Não encontrei as colunas esperadas (ID, Valor).');
        }
    };
    reader.readAsArrayBuffer(file);
}

async function uploadToSupabase(data) {
    const btn = document.getElementById('btnSync');
    btn.textContent = 'Enviando... ⏳';
    btn.disabled = true;

    try {
        // Clear current table? Or append? Assuming append or replace.
        // For simplicity, let's just insert.
        // Optional: Delete all before inserting to avoid duplicates if that's the goal.
        // await supabase.from('delivery_rankings').delete().neq('id', 0); // "Delete all" is tricky with RLS/policies sometimes.

        // Using batch insert (Supabase handles batching automatically mostly, but let's be safe with chunks if large)
        const { error } = await supabaseClient
            .from('delivery_rankings')
            .insert(data);

        if (error) throw error;

        alert('Sucesso! Dados enviados para o Supabase. 🚀');
        btn.style.display = 'none';
        document.querySelector('header p').textContent = 'Dados salvos com sucesso na nuvem!';

        // Refresh from DB to be sure
        fetchFromSupabase();

    } catch (err) {
        console.error('Erro no upload:', err);
        alert('Erro ao enviar dados. Verifique o console ou as permissões da tabela.');
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

function processData(data) {
    const totals = {};

    data.forEach(entry => {
        const id = entry.id_da_pessoa_entregadora;
        const value = parseFloat(entry.valor);

        if (totals[id]) {
            totals[id] += value;
        } else {
            totals[id] = value;
        }
    });

    const rankingArray = Object.keys(totals).map(id => ({
        id: id,
        total: totals[id]
    }));

    rankingArray.sort((a, b) => b.total - a.total);
    return rankingArray;
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
                    <h3>ID: ${item.id}</h3>
                    <p>Entregador</p>
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
                    <h3>ID: ${item.id}</h3>
                    <p>Entregador</p>
                </div>
            </div>
            <div class="rank-value">${formattedValue}</div>
        `;

        listElement.appendChild(card);
    });
}
