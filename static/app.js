/* =========================
   Constants, Cache helpers
========================= */
const K = {
  name: 'sd_name',
  subtitle: 'sd_subtitle',
  notes: 'sd_notes',
  photo: 'sd_photo_b64'
};
const RK = 'sd_routine_v1';
const EK = 'sd_events_v1'; // events cache

const WEEK_ORDER = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const $ = (sel) => document.querySelector(sel);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,7);

const cacheGet     = (k, d=null) => localStorage.getItem(k) ?? d;
const cacheSet     = (k, v)      => localStorage.setItem(k, v);
const cacheGetJSON = (k, d=[])   => { try{ return JSON.parse(localStorage.getItem(k)||''); }catch{ return d; } };
const cacheSetJSON = (k, v)      => localStorage.setItem(k, JSON.stringify(v));

async function waitForFirebase(){
  if (!window.firebaseReadyPromise) return;
  await window.firebaseReadyPromise;
}

/* =========================
   Header (Name & Subtitle)
========================= */
const nameDisplay = $('#nameDisplay');
const subtitleDisplay = $('#subtitleDisplay');
const nameInput = $('#nameInput');
const subtitleInput = $('#subtitleInput');

function loadHeaderFromCache(){
  const name = cacheGet(K.name, 'Name Here');
  const sub  = cacheGet(K.subtitle, 'To be doctor...');
  nameDisplay.textContent = name;
  subtitleDisplay.textContent = sub;
  if (nameInput) nameInput.value = name;
  if (subtitleInput) subtitleInput.value = sub;
}

async function syncHeaderFromCloud(){
  await waitForFirebase();
  const cloudName = await loadData(K.name);
  const cloudSub  = await loadData(K.subtitle);
  if (cloudName !== null) { cacheSet(K.name, cloudName); nameDisplay.textContent = cloudName; if (nameInput) nameInput.value = cloudName; }
  if (cloudSub  !== null) { cacheSet(K.subtitle, cloudSub); subtitleDisplay.textContent = cloudSub; if (subtitleInput) subtitleInput.value = cloudSub; }
}

async function saveHeader(){
  const n = (nameInput?.value || 'Name Here').trim();
  const s = (subtitleInput?.value || '').trim();
  cacheSet(K.name, n); cacheSet(K.subtitle, s);
  await waitForFirebase();
  await saveData(K.name, n);
  await saveData(K.subtitle, s);
  loadHeaderFromCache();
}


/* =========================
   Settings Modal (robust)
========================= */
const settingsDialog  = document.getElementById('settings');
const openSettingsBtn = document.getElementById('openSettings');
const saveSettingsBtn = document.getElementById('saveSettings');

openSettingsBtn?.addEventListener('click', (e) => {
  e.preventDefault();
  if (!settingsDialog) return;
  // Prefer real modal if supported; fallback to non‑modal
  if (typeof settingsDialog.showModal === 'function') {
    settingsDialog.showModal();
  } else {
    settingsDialog.setAttribute('open', '');
  }
});

saveSettingsBtn?.addEventListener('click', async (e) => {
  e.preventDefault();
  await saveHeader();
  // Close if available; otherwise remove 'open' attribute
  if (typeof settingsDialog.close === 'function') {
    settingsDialog.close();
  } else {
    settingsDialog.removeAttribute('open');
  }
});



/* =========================
   Background Photo
========================= */
const photoArea   = $('#photoArea');
const photoInput  = $('#photoInput');
const removePhoto = $('#removePhoto');

function setPhotoFromB64(b64){
  photoArea.style.backgroundImage = b64 ? `url(${b64})` : 'none';
}

function loadPhotoFromCache(){
  setPhotoFromB64(cacheGet(K.photo, null));
}

async function syncPhotoFromCloud(){
  await waitForFirebase();
  const b64 = await loadData(K.photo);
  if (b64 !== null){ cacheSet(K.photo, b64); setPhotoFromB64(b64); }
}

// optional: compress before saving to reduce load size
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

photoInput?.addEventListener('change', async (e)=>{
  const f = e.target.files?.[0]; if (!f) return;
  const b64 = await compressImage(f);          // much smaller than original
  cacheSet(K.photo, b64);
  setPhotoFromB64(b64);
  await waitForFirebase();
  await saveData(K.photo, b64);
});

removePhoto?.addEventListener('click', async ()=>{
  cacheSet(K.photo, '');
  setPhotoFromB64(null);
  await waitForFirebase();
  await saveData(K.photo, null);
});

/* =========================
   Notes (autosave + cache)
========================= */
const notes       = $('#notes');
const clearNotes  = $('#clearNotes');
const exportNotes = $('#exportNotes');
const importNotes = $('#importNotes');

function loadNotesFromCache(){
  notes.value = cacheGet(K.notes, '');
}

async function syncNotesFromCloud(){
  await waitForFirebase();
  const t = await loadData(K.notes);
  if (t !== null){ cacheSet(K.notes, t); notes.value = t; }
}

