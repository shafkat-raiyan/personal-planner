// =========================
//  app.js  (module)
// =========================

// We only need signOut here. Firestore DB instance comes from window.__db (set in index.html)
import { signOut } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc, doc, getDoc
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

/* =========================
   Constants & Cache helpers
========================= */
const K = {
  name: 'sd_name',
  subtitle: 'sd_subtitle',
  notes: 'sd_notes',
  photo: 'sd_photo_b64',
  notesHeight: 'sd_notes_height'
};

const RK = 'sd_routine_v1';
const EK = 'sd_events_v1'; // events cache

const WEEK_ORDER = ["Saturday","Sunday","Monday","Tuesday","Wednesday","Thursday","Friday"];
const $ = (sel) => document.querySelector(sel);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,7);

const cacheGet     = (k, d=null) => localStorage.getItem(k) ?? d;
const cacheSet     = (k, v)      => localStorage.setItem(k, v);
const cacheGetJSON = (k, d=[])   => { try{ return JSON.parse(localStorage.getItem(k)||''); }catch{ return d; } };
const cacheSetJSON = (k, v)      => localStorage.setItem(k, JSON.stringify(v));


/* Apply cached notes height instantly (before DOM ready) */
{
  const cachedHeight = localStorage.getItem(K.notesHeight);
  if (cachedHeight) {
    const el = document.getElementById('notes');
    if (el) el.style.height = cachedHeight + 'px';
  }
}

/* Firebase helpers */
async function waitForFirebase(){
  if (!window.firebaseReadyPromise) return;
  await window.firebaseReadyPromise;
}
async function waitForFirebaseGlobals() {
  while (!window.__signIn || !window.__auth || !window.__db || !window.saveData || !window.loadData) {
    await new Promise(r => setTimeout(r, 50));
  }
}
const isLoggedIn = () => !!(window.__auth?.currentUser);

/* =========================
   Auth overlay → Firebase sign-in
========================= */
(async function initAuthOverlay(){
  await waitForFirebaseGlobals();

  const overlay   = document.getElementById('authOverlay');
  const form      = document.getElementById('authForm');
  const passInput = document.getElementById('authPassword');

  if (!overlay || !form || !passInput) return;

  // helper to show/hide overlay cleanly
  function showOverlay() {
    document.body.classList.add('auth-locked');
    overlay.style.display = 'flex';
    overlay.removeAttribute('hidden');
  }
  function hideOverlay() {
    document.body.classList.remove('auth-locked');
    overlay.style.display = 'none';
    overlay.setAttribute('hidden', '');
  }

  // Close any open dialogs when logged out
  window.__auth.onAuthStateChanged((user) => {
    if (user) {
      hideOverlay();
      initApp();                 // safe: runs only after login
    } else {
      try { settingsDialog?.close?.(); } catch {}
      showOverlay();
    }
  });

  // Submit → sign in using fixed email (in index.html) + typed password
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pwd = passInput.value.trim();
    if (!pwd) return;
    try {
      await window.__signIn(pwd);
      // persistence already handled (browserLocalPersistence)
    } catch (err) {
      passInput.value = '';
      passInput.placeholder = 'Wrong password. Try again.';
      console.error('Sign-in failed:', err);
    }
  });
})();

/* Logout button: real Firebase signOut (clears persistent session) */
document.getElementById('logoutBtn')?.addEventListener('click', () => {
  if (window.__auth) signOut(window.__auth);
});


/* =========================
   Smoothly scroll a field into view
   inside itsnearest scrollable card
========================= */
function scrollFieldIntoCard(el) {
  if (!el) return;

  let container = el.closest('.card');
  const isScrollable = (node) => {
    if (!node) return false;
    const cs = getComputedStyle(node);
    return /(auto|scroll|overlay)/.test(cs.overflowY) && node.scrollHeight > node.clientHeight;
  };
  if (!isScrollable(container)) container = null;

  if (container) {
    const cardRect = container.getBoundingClientRect();
    const elRect   = el.getBoundingClientRect();
    // offset so element ends up ~middle of the card
    const offset = (cardRect.height / 2) - (elRect.height / 2);
    const top = (container.scrollTop || 0) + (elRect.top - cardRect.top) - offset;
    container.scrollTo({ top, behavior: 'smooth' });
    setTimeout(() => el.focus?.({ preventScroll: true }), 180);
  } else {
    // Mobile → scroll window
    const elRect = el.getBoundingClientRect();
    const pageTop = (window.pageYOffset || document.documentElement.scrollTop || 0)
                  + elRect.top - (window.innerHeight / 2) + (elRect.height / 2);
    window.scrollTo({ top: pageTop, behavior: 'smooth' });
    setTimeout(() => el.focus?.({ preventScroll: true }), 180);
  }
}

