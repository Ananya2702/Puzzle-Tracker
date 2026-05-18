// ============================================================
// Puzzle Geeks - App Logic
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

// ============================================================
// CONFETTI SYSTEM
// ============================================================
const confettiCanvas = document.getElementById('confetti-canvas');
const confettiCtx = confettiCanvas.getContext('2d');
let confettiPieces = [];
let confettiActive = false;

function resizeConfetti() {
    confettiCanvas.width = window.innerWidth;
    confettiCanvas.height = window.innerHeight;
}
resizeConfetti();
window.addEventListener('resize', resizeConfetti);

function launchConfetti(duration = 3000) {
    confettiActive = true;
    const colors = ['#7c5cfc', '#34d399', '#f87171', '#fbbf24', '#60a5fa', '#ec4899', '#a78bfa', '#fb923c'];
    const startTime = Date.now();

    for (let i = 0; i < 150; i++) {
        confettiPieces.push({
            x: Math.random() * confettiCanvas.width,
            y: -20 - Math.random() * 100,
            w: 4 + Math.random() * 6,
            h: 8 + Math.random() * 8,
            color: colors[Math.floor(Math.random() * colors.length)],
            vx: (Math.random() - 0.5) * 4,
            vy: 2 + Math.random() * 4,
            spin: Math.random() * 360,
            spinSpeed: (Math.random() - 0.5) * 10,
            opacity: 1,
        });
    }

    function animate() {
        if (!confettiActive) return;
        confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
        const elapsed = Date.now() - startTime;
        const fading = elapsed > duration - 800;

        confettiPieces = confettiPieces.filter(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.12;
            p.spin += p.spinSpeed;
            if (fading) p.opacity -= 0.02;

            if (p.y > confettiCanvas.height + 20 || p.opacity <= 0) return false;

            confettiCtx.save();
            confettiCtx.translate(p.x, p.y);
            confettiCtx.rotate(p.spin * Math.PI / 180);
            confettiCtx.globalAlpha = p.opacity;
            confettiCtx.fillStyle = p.color;
            confettiCtx.fillRect(-p.w/2, -p.h/2, p.w, p.h);
            confettiCtx.restore();
            return true;
        });

        if (confettiPieces.length > 0 && elapsed < duration) {
            requestAnimationFrame(animate);
        } else {
            confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
            confettiActive = false;
            confettiPieces = [];
        }
    }
    requestAnimationFrame(animate);
}

// ============================================================
// XP / LEVEL SYSTEM (purely frontend, based on stats)
// ============================================================
function calculateLevel(stats) {
    // XP formula: 50 per puzzle + 10 per hour + 100 per streak day + 200 per achievement
    const puzzleXP = (stats.total_puzzles || 0) * 50;
    const hourXP = (stats.total_time_hours || 0) * 10;
    const streakXP = (stats.longest_streak || 0) * 100;
    const totalXP = puzzleXP + hourXP + streakXP;

    // Level curve: each level needs progressively more XP
    let level = 1;
    let xpForNext = 100;
    let xpAccum = 0;

    while (xpAccum + xpForNext <= totalXP) {
        xpAccum += xpForNext;
        level++;
        xpForNext = Math.round(100 * Math.pow(1.4, level - 1));
    }

    const xpInCurrentLevel = totalXP - xpAccum;
    const progress = Math.min(100, Math.round((xpInCurrentLevel / xpForNext) * 100));

    return { level, totalXP, xpInCurrentLevel, xpForNext, progress };
}

function updateLevelDisplay(stats) {
    const { level, totalXP, progress } = calculateLevel(stats);
    document.getElementById('level-num').textContent = `Level ${level}`;
    document.getElementById('xp-fill').style.width = `${progress}%`;
    document.getElementById('xp-text').textContent = `${totalXP} XP`;
}