notes?.addEventListener('input', ()=>{
  clearTimeout(notes._t);
  notes._t = setTimeout(async ()=>{
    const v = notes.value;
    cacheSet(K.notes, v);
    await waitForFirebase();
    await saveData(K.notes, v);
  }, 400);
});

clearNotes?.addEventListener('click', async ()=>{
  if (!confirm('Clear all notes?')) return;
  notes.value = '';
  cacheSet(K.notes, '');
  await waitForFirebase();
  await saveData(K.notes, null);
});

exportNotes?.addEventListener('click', ()=>{
  const blob = new Blob([notes.value || ''], {type:'text/plain'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'notes.txt'; a.click();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
});

importNotes?.addEventListener('change', async (e)=>{
  const file = e.target.files?.[0]; if (!file) return;
  const text = await file.text();
  notes.value = text;
  cacheSet(K.notes, text);
  await waitForFirebase();
  await saveData(K.notes, text);
});

/* =========================
   Draggable bar for Notes
========================= */
const dragBar = document.querySelector('.drag-bar');
let startY, startH;
if (dragBar){
  const start = (e)=>{ e.preventDefault(); startY=(e.touches?e.touches[0].clientY:e.clientY); startH=notes.offsetHeight;
    document.addEventListener('mousemove',move); document.addEventListener('touchmove',move);
    document.addEventListener('mouseup',stop);   document.addEventListener('touchend',stop);
  };
  const move = (e)=>{ const y=(e.touches?e.touches[0].clientY:e.clientY); notes.style.height = `${startH+(y-startY)}px`; };
  const stop = ()=>{ document.removeEventListener('mousemove',move); document.removeEventListener('touchmove',move);
    document.removeEventListener('mouseup',stop); document.removeEventListener('touchend',stop);
  };
  dragBar.addEventListener('mousedown',start);
  dragBar.addEventListener('touchstart',start);
}

/* =========================
   Upcoming Events (progress)
========================= */
import {
  getFirestore, collection, getDocs, addDoc, updateDoc, deleteDoc, doc, getDoc
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const db             = getFirestore();
const eventNameInput = document.getElementById('eventName');
const eventDateInput = document.getElementById('eventDate');
const addEventBtn    = document.getElementById('addEvent');
const eventList      = document.getElementById('eventList');
let editingId = null;

const clamp = (v,min,max)=> Math.max(min, Math.min(max,v));
const startOfDay = d => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
const daysBetween = (a,b)=> Math.ceil((b-a)/(24*60*60*1000));
const pretty = s => new Date(s).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});

function renderEvents(items){
  // sort by date asc
  items = (items||[]).slice().sort((a,b)=> (a.date||'') < (b.date||'') ? -1 : 1);
  const today = startOfDay(new Date());
  eventList.innerHTML = '';
  for (const ev of items){
    const created = ev.created || ev.date;     // fallback
    const start   = startOfDay(new Date(created));
    const target  = startOfDay(new Date(ev.date));
    const total   = Math.max(1, daysBetween(start, target));
    const left    = Math.max(0, daysBetween(today, target));
    const pct     = clamp(Math.round((left/total)*100), 0, 100);

    const row = document.createElement('div');
    row.className = 'event-item';
    row.innerHTML = `
      <div class="event-main">
        <div class="event-name">${ev.name || '(no title)'}</div>
        <div class="progress-row">
          <div class="progress-line ${left<=5?'low-time':''}"><span style="width:${pct}%"></span></div>
          <span class="event-actions">
            <button class="edit"   data-id="${ev.id}">Edit</button>
            <button class="delete" data-id="${ev.id}">Delete</button>
          </span>
        </div>
        <div class="event-meta">
          <strong>${left}</strong> days left <span class="date">(${pretty(ev.date)})</span>
        </div>
      </div>`;
    eventList.appendChild(row);
  }
}

function loadEventsFromCache(){
  const items = cacheGetJSON(EK, []);
  renderEvents(items);
}

async function syncEventsFromCloud(){
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

eventList.addEventListener('click', async (e)=>{
  const id = e.target.dataset.id; if (!id) return;
  if (e.target.classList.contains('edit')){
    await waitForFirebase();
    const snap = await getDoc(doc(db,"events",id));
    if (snap.exists()){
      const d = snap.data();
      editingId = id;
      eventNameInput.value = d.name || '';
      eventDateInput.value = d.date || '';
    }
  }
  if (e.target.classList.contains('delete')){
    await waitForFirebase();
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
  return cacheGet(RK) ? JSON.parse(cacheGet(RK)) :
    { days:["Monday","Tuesday","Wednesday","Thursday","Friday"], items:{} };
}
function setRoutineCache(data){ cacheSet(RK, JSON.stringify(data)); }

async function getRoutineFromCloud(){
  await waitForFirebase();
  const raw = await loadData(RK);
  return raw ? JSON.parse(raw) :
    { days:["Monday","Tuesday","Wednesday","Thursday","Friday"], items:{} };
}
async function saveRoutineCloud(data){
  await waitForFirebase();
  await saveData(RK, JSON.stringify(data));
}

function renderRoutineViewFromData(data){
  if (!data.days?.length){ routineView.textContent = "No routine yet."; return; }
  const container = document.createElement('div');
  data.days.forEach(day=>{
    const items = (data.items?.[day]||[]).slice().sort((a,b)=> (a.time||"")<(b.time||"") ? -1:1);
    const dayEl = document.createElement('div'); dayEl.className='day'; dayEl.textContent=day;
    container.appendChild(dayEl);
    if (!items.length){ const none=document.createElement('div'); none.className='item'; none.textContent='—'; container.appendChild(none); }
    else{
      items.forEach(it=>{
        const [h,m] = (it.time||'00:00').split(':').map(Number);
        const ap = h>=12 ? 'PM':'AM';
        const hh = String(h%12||12).padStart(2,'0');
        const mm = String(m).padStart(2,'0');
        const line = document.createElement('div');
        line.className = 'item';
        line.textContent = `${hh}:${mm} ${ap} — ${it.name}`;
        container.appendChild(line);
      });
    }
  });
  routineView.innerHTML = ''; routineView.appendChild(container);
}

// open dialog
openRoutine?.addEventListener('click', async ()=>{
  editState=null; addClassBtn.style.display=''; updateClassBtn.style.display='none'; cancelEditBtn.style.display='none';
  const data = getRoutineFromCache();
  const set = new Set(data.days?.length ? data.days : WEEK_ORDER.slice(0,5));
  weekdayGrid.querySelectorAll('input[type="checkbox"]').forEach(cb=> cb.checked=set.has(cb.value));
  routineDay.innerHTML=''; Array.from(set).forEach(d=>{ const o=document.createElement('option'); o.value=d;o.textContent=d; routineDay.appendChild(o); });
  classNameInput.value=''; classTimeInput.value='';
  await renderDraft(data);
  weekdayGrid.onchange = async ()=>{
    const d = await getDialogState();
    routineDay.innerHTML=''; d.days.forEach(x=>{ const o=document.createElement('option'); o.value=x; o.textContent=x; routineDay.appendChild(o); });
    await renderDraft(d);
  };
  routineDialog.showModal();
});

async function getDialogState(){
  const days = Array.from(weekdayGrid.querySelectorAll('input[type="checkbox"]:checked')).map(c=>c.value);
  const data = getRoutineFromCache(); data.days = days.length ? days : []; return data;
}

async function renderDraft(data){
  const wrap = document.createElement('div');
  data.days.forEach(day=>{
    const items = (data.items?.[day]||[]).slice().sort((a,b)=> (a.time||'')<(b.time||'')?-1:1);
    const head = document.createElement('div'); head.style.fontWeight='700'; head.style.marginTop='8px'; head.textContent=day; wrap.appendChild(head);
    if (!items.length){ const none=document.createElement('div'); none.style.opacity=.8; none.textContent='—'; wrap.appendChild(none); return; }
    items.forEach(it=>{
      if (!it.id) it.id = uid();
      const [h,m] = (it.time||'00:00').split(':').map(Number);
      const ap = h>=12?'PM':'AM'; const hh=String(h%12||12).padStart(2,'0'); const mm=String(m).padStart(2,'0');
      const row=document.createElement('div'); row.style.display='flex'; row.style.justifyContent='space-between'; row.style.alignItems='center'; row.style.gap='8px';
      const left=document.createElement('span'); left.textContent=`${hh}:${mm} ${ap} — ${it.name}`;
      const actions=document.createElement('span'); actions.style.display='flex'; actions.style.gap='6px';
      const ebtn=document.createElement('button'); ebtn.type='button'; ebtn.textContent='Edit'; ebtn.dataset.action='edit'; ebtn.dataset.day=day; ebtn.dataset.id=it.id;
      const dbtn=document.createElement('button'); dbtn.type='button'; dbtn.textContent='Delete'; dbtn.dataset.action='delete'; dbtn.dataset.day=day; dbtn.dataset.id=it.id; dbtn.style.color='var(--danger)';
      actions.append(ebtn,dbtn); row.append(left,actions); wrap.appendChild(row);
    });
  });
  routineDraft.innerHTML=''; routineDraft.appendChild(wrap);
  setRoutineCache(data); // persist draft to cache too
}

routineDraft.addEventListener('click', async (e)=>{
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
   Init (FAST first, then cloud)
========================= */
window.addEventListener('DOMContentLoaded', ()=>{
  // 1) FAST: show cached immediately
  loadHeaderFromCache();
  loadPhotoFromCache();
  loadNotesFromCache();
  renderRoutineViewFast();
  loadEventsFromCache();

  // 2) Then fetch from cloud in background and refresh
  // (no blocking UI)
  (async ()=>{
    await Promise.all([
      syncHeaderFromCloud(),
      syncPhotoFromCloud(),
      syncNotesFromCloud(),
      syncRoutineFromCloud(),
      syncEventsFromCloud()
    ]);
  })();
});