function scrollFieldInDialog(dlg, el) {
  if (!dlg || !el) return;
  // aim to center the field vertically in the dialog
  const offset = (dlg.clientHeight / 2) - (el.offsetHeight / 2);
  const top = Math.max(0, el.offsetTop - offset);
  dlg.scrollTo({ top, behavior: 'smooth' });
  setTimeout(() => el.focus?.({ preventScroll: true }), 180);
}




/* =========================
   Header (Name & Subtitle)
========================= */
const nameDisplay   = $('#nameDisplay');
const subtitleDisplay = $('#subtitleDisplay');
const nameInput     = $('#nameInput');
const subtitleInput = $('#subtitleInput');

function loadHeaderFromCache(){
  if (!isLoggedIn()) return;
  const name = cacheGet(K.name, 'Name Here');
  const sub  = cacheGet(K.subtitle, 'To be doctor...');
  if (nameDisplay) nameDisplay.textContent = name;
  if (subtitleDisplay) subtitleDisplay.textContent = sub;
  if (nameInput) nameInput.value = name;
  if (subtitleInput) subtitleInput.value = sub;
}

async function syncHeaderFromCloud(){
  await waitForFirebase();
  const cloudName = await window.loadData(K.name);
  const cloudSub  = await window.loadData(K.subtitle);
  if (cloudName !== null) { cacheSet(K.name, cloudName); if (nameDisplay) nameDisplay.textContent = cloudName; if (nameInput) nameInput.value = cloudName; }
  if (cloudSub  !== null) { cacheSet(K.subtitle, cloudSub); if (subtitleDisplay) subtitleDisplay.textContent = cloudSub; if (subtitleInput) subtitleInput.value = cloudSub; }
}

async function saveHeader(){
  const n = (nameInput?.value || 'Name Here').trim();
  const s = (subtitleInput?.value || '').trim();
  cacheSet(K.name, n);
  cacheSet(K.subtitle, s);
  await waitForFirebase();
  await window.saveData(K.name, n);
  await window.saveData(K.subtitle, s);
  loadHeaderFromCache();
}

/* =========================
   Settings Modal
========================= */
const settingsDialog  = document.getElementById('settings');
const openSettingsBtn = document.getElementById('openSettings');
const saveSettingsBtn = document.getElementById('saveSettings');

openSettingsBtn?.addEventListener('click', (e) => {
  e.preventDefault();
  if (!settingsDialog) return;
  if (typeof settingsDialog.showModal === 'function') {
    settingsDialog.showModal();
  } else {
    settingsDialog.setAttribute('open', '');
  }
});

saveSettingsBtn?.addEventListener('click', async (e) => {
  e.preventDefault();
  await saveHeader();
  if (typeof settingsDialog.close === 'function') settingsDialog.close();
  else settingsDialog.removeAttribute('open');
});

/* =========================
   Background Photo
========================= */
const photoArea   = $('#photoArea');
const photoInput  = $('#photoInput');
const removePhoto = $('#removePhoto');

const PHOTO_DIM_KEY = 'sd_photo_dim'; // persist dim preference ('1' on, '0' off)

function setPhotoFromB64(b64){
  if (photoArea) photoArea.style.backgroundImage = b64 ? `url(${b64})` : 'none';
  // re-apply dim each time we set the image
  applyPhotoDim(cacheGet(PHOTO_DIM_KEY, '1') === '1');
}

function applyPhotoDim(dimOn) {
  if (!photoArea) return;
  // If dimOn => keep the haze (0.28), else full opacity
  photoArea.style.opacity = dimOn ? '0.5' : '1';
}

async function syncPhotoDimFromCloud(){
  await waitForFirebase();
  const v = await window.loadData(PHOTO_DIM_KEY);
  // default to '1' (dim on) if nothing saved yet
  const val = (v === null ? '1' : String(v));
  cacheSet(PHOTO_DIM_KEY, val);
  applyPhotoDim(val === '1');
}

function loadPhotoFromCache(){
  if (!isLoggedIn()) return;
  setPhotoFromB64(cacheGet(K.photo, null));
}
async function syncPhotoFromCloud(){
  await waitForFirebase();
  const b64 = await window.loadData(K.photo);
  if (b64 !== null){ cacheSet(K.photo, b64); setPhotoFromB64(b64); }
}