// ============================================================
// MOTIVATIONAL MESSAGES
// ============================================================
const MOTIVATIONS = {
    new_user: [
        { emoji: '&#127942;', msg: "Welcome to Puzzle Geeks! Log your first puzzle to start tracking." },
        { emoji: '&#128640;', msg: "Ready to track your puzzling journey? Start by logging a session!" },
    ],
    streak_active: [
        { emoji: '&#128293;', msg: "You're on fire! {streak}-day streak going strong. Keep it alive!" },
        { emoji: '&#9889;', msg: "{streak} days straight! You're becoming a puzzle machine!" },
        { emoji: '&#127775;', msg: "Day {streak} of your streak! Consistency is the secret sauce." },
    ],
    improving: [
        { emoji: '&#128200;', msg: "You've improved {imp}% from your early sessions. The grind pays off!" },
        { emoji: '&#127881;', msg: "Getting faster! {imp}% improvement since you started. Keep pushing!" },
    ],
    lots_of_puzzles: [
        { emoji: '&#129513;', msg: "{total} puzzles completed! That's {pieces} pieces you've conquered." },
        { emoji: '&#128170;', msg: "You've spent {hours}h puzzling. That's dedication!" },
    ],
    general: [
        { emoji: '&#129300;', msg: "Tip: Consistent practice matters more than marathon sessions." },
        { emoji: '&#128161;', msg: "Pro tip: Sort edge pieces first, then group by color/pattern." },
        { emoji: '&#127912;', msg: "Challenge yourself: Try a puzzle with an unusual color palette!" },
        { emoji: '&#9200;', msg: "Speed puzzling secret: Look at the box less, trust your pattern recognition." },
        { emoji: '&#128640;', msg: "The best puzzlers aren't fast at first. They're fast because they don't stop." },
    ],
};

function getMotivation(stats) {
    if (!stats.total_puzzles || stats.total_puzzles === 0) {
        return pick(MOTIVATIONS.new_user);
    }
    // Prioritize streak messages
    if (stats.current_streak >= 3) {
        const m = pick(MOTIVATIONS.streak_active);
        return { emoji: m.emoji, msg: m.msg.replace('{streak}', stats.current_streak) };
    }
    // Then improvement
    if (stats.improvement_pct > 5) {
        const m = pick(MOTIVATIONS.improving);
        return { emoji: m.emoji, msg: m.msg.replace('{imp}', Math.round(stats.improvement_pct)) };
    }
    // Fun stats
    if (stats.total_puzzles >= 5) {
        const m = pick(MOTIVATIONS.lots_of_puzzles);
        return { emoji: m.emoji, msg: m.msg.replace('{total}', stats.total_puzzles).replace('{pieces}', (stats.total_pieces||0).toLocaleString()).replace('{hours}', stats.total_time_hours) };
    }
    return pick(MOTIVATIONS.general);
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function updateMotivation(stats) {
    const m = getMotivation(stats);
    document.getElementById('motivation-emoji').innerHTML = m.emoji;
    document.getElementById('motivation-msg').textContent = m.msg;
}

// ============================================================
// FUN STATS
// ============================================================
function updateFunStats(stats) {
    const el = document.getElementById('fun-stats');
    if (!stats.total_puzzles || stats.total_puzzles === 0) {
        el.innerHTML = '<p class="placeholder">Complete some puzzles to unlock fun stats</p>';
        return;
    }

    const funItems = [];

    // Speed rank
    const avgMin = stats.avg_scaled_time ? Math.round(stats.avg_scaled_time / 60) : 0;
    if (avgMin > 0) {
        let rank = 'Beginner';
        if (avgMin <= 15) rank = 'Lightning';
        else if (avgMin <= 25) rank = 'Speedster';
        else if (avgMin <= 40) rank = 'Swift';
        else if (avgMin <= 60) rank = 'Steady';
        else if (avgMin <= 90) rank = 'Patient';
        funItems.push({ icon: '&#9889;', text: 'Speed rank', val: rank });
    }

    // Total pieces as something tangible
    if (stats.total_pieces) {
        const football_fields = (stats.total_pieces * 4 / 10000).toFixed(1); // ~4cm2 per piece
        funItems.push({ icon: '&#129513;', text: 'Pieces placed', val: stats.total_pieces.toLocaleString() });
    }

    // Time as something relatable
    if (stats.total_time_hours >= 1) {
        const movies = Math.round(stats.total_time_hours / 2);
        if (movies > 0) funItems.push({ icon: '&#127916;', text: 'Could have watched', val: `${movies} movie${movies>1?'s':''}` });
    }

    // Longest streak
    if (stats.longest_streak > 0) {
        funItems.push({ icon: '&#128293;', text: 'Longest streak', val: `${stats.longest_streak} day${stats.longest_streak>1?'s':''}` });
    }

    // Favorite piece count
    if (stats.favorite_piece_count) {
        funItems.push({ icon: '&#128151;', text: 'Favorite size', val: `${stats.favorite_piece_count}pc` });
    }

    // Pace
    if (stats.best_pace) {
        funItems.push({ icon: '&#128640;', text: 'Fastest pace', val: `${stats.best_pace}s/piece` });
    }

    el.innerHTML = funItems.map(f =>
        `<div class="fun-stat"><span class="fun-stat-icon">${f.icon}</span><span class="fun-stat-text">${f.text}</span><span class="fun-stat-val">${f.val}</span></div>`
    ).join('');
}

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
    localStorage.setItem('pg-theme', t);
    setChartTheme();
}
document.getElementById('theme-toggle').addEventListener('click', () => {
    setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
});
setTheme(localStorage.getItem('pg-theme') || 'dark');

