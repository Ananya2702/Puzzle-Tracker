// ============================================================
// PuzzlePace - App Logic
// ============================================================

// --- Utilities ---
function fmt(s) {
    s = Math.round(s);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return h > 0 ? `${h}h ${m.toString().padStart(2,'0')}m ${sec.toString().padStart(2,'0')}s` : `${m}m ${sec.toString().padStart(2,'0')}s`;
}

function fmtShort(s) {
    s = Math.round(s);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return h > 0 ? `${h}:${m.toString().padStart(2,'0')}:${sec.toString().padStart(2,'0')}` : `${m}:${sec.toString().padStart(2,'0')}`;
}

function fmtDate(d) { return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
function fmtDateFull(d) { return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }

let EXPONENT = 0.73;
function scaled(actual, pieces) { return actual * Math.pow(500 / pieces, EXPONENT); }

// --- Chart defaults ---
function setChartTheme() {
    const s = getComputedStyle(document.documentElement);
    Chart.defaults.color = s.getPropertyValue('--chart-text').trim();
    Chart.defaults.borderColor = s.getPropertyValue('--chart-grid').trim();
    Chart.defaults.font.family = "'Inter', sans-serif";
    Chart.defaults.font.size = 11;
    Chart.defaults.plugins.legend.labels.boxWidth = 10;
    Chart.defaults.plugins.legend.labels.padding = 14;
}
setChartTheme();

// --- Navigation ---
const navLinks = document.querySelectorAll('.nav-link');
const pages = document.querySelectorAll('.page');
const loaders = { dashboard: loadDashboard, history: loadHistory, charts: loadCharts, goals: loadGoals, achievements: loadAchievements, settings: loadSettings };

function goTo(page) {
    navLinks.forEach(n => n.classList.toggle('active', n.dataset.page === page));
    pages.forEach(p => p.classList.toggle('active', p.id === `page-${page}`));
    if (loaders[page]) loaders[page]();
    document.getElementById('sidebar').classList.remove('open');
}

navLinks.forEach(l => l.addEventListener('click', () => goTo(l.dataset.page)));
document.getElementById('menu-toggle')?.addEventListener('click', () => document.getElementById('sidebar').classList.toggle('open'));
document.getElementById('main').addEventListener('click', () => document.getElementById('sidebar').classList.remove('open'));

// --- Theme ---
function setTheme(t) {
    document.documentElement.dataset.theme = t;
    localStorage.setItem('pp-theme', t);
    setChartTheme();
}
document.getElementById('theme-toggle').addEventListener('click', () => {
    setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
});
setTheme(localStorage.getItem('pp-theme') || 'dark');

// --- Logout ---
document.getElementById('logout-btn').addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
});

// ============================================================
// DASHBOARD
// ============================================================
let dCharts = {};

async function loadDashboard() {
    try {
        const [sr, tr] = await Promise.all([fetch('/api/statistics'), fetch('/api/charts/trend')]);
        const stats = await sr.json(), trend = await tr.json();

        document.getElementById('stat-total').textContent = stats.total_puzzles;
        document.getElementById('stat-best').textContent = stats.best_scaled_time ? fmtShort(stats.best_scaled_time) : '--';
        document.getElementById('stat-avg').textContent = stats.avg_scaled_time ? fmtShort(stats.avg_scaled_time) : '--';

        const impEl = document.getElementById('stat-improvement');
        if (stats.improvement_pct !== 0) {
            impEl.textContent = `${stats.improvement_pct > 0 ? '+' : ''}${stats.improvement_pct}%`;
            impEl.style.color = stats.improvement_pct > 0 ? 'var(--green)' : 'var(--red)';
        } else impEl.textContent = '--';

        document.getElementById('stat-hours').textContent = stats.total_time_hours;
        document.getElementById('stat-streak').textContent = stats.current_streak;
        document.getElementById('stat-week').textContent = stats.this_week_count;
        document.getElementById('stat-pace-trend').textContent = stats.pace_trend;
        document.getElementById('stat-total-pieces').textContent = (stats.total_pieces || 0).toLocaleString();

        // PBs
        const pb = document.getElementById('personal-bests');
        if (Object.keys(stats.personal_bests).length > 0) {
            pb.innerHTML = Object.entries(stats.personal_bests).map(([pc, t]) =>
                `<div class="pb-item"><div class="pb-pcs">${pc}pc</div><div class="pb-time">${fmtShort(t)}</div></div>`
            ).join('');
        } else pb.innerHTML = '<p class="placeholder">Complete your first puzzle to see records</p>';

        if (trend.puzzles.length > 0) { renderDashTrend(trend); renderDashRecent(trend); }
    } catch (e) { console.error(e); }
}

