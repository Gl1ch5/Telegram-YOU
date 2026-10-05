// Notifications: web (Notification API / Service Worker), Windows (same API inside Electron) and Android
// (native notifications through the TeleXNative bridge). Respects Telegram's mute state of each chat.
import { S, t } from './store.js';
import { getPrefs } from '../core/prefs.js';
import { postNative } from '../core/devtools.js';
import { mediaLabel } from './list.js';

const isAndroid = /TelegramYouAndroid/.test(navigator.userAgent);
let audio = null;

export const notifySupported = () => isAndroid || 'Notification' in window;

export function notifyPermission() {
  if (isAndroid) return localStorage.getItem('telex.cx.notifyAsked') ? 'granted' : 'default';
  return 'Notification' in window ? Notification.permission : 'denied';
}

/** Ask once (must be called from a user gesture on the web). */
export async function askNotifyPermission() {
  if (isAndroid) { postNative('notifyPermission'); try { localStorage.setItem('telex.cx.notifyAsked', '1'); } catch {} return 'granted'; }
  if (!('Notification' in window)) return 'denied';
  try { return await Notification.requestPermission(); } catch { return Notification.permission; }
}

/** Short "pop" like Telegram's in-app sound, generated (no audio file to load). */
function pop() {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const o = audio.createOscillator(); const g = audio.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(880, audio.currentTime); o.frequency.exponentialRampToValueAtTime(520, audio.currentTime + 0.12);
    g.gain.setValueAtTime(0.0001, audio.currentTime); g.gain.exponentialRampToValueAtTime(0.18, audio.currentTime + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.16);
    o.connect(g); g.connect(audio.destination); o.start(); o.stop(audio.currentTime + 0.18);
  } catch { /* no audio: fine */ }
}

function allowed(dlg) {
  const p = getPrefs();
  if (dlg.muted) return false;
  if (dlg.kind === 'user') return p.notifyPrivate;
  if (dlg.kind === 'group') return p.notifyGroups;
  return p.notifyChannels;
}

async function avatarData(url) {
  try {
    const blob = await (await fetch(url)).blob();
    if (blob.size > 60000) return null;
    return await new Promise((res) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.readAsDataURL(blob); });
  } catch { return null; }
}

/** An incoming message arrived: show a notification when the user is not looking at that chat. */
export async function notifyIncoming(m, dlg) {
  const p = getPrefs();
  if (m.out || !dlg || !allowed(dlg)) return;
  const looking = document.visibilityState === 'visible' && S.openId === m.chatId;
  if (looking) { if (p.notifySound) pop(); return; }
  const title = dlg.self ? t('Избранное') : dlg.title;
  const text = p.notifyPreview
    ? (dlg.kind !== 'user' && m.senderName ? `${m.senderName}: ` : '') + (m.service ? m.service.text : (m.text || mediaLabel(m) || t('Сообщение')))
    : t('Новое сообщение');
  if (isAndroid) {
    postNative(JSON.stringify({ t: 'notify', id: m.chatId, title, text, sound: p.notifySound, avatar: dlg.avatar ? await avatarData(dlg.avatar) : null }));
    return;
  }
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const opts = { body: text, tag: m.chatId, renotify: true, silent: !p.notifySound, icon: dlg.avatar || 'icons/app.svg', badge: 'icons/app.svg', data: { chat: m.chatId } };
  try {
    const reg = navigator.serviceWorker && (await navigator.serviceWorker.getRegistration());
    if (reg && reg.active) await reg.showNotification(title, opts);
    else { const n = new Notification(title, opts); n.onclick = () => { window.focus(); window.__openChat && window.__openChat(m.chatId); n.close(); }; }
  } catch { /* the browser refused: nothing to do */ }
}

/** Unread counter on the tab title and the app icon. */
export function updateBadge(count) {
  const p = getPrefs();
  const n = p.notifyBadge ? count : 0;
  document.title = n ? `(${n > 99 ? '99+' : n}) Telegram You` : 'Telegram You';
  try { if (navigator.setAppBadge) (n ? navigator.setAppBadge(n) : navigator.clearAppBadge()).catch(() => {}); } catch { /* unsupported */ }
}

/** Tapping a notification (web: via the Service Worker, Android: via the native bridge) opens its chat. */
export function initNotifyClicks(open) {
  window.__openChat = (id) => { try { window.focus(); postNative('show'); } catch {} open(id); };
  if (navigator.serviceWorker) navigator.serviceWorker.addEventListener('message', (e) => { if (e.data && e.data.type === 'open-chat') window.__openChat(e.data.chat); });
}

/** Android: tell the shell whether to keep the connection alive in the background. */
export function syncBackgroundService() {
  if (isAndroid) postNative('bg:' + (getPrefs().bgService ? 'on' : 'off'));
}