// --- Logout ---
document.getElementById('logout-btn').addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
});

// --- Toast helper ---
function toast(id, msg, type) {
    const el = document.getElementById(id);
    el.textContent = msg; el.className = `toast ${type}`;
    setTimeout(() => el.className = 'toast', 5000);
}

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

        // Streak fire effect
        const streakChip = document.getElementById('streak-chip');
        if (stats.current_streak >= 3) {
            streakChip.classList.add('on-fire');
            document.getElementById('stat-streak').textContent = stats.current_streak + ' &#128293;';
        } else {
            streakChip.classList.remove('on-fire');
        }

        // Level system
        updateLevelDisplay(stats);

        // Motivation
        updateMotivation(stats);

        // Fun stats
        updateFunStats(stats);

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
    if (res.ok) {
        const p = await res.json();
        document.getElementById('timer-reset').click();
        if (p.is_personal_best) { launchConfetti(); toast('form-toast', `NEW PERSONAL BEST! ${fmt(p.time_seconds)}`, 'pb'); }
        else toast('form-toast', `Saved! ${fmt(p.time_seconds)} (500pc eq: ${fmt(Math.round(p.scaled_time_seconds))})`, 'success');
        setTimeout(() => goTo('dashboard'), 1500);
    }
});

// ============================================================
// ADD PUZZLE - QUICK MODE
// ============================================================
let quickMode = false;
let quickPieces = 500;

document.getElementById('toggle-quick-mode').addEventListener('click', () => {
    quickMode = !quickMode;
    document.getElementById('quick-add-card').style.display = quickMode ? 'block' : 'none';
    document.getElementById('full-add-card').style.display = quickMode ? 'none' : 'block';
    document.getElementById('toggle-quick-mode').textContent = quickMode ? 'Full Form' : 'Quick Add';
});

// Piece buttons for quick add
document.querySelectorAll('#quick-piece-btns .piece-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('#quick-piece-btns .piece-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        quickPieces = parseInt(btn.dataset.val);
        updQuickPreview();
    });
});

function updQuickPreview() {
    const h = parseInt(document.getElementById('quick-hours').value) || 0;
    const m = parseInt(document.getElementById('quick-minutes').value) || 0;
    const s = parseInt(document.getElementById('quick-seconds').value) || 0;
    const total = h * 3600 + m * 60 + s;
    const bar = document.getElementById('quick-preview');
    if (quickPieces > 0 && total > 0) {
        document.getElementById('quick-preview-time').textContent = fmt(Math.round(scaled(total, quickPieces)));
        bar.classList.add('visible');
    } else bar.classList.remove('visible');
}
['quick-hours','quick-minutes','quick-seconds'].forEach(id =>
    document.getElementById(id).addEventListener('input', updQuickPreview)
);