function renderDashTrend(d) {
    if (dCharts.trend) dCharts.trend.destroy();
    dCharts.trend = new Chart(document.getElementById('dashTrendChart'), {
        type: 'line',
        data: {
            labels: d.puzzles.map(p => fmtDate(p.date)),
            datasets: [
                { label: 'Scaled', data: d.puzzles.map(p => Math.round(p.scaled_time_seconds)), borderColor: '#7c5cfc', backgroundColor: 'rgba(124,92,252,0.06)', fill: true, tension: 0.35, pointRadius: 3, pointBackgroundColor: '#7c5cfc' },
                { label: '5-Avg', data: d.moving_avg_5.map(v => Math.round(v)), borderColor: '#f87171', borderWidth: 2, borderDash: [5,3], pointRadius: 0, tension: 0.4 },
            ]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { tooltip: { callbacks: { label: c => `${c.dataset.label}: ${fmtShort(c.raw)}` } } }, scales: { y: { ticks: { callback: v => fmtShort(v) } }, x: { ticks: { maxTicksLimit: 8 } } } }
    });
}

function renderDashRecent(d) {
    if (dCharts.recent) dCharts.recent.destroy();
    const r = d.puzzles.slice(-10), times = r.map(p => Math.round(p.scaled_time_seconds));
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    dCharts.recent = new Chart(document.getElementById('dashRecentChart'), {
        type: 'bar',
        data: { labels: r.map(p => fmtDate(p.date)), datasets: [{ data: times, backgroundColor: times.map(t => t <= avg ? 'rgba(52,211,153,0.55)' : 'rgba(248,113,113,0.45)'), borderRadius: 6, borderSkipped: false }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => fmtShort(c.raw) } } }, scales: { y: { ticks: { callback: v => fmtShort(v) } } } }
    });
}

// ============================================================
// TIMER
// ============================================================
let timerInt = null, timerSec = 0, timerOn = false;
const timerDisp = document.getElementById('timer-display');
const timerRing = document.querySelector('.timer-ring');