// optional: compress helper if you ever save raw files (we use canvas export below)
function compressImage(file, maxW=1600, maxH=1600, quality=0.85){
  return new Promise((resolve, reject)=>{
    const img = new Image();
    const r = new FileReader();
    r.onload = () => { img.src = r.result; };
    img.onload = () => {
      const ratio = Math.min(maxW/img.width, maxH/img.height, 1);
      const w = Math.round(img.width*ratio);
      const h = Math.round(img.height*ratio);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

// Open cropper when choosing a file
photoInput?.addEventListener('change', (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  openCropperWithFile(f);
});

removePhoto?.addEventListener('click', async ()=>{
  cacheSet(K.photo, '');
  setPhotoFromB64(null);
  await waitForFirebase();
  await window.saveData(K.photo, null);
});

/* =========================
   Minimal canvas cropper (no libraries)
========================= */

// Elements
const cropDialog    = document.getElementById('cropDialog');
const cropCanvas    = document.getElementById('cropCanvas');
const cropApplyBtn  = document.getElementById('cropApply');
const cropCancelBtn = document.getElementById('cropCancel');
const cropDimToggle = document.getElementById('cropDimToggle');

const ctx = cropCanvas.getContext('2d', { alpha: false });

// state
const cropState = {
  img: null,
  scale: 1,
  drag: false,
  lastX: 0,
  lastY: 0,
  offsetX: 0,
  offsetY: 0,
  aspect: null, // computed from #photoArea size
};

// reset file input so selecting the same file re-triggers change
function resetPhotoInput() { if (photoInput) photoInput.value = ''; }

// compute aspect from the live frame (mobile-first fallback 9:16)
function setAspectToPhotoArea() {
  const rect = photoArea?.getBoundingClientRect?.() || { width: 0, height: 0 };
  const aspect = (rect.width > 0 && rect.height > 0)
    ? (rect.width / rect.height)
    : (9 / 16);

  cropState.aspect = aspect;

  // internal working size (not the UI size)
  const targetW = 960;
  cropCanvas.width  = targetW;
  cropCanvas.height = Math.round(targetW / aspect);

  drawCrop();
}

// open cropper from a chosen file
function openCropperWithFile(file) {
  const img = new Image();
  img.onload = () => {
    cropState.img     = img;
    cropState.scale   = 1;
    cropState.offsetX = 0;
    cropState.offsetY = 0;

    setAspectToPhotoArea();

    // init Dim toggle from cache (default on)
    const stored = cacheGet(PHOTO_DIM_KEY, '1') === '1';
    if (cropDimToggle) cropDimToggle.checked = stored;

    if (typeof cropDialog.showModal === 'function') cropDialog.showModal();
    else cropDialog.setAttribute('open', '');
  };
  img.onerror = () => alert('Could not load image.');
  const r = new FileReader();
  r.onload = () => (img.src = r.result);
  r.readAsDataURL(file);
}

// draw current view
function drawCrop() {
  if (!cropState.img) return;
  const { img, scale, offsetX, offsetY } = cropState;
  const cw = cropCanvas.width;
  const ch = cropCanvas.height;

  // fill bg (no gridlines)
  ctx.fillStyle = '#0c111b';
  ctx.fillRect(0, 0, cw, ch);

  // cover-fit
  const baseScale = Math.max(cw / img.width, ch / img.height);
  const s = baseScale * scale;

  const drawW = img.width  * s;
  const drawH = img.height * s;
  const x = (cw - drawW) / 2 + offsetX;
  const y = (ch - drawH) / 2 + offsetY;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, x, y, drawW, drawH);
}

// mouse drag
cropCanvas.addEventListener('mousedown', (ev) => {
  cropState.drag = true;
  cropState.lastX = ev.clientX;
  cropState.lastY = ev.clientY;
});
window.addEventListener('mouseup', () => cropState.drag = false);
cropCanvas.addEventListener('mousemove', (ev) => {
  if (!cropState.drag) return;
  const dx = ev.clientX - cropState.lastX;
  const dy = ev.clientY - cropState.lastY;
  cropState.lastX = ev.clientX;
  cropState.lastY = ev.clientY;
  cropState.offsetX += dx;
  cropState.offsetY += dy;
  drawCrop();
});

// touch drag & pinch zoom
let pinchStartDist = 0;
let pinchStartScale = 1;
function distance(p1, p2){ const dx=p1.clientX-p2.clientX, dy=p1.clientY-p2.clientY; return Math.hypot(dx,dy); }

cropCanvas.addEventListener('touchstart', (ev) => {
  if (ev.touches.length === 2) {
    pinchStartDist = distance(ev.touches[0], ev.touches[1]);
    pinchStartScale = cropState.scale;
  } else if (ev.touches.length === 1) {
    cropState.drag = true;
    cropState.lastX = ev.touches[0].clientX;
    cropState.lastY = ev.touches[0].clientY;
  }
},{passive:true});

cropCanvas.addEventListener('touchmove', (ev) => {
  if (ev.touches.length === 2) {
    const d = distance(ev.touches[0], ev.touches[1]);
    const factor = d / (pinchStartDist || d);
    cropState.scale = Math.max(1, Math.min(3, pinchStartScale * factor));
    drawCrop();
  } else if (cropState.drag && ev.touches.length === 1) {
    const t = ev.touches[0];
    const dx = t.clientX - cropState.lastX;
    const dy = t.clientY - cropState.lastY;
    cropState.lastX = t.clientX;
    cropState.lastY = t.clientY;
    cropState.offsetX += dx;
    cropState.offsetY += dy;
    drawCrop();
  }
},{passive:true});

cropCanvas.addEventListener('touchend', () => { cropState.drag = false; }, {passive:true});

// wheel zoom (desktop)
cropCanvas.addEventListener('wheel', (ev) => {
  ev.preventDefault();
  const step = (ev.ctrlKey ? 0.03 : 0.06);
  cropState.scale = Math.min(3, Math.max(1, cropState.scale + (ev.deltaY > 0 ? -step : step)));
  drawCrop();
}, { passive: false });

// Dim toggle live-preview
cropDimToggle?.addEventListener('change', () => {
  applyPhotoDim(!!cropDimToggle.checked);
});

// Cancel → close + make input re-triggerable
cropCancelBtn?.addEventListener('click', () => {
  if (typeof cropDialog.close === 'function') cropDialog.close();
  else cropDialog.removeAttribute('open');
  resetPhotoInput();
});

// Also reset input whenever dialog closes (ESC, backdrop, etc.)
cropDialog?.addEventListener('close', resetPhotoInput);

// Apply → export & save + persist dim setting
// — helper: blob -> dataURL
function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = reject;
    fr.readAsDataURL(blob);
  });
}

