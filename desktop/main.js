import { app, BrowserWindow } from 'electron';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const ROOT = join(import.meta.dirname, '..');
const SERVER_PORT = process.env.PORT || '5050';
const SERVER_URL = `http://127.0.0.1:${SERVER_PORT}`;

let serverProc;
let mainWindow;

function spawnProcess(cmd, args, extraEnv = {}) {
  const child = spawn(cmd, args, {
    cwd: ROOT,
    env: { ...process.env, ...extraEnv },
    stdio: 'inherit'
  });

  child.on('exit', (code, signal) => {
    console.log(`[desktop] ${cmd} exited code=${code} signal=${signal}`);
  });

  return child;
}

async function waitForServer(timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${SERVER_URL}/api/health`);
      if (res.ok) return;
    } catch {
      // retry
    }
    await delay(300);
  }
  throw new Error('Server did not become ready in time');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 980,
    minHeight: 700,
    title: 'Claude Pulse',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadURL(SERVER_URL);
}

function stopProcesses() {
  for (const proc of [serverProc]) {
    if (proc && !proc.killed) {
      proc.kill('SIGTERM');
    }
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopProcesses();
});

app.whenReady().then(async () => {
  serverProc = spawnProcess('cargo', ['run', '--release'], { PORT: SERVER_PORT });

  serverProc.on('error', (err) => {
    console.error(`[desktop] Failed to start cargo: ${err.message}`);
    console.error('[desktop] Rust toolchain is required. Install from https://rustup.rs');
    app.quit();
  });

  try {
    await waitForServer();
    createWindow();
  } catch (err) {
    console.error(`[desktop] ${err.message}`);
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});