function updTimer() {
    const h = Math.floor(timerSec/3600), m = Math.floor((timerSec%3600)/60), s = timerSec%60;
    timerDisp.textContent = `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
}

document.getElementById('timer-start').addEventListener('click', () => {
    if (!timerOn) {
        timerOn = true;
        document.getElementById('timer-start').disabled = true;
        document.getElementById('timer-pause').disabled = false;
        document.getElementById('timer-save-section').style.display = 'none';
        timerRing.classList.add('running');
        timerInt = setInterval(() => { timerSec++; updTimer(); }, 1000);
    }
});

document.getElementById('timer-pause').addEventListener('click', () => {
    timerOn = false; clearInterval(timerInt);
    document.getElementById('timer-start').disabled = false;
    document.getElementById('timer-pause').disabled = true;
    timerRing.classList.remove('running');
    if (timerSec > 0) document.getElementById('timer-save-section').style.display = 'block';
});

document.getElementById('timer-reset').addEventListener('click', () => {
    timerOn = false; clearInterval(timerInt); timerSec = 0; updTimer();
    document.getElementById('timer-start').disabled = false;
    document.getElementById('timer-pause').disabled = true;
    document.getElementById('timer-save-section').style.display = 'none';
    timerRing.classList.remove('running');
});

document.getElementById('timer-save-btn').addEventListener('click', async () => {
    const res = await fetch('/api/puzzles', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pieces: parseInt(document.getElementById('timer-pieces').value), time_seconds: timerSec, puzzle_name: document.getElementById('timer-name').value, date: new Date().toISOString().split('T')[0] })
    });
    if (res.ok) { document.getElementById('timer-reset').click(); alert('Saved!'); }
});

// ============================================================
// ADD PUZZLE
// ============================================================
document.getElementById('date').value = new Date().toISOString().split('T')[0];
document.getElementById('pieces').addEventListener('change', function() {
    document.getElementById('pieces-custom').style.display = this.value === 'custom' ? 'block' : 'none';
    updPreview();
});

let rating = 3;
const stars = document.querySelectorAll('#star-rating button');
function setStars(n) { rating = n; stars.forEach((s, i) => s.classList.toggle('active', i < n)); }
setStars(3);
stars.forEach(s => s.addEventListener('click', () => setStars(parseInt(s.dataset.val))));

function updPreview() {
    const sel = document.getElementById('pieces');
    let pcs = sel.value === 'custom' ? parseInt(document.getElementById('pieces-custom').value) : parseInt(sel.value);
    const h = parseInt(document.getElementById('time-hours').value) || 0;
    const m = parseInt(document.getElementById('time-minutes').value) || 0;
    const s = parseInt(document.getElementById('time-seconds').value) || 0;
    const total = h * 3600 + m * 60 + s;
    const bar = document.getElementById('scaled-preview');
    if (pcs > 0 && total > 0) {
        document.getElementById('scaled-preview-time').textContent = fmt(Math.round(scaled(total, pcs)));
        bar.classList.add('visible');
    } else bar.classList.remove('visible');
}
['time-hours','time-minutes','time-seconds','pieces','pieces-custom'].forEach(id => document.getElementById(id).addEventListener('input', updPreview));

document.getElementById('puzzleForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const sel = document.getElementById('pieces');
    let pcs = sel.value === 'custom' ? parseInt(document.getElementById('pieces-custom').value) : parseInt(sel.value);
    const h = parseInt(document.getElementById('time-hours').value) || 0;
    const m = parseInt(document.getElementById('time-minutes').value) || 0;
    const s = parseInt(document.getElementById('time-seconds').value) || 0;
    const total = h * 3600 + m * 60 + s;
    if (!pcs || pcs <= 0) return toast('form-toast', 'Select pieces', 'error');
    if (total <= 0) return toast('form-toast', 'Enter time', 'error');

    const res = await fetch('/api/puzzles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        date: document.getElementById('date').value, pieces: pcs, time_seconds: total,
        puzzle_name: document.getElementById('puzzle_name').value, brand: document.getElementById('brand').value,
        difficulty_rating: rating, notes: document.getElementById('notes').value, tags: document.getElementById('tags').value,
    })});
    if (res.ok) {
        const p = await res.json();
        toast('form-toast', `Saved! 500pc eq: ${fmt(Math.round(p.scaled_time_seconds))}`, 'success');
        ['time-hours','time-minutes','time-seconds','puzzle_name','brand','notes','tags'].forEach(id => document.getElementById(id).value = '');
        document.getElementById('scaled-preview').classList.remove('visible');
        document.getElementById('date').value = new Date().toISOString().split('T')[0];
    } else toast('form-toast', 'Error saving', 'error');
});

function toast(id, msg, type) {
    const el = document.getElementById(id);
    el.textContent = msg; el.className = `toast ${type}`;
    setTimeout(() => el.className = 'toast', 4000);
}

// ============================================================
// HISTORY
// ============================================================
async function loadHistory() {
    const pcs = document.getElementById('filter-pieces').value;
    const sort = document.getElementById('sort-by').value;
    let url = `/api/puzzles?sort=${sort}&order=desc`;
    if (pcs) url += `&pieces=${pcs}`;
    const res = await fetch(url);
    const puzzles = await res.json();
    const tbody = document.getElementById('history-body');
    if (!puzzles.length) { tbody.innerHTML = '<tr><td colspan="8" class="placeholder" style="text-align:center;padding:32px">No entries</td></tr>'; return; }
    tbody.innerHTML = puzzles.map(p => {
        const pace = (p.time_seconds / p.pieces).toFixed(1);
        const s = '<span style="color:var(--orange)">' + '&#9733;'.repeat(p.difficulty_rating) + '</span><span style="opacity:0.25">' + '&#9733;'.repeat(5 - p.difficulty_rating) + '</span>';
        return `<tr class="${p.is_personal_best ? 'is-pb' : ''}">
            <td>${fmtDate(p.date)}</td><td><strong>${p.puzzle_name || '-'}</strong>${p.brand ? `<br><small style="color:var(--text-3)">${p.brand}</small>` : ''}</td>
            <td><strong>${p.pieces}</strong></td><td>${fmt(p.time_seconds)}</td><td>${fmt(Math.round(p.scaled_time_seconds))}</td>
            <td>${pace}s/pc</td><td>${s}</td>
            <td><button class="action-btn edit" onclick="openEdit(${p.id})">Edit</button> <button class="action-btn delete" onclick="delPuzzle(${p.id})">Del</button></td></tr>`;
    }).join('');
}
document.getElementById('filter-pieces').addEventListener('change', loadHistory);
document.getElementById('sort-by').addEventListener('change', loadHistory);

async function openEdit(id) {
    const res = await fetch('/api/puzzles'); const all = await res.json();
    const p = all.find(x => x.id === id); if (!p) return;
    document.getElementById('edit-id').value = p.id;
    document.getElementById('edit-date').value = p.date;
    document.getElementById('edit-pieces').value = p.pieces;
    document.getElementById('edit-hours').value = Math.floor(p.time_seconds / 3600);
    document.getElementById('edit-minutes').value = Math.floor((p.time_seconds % 3600) / 60);
    document.getElementById('edit-seconds').value = p.time_seconds % 60;
    document.getElementById('edit-difficulty').value = p.difficulty_rating;
    document.getElementById('edit-name').value = p.puzzle_name || '';
    document.getElementById('edit-brand').value = p.brand || '';
    document.getElementById('edit-notes').value = p.notes || '';
    document.getElementById('edit-tags').value = p.tags || '';
    document.getElementById('edit-modal').classList.add('open');
}
function closeEditModal() { document.getElementById('edit-modal').classList.remove('open'); }

document.getElementById('editForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-id').value;
    const h = parseInt(document.getElementById('edit-hours').value) || 0;
    const m = parseInt(document.getElementById('edit-minutes').value) || 0;
    const s = parseInt(document.getElementById('edit-seconds').value) || 0;
    await fetch(`/api/puzzles/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        date: document.getElementById('edit-date').value, pieces: parseInt(document.getElementById('edit-pieces').value),
        time_seconds: h*3600+m*60+s, difficulty_rating: parseInt(document.getElementById('edit-difficulty').value),
        puzzle_name: document.getElementById('edit-name').value, brand: document.getElementById('edit-brand').value,
        notes: document.getElementById('edit-notes').value, tags: document.getElementById('edit-tags').value,
    })});
    closeEditModal(); loadHistory();
});

