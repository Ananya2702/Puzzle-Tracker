import sqlite3
import os
import json
import math
import csv
import io
import secrets
from datetime import datetime, timedelta
from functools import wraps

import bcrypt
from dotenv import load_dotenv
from flask import Flask, render_template, request, jsonify, g, Response, redirect, url_for, session
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user

load_dotenv()

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', secrets.token_hex(32))
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=30)

DATABASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), os.environ.get('DATABASE_PATH', 'puzzles.db'))
DEFAULT_SCALING_EXPONENT = 0.73

# --- Flask-Login Setup ---
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login_page'


class User(UserMixin):
    def __init__(self, id, username, email):
        self.id = id
        self.username = username
        self.email = email


@login_manager.user_loader
def load_user(user_id):
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    user = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    conn.close()
    if user:
        return User(user['id'], user['username'], user['email'])
    return None


@login_manager.unauthorized_handler
def unauthorized():
    if request.headers.get('Accept', '').find('application/json') != -1 or request.path.startswith('/api/'):
        return jsonify({'error': 'Authentication required'}), 401
    return redirect(url_for('login_page'))


# --- Database ---
def get_db():
    if 'db' not in g:
        g.db = sqlite3.connect(DATABASE)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA journal_mode=WAL")
        g.db.execute("PRAGMA foreign_keys=ON")
    return g.db


@app.teardown_appcontext
def close_db(exception):
    db = g.pop('db', None)
    if db is not None:
        db.close()


