// One back-navigation stack for the whole app (Android back gesture, browser Back, Esc).
// Every "layer" that should close on Back (menu, dialog, viewer, emoji panel, selection mode, chat search,
// picker, profile, chat, settings sub-page, non-chat tab) registers here and gets one history entry.
// Back (popstate) closes the topmost layer; with no layers left the browser/app leaves as usual
// (the Android shell minimises the task).

const stack = [];     // [{ id, onBack }]
let ignore = 0;       // popstate events caused by our own history.back()
const queued = [];    // pushes asked for while an app-made Back was still pending

// A reload keeps history.state of the previous run; forget it.
try { history.replaceState(null, ''); } catch { /* ignore */ }

export function pushLayer(id, onBack) {
  if (stack.some((l) => l.id === id) || queued.some((q) => q.id === id)) return;
  if (ignore > 0) { queued.push({ id, onBack }); return; } // history.go() is asynchronous: wait for it
  stack.push({ id, onBack });
  history.pushState({ cxLayer: id }, '');
}

/** The layer was closed by the app itself (not by Back): drop its history entry. */
export function closeLayer(id) {
  const i = stack.findIndex((l) => l.id === id);
  if (i < 0) return;
  const removed = stack.splice(i);          // it and everything above it
  ignore += removed.length;
  history.go(-removed.length);
}

export const hasLayer = (id) => stack.some((l) => l.id === id);
export const topLayer = () => (stack.length ? stack[stack.length - 1].id : null);

/** Programmatic "Back" (arrow buttons): the same as the system gesture. */
export function goBack() {
  if (stack.length) history.back();
}

window.addEventListener('popstate', () => {
  if (ignore > 0) {
    ignore -= 1;
    if (ignore === 0) while (queued.length) { const q = queued.shift(); stack.push(q); history.pushState({ cxLayer: q.id }, ''); }
    return;
  }
  const top = stack.pop();
  if (top) { try { top.onBack(); } catch (e) { console.warn('[back]', e); } }
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && stack.length) { e.preventDefault(); history.back(); }
});