// — helper: downscale if needed
async function downscaleIfNeededFromCanvas(canvas, type = 'image/jpeg', quality = 0.85, maxW = 1200, maxH = 1200) {
  const cw = canvas.width, ch = canvas.height;

  if (cw <= maxW && ch <= maxH) {
    const blob = await new Promise(res => canvas.toBlob(res, type, quality));
    return blob;
  }

  const ratio = Math.min(maxW / cw, maxH / ch);
  const w = Math.round(cw * ratio);
  const h = Math.round(ch * ratio);

  const tmp = document.createElement('canvas');
  tmp.width = w; tmp.height = h;
  const tctx = tmp.getContext('2d', { alpha: false });
  tctx.imageSmoothingEnabled = true;
  tctx.imageSmoothingQuality = 'high';
  tctx.drawImage(canvas, 0, 0, w, h);

  const blob = await new Promise(res => tmp.toBlob(res, type, quality));
  return blob;
}

// ————— FAST APPLY: instant UI, async save —————
cropApplyBtn?.addEventListener('click', async (e) => {
  e.preventDefault();

  try {
    // 1) Instantly update UI
    const previewDataURL = cropCanvas.toDataURL('image/jpeg', 0.9);
    cacheSet(K.photo, previewDataURL);
    setPhotoFromB64(previewDataURL);

    const dimOn = !!cropDimToggle?.checked;
    cacheSet(PHOTO_DIM_KEY, dimOn ? '1' : '0');
    applyPhotoDim(dimOn);

    if (typeof cropDialog.close === 'function') cropDialog.close();
    else cropDialog.removeAttribute('open');
    if (photoInput) photoInput.value = '';

    // 2) Background save to Firebase
    queueMicrotask(async () => {
      try {
        const blob = await downscaleIfNeededFromCanvas(cropCanvas, 'image/jpeg', 0.85, 1200, 1200);
        const finalDataURL = await blobToDataURL(blob);

        await waitForFirebase();
        await window.saveData(K.photo, finalDataURL);
        await window.saveData(PHOTO_DIM_KEY, dimOn ? '1' : '0');
      } catch (saveErr) {
        console.error('Background save failed:', saveErr);
      }
    });

  } catch (err) {
    console.error('Crop/Save failed', err);
    alert('Failed to save cropped photo.');
  }
});


// Keep canvas aspect in sync if dialog is open and viewport changes
window.addEventListener('resize', () => {
  if (cropDialog?.open && cropState.img) setAspectToPhotoArea();
});



/* =========================
   Notes (autosave + cache)
========================= */
const notes       = $('#notes');
const clearNotes  = $('#clearNotes');


