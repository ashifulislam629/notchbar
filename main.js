const { app, BrowserWindow, globalShortcut, screen, clipboard, ipcMain, Tray, Menu, nativeImage, shell } = require('electron');
const os = require('os');
const path = require('path');
const fs = require('fs');

if (!app.requestSingleInstanceLock()) app.quit();

const SMALL = { w: 190, h: 34 };
const BIG = { w: 760, h: 400 };
let win, tray, isOpen = false;
let history = [];
let last = '';
const histFile = () => path.join(app.getPath('userData'), 'clipboard.json');

function place(open) {
  const d = screen.getPrimaryDisplay().bounds;
  const s = open ? BIG : SMALL;
  win.setBounds({ x: Math.round(d.x + (d.width - s.w) / 2), y: d.y, width: s.w, height: s.h });
  isOpen = open;
  win.webContents.send('open-state', open);
  if (open) win.focus();
}

function createWindow() {
  win = new BrowserWindow({
    width: SMALL.w, height: SMALL.h, frame: false, transparent: true, resizable: false,
    alwaysOnTop: true, skipTaskbar: true, hasShadow: false, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js') }
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.loadFile('renderer/index.html');
  win.once('ready-to-show', () => { place(false); win.showInactive(); });
}

function sendClip() { win && win.webContents.send('clipboard', history); }

function pollClipboard() {
  setInterval(() => {
    const t = clipboard.readText();
    if (t && t !== last) {
      last = t;
      history = [{ t, time: Date.now() }, ...history.filter(h => h.t !== t)].slice(0, 100);
      try { fs.writeFileSync(histFile(), JSON.stringify(history)); } catch {}
      sendClip();
    }
  }, 700);
}

let prev = os.cpus();
function sendStats() {
  const now = os.cpus();
  let idle = 0, total = 0;
  now.forEach((c, i) => {
    const p = prev[i].times, n = c.times;
    idle += n.idle - p.idle;
    total += (n.user - p.user) + (n.nice - p.nice) + (n.sys - p.sys) + (n.irq - p.irq) + (n.idle - p.idle);
  });
  prev = now;
  const cpu = total ? Math.round(100 * (1 - idle / total)) : 0;
  const ram = Math.round(100 * (1 - os.freemem() / os.totalmem()));
  win && win.webContents.send('stats', { cpu, ram });
}

app.whenReady().then(() => {
  try { history = JSON.parse(fs.readFileSync(histFile(), 'utf8')); } catch {}
  last = clipboard.readText();
  createWindow();
  pollClipboard();
  setInterval(sendStats, 2000);

  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png')).resize({ width: 16, height: 16 }));
  tray.setToolTip('NotchBar (Ctrl+Shift+Space)');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open / close', click: () => place(!isOpen) },
    { label: 'Quit NotchBar', click: () => app.quit() }
  ]));

  globalShortcut.register('Control+Shift+Space', () => place(!isOpen));

  ipcMain.on('set-open', (_e, open) => place(!!open));
  ipcMain.handle('get-clipboard', () => history);
  ipcMain.on('copy', (_e, t) => {
    clipboard.writeText(t); last = t;
    history = [{ t, time: Date.now() }, ...history.filter(h => h.t !== t)];
    sendClip();
  });
  ipcMain.on('clear-clipboard', () => { history = []; try { fs.writeFileSync(histFile(), '[]'); } catch {} sendClip(); });
  ipcMain.on('open-path', (_e, p) => shell.openPath(p));
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => {});