document.getElementById('quickForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('quick-name').value.trim();
    if (!name) return toast('quick-toast', 'Give your puzzle a name!', 'error');
    const h = parseInt(document.getElementById('quick-hours').value) || 0;
    const m = parseInt(document.getElementById('quick-minutes').value) || 0;
    const s = parseInt(document.getElementById('quick-seconds').value) || 0;
    const total = h * 3600 + m * 60 + s;
    if (total <= 0) return toast('quick-toast', 'Enter a time', 'error');

    const res = await fetch('/api/puzzles', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pieces: quickPieces, time_seconds: total, puzzle_name: name, date: new Date().toISOString().split('T')[0] })
    });
    if (res.ok) {
        const p = await res.json();
        if (p.is_personal_best) {
            launchConfetti();
            toast('quick-toast', `NEW PERSONAL BEST! ${name} - ${quickPieces}pc in ${fmt(total)}`, 'pb');
        } else {
            toast('quick-toast', `Saved! ${name} - ${quickPieces}pc in ${fmt(total)} (500pc eq: ${fmt(Math.round(p.scaled_time_seconds))})`, 'success');
        }
        ['quick-hours','quick-minutes','quick-seconds'].forEach(id => document.getElementById(id).value = '');
        document.getElementById('quick-name').value = '';
        document.getElementById('quick-preview').classList.remove('visible');
        document.getElementById('quick-add-card').classList.add('save-success');
        setTimeout(() => document.getElementById('quick-add-card').classList.remove('save-success'), 500);
    } else toast('quick-toast', 'Error saving', 'error');
});