function loadNotesFromCache(){
  if (!isLoggedIn()) return;
  if (notes) notes.value = cacheGet(K.notes, '');
}
function loadNotesHeightFromCache(){
  if (!isLoggedIn()) return;
  const h = cacheGet(K.notesHeight, null);
  if (h && notes) notes.style.height = h + 'px';
}
async function syncNotesHeightFromCloud(){
  await waitForFirebase();
  const h = await window.loadData(K.notesHeight);
  if (h && notes) {
    cacheSet(K.notesHeight, h);
    notes.style.height = h + 'px';
  }
}
async function syncNotesFromCloud(){
  await waitForFirebase();
  const t = await window.loadData(K.notes);
  if (t !== null && notes){ cacheSet(K.notes, t); notes.value = t; }
}
notes?.addEventListener('input', ()=>{
  clearTimeout(notes._t);
  notes._t = setTimeout(async ()=>{
    const v = notes.value;
    cacheSet(K.notes, v);
    await waitForFirebase();
    await window.saveData(K.notes, v);
  }, 400);
});

clearNotes?.addEventListener('click', async ()=>{
  if (!confirm('Clear all notes?')) return;
  if (notes) notes.value = '';
  cacheSet(K.notes, '');
  await waitForFirebase();
  await window.saveData(K.notes, null);
});

document.getElementById('copyNotesBtn').addEventListener('click', function () {
  const notesText = document.getElementById('notes').value;
  if (!notesText.trim()) {
    alert('No notes to copy!');
    return;
  }
  
  navigator.clipboard.writeText(notesText)
    .then(() => {
      alert('Notes copied to clipboard!');
    })
    .catch(err => {
      console.error('Failed to copy notes:', err);
      alert('Failed to copy notes.');
    });
});


/* =========================
   Draggable bar for Notes
========================= */
const dragBar = document.querySelector('.drag-bar');
let startY, startH;
if (dragBar && notes){
  const start = (e)=>{ e.preventDefault(); startY=(e.touches?e.touches[0].clientY:e.clientY); startH=notes.offsetHeight;
    document.addEventListener('mousemove',move); document.addEventListener('touchmove',move);
    document.addEventListener('mouseup',stop);   document.addEventListener('touchend',stop);
  };
  const move = (e)=>{ const y=(e.touches?e.touches[0].clientY:e.clientY); notes.style.height = `${startH+(y-startY)}px`; };
  const stop = async ()=>{
    document.removeEventListener('mousemove', move);
    document.removeEventListener('touchmove', move);
    document.removeEventListener('mouseup', stop);
    document.removeEventListener('touchend', stop);
    const currentHeight = parseInt(notes.style.height, 10);
    cacheSet(K.notesHeight, currentHeight);
    await waitForFirebase();
    await window.saveData(K.notesHeight, currentHeight);
  };
  dragBar.addEventListener('mousedown',start);
  dragBar.addEventListener('touchstart',start);
}

/* =========================
   Upcoming Events (progress)
========================= */
function getDB() {
  if (!window.__db) throw new Error('Firestore not ready yet');
  return window.__db;
}

const eventNameInput = document.getElementById('eventName');
const eventDateInput = document.getElementById('eventDate');
const addEventBtn    = document.getElementById('addEvent');
const eventList      = document.getElementById('eventList');
let editingId = null;

const clamp = (v,min,max)=> Math.max(min, Math.min(max,v));
const startOfDay = d => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
const daysBetween = (a,b)=> Math.ceil((b-a)/(24*60*60*1000));
const pretty = s => new Date(s).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});

function renderEvents(items) {
  // sort asc and group by month
  items = (items || [])
    .slice()
    .sort((a, b) => (a.date || '') < (b.date || '') ? -1 : 1);

  const today = startOfDay(new Date());
  const groups = new Map(); // "Aug 2025" => [events]

  for (const ev of items) {
    const monthKey = new Date(ev.date || Date.now())
      .toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
    if (!groups.has(monthKey)) groups.set(monthKey, []);
    groups.get(monthKey).push(ev);
  }

  eventList.innerHTML = '';

  for (const [month, list] of groups.entries()) {
    // Check if this month group is urgent (any event ≤ 5 days left)
    const hasUrgent = list.some(ev => {
      const target = startOfDay(new Date(ev.date));
      const left = Math.max(0, daysBetween(today, target));
      return left <= 5;
    });

    // month header with per-group accent variable
    const mg = document.createElement('div');
    mg.className = 'month-group';
    mg.style.setProperty('--month-accent', hasUrgent ? 'var(--danger)' : 'var(--accent)');
    mg.innerHTML = `<div class="month-title">${month}</div>`;
    eventList.appendChild(mg);

    // events in that month
    for (const ev of list) {
      const created = ev.created || ev.date;
      const start = startOfDay(new Date(created));
      const target = startOfDay(new Date(ev.date));
      const total = Math.max(1, daysBetween(start, target));
      const left = Math.max(0, daysBetween(today, target));
      const pct = clamp(Math.round((left / total) * 100), 0, 100);
      const urgent = left <= 5;

      const row = document.createElement('div');
      row.className = 'event-item';

      row.innerHTML = `
        <div class="event-head">
          <div class="event-name">${ev.name || '(no title)'}</div>
          <span class="badge ${urgent ? 'urgent' : ''}">${left} day${left === 1 ? '' : 's'} left</span>
          <span class="badge date">${pretty(ev.date)}</span>
        </div>

        <div class="progress-row">
          <div class="progress-line ${urgent ? 'low-time' : ''}">
            <span style="width:0%"></span>
          </div>
          <span class="event-actions">
            <button class="edit" data-id="${ev.id}">Edit</button>
            <button class="delete" data-id="${ev.id}">Delete</button>
          </span>
        </div>
      `;

      mg.appendChild(row);

      // animate in
      requestAnimationFrame(() => {
        row.classList.add('appear');
        // animate bar after layout
        const bar = row.querySelector('.progress-line > span');
        requestAnimationFrame(() => { bar.style.width = pct + '%'; });
      });
    }
  }
}