async function delPuzzle(id) { if (!confirm('Delete?')) return; await fetch(`/api/puzzles/${id}`, { method: 'DELETE' }); loadHistory(); }

// ============================================================
// CHARTS
// ============================================================
let charts = {};
function kill(n) { if (charts[n]) charts[n].destroy(); }

async function loadCharts() {
    const [tr, pr, par, wr] = await Promise.all([fetch('/api/charts/trend'), fetch('/api/charts/piece_breakdown'), fetch('/api/charts/pace'), fetch('/api/charts/weekly')]);
    const trend = await tr.json(), piece = await pr.json(), pace = await par.json(), weekly = await wr.json();
    if (!trend.puzzles.length) return;
    renderTrend(trend); renderPiece(piece); renderPace(pace); renderDist(trend); renderPieCount(piece); renderImprovement(trend); renderWeekly(weekly);
}

function renderTrend(d) {
    kill('trend');
    charts.trend = new Chart(document.getElementById('trendChart'), {
        type: 'line', data: { labels: d.puzzles.map((p,i)=>`#${i+1}`), datasets: [
            { label: 'Scaled', data: d.puzzles.map(p=>Math.round(p.scaled_time_seconds)), borderColor: '#7c5cfc', backgroundColor: 'rgba(124,92,252,0.05)', fill: true, tension: 0.25, pointRadius: 3 },
            { label: '5-Avg', data: d.moving_avg_5.map(v=>Math.round(v)), borderColor: '#f87171', borderWidth: 2.5, pointRadius: 0, tension: 0.4 },
            { label: '10-Avg', data: d.moving_avg_10.map(v=>Math.round(v)), borderColor: '#34d399', borderWidth: 2.5, borderDash: [6,3], pointRadius: 0, tension: 0.4 },
        ]}, options: { responsive: true, maintainAspectRatio: false, interaction: { intersect: false, mode: 'index' }, plugins: { tooltip: { callbacks: { label: c=>`${c.dataset.label}: ${fmt(c.raw)}` } } }, scales: { y: { ticks: { callback: v=>fmtShort(v) } }, x: { ticks: { maxTicksLimit: 12 } } } }
    });
}

