// Telegram You — boot: appearance, language, auth, tabs, live updates.
import { applyAppearance, getPrefs, onPrefsChange, resolvedTheme } from '../core/prefs.js';
import { postNative } from '../core/devtools.js';
import { applyDocumentLanguage, translateTree } from '../i18n.js';
import { S, t, on, avatar } from './store.js';
import { I } from './icons.js';
import { initList, loadFirst, render as renderList, bindOpen, onLiveRead, onLiveTyping, totalUnread } from './list.js';
import { openChat, closeChat, liveMessage, liveEdit, liveDelete, liveRead, liveTyping, liveStatus, liveReactions } from './conv.js';
import { startMods } from './mods.js';
import { initWallpaperEngine } from '../components/wallpaperTheme.js';
import { renderContacts, renderSettings, renderProfile, bindOpenPages } from './pages.js';
import * as settings from '../views/settings.js';
import * as profile from '../views/profile.js';
import { state } from '../state.js';
import { pushLayer, closeLayer, hasLayer } from './back.js';
import { notifyIncoming, updateBadge, initNotifyClicks, syncBackgroundService } from './notify.js';
import { api } from '../api.js';
import { showToast } from '../utils.js';

const fake = new URLSearchParams(location.search).has('fake');
const $ = (id) => document.getElementById(id);

async function pickService() {
  if (fake) return (await import('./fake.js')).fake;
  return (await import('../tg.js')).telegram;
}

// Bottom tab bar: original Telegram tab animations (lottie, outline → filled), built once and only updated.
const TABS = [['chats', 'Чаты'], ['contacts', 'Контакты'], ['settings', 'Настройки'], ['profile', 'Профиль']];
const anims = new Map();
let lottieP = null;
const loadLottie = () => lottieP || (lottieP = new Promise((res, rej) => {
  if (window.lottie) return res(window.lottie);
  const s = document.createElement('script');
  s.src = 'js/vendor/lottie_light.min.js';
  s.onload = () => res(window.lottie);
  s.onerror = rej;
  document.head.appendChild(s);
}));

function buildDock() {
  const label = { chats: t('Чаты'), contacts: t('Контакты'), settings: t('Настройки'), profile: t('Профиль') };
  $('cx-dock').innerHTML = TABS.map(([id]) => `<button class="cx-tab" data-tab="${id}"><span class="tabi" data-icon="${id}"></span><span>${label[id]}</span><span class="cx-badge tx-hidden"></span></button>`).join('');
  loadLottie().then((lottie) => {
    for (const id of ['chats', 'contacts', 'settings']) {
      fetch(`icons/tabs/tab_${id}.json`).then((r) => r.json()).then((data) => {
        const box = document.querySelector(`.tabi[data-icon="${id}"]`);
        if (!box) return;
        const anim = lottie.loadAnimation({ container: box, renderer: 'svg', loop: false, autoplay: false, animationData: data });
        anim.addEventListener('DOMLoaded', () => anim.goToAndStop(S.tab === id ? anim.totalFrames - 1 : 0, true));
        anims.set(id, anim);
      }).catch(() => {});
    }
  }).catch(() => {});
}

let lastTab = null;
function dock() {
  if (!$('cx-dock').firstElementChild) buildDock();
  const n = totalUnread();
  for (const btn of $('cx-dock').children) {
    const id = btn.dataset.tab;
    btn.classList.toggle('on', S.tab === id);
    if (id === 'profile') {
      const box = btn.querySelector('.tabi');
      const key = S.me ? `${S.me.id}|${S.me.avatar}` : '';
      if (box.dataset.key !== key) { box.dataset.key = key; box.innerHTML = S.me ? avatar({ id: S.me.id, title: S.me.name, avatar: S.me.avatar }) : ''; }
    }
    if (id === 'chats') { const b = btn.querySelector('.cx-badge'); b.textContent = n > 99 ? '99+' : String(n); b.classList.toggle('tx-hidden', !n); }
  }
  if (lastTab !== S.tab) {
    for (const [id, anim] of anims) {
      if (!anim.totalFrames) continue;
      anim.stop();
      if (id === S.tab && lastTab !== null) anim.playSegments([0, anim.totalFrames - 1], true);
      else anim.goToAndStop(id === S.tab ? anim.totalFrames - 1 : 0, true);
    }
    lastTab = S.tab;
  }
}

let settingsParams = {};
function showTab(tab) {
  // Back from any tab other than "Chats" returns to "Chats"; Back from there leaves the app.
  if (tab !== 'chats') pushLayer('tab', () => showTab('chats'));
  else closeLayer('tab');
  S.tab = tab;
  for (const id of ['chats', 'contacts', 'settings', 'profile']) $(`page-${id}`).classList.toggle('tx-hidden', id !== tab);
  if (tab === 'contacts') renderContacts();
  if (tab === 'settings') renderSettings(settingsParams);
  if (tab === 'profile') renderProfile({});
  dock();
}

function live() {
  S.tg.startChatLive({
    onMessage: (m, meta) => { liveMessage(m); notifyIncoming(m, S.dialogs.get(m.chatId)); },
    onEdit: liveEdit,
    onDelete: liveDelete,
    onRead: (k, kind, id) => { onLiveRead(k, kind, id); liveRead(k, kind, id); },
    onTyping: (k, name) => { onLiveTyping(k, name); liveTyping(k); },
    onStatus: liveStatus,
    onReactions: liveReactions,
  }).catch((e) => console.warn('[chat] live', e));
}