function loadEventsFromCache(){
  if (!isLoggedIn()) return;
  const items = cacheGetJSON(EK, []);
  renderEvents(items);
}
async function syncEventsFromCloud(){
  const db = getDB();
  await waitForFirebase();
  const q = await getDocs(collection(db, "events"));
  const items = [];
  q.forEach(s => items.push({ id:s.id, ...s.data() }));
  cacheSetJSON(EK, items);
  renderEvents(items);
}
addEventBtn?.addEventListener('click', async ()=>{
  const name = (eventNameInput.value||'').trim();
  const date = eventDateInput.value; if (!name || !date) return;
  await waitForFirebase();
  const db = getDB();
  if (editingId){
    await updateDoc(doc(db,"events",editingId), { name, date });
    editingId = null;
  } else {
    const created = new Date().toISOString().slice(0,10);
    await addDoc(collection(db,"events"), { name, date, created });
  }
  eventNameInput.value = ''; eventDateInput.value = '';
  await syncEventsFromCloud();
});
eventList?.addEventListener('click', async (e)=>{
  const id = e.target.dataset.id; if (!id) return;
  if (e.target.classList.contains('edit')){
    await waitForFirebase();
    const db = getDB();
    const snap = await getDoc(doc(db,"events",id));
    if (snap.exists()){
      const d = snap.data();
      editingId = id;
      eventNameInput.value = d.name || '';
      eventDateInput.value = d.date || '';

      // scroll the form into view and focus
    scrollFieldIntoCard(eventNameInput);
    }
  }
  if (e.target.classList.contains('delete')){
    await waitForFirebase();
     const db = getDB();
    await deleteDoc(doc(db,"events",id));
    await syncEventsFromCloud();
  }
});

/* =========================
   Routine (cache + cloud)
========================= */
const openRoutine   = document.getElementById('openRoutine');
const clearRoutine  = document.getElementById('clearRoutine');
const routineView   = document.getElementById('routineView');
const routineDialog = document.getElementById('routineDialog');
const weekdayGrid   = document.getElementById('weekdayGrid');
const routineDay    = document.getElementById('routineDay');
const classNameInput= document.getElementById('className');
const classTimeInput= document.getElementById('classTime');
const addClassBtn   = document.getElementById('addClass');
const saveRoutineBtn= document.getElementById('saveRoutine');
const routineDraft  = document.getElementById('routineDraft');
const updateClassBtn= document.getElementById('updateClass');
const cancelEditBtn = document.getElementById('cancelEdit');

let editState = null;

function getRoutineFromCache(){
  // return default structure if nothing stored
  try {
    const raw = cacheGet(RK, null);
    return raw ? JSON.parse(raw) : { days:[...WEEK_ORDER], items:{} };
  } catch {
    return { days:[...WEEK_ORDER], items:{} };
  }
}
function setRoutineCache(data){ cacheSet(RK, JSON.stringify(data)); }

async function getRoutineFromCloud(){
  await waitForFirebase();
  const raw = await window.loadData(RK);
  try {
    return raw ? JSON.parse(raw) : { days:[...WEEK_ORDER], items:{} };
  } catch {
    return { days:[...WEEK_ORDER], items:{} };
  }
}
async function saveRoutineCloud(data){
  await waitForFirebase();
  await window.saveData(RK, JSON.stringify(data));
}

function formatTime12h(t = '00:00') {
  const [h, m] = (t || '00:00').split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  const hh = String(h % 12 || 12).padStart(2, '0');
  const mm = String(m ?? 0).padStart(2, '0');
  return `${hh}:${mm} ${ap}`;
}