def init_db():
    conn = sqlite3.connect(DATABASE)

    # Check if this is an old database without 'users' table (pre-auth version)
    cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
    has_users_table = cursor.fetchone() is not None

    # If old tables exist without user support, drop them and start fresh
    if not has_users_table:
        old_tables = conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
        old_table_names = [t[0] for t in old_tables if t[0] != 'sqlite_sequence']
        if old_table_names:
            for table in old_table_names:
                conn.execute(f"DROP TABLE IF EXISTS {table}")
            conn.commit()

    conn.executescript('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS puzzles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            pieces INTEGER NOT NULL,
            time_seconds INTEGER NOT NULL,
            scaled_time_seconds REAL NOT NULL,
            puzzle_name TEXT DEFAULT '',
            brand TEXT DEFAULT '',
            difficulty_rating INTEGER DEFAULT 3,
            notes TEXT DEFAULT '',
            tags TEXT DEFAULT '',
            is_personal_best INTEGER DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS settings (
            user_id INTEGER NOT NULL,
            key TEXT NOT NULL,
            value TEXT NOT NULL,
            PRIMARY KEY (user_id, key),
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS goals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            pieces INTEGER NOT NULL,
            target_time_seconds INTEGER NOT NULL,
            description TEXT DEFAULT '',
            achieved INTEGER DEFAULT 0,
            achieved_date TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS achievements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            code TEXT NOT NULL,
            name TEXT NOT NULL,
            description TEXT NOT NULL,
            icon TEXT NOT NULL,
            unlocked INTEGER DEFAULT 0,
            unlocked_date TEXT,
            UNIQUE(user_id, code),
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE INDEX IF NOT EXISTS idx_puzzles_user ON puzzles(user_id);
        CREATE INDEX IF NOT EXISTS idx_puzzles_date ON puzzles(user_id, date);
        CREATE INDEX IF NOT EXISTS idx_puzzles_pieces ON puzzles(user_id, pieces);
    ''')
    conn.commit()
    conn.close()


def setup_user_defaults(user_id):
    """Set up default settings and achievements for a new user."""
    conn = sqlite3.connect(DATABASE)

    # Default settings
    defaults = [
        ('scaling_exponent', str(DEFAULT_SCALING_EXPONENT)),
        ('theme', 'dark'),
    ]
    for key, value in defaults:
        conn.execute("INSERT OR IGNORE INTO settings (user_id, key, value) VALUES (?, ?, ?)",
                     (user_id, key, value))

    # Default achievements
    achievements = [
        ('first_puzzle', 'First Piece', 'Complete your first puzzle', 'puzzle-piece'),
        ('five_puzzles', 'Getting Started', 'Complete 5 puzzles', 'star'),
        ('ten_puzzles', 'Dedicated', 'Complete 10 puzzles', 'fire'),
        ('twentyfive_puzzles', 'Quarter Century', 'Complete 25 puzzles', 'trophy'),
        ('fifty_puzzles', 'Half Century', 'Complete 50 puzzles', 'crown'),
        ('hundred_puzzles', 'Centurion', 'Complete 100 puzzles', 'gem'),
        ('speed_demon', 'Speed Demon', 'Complete a 500pc puzzle under 30 minutes', 'bolt'),
        ('marathon', 'Marathon Runner', 'Complete a 2000+ piece puzzle', 'mountain'),
        ('streak_3', 'Three-peat', 'Puzzle 3 days in a row', 'calendar'),
        ('streak_7', 'Week Warrior', 'Puzzle 7 days in a row', 'flame'),
        ('streak_30', 'Monthly Master', 'Puzzle 30 days in a row', 'rocket'),
        ('improver', 'Getting Better', 'Improve your scaled time by 10%', 'chart-up'),
        ('big_improver', 'Major Progress', 'Improve your scaled time by 25%', 'trending-up'),
        ('variety', 'Variety Pack', 'Complete puzzles of 4+ different piece counts', 'grid'),
        ('all_rounder', 'All Rounder', 'Complete puzzles of 6+ different piece counts', 'globe'),
        ('night_owl', 'Consistent', 'Log puzzles on 10 different days', 'moon'),
        ('pb_breaker', 'Record Breaker', 'Beat your personal best 3 times', 'medal'),
        ('hour_club', '10 Hour Club', 'Spend 10+ hours puzzling total', 'clock'),
        ('day_club', '24 Hour Club', 'Spend 24+ hours puzzling total', 'sun'),
    ]
    for code, name, desc, icon in achievements:
        conn.execute('''
            INSERT OR IGNORE INTO achievements (user_id, code, name, description, icon)
            VALUES (?, ?, ?, ?, ?)
        ''', (user_id, code, name, desc, icon))

    conn.commit()
    conn.close()


# --- Helpers ---
def get_setting(user_id, key, default=None):
    db = get_db()
    row = db.execute("SELECT value FROM settings WHERE user_id = ? AND key = ?", (user_id, key)).fetchone()
    return row['value'] if row else default


def get_scaling_exponent(user_id):
    return float(get_setting(user_id, 'scaling_exponent', DEFAULT_SCALING_EXPONENT))


def calculate_scaled_time(actual_time_seconds, pieces, exponent=None):
    if pieces <= 0:
        return 0
    if exponent is None:
        exponent = DEFAULT_SCALING_EXPONENT
    return actual_time_seconds * (500 / pieces) ** exponent


def update_personal_bests(db, user_id):
    db.execute("UPDATE puzzles SET is_personal_best = 0 WHERE user_id = ?", (user_id,))
    piece_counts = db.execute("SELECT DISTINCT pieces FROM puzzles WHERE user_id = ?", (user_id,)).fetchall()
    for row in piece_counts:
        pc = row['pieces']
        best = db.execute(
            "SELECT id FROM puzzles WHERE user_id = ? AND pieces = ? ORDER BY time_seconds ASC LIMIT 1",
            (user_id, pc)
        ).fetchone()
        if best:
            db.execute("UPDATE puzzles SET is_personal_best = 1 WHERE id = ?", (best['id'],))
    db.commit()


def check_achievements(db, user_id):
    puzzles = db.execute("SELECT * FROM puzzles WHERE user_id = ? ORDER BY date ASC, id ASC", (user_id,)).fetchall()
    total = len(puzzles)
    if total == 0:
        return

    checks = {
        'first_puzzle': total >= 1,
        'five_puzzles': total >= 5,
        'ten_puzzles': total >= 10,
        'twentyfive_puzzles': total >= 25,
        'fifty_puzzles': total >= 50,
        'hundred_puzzles': total >= 100,
        'speed_demon': any(p['pieces'] == 500 and p['time_seconds'] < 1800 for p in puzzles),
        'marathon': any(p['pieces'] >= 2000 for p in puzzles),
    }

    # Streaks
    dates = sorted(set(p['date'] for p in puzzles))
    max_streak = 1
    streak = 1
    for i in range(1, len(dates)):
        d1 = datetime.strptime(dates[i - 1], '%Y-%m-%d')
        d2 = datetime.strptime(dates[i], '%Y-%m-%d')
        if (d2 - d1).days == 1:
            streak += 1
            max_streak = max(max_streak, streak)
        else:
            streak = 1
    checks['streak_3'] = max_streak >= 3
    checks['streak_7'] = max_streak >= 7
    checks['streak_30'] = max_streak >= 30

    # Improvement
    if total >= 3:
        cc = min(5, max(1, total // 3))
        scaled = [p['scaled_time_seconds'] for p in puzzles]
        first_avg = sum(scaled[:cc]) / cc
        last_avg = sum(scaled[-cc:]) / cc
        imp = (first_avg - last_avg) / first_avg * 100 if first_avg > 0 else 0
        checks['improver'] = imp >= 10
        checks['big_improver'] = imp >= 25

    checks['variety'] = len(set(p['pieces'] for p in puzzles)) >= 4
    checks['all_rounder'] = len(set(p['pieces'] for p in puzzles)) >= 6
    checks['night_owl'] = len(dates) >= 10

    pb_count = sum(1 for p in puzzles if p['is_personal_best'])
    checks['pb_breaker'] = pb_count >= 3

    total_time = sum(p['time_seconds'] for p in puzzles)
    checks['hour_club'] = total_time >= 36000
    checks['day_club'] = total_time >= 86400

    now = datetime.now().strftime('%Y-%m-%d')
    for code, achieved in checks.items():
        if achieved:
            db.execute('''
                UPDATE achievements SET unlocked = 1, unlocked_date = ?
                WHERE user_id = ? AND code = ? AND unlocked = 0
            ''', (now, user_id, code))
    db.commit()


def get_statistics(puzzles):
    if not puzzles:
        return {
            'total_puzzles': 0, 'total_time_hours': 0, 'avg_scaled_time': 0,
            'median_scaled_time': 0, 'best_scaled_time': 0, 'worst_scaled_time': 0,
            'std_deviation': 0, 'improvement_pct': 0, 'current_streak': 0,
            'longest_streak': 0, 'avg_pieces': 0, 'favorite_piece_count': 0,
            'personal_bests': {}, 'pace_trend': 'N/A', 'total_pieces': 0,
            'avg_pace': 0, 'best_pace': 0, 'this_week_count': 0, 'this_month_count': 0,
        }

    total_time = sum(p['time_seconds'] for p in puzzles)
    total_pieces = sum(p['pieces'] for p in puzzles)
    scaled_times = [p['scaled_time_seconds'] for p in puzzles]
    sorted_scaled = sorted(scaled_times)

    n = len(sorted_scaled)
    median = sorted_scaled[n // 2] if n % 2 == 1 else (sorted_scaled[n // 2 - 1] + sorted_scaled[n // 2]) / 2
    avg = sum(scaled_times) / n
    variance = sum((t - avg) ** 2 for t in scaled_times) / n
    std_dev = math.sqrt(variance)

    cc = min(5, max(1, n // 3))
    first_n = sum(scaled_times[:cc]) / cc
    last_n = sum(scaled_times[-cc:]) / cc
    improvement_pct = ((first_n - last_n) / first_n * 100) if first_n > 0 else 0

    dates = sorted(set(p['date'] for p in puzzles))
    current_streak = 0
    longest_streak = 1
    if len(dates) > 1:
        streak = 1
        for i in range(1, len(dates)):
            d1 = datetime.strptime(dates[i - 1], '%Y-%m-%d')
            d2 = datetime.strptime(dates[i], '%Y-%m-%d')
            if (d2 - d1).days == 1:
                streak += 1
                longest_streak = max(longest_streak, streak)
            else:
                streak = 1
        last_date = datetime.strptime(dates[-1], '%Y-%m-%d')
        today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        current_streak = streak if (today - last_date).days <= 1 else 0
    elif len(dates) == 1:
        last_date = datetime.strptime(dates[-1], '%Y-%m-%d')
        today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        current_streak = 1 if (today - last_date).days <= 1 else 0

    from collections import Counter
    piece_counts = set(p['pieces'] for p in puzzles)
    personal_bests = {}
    for pc in sorted(piece_counts):
        times_for_pc = [p['time_seconds'] for p in puzzles if p['pieces'] == pc]
        personal_bests[pc] = min(times_for_pc)

    piece_counter = Counter(p['pieces'] for p in puzzles)
    favorite_piece_count = piece_counter.most_common(1)[0][0]

    paces = [p['time_seconds'] / p['pieces'] for p in puzzles]

    if len(scaled_times) >= 4:
        mid = len(scaled_times) // 2
        first_half = sum(scaled_times[:mid]) / mid
        second_half = sum(scaled_times[mid:]) / (n - mid)
        pace_trend = 'Improving' if second_half < first_half * 0.95 else ('Slowing' if second_half > first_half * 1.05 else 'Steady')
    else:
        pace_trend = 'Need more data'

    today = datetime.now()
    week_start = (today - timedelta(days=today.weekday())).strftime('%Y-%m-%d')
    month_start = today.replace(day=1).strftime('%Y-%m-%d')

    return {
        'total_puzzles': n,
        'total_time_hours': round(total_time / 3600, 1),
        'total_pieces': total_pieces,
        'avg_scaled_time': round(avg),
        'median_scaled_time': round(median),
        'best_scaled_time': round(min(scaled_times)),
        'worst_scaled_time': round(max(scaled_times)),
        'std_deviation': round(std_dev),
        'improvement_pct': round(improvement_pct, 1),
        'current_streak': current_streak,
        'longest_streak': longest_streak,
        'avg_pieces': round(sum(p['pieces'] for p in puzzles) / n),
        'favorite_piece_count': favorite_piece_count,
        'personal_bests': personal_bests,
        'pace_trend': pace_trend,
        'avg_pace': round(sum(paces) / len(paces), 2),
        'best_pace': round(min(paces), 2),
        'this_week_count': sum(1 for p in puzzles if p['date'] >= week_start),
        'this_month_count': sum(1 for p in puzzles if p['date'] >= month_start),
    }


# =========================================================
# AUTH ROUTES
# =========================================================

@app.route('/login')
def login_page():
    if current_user.is_authenticated:
        return redirect(url_for('index'))
    return render_template('auth.html', mode='login')


@app.route('/register')
def register_page():
    if current_user.is_authenticated:
        return redirect(url_for('index'))
    return render_template('auth.html', mode='register')


@app.route('/api/auth/register', methods=['POST'])
def api_register():
    data = request.get_json()
    username = data.get('username', '').strip()
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')

    if not username or not email or not password:
        return jsonify({'error': 'All fields are required'}), 400
    if len(username) < 3:
        return jsonify({'error': 'Username must be at least 3 characters'}), 400
    if len(password) < 6:
        return jsonify({'error': 'Password must be at least 6 characters'}), 400
    if '@' not in email:
        return jsonify({'error': 'Invalid email address'}), 400

    db = get_db()
    existing = db.execute("SELECT id FROM users WHERE username = ? OR email = ?", (username, email)).fetchone()
    if existing:
        return jsonify({'error': 'Username or email already taken'}), 409

    password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    cursor = db.execute(
        "INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)",
        (username, email, password_hash)
    )
    db.commit()

    user_id = cursor.lastrowid
    setup_user_defaults(user_id)

    user = User(user_id, username, email)
    login_user(user, remember=True)
    return jsonify({'status': 'ok', 'username': username}), 201


@app.route('/api/auth/login', methods=['POST'])
def api_login():
    data = request.get_json()
    identifier = data.get('identifier', '').strip()
    password = data.get('password', '')

    if not identifier or not password:
        return jsonify({'error': 'All fields are required'}), 400

    db = get_db()
    user = db.execute(
        "SELECT * FROM users WHERE username = ? OR email = ?",
        (identifier, identifier.lower())
    ).fetchone()

    if not user or not bcrypt.checkpw(password.encode('utf-8'), user['password_hash'].encode('utf-8')):
        return jsonify({'error': 'Invalid credentials'}), 401

    user_obj = User(user['id'], user['username'], user['email'])
    login_user(user_obj, remember=True)
    return jsonify({'status': 'ok', 'username': user['username']})


@app.route('/api/auth/logout', methods=['POST'])
@login_required
def api_logout():
    logout_user()
    return jsonify({'status': 'ok'})


@app.route('/api/auth/me', methods=['GET'])
@login_required
def api_me():
    return jsonify({'id': current_user.id, 'username': current_user.username, 'email': current_user.email})


# =========================================================
# APP ROUTES
# =========================================================

@app.route('/')
@login_required
def index():
    return render_template('index.html', username=current_user.username)


@app.route('/api/puzzles', methods=['GET'])
@login_required
def get_puzzles():
    db = get_db()
    uid = current_user.id
    piece_filter = request.args.get('pieces')
    sort_by = request.args.get('sort', 'date')
    order = request.args.get('order', 'desc')

    query = "SELECT * FROM puzzles WHERE user_id = ?"
    params = [uid]

    if piece_filter:
        query += " AND pieces = ?"
        params.append(int(piece_filter))

    valid_sorts = {'date': 'date', 'time': 'time_seconds', 'scaled': 'scaled_time_seconds', 'pieces': 'pieces'}
    sort_col = valid_sorts.get(sort_by, 'date')
    order_dir = 'DESC' if order == 'desc' else 'ASC'
    query += f" ORDER BY {sort_col} {order_dir}, id {order_dir}"

    puzzles = db.execute(query, params).fetchall()
    return jsonify([dict(p) for p in puzzles])


@app.route('/api/puzzles', methods=['POST'])
@login_required
def add_puzzle():
    data = request.get_json()
    uid = current_user.id
    pieces = int(data['pieces'])
    time_seconds = int(data['time_seconds'])
    date = data.get('date', datetime.now().strftime('%Y-%m-%d'))
    puzzle_name = data.get('puzzle_name', '')
    brand = data.get('brand', '')
    difficulty_rating = int(data.get('difficulty_rating', 3))
    notes = data.get('notes', '')
    tags = data.get('tags', '')

    db = get_db()
    exponent = get_scaling_exponent(uid)
    scaled_time = calculate_scaled_time(time_seconds, pieces, exponent)

    cursor = db.execute('''
        INSERT INTO puzzles (user_id, date, pieces, time_seconds, scaled_time_seconds, puzzle_name, brand, difficulty_rating, notes, tags)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (uid, date, pieces, time_seconds, scaled_time, puzzle_name, brand, difficulty_rating, notes, tags))
    db.commit()

    update_personal_bests(db, uid)
    check_achievements(db, uid)

    # Check goals
    goals = db.execute("SELECT * FROM goals WHERE user_id = ? AND pieces = ? AND achieved = 0", (uid, pieces)).fetchall()
    for goal in goals:
        if time_seconds <= goal['target_time_seconds']:
            db.execute("UPDATE goals SET achieved = 1, achieved_date = ? WHERE id = ?", (date, goal['id']))
    db.commit()

    new_puzzle = db.execute("SELECT * FROM puzzles WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return jsonify(dict(new_puzzle)), 201


@app.route('/api/puzzles/<int:puzzle_id>', methods=['PUT'])
@login_required
def update_puzzle(puzzle_id):
    data = request.get_json()
    db = get_db()
    uid = current_user.id

    existing = db.execute("SELECT * FROM puzzles WHERE id = ? AND user_id = ?", (puzzle_id, uid)).fetchone()
    if not existing:
        return jsonify({'error': 'Not found'}), 404

    pieces = int(data.get('pieces', existing['pieces']))
    time_seconds = int(data.get('time_seconds', existing['time_seconds']))
    date = data.get('date', existing['date'])
    puzzle_name = data.get('puzzle_name', existing['puzzle_name'])
    brand = data.get('brand', existing['brand'])
    difficulty_rating = int(data.get('difficulty_rating', existing['difficulty_rating']))
    notes = data.get('notes', existing['notes'])
    tags = data.get('tags', existing['tags'] or '')

    exponent = get_scaling_exponent(uid)
    scaled_time = calculate_scaled_time(time_seconds, pieces, exponent)

    db.execute('''
        UPDATE puzzles SET date=?, pieces=?, time_seconds=?, scaled_time_seconds=?,
        puzzle_name=?, brand=?, difficulty_rating=?, notes=?, tags=?, updated_at=datetime('now')
        WHERE id=? AND user_id=?
    ''', (date, pieces, time_seconds, scaled_time, puzzle_name, brand, difficulty_rating, notes, tags, puzzle_id, uid))
    db.commit()
    update_personal_bests(db, uid)

    updated = db.execute("SELECT * FROM puzzles WHERE id = ?", (puzzle_id,)).fetchone()
    return jsonify(dict(updated))


@app.route('/api/puzzles/<int:puzzle_id>', methods=['DELETE'])
@login_required
def delete_puzzle(puzzle_id):
    db = get_db()
    uid = current_user.id
    existing = db.execute("SELECT * FROM puzzles WHERE id = ? AND user_id = ?", (puzzle_id, uid)).fetchone()
    if not existing:
        return jsonify({'error': 'Not found'}), 404

    db.execute("DELETE FROM puzzles WHERE id = ? AND user_id = ?", (puzzle_id, uid))
    db.commit()
    update_personal_bests(db, uid)
    return jsonify({'status': 'ok'})


@app.route('/api/statistics', methods=['GET'])
@login_required
def get_statistics_route():
    db = get_db()
    puzzles = db.execute("SELECT * FROM puzzles WHERE user_id = ? ORDER BY date ASC, id ASC", (current_user.id,)).fetchall()
    stats = get_statistics([dict(p) for p in puzzles])
    return jsonify(stats)


@app.route('/api/charts/trend', methods=['GET'])
@login_required
def get_trend_data():
    db = get_db()
    puzzles = db.execute("SELECT * FROM puzzles WHERE user_id = ? ORDER BY date ASC, id ASC", (current_user.id,)).fetchall()
    puzzles_list = [dict(p) for p in puzzles]

    scaled_times = [p['scaled_time_seconds'] for p in puzzles_list]
    ma_5, ma_10 = [], []
    for i in range(len(scaled_times)):
        w5 = scaled_times[max(0, i - 4):i + 1]
        ma_5.append(sum(w5) / len(w5))
        w10 = scaled_times[max(0, i - 9):i + 1]
        ma_10.append(sum(w10) / len(w10))

    return jsonify({'puzzles': puzzles_list, 'moving_avg_5': ma_5, 'moving_avg_10': ma_10})


@app.route('/api/charts/piece_breakdown', methods=['GET'])
@login_required
def get_piece_breakdown():
    db = get_db()
    puzzles = db.execute("SELECT * FROM puzzles WHERE user_id = ? ORDER BY date ASC", (current_user.id,)).fetchall()

    breakdown = {}
    for p in puzzles:
        pc = p['pieces']
        if pc not in breakdown:
            breakdown[pc] = {'count': 0, 'times': [], 'best': float('inf')}
        breakdown[pc]['count'] += 1
        breakdown[pc]['times'].append(p['time_seconds'])
        breakdown[pc]['best'] = min(breakdown[pc]['best'], p['time_seconds'])

    result = {}
    for pc, data in sorted(breakdown.items()):
        result[pc] = {
            'count': data['count'],
            'average': round(sum(data['times']) / len(data['times'])),
            'best': data['best'],
            'worst': max(data['times']),
        }
    return jsonify(result)


@app.route('/api/charts/pace', methods=['GET'])
@login_required
def get_pace_data():
    db = get_db()
    puzzles = db.execute("SELECT * FROM puzzles WHERE user_id = ? ORDER BY date ASC, id ASC", (current_user.id,)).fetchall()
    return jsonify([{'date': p['date'], 'pace': round(p['time_seconds'] / p['pieces'], 2), 'pieces': p['pieces'], 'id': p['id']} for p in puzzles])


@app.route('/api/charts/weekly', methods=['GET'])
@login_required
def get_weekly_data():
    db = get_db()
    puzzles = db.execute("SELECT * FROM puzzles WHERE user_id = ? ORDER BY date ASC", (current_user.id,)).fetchall()

    weekly = {}
    for p in puzzles:
        d = datetime.strptime(p['date'], '%Y-%m-%d')
        ws = (d - timedelta(days=d.weekday())).strftime('%Y-%m-%d')
        if ws not in weekly:
            weekly[ws] = {'count': 0, 'total_time': 0, 'scaled_times': [], 'pieces': 0}
        weekly[ws]['count'] += 1
        weekly[ws]['total_time'] += p['time_seconds']
        weekly[ws]['scaled_times'].append(p['scaled_time_seconds'])
        weekly[ws]['pieces'] += p['pieces']

    return jsonify([{
        'week': w, 'count': d['count'], 'total_time': d['total_time'],
        'avg_scaled': round(sum(d['scaled_times']) / len(d['scaled_times'])),
        'best_scaled': round(min(d['scaled_times'])), 'total_pieces': d['pieces'],
    } for w, d in sorted(weekly.items())])


@app.route('/api/settings', methods=['GET'])
@login_required
def get_settings():
    db = get_db()
    settings = db.execute("SELECT * FROM settings WHERE user_id = ?", (current_user.id,)).fetchall()
    return jsonify({s['key']: s['value'] for s in settings})


@app.route('/api/settings', methods=['PUT'])
@login_required
def update_settings():
    data = request.get_json()
    db = get_db()
    uid = current_user.id

    for key, value in data.items():
        db.execute("INSERT OR REPLACE INTO settings (user_id, key, value) VALUES (?, ?, ?)", (uid, key, str(value)))
    db.commit()

    if 'scaling_exponent' in data:
        exponent = float(data['scaling_exponent'])
        puzzles = db.execute("SELECT id, time_seconds, pieces FROM puzzles WHERE user_id = ?", (uid,)).fetchall()
        for p in puzzles:
            new_scaled = calculate_scaled_time(p['time_seconds'], p['pieces'], exponent)
            db.execute("UPDATE puzzles SET scaled_time_seconds = ? WHERE id = ?", (new_scaled, p['id']))
        db.commit()

    return jsonify({'status': 'ok'})


@app.route('/api/goals', methods=['GET'])
@login_required
def get_goals():
    db = get_db()
    goals = db.execute("SELECT * FROM goals WHERE user_id = ? ORDER BY created_at DESC", (current_user.id,)).fetchall()
    return jsonify([dict(g) for g in goals])


@app.route('/api/goals', methods=['POST'])
@login_required
def add_goal():
    data = request.get_json()
    db = get_db()
    db.execute('''
        INSERT INTO goals (user_id, pieces, target_time_seconds, description)
        VALUES (?, ?, ?, ?)
    ''', (current_user.id, int(data['pieces']), int(data['target_time_seconds']), data.get('description', '')))
    db.commit()
    return jsonify({'status': 'created'}), 201


@app.route('/api/goals/<int:goal_id>', methods=['DELETE'])
@login_required
def delete_goal(goal_id):
    db = get_db()
    db.execute("DELETE FROM goals WHERE id = ? AND user_id = ?", (goal_id, current_user.id))
    db.commit()
    return jsonify({'status': 'ok'})


@app.route('/api/achievements', methods=['GET'])
@login_required
def get_achievements():
    db = get_db()
    achievements = db.execute(
        "SELECT * FROM achievements WHERE user_id = ? ORDER BY unlocked DESC, id ASC", (current_user.id,)
    ).fetchall()
    return jsonify([dict(a) for a in achievements])


@app.route('/api/export/csv', methods=['GET'])
@login_required
def export_csv():
    db = get_db()
    puzzles = db.execute("SELECT * FROM puzzles WHERE user_id = ? ORDER BY date ASC", (current_user.id,)).fetchall()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['Date', 'Puzzle Name', 'Brand', 'Pieces', 'Time (seconds)', 'Time (formatted)',
                     'Scaled Time (500pc)', 'Difficulty', 'Notes', 'Tags'])
    for p in puzzles:
        h = p['time_seconds'] // 3600
        m = (p['time_seconds'] % 3600) // 60
        s = p['time_seconds'] % 60
        writer.writerow([p['date'], p['puzzle_name'], p['brand'], p['pieces'],
                         p['time_seconds'], f"{h}:{m:02d}:{s:02d}", round(p['scaled_time_seconds']),
                         p['difficulty_rating'], p['notes'], p['tags']])

    output.seek(0)
    return Response(output.getvalue(), mimetype='text/csv',
                    headers={'Content-Disposition': 'attachment; filename=puzzle_times.csv'})


@app.route('/api/scaling_info', methods=['GET'])
@login_required
def get_scaling_info():
    exponent = get_scaling_exponent(current_user.id)
    common_pieces = [100, 200, 300, 500, 750, 1000, 1500, 2000, 3000, 5000]
    info = {}
    for pc in common_pieces:
        factor = (500 / pc) ** exponent
        info[pc] = {'scaling_factor': round(factor, 3), 'example_30min': round(1800 * factor)}
    return jsonify({'exponent': exponent, 'baseline_pieces': 500, 'scaling_table': info})


if __name__ == '__main__':
    init_db()
    app.run(debug=True, port=5000)