async function start() {
  $('cx-app').classList.remove('tx-hidden');
  S.me = S.tg.cachedMe ? S.tg.cachedMe() : null;
  state.isAuth = true; state.user = S.me;
  initList();
  bindOpen(openChat);
  bindOpenPages((id) => openChat(id));
  dock();
  await loadFirst();
  live();
  startMods();
  initNotifyClicks((id) => openChat(id));
  syncBackgroundService();
  const want = new URLSearchParams(location.search).get('chat');
  if (want) openChat(want);
  try { const me = await S.tg.getMe(); if (me) { S.me = me; state.user = me; dock(); renderList(true); } } catch {}
}

async function init() {
  applyDocumentLanguage();
  applyAppearance();
  postNative('theme:' + resolvedTheme()); // Android/Windows shells follow the theme (status bar icons)
  initWallpaperEngine();
  translateTree(document.body);
  try { matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => { if (getPrefs().theme === 'auto') { applyAppearance(); postNative('theme:' + resolvedTheme()); } }); } catch {}
  onPrefsChange((p) => { applyAppearance(p); postNative('theme:' + resolvedTheme(p)); });

  S.tg = await pickService();
  const authModal = (fn) => (...a) => import('../components/authModal.js').then((m) => m[fn](...a));
  window.TelegramX = {
    authBack: authModal('authBack'), authNext: authModal('authNext'), authPickCountry: authModal('authPickCountry'),
    authQr: authModal('authQr'), authResend: authModal('authResend'), openAuthModal: authModal('openAuthModal'),
    back: () => window.dispatchEvent(new Event('cx:back')),
    refreshFeed: () => Promise.resolve(),
    startLive: () => {},
    updateSettingsView: () => {},
    updateAuthUI: () => {
      if (!S.started) { S.started = true; start(); return; }
      state.user = S.me; settings.rerenderSettings(); profile.renderProfile();
    },
    setView: (view) => showTab(view),
    openSettingsPage: settings.openSettingsPage, rerenderSettings: settings.rerenderSettings, openSettingsMenu: settings.openSettingsMenu,
    setPref: settings.updatePref, setColorTheme: settings.setColorTheme, setThemeMode: settings.setThemeMode, toggleDayNight: settings.toggleDayNight,
    setAccent: settings.setAccent, setNameColor: settings.setNameColor, openChatSettingsMenu: settings.openChatSettingsMenu,
    setLanguage: settings.setLanguage, filterLanguages: settings.filterLanguages, toggleLanguageSearch: settings.toggleLanguageSearch,
    openWallpaperPicker: settings.openWallpaperPicker, terminateSession: settings.terminateSession, setWorkerMode: settings.setWorkerMode,
    askNotify: settings.askNotify, syncBg: settings.syncBg, refreshBadge: settings.refreshBadge,
    checkAppUpdate: settings.checkAppUpdate, toggleMod: settings.toggleMod, deleteMod: settings.deleteMod, installModFile: settings.installModFile,
    devPing: settings.devPing, devReconnect: settings.devReconnect, devExportLogs: settings.devExportLogs, devCopyDiagnostics: settings.devCopyDiagnostics,
    devClearLogs: settings.devClearLogs, devExportSession: settings.devExportSession, devToggleImport: settings.devToggleImport,
    devImportSession: settings.devImportSession, devHardReload: settings.devHardReload,
    openProfilePage: profile.openProfilePage, openProfileMenu: profile.openProfileMenu, copyText: profile.copyText,
    pickProfilePhoto: profile.pickProfilePhoto, uploadProfilePhoto: profile.uploadProfilePhoto, saveProfile: profile.saveProfile,
    clearMediaCache: async () => { await api.clearCache(); showToast(t('Кэш очищен')); settings.rerenderSettings(); },
    logoutTelegram: async () => {
      if (!confirm(t('Выйти из Telegram на этом устройстве?'))) return;
      await api.logout();
      location.reload();
    },
  };
  // navigation requests from the settings/profile views
  window.addEventListener('cx:go', (e) => {
    const { view, params } = e.detail;
    if (view === 'settings') {
      settingsParams = params || {};
      if (S.tab !== 'settings') showTab('settings'); else renderSettings(settingsParams);
      if (params && params.page) pushLayer('spage', () => { settingsParams = {}; renderSettings({}); });
    } else if (view === 'profile') {
      if (params && params.page) { renderProfile(params); pushLayer('ppage', () => renderProfile({})); } else showTab('profile');
    }
  });
  // arrow buttons inside the ported views = the system Back
  window.addEventListener('cx:back', () => {
    if (hasLayer('ppage') || hasLayer('spage')) history.back();
  });

  $('cx-dock').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) showTab(b.dataset.tab); });
  on('tab', showTab);
  on('unread', (n) => { dock(); updateBadge(n); });

  // The interface must not wait for the network: the media bridge starts in the background and,
  // when a session is saved on this device, the chat list is drawn at once from the local cache.
  if (!fake) {
    import('../media.js').then((m) => m.initMediaBridge('sw.js', './')).catch((e) => console.error('[chat] media bridge', e));
  }
  const saved = fake || (S.tg.hasSession && S.tg.hasSession());
  if (saved) {
    S.started = true;
    start();
    if (!fake) {
      // Verify the session in the background; a revoked session sends the user to the login screen.
      S.tg.isAuthorized().then(async (ok) => {
        if (!ok) { (await import('../components/authModal.js')).openAuthModal(); }
      }).catch((e) => console.error('[chat] auth check', e));
    }
  } else {
    (await import('../components/authModal.js')).openAuthModal();
  }
}

init().catch((e) => { console.error('[chat] init', e); document.body.insertAdjacentHTML('beforeend', `<pre style="position:fixed;inset:0;margin:0;padding:20px;background:#000;color:#f66;z-index:999;white-space:pre-wrap">${String(e && e.stack || e)}</pre>`); });
