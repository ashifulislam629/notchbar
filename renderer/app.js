const $ = s => document.querySelector(s);
const pad = n => String(n).padStart(2, '0');
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };

const TABS = [['home','Home'],['clipboard','Clipboard'],['timer','Timer'],['files','Files'],['notes','Notes'],['clocks','Clocks']];
let tab = 'home', pinned = false, clip = [], files = load('files', []), closeT = null;
let timer = { total: 1500, left: 1500, end: null }, sw = { base: 0, t0: null };
const ZONES = [['Dhaka','Asia/Dhaka'],['London','Europe/London'],['New York','America/New_York'],['Tokyo','Asia/Tokyo'],['Dubai','Asia/Dubai'],['Sydney','Australia/Sydney']];

/* ---------- open / close ---------- */
const root = document.documentElement;
root.addEventListener('mouseenter', () => { clearTimeout(closeT); api.setOpen(true); });
root.addEventListener('dragenter', () => api.setOpen(true));
root.addEventListener('mouseleave', () => { if (!pinned) closeT = setTimeout(() => api.setOpen(false), 700); });
api.onOpenState(o => document.body.classList.toggle('open', o));
$('#close').onclick = () => { pinned = false; $('#pin').classList.remove('on'); api.setOpen(false); };
$('#pin').onclick = e => { pinned = !pinned; e.target.classList.toggle('on', pinned); };

/* ---------- dock ---------- */
TABS.forEach(([id, label]) => {
  const b = document.createElement('button'); b.textContent = label; b.dataset.tab = id;
  b.onclick = () => show(id); $('#dock').appendChild(b);
});
function show(id) {
  tab = id;
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('show', v.id === 'v-' + id));
  document.querySelectorAll('#dock button').forEach(b => b.classList.toggle('on', b.dataset.tab === id));
}
show('home');

/* ---------- system stats ---------- */
api.onStats(({ cpu, ram }) => {
  $('#bCpu').style.width = cpu + '%'; $('#tCpu').textContent = cpu + '%';
  $('#bRam').style.width = ram + '%'; $('#tRam').textContent = ram + '%';
});

/* ---------- clipboard ---------- */
function ago(t) { const s = (Date.now() - t) / 1000; return s < 60 ? 'now' : s < 3600 ? Math.floor(s / 60) + 'm' : s < 86400 ? Math.floor(s / 3600) + 'h' : Math.floor(s / 86400) + 'd'; }
function renderClip() {
  const q = $('#search').value.toLowerCase();
  const list = $('#clipList'); list.replaceChildren();
  clip.filter(c => c.t.toLowerCase().includes(q)).slice(0, 60).forEach(c => {
    const d = document.createElement('div'); d.className = 'item'; d.title = 'Click to copy again';
    const s = document.createElement('span'); s.textContent = c.t.replace(/\s+/g, ' ');
    const a = document.createElement('small'); a.textContent = ago(c.time);
    d.append(s, a); d.onclick = () => api.copy(c.t); list.appendChild(d);
  });
  if (!list.children.length) { const e = document.createElement('div'); e.className = 'mini'; e.textContent = 'Nothing here yet. Copy some text and it shows up.'; list.appendChild(e); }
  const h = $('#hClip'); h.replaceChildren();
  clip.slice(0, 3).forEach(c => { const d = document.createElement('div'); d.textContent = c.t.replace(/\s+/g, ' '); h.appendChild(d); });
}
api.onClipboard(c => { clip = c; renderClip(); });
api.getClipboard().then(c => { clip = c; renderClip(); });
$('#search').oninput = renderClip;
$('#clearClip').onclick = () => api.clearClipboard();