function renderPiece(d) {
    kill('piece'); const pcs = Object.keys(d).map(Number);
    charts.piece = new Chart(document.getElementById('pieceChart'), { type: 'bar', data: { labels: pcs.map(p=>`${p}pc`), datasets: [
        { label: 'Avg', data: pcs.map(p=>d[p].average), backgroundColor: 'rgba(124,92,252,0.45)', borderRadius: 6 },
        { label: 'Best', data: pcs.map(p=>d[p].best), backgroundColor: 'rgba(52,211,153,0.45)', borderRadius: 6 },
    ]}, options: { responsive: true, maintainAspectRatio: false, plugins: { tooltip: { callbacks: { label: c=>`${c.dataset.label}: ${fmt(c.raw)}` } } }, scales: { y: { ticks: { callback: v=>fmtShort(v) } } } } });
}

function renderPace(d) {
    kill('pace');
    const cm = { 100:'#34d399',200:'#60a5fa',300:'#a78bfa',500:'#7c5cfc',750:'#fb923c',1000:'#f87171',1500:'#ec4899',2000:'#f472b6' };
    charts.pace = new Chart(document.getElementById('paceChart'), { type: 'scatter', data: { datasets: [{
        label: 'Pace', data: d.map((p,i)=>({x:i+1,y:p.pace})), backgroundColor: d.map(p=>cm[p.pieces]||'#7c5cfc'), pointRadius: 5,
    }]}, options: { responsive: true, maintainAspectRatio: false, plugins: { tooltip: { callbacks: { label: c=>`${d[c.dataIndex].pieces}pc: ${c.raw.y}s/pc` } } }, scales: { y: { title: { display: true, text: 'sec/piece' } }, x: { title: { display: true, text: '#' } } } } });
}

function renderDist(d) {
    kill('dist');
    const mins = d.puzzles.map(p=>Math.round(p.scaled_time_seconds/60));
    const mn = Math.min(...mins), mx = Math.max(...mins);
    const bs = Math.max(1, Math.round((mx-mn)/8));
    const bins = {};
    for (let i=Math.floor(mn/bs)*bs; i<=mx; i+=bs) bins[i]=0;
    mins.forEach(t=>{const b=Math.floor(t/bs)*bs; bins[b]=(bins[b]||0)+1;});
    charts.dist = new Chart(document.getElementById('distributionChart'), { type: 'bar', data: { labels: Object.keys(bins).map(b=>`${b}-${+b+bs}m`), datasets: [{data: Object.values(bins), backgroundColor: 'rgba(124,92,252,0.45)', borderRadius: 4}] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { ticks: { stepSize: 1 } } } } });
}

