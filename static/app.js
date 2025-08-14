/* =========================
   Constants & Utilities
========================= */
const K = {
  name: 'sd_name',
  subtitle: 'sd_subtitle',
  notes: 'sd_notes',
  photo: 'sd_photo_b64'
};
const RK = 'sd_routine_v1';
const WEEK_ORDER = ["Saturday", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
function uid() { return (Date.now().toString(36) + Math.random().toString(36).slice(2,7)); }
const $ = (sel) => document.querySelector(sel);

/* =========================
   Wait for Firebase
========================= */
async function waitForFirebase() {
  if (!window.firebaseReadyPromise) {
    console.error("Firebase not initialized!");
    return;
  }
  await window.firebaseReadyPromise;
}

/* =========================
   Header (Name & Subtitle)
========================= */
const nameDisplay = $('#nameDisplay');
const subtitleDisplay = $('#subtitleDisplay');
const nameInput = $('#nameInput');
const subtitleInput = $('#subtitleInput');

async function loadHeader() {
  await waitForFirebase();
  const name = await loadData(K.name) || 'Name Here';
  const subtitle = await loadData(K.subtitle) || 'To be doctor...';
  nameDisplay.textContent = name;
  subtitleDisplay.textContent = subtitle;
  nameInput.value = name;
  subtitleInput.value = subtitle;
}

async function saveHeader() {
  await waitForFirebase();
  await saveData(K.name, nameInput.value.trim() || 'Name Here');
  await saveData(K.subtitle, subtitleInput.value.trim() || '');
  await loadHeader();
}

/* =========================
   Background Photo
========================= */
const photoArea = $('#photoArea');
const photoInput = $('#photoInput');
const removePhoto = $('#removePhoto');

function setPhotoFromB64(b64) {
  photoArea.style.backgroundImage = b64 ? `url(${b64})` : 'none';
}

async function loadPhoto() {
  await waitForFirebase();
  const b64 = await loadData(K.photo);
  setPhotoFromB64(b64);
}

photoInput?.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    await waitForFirebase();
    await saveData(K.photo, reader.result);
    setPhotoFromB64(reader.result);
  };
  reader.readAsDataURL(file);
});

removePhoto?.addEventListener('click', async () => {
  await waitForFirebase();
  await saveData(K.photo, null);
  setPhotoFromB64(null);
});

/* =========================
   Upcoming Events (with R→L progress)
========================= */
import {
  getFirestore,
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const db = getFirestore();
const eventNameInput = document.getElementById('eventName');
const eventDateInput = document.getElementById('eventDate');
const addEventBtn    = document.getElementById('addEvent');
const eventList      = document.getElementById('eventList');
let editingId = null;

/* ----- helpers ----- */
function clamp(v, min, max){ return Math.max(min, Math.min(max, v)); }
function daysBetween(a,b){                     // a,b are Date (00:00)
  const MS = 24*60*60*1000;
  return Math.ceil((b - a)/MS);
}
function startOfDay(d){ const x=new Date(d); x.setHours(0,0,0,0); return x; }
function pretty(dateStr){
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { month:'short', day:'numeric', year:'numeric' });
}

/* ----- load & render events ----- */
async function loadEvents(){
  await waitForFirebase();
  eventList.innerHTML = '';

  const q = await getDocs(collection(db, "events"));
  const items = [];
  q.forEach(s => items.push({ id: s.id, ...s.data() }));
  // sort by date ascending
  items.sort((a,b)=> (a.date||'') < (b.date||'') ? -1 : 1);

  const today = startOfDay(new Date());

  for (const ev of items){
    // ensure we have a created field (yyyy-mm-dd)
    let created = ev.created;
    if (!created){
      created = new Date().toISOString().slice(0,10);
      try { await updateDoc(doc(db,"events",ev.id), { created }); } catch(_) {}
    }

    const start   = startOfDay(new Date(created));
    const target  = startOfDay(new Date(ev.date));
    const total   = Math.max(1, daysBetween(start, target));           // avoid /0
    const left    = Math.max(0, daysBetween(today, target));           // remaining days
    const pct     = clamp(Math.round((left/total)*100), 0, 100);       // R→L fill

    // build row
    const row = document.createElement('div');
    row.className = 'event-item';
    row.innerHTML = `
    <div class="event-main">
      <div class="event-name">${ev.name || '(no title)'}</div>
      <div class="progress-row">
        <div class="progress-line ${left<=5?'low-time':''}">
          <span style="width:${pct}%"></span>
        </div>
        <span class="event-actions">
          <button class="edit"   data-id="${ev.id}">Edit</button>
          <button class="delete" data-id="${ev.id}">Delete</button>
        </span>
      </div>
      <div class="event-meta">
        <strong>${left}</strong> days left
        <span class="date">(${pretty(ev.date)})</span>
      </div>
    </div>
  `;

    eventList.appendChild(row);
  }
}