/* ---------- timer + stopwatch ---------- */
const fmt = s => pad(Math.floor(s / 60)) + ':' + pad(s % 60);
function beep() {
  try { const c = new AudioContext(), o = c.createOscillator(); o.connect(c.destination); o.frequency.value = 880; o.start(); o.stop(c.currentTime + 0.4); } catch {}
  try { new Notification('NotchBar', { body: 'Timer finished' }); } catch {}
}
function toggleTimer() {
  if (timer.end) { timer.left = Math.ceil((timer.end - Date.now()) / 1000); timer.end = null; }
  else { if (timer.left <= 0) timer.left = timer.total; timer.end = Date.now() + timer.left * 1000; }
}
$('#tStart').onclick = toggleTimer; $('#hToggle').onclick = toggleTimer;
$('#tReset').onclick = () => { timer.end = null; timer.left = timer.total; };
document.querySelectorAll('.pre').forEach(b => b.onclick = () => { timer.total = timer.left = +b.dataset.m * 60; timer.end = null; });
$('#swStart').onclick = () => { if (sw.t0) { sw.base += Date.now() - sw.t0; sw.t0 = null; } else sw.t0 = Date.now(); };
$('#swReset').onclick = () => { sw.base = 0; sw.t0 = sw.t0 ? Date.now() : null; };

/* ---------- files ---------- */
function renderFiles() {
  const l = $('#fileList'); l.replaceChildren();
  files.forEach((p, i) => {
    const d = document.createElement('div'); d.className = 'item'; d.title = 'Click to open';
    const s = document.createElement('span'); s.textContent = p.split(/[\\/]/).pop();
    const x = document.createElement('button'); x.textContent = '✕';
    x.onclick = e => { e.stopPropagation(); files.splice(i, 1); save('files', files); renderFiles(); };
    d.append(s, x); d.onclick = () => api.openPath(p); l.appendChild(d);
  });
  $('#hFiles').textContent = files.length;
}
['dragover', 'drop'].forEach(ev => window.addEventListener(ev, e => e.preventDefault()));
const drop = $('#drop');
window.addEventListener('dragenter', () => { show('files'); drop.classList.add('hot'); });
window.addEventListener('dragleave', e => { if (!e.relatedTarget) drop.classList.remove('hot'); });
window.addEventListener('drop', e => {
  drop.classList.remove('hot');
  [...e.dataTransfer.files].forEach(f => { const p = api.pathForFile(f); if (p && !files.includes(p)) files.push(p); });
  save('files', files); renderFiles();
});
renderFiles();

/* ---------- notes ---------- */
const na = $('#noteArea'); na.value = load('note', '');
const noteHome = () => { $('#hNote').textContent = na.value.trim().split('\n')[0] || 'No notes yet'; };
na.oninput = () => { save('note', na.value); noteHome(); }; noteHome();

/* ---------- clocks ---------- */
const clockCards = ZONES.map(([name, tz]) => {
  const c = document.createElement('div'); c.className = 'card';
  c.innerHTML = '<small></small><big></big><em></em>'; c.querySelector('small').textContent = name;
  $('#clockList').appendChild(c); return [tz, c];
});

/* ---------- tick ---------- */
function tick() {
  const n = new Date();
  const t = pad(n.getHours()) + ':' + pad(n.getMinutes());
  $('#pTime').textContent = t; $('#hTime').textContent = t;
  $('#hDate').textContent = n.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });
  $('#hDay').textContent = n.toLocaleDateString(undefined, { year: 'numeric', month: 'long' });
  if (timer.end) {
    timer.left = Math.max(0, Math.ceil((timer.end - Date.now()) / 1000));
    if (timer.left === 0) { timer.end = null; beep(); }
  }
  $('#tDisp').textContent = $('#hFocus').textContent = fmt(timer.left);
  $('#tStart').textContent = $('#hToggle').textContent = timer.end ? 'Pause' : 'Start';
  const ms = sw.base + (sw.t0 ? Date.now() - sw.t0 : 0);
  $('#swDisp').textContent = pad(Math.floor(ms / 60000)) + ':' + pad(Math.floor(ms / 1000) % 60) + '.' + Math.floor(ms / 100) % 10;
  $('#swStart').textContent = sw.t0 ? 'Pause' : 'Start';
  clockCards.forEach(([tz, c]) => {
    c.querySelector('big').textContent = n.toLocaleTimeString([], { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });
    c.querySelector('em').textContent = n.toLocaleDateString([], { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' });
  });
}
setInterval(tick, 200); tick();
