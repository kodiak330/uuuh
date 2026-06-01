'use strict';

const STORAGE_KEYS = { workouts: 'ft_workouts', daily: 'ft_daily' };

// --- Storage helpers ---
function load(key) {
  try { return JSON.parse(localStorage.getItem(key)) || []; } catch { return []; }
}
function save(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

// --- Date helpers ---
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function fmtDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function dayLabel(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short' });
}
function last7Days() {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}
function thisWeekDates() {
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

// --- State ---
let pendingExercises = [];

// --- Tab switching ---
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  });
});

// --- Toast ---
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

// --- Workout form ---
document.getElementById('workout-form').addEventListener('submit', e => {
  e.preventDefault();
  const name = document.getElementById('workout-name').value.trim();
  if (!name) return;
  pendingExercises.push({
    name,
    sets:   document.getElementById('workout-sets').value || null,
    reps:   document.getElementById('workout-reps').value || null,
    weight: document.getElementById('workout-weight').value || null,
    notes:  document.getElementById('workout-notes').value.trim() || null,
  });
  e.target.reset();
  renderPendingExercises();
  showToast('Exercise added!');
});

function renderPendingExercises() {
  const list = document.getElementById('today-workout-list');
  const saveBtn = document.getElementById('save-workout');
  if (!pendingExercises.length) {
    list.innerHTML = '<p class="empty-state">No exercises added yet.</p>';
    saveBtn.style.display = 'none';
    return;
  }
  saveBtn.style.display = 'block';
  list.innerHTML = pendingExercises.map((ex, i) => `
    <div class="log-item">
      <div class="log-item-left">
        <div class="log-item-name">${esc(ex.name)}</div>
        <div class="log-item-meta">${exerciseMeta(ex)}</div>
      </div>
      <button class="delete-btn" data-pending="${i}" title="Remove"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
    </div>
  `).join('');
  list.querySelectorAll('[data-pending]').forEach(btn => {
    btn.addEventListener('click', () => {
      pendingExercises.splice(Number(btn.dataset.pending), 1);
      renderPendingExercises();
    });
  });
}

document.getElementById('save-workout').addEventListener('click', () => {
  if (!pendingExercises.length) return;
  const workouts = load(STORAGE_KEYS.workouts);
  workouts.unshift({ id: Date.now(), date: todayStr(), exercises: [...pendingExercises] });
  save(STORAGE_KEYS.workouts, workouts);
  pendingExercises = [];
  renderPendingExercises();
  refreshDashboard();
  renderHistory();
  showToast('Workout session saved!');
});

// --- Daily stats form ---
const dailyForm = document.getElementById('daily-form');
(function loadTodayDailyIntoForm() {
  const daily = load(STORAGE_KEYS.daily);
  const rec = daily.find(d => d.date === todayStr());
  if (!rec) return;
  document.getElementById('daily-steps').value   = rec.steps    || '';
  document.getElementById('daily-calories').value = rec.calories || '';
  document.getElementById('daily-water').value   = rec.water    || '';
  document.getElementById('daily-sleep').value   = rec.sleep    || '';
  document.getElementById('daily-weight').value  = rec.weight   || '';
})();

dailyForm.addEventListener('submit', e => {
  e.preventDefault();
  const daily = load(STORAGE_KEYS.daily).filter(d => d.date !== todayStr());
  daily.unshift({
    date:     todayStr(),
    steps:    Number(document.getElementById('daily-steps').value)    || 0,
    calories: Number(document.getElementById('daily-calories').value) || 0,
    water:    Number(document.getElementById('daily-water').value)    || 0,
    sleep:    Number(document.getElementById('daily-sleep').value)    || 0,
    weight:   Number(document.getElementById('daily-weight').value)   || 0,
  });
  save(STORAGE_KEYS.daily, daily);
  refreshDashboard();
  renderWeeklyChart();
  showToast('Daily stats saved!');
});

// --- Dashboard ---
function refreshDashboard() {
  document.getElementById('today-date').textContent = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  });

  const today = todayStr();
  const workouts = load(STORAGE_KEYS.workouts);
  const daily    = load(STORAGE_KEYS.daily);

  const weekDates = thisWeekDates();
  const weeklyCount = workouts.filter(w => weekDates.includes(w.date)).length;
  document.getElementById('weekly-workouts').textContent = weeklyCount;

  const todayDaily = daily.find(d => d.date === today);
  document.getElementById('today-steps').textContent    = (todayDaily?.steps    || 0).toLocaleString();
  document.getElementById('today-calories').textContent = (todayDaily?.calories || 0).toLocaleString();

  // Streak: consecutive days with either a workout or daily entry
  let streak = 0;
  const allDates = new Set([
    ...workouts.map(w => w.date),
    ...daily.map(d => d.date),
  ]);
  const check = new Date();
  while (allDates.has(check.toISOString().slice(0, 10))) {
    streak++;
    check.setDate(check.getDate() - 1);
  }
  document.getElementById('streak').textContent = streak;

  // Recent workouts (last 3)
  const container = document.getElementById('recent-workouts');
  if (!workouts.length) {
    container.innerHTML = '<p class="empty-state">No workouts logged yet.</p>';
    return;
  }
  container.innerHTML = workouts.slice(0, 3).map(w => `
    <div class="log-item">
      <div class="log-item-left">
        <div class="log-item-name">${w.exercises.length} exercise${w.exercises.length !== 1 ? 's' : ''}</div>
        <div class="log-item-meta">${w.exercises.map(ex => esc(ex.name)).join(', ')}</div>
      </div>
      <div class="log-item-right">
        <div class="log-item-date">${fmtDate(w.date)}</div>
        <span class="badge badge-workout">Workout</span>
      </div>
    </div>
  `).join('');
}