function renderPieCount(d) {
    kill('pieCount'); const pcs = Object.keys(d).map(Number);
    const cols = ['#7c5cfc','#34d399','#fb923c','#f87171','#60a5fa','#a78bfa','#ec4899','#fbbf24'];
    charts.pieCount = new Chart(document.getElementById('pieCountChart'), { type: 'doughnut', data: { labels: pcs.map(p=>`${p}pc`), datasets: [{data: pcs.map(p=>d[p].count), backgroundColor: cols.slice(0,pcs.length), borderWidth: 0}] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } } });
}

function renderImprovement(d) {
    kill('imp'); if (d.puzzles.length < 2) return;
    const base = d.puzzles[0].scaled_time_seconds;
    const imps = d.puzzles.map(p=>Math.round(((base-p.scaled_time_seconds)/base*100)*10)/10);
    charts.imp = new Chart(document.getElementById('improvementChart'), { type: 'line', data: { labels: d.puzzles.map((_,i)=>`#${i+1}`), datasets: [{ label: '%', data: imps, borderColor: '#34d399', backgroundColor: 'rgba(52,211,153,0.06)', fill: true, tension: 0.3, pointRadius: 2 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { tooltip: { callbacks: { label: c=>`${c.raw>0?'+':''}${c.raw}%` } } }, scales: { y: { ticks: { callback: v=>`${v>0?'+':''}${v}%` } }, x: { ticks: { maxTicksLimit: 15 } } } } });
}

function renderWeekly(d) {
    kill('weekly'); if (!d.length) return;
    charts.weekly = new Chart(document.getElementById('weeklyChart'), { type: 'bar', data: { labels: d.map(w=>fmtDate(w.week)), datasets: [
        { label: 'Puzzles', data: d.map(w=>w.count), backgroundColor: 'rgba(124,92,252,0.4)', borderRadius: 6, yAxisID: 'y' },
        { label: 'Avg Scaled', data: d.map(w=>w.avg_scaled), type: 'line', borderColor: '#34d399', pointRadius: 3, yAxisID: 'y1', tension: 0.3 },
    ]}, options: { responsive: true, maintainAspectRatio: false, scales: { y: { position: 'left', ticks: { stepSize: 1 } }, y1: { position: 'right', ticks: { callback: v=>fmtShort(v) }, grid: { drawOnChartArea: false } } } } });
}

// ============================================================
// GOALS
// ============================================================
async function loadGoals() {
    const res = await fetch('/api/goals'); const goals = await res.json();
    const el = document.getElementById('goals-list');
    if (!goals.length) { el.innerHTML = '<div class="placeholder">No goals yet</div>'; return; }
    el.innerHTML = goals.map(g => `
        <div class="goal-card ${g.achieved?'done':''}">
            <div class="goal-info"><div class="goal-title">${g.pieces}pc in ${fmt(g.target_time_seconds)}</div><div class="goal-meta">${g.description||''}${g.achieved_date?` &mdash; Done ${fmtDateFull(g.achieved_date)}`:''}</div></div>
            <span class="goal-badge ${g.achieved?'done':'pending'}">${g.achieved?'Done':'Active'}</span>
            <button class="goal-del" onclick="delGoal(${g.id})">&#10005;</button>
        </div>`).join('');
}

document.getElementById('goalForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const h = parseInt(document.getElementById('goal-hours').value)||0;
    const m = parseInt(document.getElementById('goal-minutes').value)||0;
    const s = parseInt(document.getElementById('goal-seconds').value)||0;
    const total = h*3600+m*60+s; if (total<=0) return;
    await fetch('/api/goals', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ pieces: parseInt(document.getElementById('goal-pieces').value), target_time_seconds: total, description: document.getElementById('goal-desc').value })});
    ['goal-hours','goal-minutes','goal-seconds','goal-desc'].forEach(id=>document.getElementById(id).value='');
    loadGoals();
});

