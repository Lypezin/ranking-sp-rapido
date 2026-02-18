
// Configuration Supabase
const SUPABASE_URL = 'https://dcwwyzvlqwrpwpeyfzhv.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRjd3d5enZscXdycHdwZXlmemh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0MzE1NTYsImV4cCI6MjA4NzAwNzU1Nn0.HLC46MtdgUM21yOzGXfkZzuuzyR3BqOKZ-GrzrxA88k';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false }
});

let globalRankingData = [];

document.addEventListener('DOMContentLoaded', () => {
    fetchFromSupabase();
});

async function fetchFromSupabase() {
    try {
        // Fetch ALL rows using pagination (Supabase default limit is 1000)
        let allData = [];
        let from = 0;
        const BATCH_SIZE = 1000;
        let keepFetching = true;

        document.getElementById('rankingList').innerHTML =
            '<div style="text-align:center; color: #94a3b8; padding: 2rem;">Carregando dados...</div>';

        while (keepFetching) {
            const { data, error } = await supabaseClient
                .from('delivery_rankings')
                .select('courier_id, receiver, value')
                .range(from, from + BATCH_SIZE - 1);

            if (error) throw error;

            if (data && data.length > 0) {
                allData = allData.concat(data);
                from += BATCH_SIZE;

                // If we got less than BATCH_SIZE, we've reached the end
                if (data.length < BATCH_SIZE) {
                    keepFetching = false;
                }
            } else {
                keepFetching = false;
            }
        }

        if (allData.length > 0) {
            console.log('Total de registros carregados do Supabase:', allData.length);
            console.log('Exemplo de dado:', allData[0]);

            globalRankingData = processSupabaseData(allData);
            renderRanking(globalRankingData);
        } else {
            console.log('Banco de dados vazio.');
            document.getElementById('rankingList').innerHTML =
                '<div style="text-align:center; color: #94a3b8; padding: 2rem;">Banco de dados vazio.</div>';
        }
    } catch (err) {
        console.error('Erro ao conectar Supabase:', err);
        document.getElementById('rankingList').innerHTML =
            '<div style="text-align:center; color: #ef4444; padding: 2rem;">Erro ao conectar ao banco de dados.</div>';
    }
}

// Group by COURIER_ID, sum VALUE, display RECEIVER name
function processSupabaseData(data) {
    const totals = {};
    const names = {};

    data.forEach(row => {
        const id = row.courier_id || 'unknown';
        const value = parseFloat(row.value) || 0;
        const name = row.receiver || id;

        totals[id] = (totals[id] || 0) + value;

        // Keep the first receiver name found for this courier_id
        if (!names[id]) {
            names[id] = name;
        }
    });

    const rankingArray = Object.keys(totals).map(id => ({
        id: id,
        name: names[id],
        total: totals[id]
    }));

    rankingArray.sort((a, b) => b.total - a.total);

    // Limit to top 60
    return rankingArray.slice(0, 60);
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

        // Display RECEIVER name (not the ID)
        card.innerHTML = `
            <div class="rank-info">
                <div class="rank-position">${rank}º</div>
                <div class="rank-details">
                    <h3>${item.name}</h3>
                </div>
            </div>
            <div class="rank-value">${formattedValue}</div>
        `;

        listElement.appendChild(card);
    });
}

function filterRanking() {
    const filter = document.getElementById('searchInput').value.trim().toLowerCase();

    if (filter === "") {
        renderRanking(globalRankingData);
        return;
    }

    const rankedWithIndex = globalRankingData.map((item, index) => ({
        ...item,
        realRank: index + 1
    }));

    const filtered = rankedWithIndex.filter(item =>
        item.name.toLowerCase().includes(filter) ||
        item.id.toString().toLowerCase().includes(filter)
    );

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
                    <h3>${item.name}</h3>
                </div>
            </div>
            <div class="rank-value">${formattedValue}</div>
        `;

        listElement.appendChild(card);
    });
}
