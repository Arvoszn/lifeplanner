const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA_DIR = process.env.LIFEPLANNER_DATA || path.join(ROOT, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'tasks.json');
const NOTIFY_SCRIPT = path.join(ROOT, 'notify.ps1');
const NOTIFIED_FILE = path.join(DATA_DIR, 'notified.json');
const EOD_EPOCH = new Date(2026, 7, 10).getTime();
const NOTIFY_GRACE_MIN = 15;
const DIGEST_HOUR = 6;

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]');

function readTasks() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) {
    return [];
  }
}

function writeTasks(tasks) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(tasks, null, 2));
}

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
};

function sendJSON(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function bodyFrom(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      try {
        resolve(JSON.parse(data || '{}'));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function localDateStr(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function readNotified() {
  let map = {};
  try {
    map = JSON.parse(fs.readFileSync(NOTIFIED_FILE, 'utf8'));
  } catch (e) {}
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const out = {};
  for (const k of Object.keys(map)) {
    if (new Date(map[k]).getTime() >= cutoff) out[k] = map[k];
  }
  return out;
}

function writeNotified(map) {
  fs.writeFileSync(NOTIFIED_FILE, JSON.stringify(map));
}

function appliesToday(task, dateStr, dow) {
  if (task.repeat === 'daily') return true;
  if (task.repeat === 'weekly') return Array.isArray(task.weekdays) && task.weekdays.includes(dow);
  if (task.repeat === 'eod') {
    const diff = Math.round((new Date(dateStr + 'T12:00:00').getTime() - EOD_EPOCH) / 86400000);
    return diff >= 0 && diff % 2 === 0;
  }
  return task.date === dateStr;
}

function toastText(task, dateStr) {
  const parts = [];
  if (task.time) parts.push(task.time);
  if (task.deadline) {
    const dl = new Date(task.deadline + 'T00:00:00');
    const today = new Date(dateStr + 'T00:00:00');
    const diff = Math.round((dl - today) / 86400000);
    const left = diff < 0 ? 'OVERDUE' : diff === 0 ? 'due today' : diff === 1 ? '1d left' : diff + 'd left';
    parts.push(`due ${dl.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · ${left}`);
  }
  if (task.notes) parts.push(task.notes);
  return parts.join(' · ');
}

function notifiesToday(task, dateStr, dow) {
  if (task.deadline) return dateStr >= task.date && dateStr <= task.deadline;
  return appliesToday(task, dateStr, dow);
}

function fireToast(title, message) {
  execFile(
    'powershell',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', NOTIFY_SCRIPT, '-Title', title, '-Message', message],
    { windowsHide: true, timeout: 20000 },
    (err) => {
      if (err) console.error('notify failed:', err.message);
    }
  );
}

function checkNotifications() {
  const now = new Date();
  const today = localDateStr(now);
  const dow = now.getDay();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const notified = readNotified();
  let changed = false;

  for (const t of readTasks()) {
    if (t.done || !t.time || !notifiesToday(t, today, dow)) continue;
    const key = `${t.id}:${today}`;
    if (notified[key]) continue;
    const [hh, mm] = t.time.split(':').map(Number);
    if (Number.isNaN(hh) || Number.isNaN(mm)) continue;
    const diff = nowMin - (hh * 60 + mm);
    if (diff >= 0 && diff <= NOTIFY_GRACE_MIN) {
      fireToast(t.title, toastText(t, today));
      notified[key] = today;
      changed = true;
    }
  }

  if (now.getHours() === DIGEST_HOUR && now.getMinutes() <= 2 && !notified[`digest:${today}`]) {
    const todays = readTasks()
      .filter((t) => !t.done && t.time && notifiesToday(t, today, dow))
      .sort((a, b) => a.time.localeCompare(b.time));
    if (todays.length > 0) {
      const lines = todays.slice(0, 4).map((t) => `${t.time}  ${t.title}`);
      if (todays.length > 4) lines.push(`+${todays.length - 4} more`);
      fireToast("Today's plan", lines.join('\n'));
      notified[`digest:${today}`] = today;
      changed = true;
    }
  }

  if (changed) writeNotified(notified);
}

setInterval(checkNotifications, 30000);
checkNotifications();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  if (pathname === '/api/tasks' && req.method === 'GET') {
    return sendJSON(res, 200, readTasks());
  }

  if (pathname === '/api/tasks' && req.method === 'POST') {
    try {
      const body = await bodyFrom(req);
      if (!body.title || !body.date) {
        return sendJSON(res, 400, { error: 'title and date are required' });
      }
      const tasks = readTasks();
      const task = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        title: String(body.title).trim(),
        type: body.type || 'personal',
        date: body.date,
        deadline: body.deadline || undefined,
        time: body.time || '',
        notes: body.notes || '',
        done: !!body.done,
        help: !!body.help,
        repeat: body.repeat || 'none',
        weekdays: Array.isArray(body.weekdays) ? body.weekdays : undefined,
        completed: [],
        createdAt: new Date().toISOString(),
      };
      tasks.push(task);
      writeTasks(tasks);
      return sendJSON(res, 201, task);
    } catch (e) {
      return sendJSON(res, 400, { error: 'invalid JSON body' });
    }
  }

  const taskMatch = pathname.match(/^\/api\/tasks\/([^/]+)$/);
  if (taskMatch && req.method === 'PATCH') {
    const id = taskMatch[1];
    const body = await bodyFrom(req);
    const tasks = readTasks();
    const idx = tasks.findIndex((t) => t.id === id);
    if (idx === -1) return sendJSON(res, 404, { error: 'not found' });
    tasks[idx] = { ...tasks[idx], ...body };
    writeTasks(tasks);
    return sendJSON(res, 200, tasks[idx]);
  }

  if (taskMatch && req.method === 'DELETE') {
    const id = taskMatch[1];
    const tasks = readTasks().filter((t) => t.id !== id);
    writeTasks(tasks);
    return sendJSON(res, 200, { ok: true });
  }

  const filePath = path.join(PUBLIC, pathname === '/' ? 'index.html' : pathname);
  if (filePath.startsWith(PUBLIC) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    return fs.createReadStream(filePath).pipe(res);
  }

  sendJSON(res, 404, { error: 'not found' });
});

const PORT = Number(process.env.PORT) || 3141;
server.listen(PORT, () => {
  console.log(`LifePlanner running at http://localhost:${PORT}`);
});