function renderRoutineViewFromData(data) {
  const container = document.createElement('div');
  container.className = 'routine-view';

  const days = Array.isArray(data?.days) ? data.days : [];
  if (!days.length) {
    container.textContent = 'No Routine Yet.';
    routineView.innerHTML = '';
    routineView.appendChild(container);
    return;
  }

  days.forEach(day => {
    const items = (data.items?.[day] || [])
      .slice()
      .sort((a, b) => (a.time || '') < (b.time || '') ? -1 : 1);

    const block = document.createElement('div');
    block.className = 'day-block';

    // Day header
    const head = document.createElement('div');
    head.className = 'day-head';
    head.innerHTML = `
      <div class="day-title">${day}</div>
      <div class="day-count">${items.length ? `${items.length} task${items.length>1?'s':''}` : 'No task'}</div>
    `;
    block.appendChild(head);

    // Timeline area
    const tl = document.createElement('div');
    tl.className = 'timeline';

    if (!items.length) {
      const none = document.createElement('div');
      none.className = 'class-empty';
      none.textContent = '—';
      tl.appendChild(none);
    } else {
      items.forEach(it => {
        const row = document.createElement('div');
        row.className = 'class-item';
        row.innerHTML = `
          <span class="dot" aria-hidden="true"></span>
          <span class="time-pill">${formatTime12h(it.time)}</span>
          <span class="subject">${it.name || ''}</span>
        `;
        tl.appendChild(row);
      });
    }

    block.appendChild(tl);
    container.appendChild(block);
  });

  routineView.innerHTML = '';
  routineView.appendChild(container);
}




// open dialog
openRoutine?.addEventListener('click', async ()=>{
  editState=null; addClassBtn.style.display=''; updateClassBtn.style.display='none'; cancelEditBtn.style.display='none';
  const data = getRoutineFromCache();
  const set = new Set(data.days?.length ? data.days : WEEK_ORDER.slice(0,5));
  weekdayGrid.querySelectorAll('input[type="checkbox"]').forEach(cb=> cb.checked=set.has(cb.value));

  // fill select
  routineDay.innerHTML='';
  Array.from(set).forEach(d=>{
    const o=document.createElement('option'); o.value=d; o.textContent=d; routineDay.appendChild(o);
  });

  classNameInput.value=''; classTimeInput.value='';
  await renderDraft(data);

  weekdayGrid.onchange = async ()=>{
    const d = await getDialogState();
    routineDay.innerHTML='';
    d.days.forEach(x=>{ const o=document.createElement('option'); o.value=x; o.textContent=x; routineDay.appendChild(o); });
    await renderDraft(d);
  };

  routineDialog.showModal();
});

async function getDialogState(){
  const days = Array.from(weekdayGrid.querySelectorAll('input[type="checkbox"]:checked')).map(c=>c.value);
  const data = getRoutineFromCache(); data.days = days.length ? days : []; return data;
}
async function renderDraft(data) {
  const wrap = document.createElement('div');

  (data.days || []).forEach(day => {
    const items = (data.items?.[day] || [])
      .slice()
      .sort((a, b) => (a.time || '') < (b.time || '') ? -1 : 1);

    // Day header
    const head = document.createElement('div');
    head.className = 'day-head';
    head.textContent = day;
    wrap.appendChild(head);

    if (!items.length) {
      const none = document.createElement('div');
      none.className = 'class-empty';
      none.textContent = '—';
      wrap.appendChild(none);
      return;
    }

    // Rows
    items.forEach(it => {
      if (!it.id) it.id = uid();

      const row = document.createElement('div');
      row.className = 'draft-row';

      // Left side: time pill + wrapped subject
      const main = document.createElement('div');
      main.className = 'draft-main';

      const time = document.createElement('span');
      time.className = 'time-pill';
      time.textContent = formatTime12h(it.time || '00:00');

      const subj = document.createElement('div');
      subj.className = 'subject';
      subj.textContent = it.name || '';

      main.append(time, subj);

      // Right side: actions (slim chips)
      const actions = document.createElement('div');
      actions.className = 'routine-actions';

      const ebtn = document.createElement('button');
      ebtn.type = 'button';
      ebtn.textContent = 'Edit';
      ebtn.dataset.action = 'edit';
      ebtn.dataset.day = day;
      ebtn.dataset.id = it.id;

      const dbtn = document.createElement('button');
      dbtn.type = 'button';
      dbtn.textContent = 'Delete';
      dbtn.dataset.action = 'delete';
      dbtn.dataset.day = day;
      dbtn.dataset.id = it.id;

      actions.append(ebtn, dbtn);

      // Assemble row
      row.append(main, actions);
      wrap.appendChild(row);
    });
  });

  routineDraft.innerHTML = '';
  routineDraft.appendChild(wrap);

  // persist draft to cache too
  setRoutineCache(data);
}