// ============================================================
// ADD PUZZLE - FULL FORM
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
    if (!pcs || pcs <= 0) return toast('form-toast', 'Select piece count', 'error');
    if (total <= 0) return toast('form-toast', 'Enter your time', 'error');

    const res = await fetch('/api/puzzles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        date: document.getElementById('date').value, pieces: pcs, time_seconds: total,
        puzzle_name: document.getElementById('puzzle_name').value, brand: document.getElementById('brand').value,
        difficulty_rating: rating, notes: document.getElementById('notes').value, tags: document.getElementById('tags').value,
    })});
    if (res.ok) {
        const p = await res.json();
        if (p.is_personal_best) {
            launchConfetti();
            toast('form-toast', `NEW PERSONAL BEST! ${pcs}pc in ${fmt(total)}`, 'pb');
        } else {
            toast('form-toast', `Saved! ${pcs}pc in ${fmt(total)} (500pc eq: ${fmt(Math.round(p.scaled_time_seconds))})`, 'success');
        }
        ['time-hours','time-minutes','time-seconds','puzzle_name','brand','notes','tags'].forEach(id => document.getElementById(id).value = '');
        document.getElementById('scaled-preview').classList.remove('visible');
        document.getElementById('date').value = new Date().toISOString().split('T')[0];
        document.getElementById('full-add-card').classList.add('save-success');
        setTimeout(() => document.getElementById('full-add-card').classList.remove('save-success'), 500);
    } else toast('form-toast', 'Error saving', 'error');
});

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
    if (!puzzles.length) { tbody.innerHTML = '<tr><td colspan="8" class="placeholder" style="text-align:center;padding:32px">No entries yet. Go log your first puzzle!</td></tr>'; return; }
    tbody.innerHTML = puzzles.map(p => {
        const pace = (p.time_seconds / p.pieces).toFixed(1);
        const s = '<span style="color:var(--orange)">' + '&#9733;'.repeat(p.difficulty_rating) + '</span><span style="opacity:0.25">' + '&#9733;'.repeat(5 - p.difficulty_rating) + '</span>';
        const pbBadge = p.is_personal_best ? ' <span class="tag" style="font-size:0.6rem">PB</span>' : '';
        return `<tr class="${p.is_personal_best ? 'is-pb' : ''}">
            <td>${fmtDate(p.date)}</td><td><strong>${p.puzzle_name || '-'}</strong>${pbBadge}${p.brand ? `<br><small style="color:var(--text-3)">${p.brand}</small>` : ''}</td>
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

async function delPuzzle(id) { if (!confirm('Delete this entry?')) return; await fetch(`/api/puzzles/${id}`, { method: 'DELETE' }); loadHistory(); }

// ============================================================
// CSV IMPORT
// ============================================================
let importData = [];

document.getElementById('toggle-import').addEventListener('click', () => {
    const panel = document.getElementById('import-panel');
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
});

document.getElementById('close-import').addEventListener('click', () => {
    document.getElementById('import-panel').style.display = 'none';
    resetImport();
});

document.getElementById('browse-file').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('csv-file').click();
});

document.getElementById('drop-area').addEventListener('click', () => {
    document.getElementById('csv-file').click();
});

// Drag & drop
const dropArea = document.getElementById('drop-area');
['dragenter', 'dragover'].forEach(evt => dropArea.addEventListener(evt, (e) => {
    e.preventDefault(); dropArea.classList.add('dragover');
}));
['dragleave', 'drop'].forEach(evt => dropArea.addEventListener(evt, (e) => {
    e.preventDefault(); dropArea.classList.remove('dragover');
}));
dropArea.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].name.endsWith('.csv')) handleCSVFile(files[0]);
});

document.getElementById('csv-file').addEventListener('change', (e) => {
    if (e.target.files.length > 0) handleCSVFile(e.target.files[0]);
});

function parseTimeString(timeStr) {
    timeStr = timeStr.trim();
    if (/^\d+$/.test(timeStr)) return parseInt(timeStr);
    const parts = timeStr.split(':');
    if (parts.length === 3) return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
    if (parts.length === 2) return parseInt(parts[0]) * 60 + parseInt(parts[1]);
    const match = timeStr.match(/(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:(\d+)s)?/);
    if (match && (match[1] || match[2] || match[3])) return (parseInt(match[1]||0)*3600) + (parseInt(match[2]||0)*60) + parseInt(match[3]||0);
    return NaN;
}

function handleCSVFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const text = e.target.result;
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        if (lines.length < 2) return toast('import-toast', 'CSV file is empty or has no data rows', 'error');

        const header = lines[0].split(',').map(h => h.trim().toLowerCase());
        const dateIdx = header.findIndex(h => h.includes('date'));
        const piecesIdx = header.findIndex(h => h.includes('piece') || h === 'pcs');
        const timeIdx = header.findIndex(h => h.includes('time') && !h.includes('scaled'));
        const nameIdx = header.findIndex(h => h.includes('name') || h.includes('puzzle'));
        const brandIdx = header.findIndex(h => h.includes('brand'));
        const diffIdx = header.findIndex(h => h.includes('diff') || h.includes('rating'));
        const notesIdx = header.findIndex(h => h.includes('note'));
        const tagsIdx = header.findIndex(h => h.includes('tag'));

        const getCol = (row, idx, fallback) => idx >= 0 && idx < row.length ? row[idx].trim() : (fallback !== undefined ? fallback : '');

        importData = [];
        let errors = 0;

        for (let i = 1; i < lines.length; i++) {
            const row = parseCSVRow(lines[i]);
            if (row.length < 2) continue;

            const date = getCol(row, dateIdx >= 0 ? dateIdx : 0);
            const piecesRaw = getCol(row, piecesIdx >= 0 ? piecesIdx : 1);
            const timeRaw = getCol(row, timeIdx >= 0 ? timeIdx : 2);

            const pieces = parseInt(piecesRaw);
            const timeSeconds = parseTimeString(timeRaw);

            let parsedDate = date;
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
                const d = new Date(date);
                parsedDate = !isNaN(d.getTime()) ? d.toISOString().split('T')[0] : null;
            }

            const entry = {
                date: parsedDate || new Date().toISOString().split('T')[0],
                pieces, time_seconds: timeSeconds,
                puzzle_name: getCol(row, nameIdx >= 0 ? nameIdx : 3, ''),
                brand: getCol(row, brandIdx >= 0 ? brandIdx : 4, ''),
                difficulty_rating: parseInt(getCol(row, diffIdx >= 0 ? diffIdx : 5, '3')) || 3,
                notes: getCol(row, notesIdx >= 0 ? notesIdx : 6, ''),
                tags: getCol(row, tagsIdx >= 0 ? tagsIdx : 7, ''),
                valid: !isNaN(pieces) && pieces > 0 && !isNaN(timeSeconds) && timeSeconds > 0,
            };

            if (!entry.valid) errors++;
            importData.push(entry);
        }
        showImportPreview(errors);
    };
    reader.readAsText(file);
}

function parseCSVRow(line) {
    const result = []; let current = ''; let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') { inQuotes = !inQuotes; continue; }
        if (ch === ',' && !inQuotes) { result.push(current); current = ''; continue; }
        current += ch;
    }
    result.push(current); return result;
}

function showImportPreview(errors) {
    const validCount = importData.filter(e => e.valid).length;
    document.getElementById('import-summary').innerHTML =
        `Found <strong>${importData.length}</strong> rows: <strong>${validCount}</strong> valid` +
        (errors > 0 ? `, <span style="color:var(--red)">${errors} with errors</span>` : '');

    document.getElementById('import-thead').innerHTML = '<tr><th>#</th><th>Date</th><th>Pieces</th><th>Time</th><th>Name</th><th>Status</th></tr>';
    document.getElementById('import-tbody').innerHTML = importData.slice(0, 50).map((entry, i) =>
        `<tr class="${entry.valid ? '' : 'error'}">
            <td>${i + 1}</td><td>${entry.date}</td><td>${entry.valid ? entry.pieces : 'Invalid'}</td>
            <td>${entry.valid ? fmtShort(entry.time_seconds) : 'Invalid'}</td><td>${entry.puzzle_name || '-'}</td>
            <td>${entry.valid ? '<span style="color:var(--green)">OK</span>' : '<span style="color:var(--red)">Error</span>'}</td>
        </tr>`
    ).join('') + (importData.length > 50 ? `<tr><td colspan="6" style="text-align:center;color:var(--text-3)">... and ${importData.length - 50} more</td></tr>` : '');

    document.getElementById('import-zone').style.display = 'none';
    document.getElementById('import-preview').style.display = 'block';
}

document.getElementById('import-cancel').addEventListener('click', resetImport);
function resetImport() {
    importData = [];
    document.getElementById('import-zone').style.display = 'block';
    document.getElementById('import-preview').style.display = 'none';
    document.getElementById('csv-file').value = '';
}

document.getElementById('import-confirm').addEventListener('click', async () => {
    const valid = importData.filter(e => e.valid);
    if (!valid.length) return toast('import-toast', 'No valid entries to import', 'error');

    const btn = document.getElementById('import-confirm');
    btn.disabled = true; btn.textContent = `Importing 0/${valid.length}...`;

    let success = 0, fail = 0;
    for (let i = 0; i < valid.length; i++) {
        const entry = valid[i];
        try {
            const res = await fetch('/api/puzzles', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(entry)
            });
            if (res.ok) success++; else fail++;
        } catch (e) { fail++; }
        if ((i + 1) % 5 === 0 || i === valid.length - 1) btn.textContent = `Importing ${i + 1}/${valid.length}...`;
    }

    btn.disabled = false; btn.textContent = 'Import All';
    if (success > 0) launchConfetti(2000);
    toast('import-toast', `Imported ${success} puzzles${fail > 0 ? ` (${fail} failed)` : ''}! +${success * 50} XP`, success > 0 ? 'success' : 'error');
    resetImport(); loadHistory();
});

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
    if (!goals.length) { el.innerHTML = '<div class="placeholder">No goals yet. Set a target above and start chasing it!</div>'; return; }
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
    const unlocked = achs.filter(a => a.unlocked).length;
    document.getElementById('achievements-grid').innerHTML =
        `<div class="ach-summary">
            <div class="ach-progress-ring">
                <svg viewBox="0 0 36 36"><path class="ach-bg-circle" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="var(--border)" stroke-width="3"/><path class="ach-fg-circle" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="var(--purple)" stroke-width="3" stroke-dasharray="${Math.round(unlocked/achs.length*100)}, 100" stroke-linecap="round"/></svg>
                <span class="ach-progress-text">${unlocked}/${achs.length}</span>
            </div>
        </div>` +
        achs.map(a => `
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