// --- Weekly chart (steps bar chart) ---
function renderWeeklyChart() {
  const days = last7Days();
  const daily = load(STORAGE_KEYS.daily);
  const byDate = Object.fromEntries(daily.map(d => [d.date, d]));
  const values = days.map(d => (byDate[d]?.steps || 0));
  const max = Math.max(...values, 1);

  const container = document.getElementById('steps-chart');
  container.innerHTML = `
    <div style="font-size:.78rem;color:var(--muted);margin-bottom:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;">Steps — Last 7 Days</div>
    <div class="bar-chart">
      ${days.map((d, i) => `
        <div class="bar-col">
          <div class="bar-val">${values[i] ? values[i].toLocaleString() : ''}</div>
          <div class="bar" style="height:${Math.round((values[i]/max)*120) || 2}px"></div>
          <div class="bar-label">${dayLabel(d)}</div>
        </div>
      `).join('')}
    </div>
  `;
}

// --- History ---
function renderHistory() {
  const search   = (document.getElementById('history-search').value || '').toLowerCase();
  const filter   = document.getElementById('history-filter').value;
  const workouts = load(STORAGE_KEYS.workouts);
  const daily    = load(STORAGE_KEYS.daily);

  let items = [];

  if (filter !== 'daily') {
    workouts.forEach(w => {
      const matches = !search || w.exercises.some(ex => ex.name.toLowerCase().includes(search));
      if (matches) items.push({ type: 'workout', date: w.date, data: w });
    });
  }
  if (filter !== 'workout') {
    daily.forEach(d => {
      if (!search || 'steps calories water sleep weight'.includes(search)) {
        items.push({ type: 'daily', date: d.date, data: d });
      }
    });
  }

  items.sort((a, b) => b.date.localeCompare(a.date));

  const container = document.getElementById('history-list');
  if (!items.length) {
    container.innerHTML = '<p class="empty-state">Nothing found.</p>';
    return;
  }
  container.innerHTML = items.map(item => {
    if (item.type === 'workout') {
      const w = item.data;
      return `
        <div class="log-item">
          <div class="log-item-left">
            <div class="log-item-name">${w.exercises.length} exercise${w.exercises.length !== 1 ? 's' : ''}</div>
            <div class="log-item-meta">${w.exercises.map(ex => esc(ex.name) + (ex.sets ? ` ${ex.sets}×${ex.reps || '?'}` + (ex.weight ? `@${ex.weight}lbs` : '') : '')).join(' · ')}</div>
          </div>
          <div class="log-item-right">
            <div class="log-item-date">${fmtDate(w.date)}</div>
            <span class="badge badge-workout">Workout</span>
          </div>
          <button class="delete-btn" data-delete-workout="${w.id}" title="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </div>
      `;
    } else {
      const d = item.data;
      const parts = [];
      if (d.steps)    parts.push(`${d.steps.toLocaleString()} steps`);
      if (d.calories) parts.push(`${d.calories} cal`);
      if (d.water)    parts.push(`${d.water}oz water`);
      if (d.sleep)    parts.push(`${d.sleep}h sleep`);
      if (d.weight)   parts.push(`${d.weight}lbs`);
      return `
        <div class="log-item">
          <div class="log-item-left">
            <div class="log-item-name">Daily Stats</div>
            <div class="log-item-meta">${parts.join(' · ') || 'No data'}</div>
          </div>
          <div class="log-item-right">
            <div class="log-item-date">${fmtDate(d.date)}</div>
            <span class="badge badge-daily">Daily</span>
          </div>
          <button class="delete-btn" data-delete-daily="${d.date}" title="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </div>
      `;
    }
  }).join('');

  container.querySelectorAll('[data-delete-workout]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.deleteWorkout);
      const ws = load(STORAGE_KEYS.workouts).filter(w => w.id !== id);
      save(STORAGE_KEYS.workouts, ws);
      refreshDashboard();
      renderHistory();
      showToast('Workout deleted.');
    });
  });
  container.querySelectorAll('[data-delete-daily]').forEach(btn => {
    btn.addEventListener('click', () => {
      const date = btn.dataset.deleteDaily;
      const ds = load(STORAGE_KEYS.daily).filter(d => d.date !== date);
      save(STORAGE_KEYS.daily, ds);
      refreshDashboard();
      renderWeeklyChart();
      renderHistory();
      showToast('Daily stats deleted.');
    });
  });
}

document.getElementById('history-search').addEventListener('input', renderHistory);
document.getElementById('history-filter').addEventListener('change', renderHistory);

document.getElementById('clear-all').addEventListener('click', () => {
  if (!confirm('Delete ALL fitness data? This cannot be undone.')) return;
  localStorage.removeItem(STORAGE_KEYS.workouts);
  localStorage.removeItem(STORAGE_KEYS.daily);
  pendingExercises = [];
  renderPendingExercises();
  refreshDashboard();
  renderWeeklyChart();
  renderHistory();
  showToast('All data cleared.');
});

// --- Utility ---
function exerciseMeta(ex) {
  const parts = [];
  if (ex.sets)   parts.push(`${ex.sets} sets`);
  if (ex.reps)   parts.push(`${ex.reps} reps`);
  if (ex.weight) parts.push(`${ex.weight} lbs`);
  if (ex.notes)  parts.push(ex.notes);
  return parts.join(' · ') || 'No details';
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// --- Init ---
refreshDashboard();
renderWeeklyChart();
renderHistory();
