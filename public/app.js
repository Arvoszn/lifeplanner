const state = {
  tasks: [],
  view: 'calendar',
  month: new Date(),
  selectedDate: null,
  editingId: null,
};

const TYPE_COLORS = {
  class: 'class',
  homework: 'homework',
  work: 'work',
  personal: 'personal',
  spontaneous: 'spontaneous',
  appointment: 'appointment',
};

const TYPE_LABELS = {
  class: 'Class',
  homework: 'Homework',
  work: 'Work',
  personal: 'Personal',
  spontaneous: 'Spontaneous',
  appointment: 'Appointment',
};

const REPEAT_LABELS = {
  none: 'Once',
  daily: 'Every day',
  eod: 'Every other day',
  weekly: 'Weekly',
};

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

async function api(url, opts = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function fmtDate(d) {
  const dt = typeof d === 'string' ? new Date(d + 'T00:00:00') : d;
  return dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function toYMD(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function todayYMD() {
  return toYMD(new Date());
}

function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m).padStart(2, '0')} ${period}`;
}

function parseYMD(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function daysBetween(a, b) {
  return Math.round((parseYMD(b) - parseYMD(a)) / 86400000);
}

// Does routine task t occur on ymd?
function routineOn(t, ymd) {
  if (t.deadline) return t.date <= ymd && ymd <= t.deadline;
  if (t.repeat === 'none') return t.date === ymd;
  if (ymd < t.date) return false;
  if (t.repeat === 'daily') return true;
  if (t.repeat === 'eod') return daysBetween(t.date, ymd) % 2 === 0;
  if (t.repeat === 'weekly') {
    const days = t.weekdays || [];
    return days.includes(parseYMD(ymd).getDay());
  }
  return false;
}

// Is task t completed on ymd (per-date for routines)?
function taskDoneOn(t, ymd) {
  if (t.repeat === 'none') return t.done;
  return (t.completed || []).includes(ymd);
}

function isOverdue(t) {
  if (t.done) return false;
  if (t.deadline) return t.deadline < todayYMD();
  return t.repeat === 'none' && t.date < todayYMD();
}

// ---------- Calendar ----------
function renderCalendar() {
  const y = state.month.getFullYear();
  const m = state.month.getMonth();
  document.getElementById('month-label').textContent =
    state.month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  const grid = document.getElementById('calendar-grid');
  grid.innerHTML = '';

  const start = new Date(y, m, 1 - new Date(y, m, 1).getDay());

  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const ymd = toYMD(d);
    const tasks = state.tasks.filter((t) => routineOn(t, ymd) && !taskDoneOn(t, ymd));

    const cell = document.createElement('div');
    cell.className = 'day' + (d.getMonth() !== m ? ' other' : '') + (ymd === todayYMD() ? ' today' : '');
    cell.innerHTML = `<div class="num">${d.getDate()}</div>`;

    if (tasks.length) {
      const dots = document.createElement('div');
      dots.className = 'dots';
      const counts = {};
      tasks.forEach((t) => (counts[t.type] = (counts[t.type] || 0) + 1));
      Object.entries(counts).forEach(([type, n]) => {
        const dot = document.createElement('span');
        dot.className = 'dot ' + (TYPE_COLORS[type] || 'personal') + (n > 1 ? ' count' : '');
        dot.textContent = n > 1 ? n : '';
        dots.appendChild(dot);
      });
      cell.appendChild(dots);
    }

    cell.addEventListener('click', () => openDay(ymd));
    grid.appendChild(cell);
  }
}

// ---------- Day panel ----------
function openDay(ymd) {
  state.selectedDate = ymd;
  state.view = 'calendar';
  switchTab('calendar');
  document.getElementById('panel-date').textContent = fmtDate(ymd);
  renderPanel();
  document.getElementById('day-panel').classList.remove('hidden');
}

function renderPanel() {
  const box = document.getElementById('panel-tasks');
  box.innerHTML = '';
  const tasks = state.tasks
    .filter((t) => routineOn(t, state.selectedDate))
    .sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));

  if (!tasks.length) {
    box.innerHTML = '<p class="empty">Nothing on this day. Add something!</p>';
    return;
  }
  tasks.forEach((t) => box.appendChild(taskEl(t, state.selectedDate)));
}

function taskEl(t, ymd) {
  const el = document.createElement('div');
  el.className = 'task' + (taskDoneOn(t, ymd) ? ' done' : '');
  el.dataset.id = t.id;

  if (t.deadline) {
    const days = Math.round((parseYMD(t.deadline) - parseYMD(todayYMD())) / 86400000);
    if (days < 0) el.classList.add('overdue');
    else if (days <= 2) el.classList.add('urgent');
  }

  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = taskDoneOn(t, ymd);
  cb.addEventListener('change', () => toggleDone(t.id, ymd));

  const body = document.createElement('div');
  body.className = 'body';
  const title = document.createElement('div');
  title.className = 'title';
  title.textContent = t.title;
  const tag = document.createElement('span');
  tag.className = 'tag ' + (TYPE_COLORS[t.type] || 'personal');
  tag.textContent = TYPE_LABELS[t.type] || t.type;
  title.appendChild(tag);

  if (t.repeat && t.repeat !== 'none') {
    const rep = document.createElement('span');
    rep.className = 'tag repeat';
    rep.textContent = REPEAT_LABELS[t.repeat] || t.repeat;
    title.appendChild(rep);
  }

  if (t.help) {
    const helpTag = document.createElement('span');
    helpTag.className = 'tag help';
    helpTag.textContent = '🤖 help';
    title.appendChild(helpTag);
  }

  body.appendChild(title);

  const metaBits = [
    t.time && `🕐 ${fmtTime(t.time)}`,
    t.repeat === 'none' && t.date && fmtDate(t.date),
    t.deadline && `⏰ due ${fmtDate(t.deadline)}`,
  ].filter(Boolean);
  if (metaBits.length) {
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = metaBits.join(' · ');
    body.appendChild(meta);
  }

  if (t.notes) {
    const notes = document.createElement('div');
    notes.className = 'notes';
    notes.textContent = t.notes;
    body.appendChild(notes);
  }

  el.appendChild(cb);
  el.appendChild(body);

  const editBtn = document.createElement('button');
  editBtn.className = 'ghost';
  editBtn.textContent = '✎';
  editBtn.title = 'Edit';
  editBtn.addEventListener('click', () => openEdit(t));

  const del = document.createElement('button');
  del.className = 'del';
  del.textContent = '✕';
  del.title = 'Delete';
  del.addEventListener('click', () => delTask(t.id));

  el.appendChild(editBtn);
  el.appendChild(del);
  return el;
}

// ---------- List view ----------
function renderList() {
  const v = state.view;
  const container = document.getElementById('list-view');
  container.innerHTML = '';

  let groups = [];
  const today = todayYMD();

  if (v === 'today') {
    const todayTasks = state.tasks
      .filter((t) => routineOn(t, today))
      .sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
    groups = [['Today', todayTasks]];
  } else if (v === 'upcoming') {
    const upcoming = state.tasks
      .filter((t) => t.repeat === 'none' && !t.done && t.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date) || (a.time || '99').localeCompare(b.time || '99'));
    groups = [['Upcoming', upcoming]];
  } else if (v === 'overdue') {
    groups = [['Overdue', state.tasks.filter(isOverdue).sort((a, b) => a.date.localeCompare(b.date))]];
  } else if (v === 'done') {
    groups = [['Done', state.tasks.filter((t) => t.done && t.repeat === 'none').sort((a, b) => b.date.localeCompare(a.date))]];
  } else if (v === 'help') {
    groups = [['Needs help', state.tasks.filter((t) => t.help && !t.done).sort((a, b) => a.date.localeCompare(b.date))]];
  }

  if (!groups.length || groups.every(([, ts]) => !ts.length)) {
    container.innerHTML = '<p class="empty">Nothing here.</p>';
    return;
  }

  groups.forEach(([label, tasks]) => {
    if (!tasks.length) return;
    const grp = document.createElement('div');
    grp.className = 'list-group';
    const h = document.createElement('h3');
    h.textContent = label;
    grp.appendChild(h);
    tasks.forEach((t) => grp.appendChild(taskEl(t, t.repeat === 'none' ? t.date : today)));
    container.appendChild(grp);
  });
}

// ---------- Modal ----------
function openModal(date, task) {
  state.editingId = task ? task.id : null;
  document.getElementById('modal-title').textContent = task ? 'Edit task' : 'Add task';
  document.getElementById('f-title').value = task ? task.title : '';
  document.getElementById('f-date').value = task ? task.date : date;
  document.getElementById('f-deadline').value = task ? (task.deadline || '') : '';
  document.getElementById('f-time').value = task ? (task.time || '') : '';
  document.getElementById('f-type').value = task ? task.type : 'personal';
  document.getElementById('f-notes').value = task ? (task.notes || '') : '';
  document.getElementById('f-help').checked = task ? !!task.help : false;
  document.getElementById('f-repeat').value = task ? (task.repeat || 'none') : 'none';
  setWeekdays(task ? (task.weekdays || []) : []);
  syncRepeatUI();
  document.getElementById('modal').classList.remove('hidden');
  document.getElementById('f-title').focus();
}

function closeModal() {
  document.getElementById('modal').classList.add('hidden');
  state.editingId = null;
}

function setWeekdays(days) {
  const btns = document.querySelectorAll('#f-weekdays button');
  btns.forEach((b, i) => b.classList.toggle('on', days.includes(i)));
}

function getWeekdays() {
  const days = [];
  document.querySelectorAll('#f-weekdays button').forEach((b, i) => {
    if (b.classList.contains('on')) days.push(i);
  });
  return days;
}

function syncRepeatUI() {
  const r = document.getElementById('f-repeat').value;
  const wd = document.getElementById('f-weekdays');
  wd.classList.toggle('hidden', r !== 'weekly');
}

async function saveTask(e) {
  e.preventDefault();
  const repeat = document.getElementById('f-repeat').value;
  let weekdays = getWeekdays();
  if (repeat === 'weekly' && !weekdays.length) {
    weekdays = [parseYMD(document.getElementById('f-date').value).getDay()];
  }
  const payload = {
    title: document.getElementById('f-title').value,
    date: document.getElementById('f-date').value,
    deadline: document.getElementById('f-deadline').value || null,
    time: document.getElementById('f-time').value,
    type: document.getElementById('f-type').value,
    notes: document.getElementById('f-notes').value,
    help: document.getElementById('f-help').checked,
    repeat,
    weekdays: repeat === 'weekly' ? weekdays : undefined,
  };

  if (state.editingId) {
    await api('/api/tasks/' + state.editingId, { method: 'PATCH', body: JSON.stringify(payload) });
  } else {
    await api('/api/tasks', { method: 'POST', body: JSON.stringify(payload) });
  }

  closeModal();
  await load();
}

// ---------- Actions ----------
async function toggleDone(id, ymd) {
  const t = state.tasks.find((x) => x.id === id);
  if (t.repeat === 'none') {
    await api('/api/tasks/' + id, { method: 'PATCH', body: JSON.stringify({ done: !t.done }) });
  } else {
    const completed = t.completed || [];
    const idx = completed.indexOf(ymd);
    const next = idx === -1 ? [...completed, ymd] : completed.filter((d) => d !== ymd);
    await api('/api/tasks/' + id, { method: 'PATCH', body: JSON.stringify({ completed: next }) });
  }
  await load();
}

async function delTask(id) {
  await api('/api/tasks/' + id, { method: 'DELETE' });
  await load();
}

function openEdit(t) {
  openModal(t.date, t);
}

// ---------- View switching ----------
function switchTab(view) {
  state.view = view;
  document.querySelectorAll('.view-tabs button').forEach((b) => {
    b.classList.toggle('active', b.dataset.view === view);
  });
  const calView = document.getElementById('calendar-view');
  const listView = document.getElementById('list-view');
  const panel = document.getElementById('day-panel');

  if (view === 'calendar') {
    calView.classList.add('active');
    listView.classList.remove('active');
    renderCalendar();
    if (!state.selectedDate) panel.classList.add('hidden');
  } else {
    calView.classList.remove('active');
    listView.classList.add('active');
    renderList();
    panel.classList.add('hidden');
  }
}

// ---------- Load ----------
async function load() {
  state.tasks = await api('/api/tasks');
  if (state.view === 'calendar') {
    renderCalendar();
    if (state.selectedDate) renderPanel();
  } else {
    renderList();
  }
}

// ---------- Events ----------
document.getElementById('prev-month').addEventListener('click', () => {
  state.month.setMonth(state.month.getMonth() - 1);
  renderCalendar();
});
document.getElementById('next-month').addEventListener('click', () => {
  state.month.setMonth(state.month.getMonth() + 1);
  renderCalendar();
});
document.getElementById('today-btn').addEventListener('click', () => {
  state.month = new Date();
  renderCalendar();
});
document.querySelectorAll('.view-tabs button').forEach((b) =>
  b.addEventListener('click', () => switchTab(b.dataset.view))
);
document.getElementById('add-task-btn').addEventListener('click', () => openModal(state.selectedDate));
document.getElementById('close-panel').addEventListener('click', () => {
  document.getElementById('day-panel').classList.add('hidden');
  state.selectedDate = null;
});
document.getElementById('f-cancel').addEventListener('click', closeModal);
document.getElementById('task-form').addEventListener('submit', saveTask);
document.getElementById('f-repeat').addEventListener('change', syncRepeatUI);
document.querySelectorAll('#f-weekdays button').forEach((b) =>
  b.addEventListener('click', () => b.classList.toggle('on'))
);

load();