/* ----- add / update ----- */
addEventBtn.addEventListener('click', async () => {
  await waitForFirebase();
  const name = (eventNameInput.value || '').trim();
  const date = eventDateInput.value;
  if (!name || !date) return;

  if (editingId){
    // keep old created; only update name/date
    await updateDoc(doc(db,"events",editingId), { name, date });
    editingId = null;
  } else {
    const created = new Date().toISOString().slice(0,10); // yyyy-mm-dd
    await addDoc(collection(db,"events"), { name, date, created });
  }

  eventNameInput.value = '';
  eventDateInput.value = '';
  await loadEvents();
});

/* ----- edit / delete actions ----- */
eventList.addEventListener('click', async (e) => {
  const id = e.target.dataset.id;
  if (!id) return;

  if (e.target.classList.contains('edit')){
    const snap = await getDoc(doc(db,"events",id));
    if (snap.exists()){
      const data = snap.data();
      eventNameInput.value = data.name || '';
      eventDateInput.value = data.date || '';
      editingId = id;
      // small UX nudge to re-open the picker on mobile if needed
      eventDateInput.blur(); setTimeout(()=>eventDateInput.focus(), 0);
    }
  }

  if (e.target.classList.contains('delete')){
    await deleteDoc(doc(db,"events",id));
    await loadEvents();
  }
});

/* initial render (also called again on add/edit/delete) */
loadEvents();

/* =========================
   Notes
========================= */
const notes = $('#notes');
const clearNotes = $('#clearNotes');
const exportNotes = $('#exportNotes');
const importNotes = $('#importNotes');

async function loadNotes() {
  await waitForFirebase();
  notes.value = await loadData(K.notes) || '';
}

notes?.addEventListener('input', () => {
  clearTimeout(notes._timer);
  notes._timer = setTimeout(async () => {
    await waitForFirebase();
    await saveData(K.notes, notes.value);
  }, 500);
});

clearNotes?.addEventListener('click', async () => {
  if (confirm('Clear all notes?')) {
    notes.value = '';
    await waitForFirebase();
    await saveData(K.notes, null);
  }
});

