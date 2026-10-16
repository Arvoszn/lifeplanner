// Starts the server only if nothing is already answering on the same port.
const http = require('http');
const { spawn } = require('child_process');

const PORT = Number(process.env.PORT) || 3141;

const req = http.get({ host: 'localhost', port: PORT, timeout: 1500 }, () => process.exit(0));
req.on('timeout', () => req.destroy());
req.on('error', () => {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: __dirname,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: { ...process.env, PORT: String(PORT) },
  });
  child.unref();
  process.exit(0);
});
