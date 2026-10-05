'use strict';
// Telegram You desktop shell: the whole web app lives inside the package (web/) and is served
// over a privileged "tgyou://app/" scheme (secure origin: Service Worker, IndexedDB, localStorage
// all work), so the interface opens instantly and offline.
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { app, BrowserWindow, session, shell, nativeTheme, Menu, net, protocol, ipcMain, Tray } = require('electron');

const APP_URL = 'tgyou://app/index.html';
const APP_SCOPE = 'tgyou://app/';
const WEB_ROOT = path.join(__dirname, '..', 'web');
const PARTITION = 'persist:telegramyou'; // localStorage, session, Service Worker, cache survive restarts
const BG = '#000000';

protocol.registerSchemesAsPrivileged([
  { scheme: 'tgyou', privileges: { standard: true, secure: true, supportFetchAPI: true, allowServiceWorkers: true, stream: true, corsEnabled: true } },
]);

app.commandLine.appendSwitch('js-flags', '--max-old-space-size=4096');
app.commandLine.appendSwitch('disk-cache-size', String(1024 * 1024 * 1024));
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

app.setAppUserModelId('io.github.gl1ch5.telegramyou');

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let win = null;
  let tray = null;
  let quitting = false;

  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });

  // ---- Window state ---------------------------------------------------------
  const stateFile = () => path.join(app.getPath('userData'), 'window-state.json');
  function loadState() {
    try {
      const s = JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
      if (s && Number.isFinite(s.width) && Number.isFinite(s.height)) return s;
    } catch (_) { /* first run */ }
    return { width: 1100, height: 780 };
  }
  function visibleOnSomeDisplay(s) {
    if (!Number.isFinite(s.x) || !Number.isFinite(s.y)) return false;
    const { screen } = require('electron');
    return screen.getAllDisplays().some(({ workArea: a }) =>
      s.x + 50 < a.x + a.width && s.x + s.width - 50 > a.x && s.y >= a.y - 10 && s.y + 40 < a.y + a.height);
  }
  let saveTimer = null;
  function saveState() {
    if (!win || win.isDestroyed()) return;
    const maximized = win.isMaximized();
    const b = maximized || win.isMinimized() ? win.getNormalBounds() : win.getBounds();
    try {
      fs.mkdirSync(app.getPath('userData'), { recursive: true });
      fs.writeFileSync(stateFile(), JSON.stringify({ ...b, maximized }));
    } catch (_) { /* not critical */ }
  }
  const saveSoon = () => { clearTimeout(saveTimer); saveTimer = setTimeout(saveState, 400); };

  // ---- Local files over tgyou:// ---------------------------------------------
  function serveLocal(req) {
    const u = new URL(req.url);
    let rel = decodeURIComponent(u.pathname);
    if (rel === '/' || rel === '') rel = '/index.html';
    const file = path.normalize(path.join(WEB_ROOT, rel));
    if (!file.startsWith(WEB_ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      return new Response('Not found', { status: 404 });
    }
    return net.fetch(pathToFileURL(file).toString());
  }

  // ---- Navigation policy -------------------------------------------------------
  const inScope = (url) => typeof url === 'string' && url.startsWith(APP_SCOPE);
  function openExternal(url) {
    try {
      const u = new URL(url);
      if (['http:', 'https:', 'tg:', 'mailto:', 'tel:'].includes(u.protocol)) shell.openExternal(url);
    } catch (_) { /* ignore malformed */ }
  }

  function configureSession(ses) {
    ses.protocol.handle('tgyou', serveLocal);
    ses.setPermissionRequestHandler((_wc, permission, cb, details) => {
      const allowed = ['notifications', 'clipboard-sanitized-write', 'clipboard-read', 'media', 'fullscreen', 'persistent-storage'];
      cb(inScope(details.requestingUrl || '') && allowed.includes(permission));
    });
    ses.on('will-download', (_e, item) => {
      const dir = app.getPath('downloads');
      const name = item.getFilename() || 'download';
      const ext = path.extname(name);
      const base = path.basename(name, ext);
      let target = path.join(dir, name);
      for (let i = 1; fs.existsSync(target); i++) target = path.join(dir, `${base} (${i})${ext}`);
      item.setSavePath(target);
      item.once('done', (_ev, state) => {
        if (state === 'completed' && win && !win.isDestroyed() && process.platform === 'win32') win.flashFrame(true);
      });
    });
  }

  function createWindow() {
    const state = loadState();
    const opts = {
      width: Math.max(380, state.width),
      height: Math.max(600, state.height),
      minWidth: 380,
      minHeight: 600,
      title: 'Telegram You',
      backgroundColor: BG,
      show: false,
      autoHideMenuBar: true,
      icon: path.join(__dirname, '..', 'build', 'icon.png'),
      webPreferences: {
        partition: PARTITION,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: false,
        backgroundThrottling: false,
        preload: path.join(__dirname, 'preload.js'),
      },
    };
    if (visibleOnSomeDisplay(state)) { opts.x = state.x; opts.y = state.y; }
    win = new BrowserWindow(opts);
    win.setMenuBarVisibility(false);
    if (state.maximized) win.maximize();

    win.once('ready-to-show', () => win.show());
    setTimeout(() => { if (win && !win.isDestroyed() && !win.isVisible()) win.show(); }, 5000);

    win.on('resize', saveSoon);
    win.on('move', saveSoon);
    // Closing the window hides it to the tray, so notifications about new messages keep coming.
    win.on('close', (e) => {
      saveState();
      if (!quitting) { e.preventDefault(); win.hide(); }
    });
    win.on('closed', () => { win = null; });
    win.on('page-title-updated', (e) => e.preventDefault());

    const wc = win.webContents;
    wc.setWindowOpenHandler(({ url }) => {
      if (inScope(url)) { wc.loadURL(url).catch(() => {}); } else { openExternal(url); }
      return { action: 'deny' };
    });
    wc.on('will-navigate', (e, url) => {
      if (inScope(url)) return;
      e.preventDefault();
      openExternal(url);
    });
    wc.on('before-input-event', (e, input) => {
      if (input.type !== 'keyDown') return;
      const key = (input.key || '').toLowerCase();
      const ctrl = input.control || input.meta;
      if ((ctrl && input.shift && key === 'i') || key === 'f12') { wc.toggleDevTools(); e.preventDefault(); }
      else if ((ctrl && key === 'r') || key === 'f5') { e.preventDefault(); input.shift ? wc.reloadIgnoringCache() : wc.reload(); }
    });

    wc.loadURL(APP_URL).catch(() => {});
    return win;
  }

  ipcMain.on('telex:theme', (e, mode) => {
    if (win && e.sender === win.webContents) nativeTheme.themeSource = mode === 'light' ? 'light' : 'dark';
  });
  // A notification click (Service Worker) asks to bring the window to the front.
  ipcMain.on('telex:show', (e) => { if (win && e.sender === win.webContents) { win.show(); win.focus(); } });

  app.on('web-contents-created', (_e, contents) => {
    contents.on('will-attach-webview', (ev) => ev.preventDefault());
  });

  function createTray() {
    tray = new Tray(path.join(__dirname, '..', 'build', 'icon.png'));
    tray.setToolTip('Telegram You');
    const show = () => { if (!win) createWindow(); else { win.show(); win.focus(); } };
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Открыть Telegram You', click: show },
      { type: 'separator' },
      { label: 'Выход', click: () => { quitting = true; app.quit(); } },
    ]));
    tray.on('click', show);
  }

  app.on('before-quit', () => { quitting = true; });

  app.whenReady().then(() => {
    nativeTheme.themeSource = 'dark';
    Menu.setApplicationMenu(null);
    configureSession(session.fromPartition(PARTITION));
    createWindow();
    createTray();
    app.on('activate', () => { if (!win) createWindow(); });
  });

  app.on('window-all-closed', () => { if (quitting) app.quit(); });
}

module.exports = { APP_URL, APP_SCOPE, PARTITION };
