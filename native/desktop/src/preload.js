'use strict';
// Bridge for the bundled page: the web app reports its theme so the window follows it.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('TeleXNative', {
  postMessage: (msg) => {
    if (typeof msg === 'string' && msg.startsWith('theme:')) ipcRenderer.send('telex:theme', msg.slice(6));
    if (msg === 'show') ipcRenderer.send('telex:show');
  },
});