async function delGoal(id) { await fetch(`/api/goals/${id}`, {method:'DELETE'}); loadGoals(); }

// ============================================================
// ACHIEVEMENTS
// ============================================================
const ICONS = {'puzzle-piece':'&#129513;',star:'&#11088;',fire:'&#128293;',trophy:'&#127942;',crown:'&#128081;',gem:'&#128142;',bolt:'&#9889;',mountain:'&#9968;',calendar:'&#128197;',flame:'&#128293;',rocket:'&#128640;','chart-up':'&#128200;','trending-up':'&#128201;',grid:'&#127922;',globe:'&#127758;',moon:'&#127769;',medal:'&#127941;',clock:'&#9200;',sun:'&#9728;'};

async function loadAchievements() {
    const res = await fetch('/api/achievements'); const achs = await res.json();
    document.getElementById('achievements-grid').innerHTML = achs.map(a => `
        <div class="ach-card ${a.unlocked?'unlocked':'locked'}">
            <div class="ach-icon">${ICONS[a.icon]||'&#127942;'}</div>
            <div class="ach-name">${a.name}</div>
            <div class="ach-desc">${a.description}</div>
            ${a.unlocked_date?`<div class="ach-date">${fmtDateFull(a.unlocked_date)}</div>`:''}
        </div>`).join('');
}

// ============================================================
// SETTINGS
// ============================================================
async function loadSettings() {
    const res = await fetch('/api/settings'); const s = await res.json();
    EXPONENT = parseFloat(s.scaling_exponent || 0.73);
    document.getElementById('setting-exponent').value = EXPONENT;
    document.getElementById('exponent-display').textContent = EXPONENT.toFixed(2);
    updScalePreview(EXPONENT); updPresets(EXPONENT);
}

function updScalePreview(exp) {
    const pcs = [100,200,300,500,750,1000,1500,2000];
    document.getElementById('scaling-preview').innerHTML = `<table><thead><tr><th>Pieces</th><th>Factor</th><th>30min &rarr; 500pc</th></tr></thead><tbody>
        ${pcs.map(pc=>{const f=Math.pow(500/pc,exp); return `<tr${pc===500?' style="color:var(--purple);font-weight:700"':''}><td>${pc}pc</td><td>&times;${f.toFixed(3)}</td><td>${fmt(Math.round(1800*f))}</td></tr>`;}).join('')}</tbody></table>`;
}

function updPresets(v) { document.querySelectorAll('.preset').forEach(b=>b.classList.toggle('active', Math.abs(parseFloat(b.dataset.val)-v)<0.005)); }

document.getElementById('setting-exponent').addEventListener('input', function() {
    const v = parseFloat(this.value);
    document.getElementById('exponent-display').textContent = v.toFixed(2);
    updScalePreview(v); updPresets(v);
});

document.querySelectorAll('.preset').forEach(b => b.addEventListener('click', () => {
    const v = parseFloat(b.dataset.val);
    document.getElementById('setting-exponent').value = v;
    document.getElementById('exponent-display').textContent = v.toFixed(2);
    updScalePreview(v); updPresets(v);
}));

document.getElementById('save-settings').addEventListener('click', async () => {
    const data = { scaling_exponent: parseFloat(document.getElementById('setting-exponent').value) };
    await fetch('/api/settings', { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data) });
    EXPONENT = data.scaling_exponent;
    toast('settings-toast', 'Saved! All times recalculated.', 'success');
});

// ============================================================
// INIT
// ============================================================
(async () => {
    try { const r = await fetch('/api/settings'); const s = await r.json(); EXPONENT = parseFloat(s.scaling_exponent||0.73); } catch(e){}
    loadDashboard();
})();