routineDraft?.addEventListener('click', async (e)=>{
  const btn=e.target.closest('button'); if(!btn) return;
  const {action,day,id}=btn.dataset; const data=getRoutineFromCache();
  if (action==='delete'){
    data.items[day]=(data.items[day]||[]).filter(x=>x.id!==id);
    setRoutineCache(data); await saveRoutineCloud(data);
    await renderDraft(data); renderRoutineViewFromData(data); return;
  }
  if (action==='edit'){
    const item=(data.items[day]||[]).find(x=>x.id===id); if(!item) return;
    editState={day,id}; routineDay.value=day; classNameInput.value=item.name||''; classTimeInput.value=item.time||'';
    addClassBtn.style.display='none'; updateClassBtn.style.display=''; cancelEditBtn.style.display='';

    //make the dialog scroll to the inputs on mobile
  scrollFieldInDialog(routineDialog, classNameInput);
  }
});

addClassBtn?.addEventListener('click', async ()=>{
  if (editState) return;
  const data=getRoutineFromCache();
  const day=routineDay.value; const name=(classNameInput.value||'').trim(); const time=(classTimeInput.value||'').trim();
  if (!day || !name) return;
  data.items ||= {}; data.items[day] ||= []; data.items[day].push({ id:uid(), name, time });
  if (!data.days?.includes(day)) data.days.push(day);
  setRoutineCache(data); await saveRoutineCloud(data);
  classNameInput.value=''; classTimeInput.value='';
  await renderDraft(data); renderRoutineViewFromData(data);
});

updateClassBtn?.addEventListener('click', async ()=>{
  if (!editState) return;
  const data=getRoutineFromCache();
  const {day:idDay, id}=editState;
  const newDay=routineDay.value; const name=(classNameInput.value||'').trim(); const time=(classTimeInput.value||'').trim();
  if (!newDay || !name) return;
  const list=data.items[idDay]||[]; const idx=list.findIndex(x=>x.id===id); if(idx!==-1) list.splice(idx,1);
  data.items[newDay] ||= []; data.items[newDay].push({id,name,time});
  if (!data.days.includes(newDay)) data.days.push(newDay);
  setRoutineCache(data); await saveRoutineCloud(data);
  editState=null; addClassBtn.style.display=''; updateClassBtn.style.display='none'; cancelEditBtn.style.display='none';
  classNameInput.value=''; classTimeInput.value='';
  await renderDraft(data); renderRoutineViewFromData(data);
});

// Save selected days when clicking "Done"
saveRoutineBtn?.addEventListener('click', async (e) => {
  e.preventDefault();
  const selectedDays = Array.from(
    weekdayGrid.querySelectorAll('input[type="checkbox"]:checked')
  ).map(c => c.value);

  const data = getRoutineFromCache();
  data.days = selectedDays;

  // prune classes for days that were unchecked
  const selectedSet = new Set(selectedDays);
  Object.keys(data.items || {}).forEach(day => {
    if (!selectedSet.has(day)) delete data.items[day];
  });

  setRoutineCache(data);
  await saveRoutineCloud(data);
  renderRoutineViewFromData(data);
  routineDialog.close();
});

cancelEditBtn?.addEventListener('click', ()=>{
  editState=null; addClassBtn.style.display=''; updateClassBtn.style.display='none'; cancelEditBtn.style.display='none';
  classNameInput.value=''; classTimeInput.value='';
});

clearRoutine?.addEventListener('click', async ()=>{
  if (!confirm('Clear entire routine?')) return;
  const empty={ days:[], items:{} };
  setRoutineCache(empty); await saveRoutineCloud(empty);
  renderRoutineViewFromData(empty);
});

function renderRoutineViewFast(){ renderRoutineViewFromData( getRoutineFromCache() ); }
async function syncRoutineFromCloud(){ const d=await getRoutineFromCloud(); setRoutineCache(d); renderRoutineViewFromData(d); }



/* =========================
   Init (Auth → Cache → Cloud)
========================= */
function initApp() {
  // Guard: never run without login
  if (!isLoggedIn()) {
    console.warn("initApp called before login — blocked");
    return;
  }

  // 1) FAST: show cached immediately
  loadHeaderFromCache();
  loadPhotoFromCache();
  loadNotesFromCache();
  loadNotesHeightFromCache();
  renderRoutineViewFast();
  loadEventsFromCache();

  // 2) Then fetch from cloud in background
  Promise.all([
    syncHeaderFromCloud(),
    syncPhotoFromCloud(),
    syncPhotoDimFromCloud(),
    syncNotesFromCloud(),
    syncNotesHeightFromCloud(),
    syncRoutineFromCloud(),
    syncEventsFromCloud()
  ]);
}

// no other bootstrapping here — auth overlay IIFE above will call initApp() after login
