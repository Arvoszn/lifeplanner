// Seeds a demo week so a fresh install has something to look at.
//
//   node server.js      (in one terminal)
//   node seed-demo.js   (in another)
//
//   PORT=3142 node seed-demo.js   # seed a different instance
//
// Anchoring: weekly tasks are placed on the next occurrence of their weekday,
// so the demo always looks "current" no matter which day you run it.

const http = require('http');

const PORT = Number(process.env.PORT) || 3141;
const API = `http://localhost:${PORT}/api/tasks`;

function post(task) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(task);
    const req = http.request(
      API,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          if (res.statusCode >= 400) return reject(new Error(`${res.statusCode}: ${body}`));
          resolve(JSON.parse(body));
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function ymd(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// next date (today or later) that falls on the given weekday
function anchor(day) {
  const d = new Date();
  const diff = (day - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + diff);
  return ymd(d);
}

function inDays(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return ymd(d);
}

const MW = [1, 3];
const TTH = [2, 4];

const tasks = [
  // routines
  { title: 'Morning routine', type: 'personal', time: '06:30', repeat: 'daily', notes: 'Wake up, stretch, breakfast' },
  { title: 'Language practice', type: 'personal', time: '21:00', repeat: 'daily' },
  { title: 'Gym', type: 'personal', time: '18:00', repeat: 'eod', notes: 'Every other day' },

  // work
  { title: 'Deep work block', type: 'work', time: '09:00', weekdays: [1, 2, 3, 4], notes: 'One objective, notifications off' },
  { title: 'Client call — design review', type: 'work', time: '14:00', weekdays: TTH },
  { title: 'Invoice + expenses', type: 'work', time: '16:00', weekdays: [5], notes: 'Friday wrap-up' },
  { title: 'File quarterly taxes', type: 'work', date: inDays(0), deadline: inDays(12), time: '10:00', notes: 'Reminds daily until the deadline' },

  // study
  { title: 'Data structures — lecture', type: 'class', time: '09:00', weekdays: MW },
  { title: 'Networking — lab', type: 'class', time: '10:30', weekdays: TTH },
  { title: 'Assignment: sorting exercise', type: 'homework', time: '19:30', weekdays: MW, notes: 'Due at the end of the week' },

  // personal
  { title: 'Grocery run', type: 'personal', time: '10:00', weekdays: [6] },
  { title: 'Weekly review + planning', type: 'personal', time: '17:00', weekdays: [0], notes: 'Deadlines, commitments, one priority' },
  { title: 'Dentist appointment', type: 'appointment', date: inDays(3), deadline: inDays(3), time: '11:00', notes: 'Bring the insurance card' },
  { title: 'Dinner with friends', type: 'spontaneous', date: inDays(2), time: '19:00' },
];

(async () => {
  for (const t of tasks) {
    const repeat = t.repeat || (t.weekdays ? 'weekly' : 'none');
    const payload = {
      title: t.title,
      type: t.type,
      // weekly tasks land on their next weekday; daily/every-other-day start today
      date: t.date || (t.weekdays ? anchor(t.weekdays[0]) : ymd(new Date())),
      deadline: t.deadline,
      time: t.time,
      notes: t.notes || '',
      help: false,
      repeat,
      weekdays: repeat === 'weekly' ? t.weekdays : undefined,
    };
    await post(payload);
    console.log('added:', t.title);
  }
  console.log(`\ndemo week seeded into http://localhost:${PORT}`);
})().catch((e) => {
  console.error('FAILED:', e.message);
  console.error('Is the server running?  node server.js');
  process.exit(1);
});