exportNotes?.addEventListener('click', () => {
  const blob = new Blob([notes.value || ''], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'notes.txt';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

importNotes?.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  notes.value = text;
  await waitForFirebase();
  await saveData(K.notes, text);
});

/* =========================
   Draggable Resize Bar for Notes
========================= */
const dragBar = document.querySelector('.drag-bar');
let startY, startHeight;

if (dragBar) {
  dragBar.addEventListener('touchstart', startResize);
  dragBar.addEventListener('mousedown', startResize);
}

function startResize(e) {
  e.preventDefault();
  startY = e.touches ? e.touches[0].clientY : e.clientY;
  startHeight = notes.offsetHeight;
  document.addEventListener('touchmove', resize);
  document.addEventListener('mousemove', resize);
  document.addEventListener('touchend', stopResize);
  document.addEventListener('mouseup', stopResize);
}

function resize(e) {
  const y = e.touches ? e.touches[0].clientY : e.clientY;
  notes.style.height = `${startHeight + (y - startY)}px`;
}

function stopResize() {
  document.removeEventListener('touchmove', resize);
  document.removeEventListener('mousemove', resize);
  document.removeEventListener('touchend', stopResize);
  document.removeEventListener('mouseup', stopResize);
}



/* =========================
   Settings Modal
========================= */
const settings = $('#settings');
$('#openSettings')?.addEventListener('click', () => settings.showModal());
$('#saveSettings')?.addEventListener('click', (e) => {
  e.preventDefault();
  saveHeader();
  settings.close();
});

/* =========================
   Class Routine
========================= */
const openRoutine = document.getElementById('openRoutine');
const clearRoutine = document.getElementById('clearRoutine');
const routineView = document.getElementById('routineView');
const routineDialog = document.getElementById('routineDialog');
const weekdayGrid = document.getElementById('weekdayGrid');
const routineDay = document.getElementById('routineDay');
const classNameInput = document.getElementById('className');
const classTimeInput = document.getElementById('classTime');
const addClassBtn = document.getElementById('addClass');
const saveRoutineBtn = document.getElementById('saveRoutine');
const routineDraft = document.getElementById('routineDraft');
const updateClassBtn = document.getElementById('updateClass');
const cancelEditBtn = document.getElementById('cancelEdit');
let editState = null;

async function loadRoutine() {
  await waitForFirebase();
  const raw = await loadData(RK);
  if (!raw) return { days: ["Monday","Tuesday","Wednesday","Thursday","Friday"], items: {} };
  return JSON.parse(raw);
}

async function saveRoutine(data) {
  await waitForFirebase();
  await saveData(RK, JSON.stringify(data));
}

async function renderRoutineView() {
  const data = await loadRoutine();
  if (!data.days?.length) { routineView.textContent = "No routine yet."; return; }
  const container = document.createElement('div');
  data.days.forEach(day => {
    const items = (data.items?.[day] || []).slice().sort((a,b)=> (a.time||"") < (b.time||"") ? -1 : 1);
    const dayEl = document.createElement('div');
    dayEl.className = 'day';
    dayEl.textContent = day;
    container.appendChild(dayEl);
    if (!items.length) {
      const none = document.createElement('div');
      none.className = 'item';
      none.textContent = '—';
      container.appendChild(none);
    } else {
      items.forEach(it => {
        const h = it.time ? Number(it.time.split(':')[0]) : 0;
        const m = it.time ? Number(it.time.split(':')[1]) : 0;
        const ampm = h >= 12 ? 'PM' : 'AM';
        const formattedTime = it.time ? `${String(h % 12 || 12).padStart(2,'0')}:${String(m).padStart(2,'0')} ${ampm}` : '--:--';
        const line = document.createElement('div');
        line.className = 'item';
        line.textContent = `${formattedTime} — ${it.name}`;
        container.appendChild(line);
      });
    }
  });
  routineView.innerHTML = '';
  routineView.appendChild(container);
}

function fillDaySelect(days) {
  routineDay.innerHTML = '';
  days.forEach(d => {
    const opt = document.createElement('option');
    opt.value = d; opt.textContent = d;
    routineDay.appendChild(opt);
  });
}

/* Routine Dialog Actions */
openRoutine?.addEventListener('click', async () => {
  editState = null;
  addClassBtn.style.display = '';
  updateClassBtn.style.display = 'none';
  cancelEditBtn.style.display = 'none';
  const data = await loadRoutine();
  const set = new Set(data.days?.length ? data.days : WEEK_ORDER.slice(0,5));
  weekdayGrid.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = set.has(cb.value));
  fillDaySelect(Array.from(set));
  classNameInput.value = '';
  classTimeInput.value = '';
  await renderDraft(data);
  weekdayGrid.onchange = async () => {
    const d = await getDialogState();
    fillDaySelect(d.days);
    await renderDraft(d);
  };
  routineDialog.showModal();
});

async function getDialogState() {
  const days = Array.from(weekdayGrid.querySelectorAll('input[type="checkbox"]:checked')).map(c => c.value);
  const data = await loadRoutine();
  data.days = days.length ? days : [];
  return data;
}

async function renderDraft(data) {
  const wrap = document.createElement('div');
  data.days.forEach(day => {
    const items = (data.items?.[day] || []).slice().sort((a,b)=> (a.time||'') < (b.time||'') ? -1 : 1);
    const head = document.createElement('div');
    head.style.fontWeight = '700';
    head.style.marginTop = '8px';
    head.textContent = day;
    wrap.appendChild(head);
    if (!items.length) {
      const none = document.createElement('div');
      none.style.opacity = .8;
      none.textContent = '—';
      wrap.appendChild(none);
      return;
    }
    items.forEach(it => {
      if (!it.id) it.id = uid();
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.justifyContent = 'space-between';
      row.style.alignItems = 'center';
      row.style.gap = '8px';
      const h = it.time ? Number(it.time.split(':')[0]) : 0;
      const m = it.time ? Number(it.time.split(':')[1]) : 0;
      const ap = h >= 12 ? 'PM' : 'AM';
      const formattedTime = it.time ? `${String(h % 12 || 12).padStart(2,'0')}:${String(m).padStart(2,'0')} ${ap}` : '--:--';
      const left = document.createElement('span');
      left.textContent = `${formattedTime} — ${it.name}`;
      const actions = document.createElement('span');
      actions.style.display = 'flex';
      actions.style.gap = '6px';
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
      dbtn.style.color = 'var(--danger)';
      actions.append(ebtn, dbtn);
      row.append(left, actions);
      wrap.appendChild(row);
    });
  });
  routineDraft.innerHTML = '';
  routineDraft.appendChild(wrap);
  await saveRoutine(data);
}

routineDraft.addEventListener('click', async (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const { action, day, id } = btn.dataset;
  const data = await loadRoutine();
  if (action === 'delete') {
    data.items[day] = (data.items[day] || []).filter(x => x.id !== id);
    await saveRoutine(data);
    await renderDraft(data);
    await renderRoutineView();
  }
  if (action === 'edit') {
    const item = (data.items[day] || []).find(x => x.id === id);
    if (!item) return;
    editState = { day, id };
    routineDay.value = day;
    classNameInput.value = item.name || '';
    classTimeInput.value = item.time || '';
    addClassBtn.style.display = 'none';
    updateClassBtn.style.display = '';
    cancelEditBtn.style.display = '';
  }
});

addClassBtn?.addEventListener('click', async () => {
  if (editState) return;
  const data = await loadRoutine();
  const day = routineDay.value;
  const name = (classNameInput.value || '').trim();
  const time = (classTimeInput.value || '').trim();
  if (!day || !name) return;
  data.items ||= {};
  data.items[day] ||= [];
  data.items[day].push({ id: uid(), name, time });
  if (!data.days?.includes(day)) data.days.push(day);
  await saveRoutine(data);
  classNameInput.value = '';
  classTimeInput.value = '';
  await renderDraft(data);
  await renderRoutineView();
});

updateClassBtn?.addEventListener('click', async () => {
  if (!editState) return;
  const data = await loadRoutine();
  const oldDay = editState.day;
  const id = editState.id;
  const newDay = routineDay.value;
  const name = (classNameInput.value || '').trim();
  const time = (classTimeInput.value || '').trim();
  if (!newDay || !name) return;
  const oldList = data.items[oldDay] || [];
  const idx = oldList.findIndex(x => x.id === id);
  if (idx !== -1) oldList.splice(idx, 1);
  data.items[newDay] ||= [];
  data.items[newDay].push({ id, name, time });
  if (!data.days.includes(newDay)) data.days.push(newDay);
  await saveRoutine(data);
  editState = null;
  addClassBtn.style.display = '';
  updateClassBtn.style.display = 'none';
  cancelEditBtn.style.display = 'none';
  classNameInput.value = '';
  classTimeInput.value = '';
  await renderDraft(data);
  await renderRoutineView();
});

cancelEditBtn?.addEventListener('click', () => {
  editState = null;
  addClassBtn.style.display = '';
  updateClassBtn.style.display = 'none';
  cancelEditBtn.style.display = 'none';
  classNameInput.value = '';
  classTimeInput.value = '';
});

/* =========================
   Init
========================= */
window.addEventListener('DOMContentLoaded', async () => {
  await loadHeader();
  await loadPhoto();
  await loadNotes();
  await renderRoutineView();
  await loadEvents();
});
