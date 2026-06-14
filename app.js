/* ============================================================
   AV AGENDA — App Logic
   Anderson Vale | Cirurgião-Dentista | CRO-PI 006903
   ============================================================ */

'use strict';

// ── CONSTANTS ──────────────────────────────────────────────
const PROCEDURES = [
  'Consulta / Avaliação','Limpeza / Profilaxia','Restauração / Obturação',
  'Extração','Tratamento de Canal','Clareamento Dental',
  'Aparelho Ortodôntico','Implante Dentário','Prótese Dentária',
  'Cirurgia Oral','Retorno','Outro',
];
const STATUS_LABELS = {
  scheduled:'Agendado', confirmed:'Confirmado',
  completed:'Concluído', cancelled:'Cancelado', noshow:'Não Compareceu',
};
const THEMES = ['navy','light','blue','dark','white'];
const THEME_LABELS = {navy:'Navy',light:'Claro',blue:'Azul',dark:'Dark',white:'Branco'};
const DAYS_PT = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
const MONTHS_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const STORAGE_KEY = 'av_appointments';
const SETTINGS_KEY = 'av_settings';

// ── STATE ──────────────────────────────────────────────────
let state = {
  view: 'today',
  appointments: [],
  theme: 'navy',
  notificationsEnabled: false,
  workStart: 8,
  workEnd: 18,
  summaryTime: 8,
  selectedDate: today(),
  currentMonth: new Date(),
  currentWeek: startOfWeek(new Date()),
  modalType: null,    // 'add'|'edit'|'detail'|'patient'
  editId: null,
  detailId: null,
  patientName: null,
  monthSelectedDate: null,
  formPrefillDate: null,
  searchQuery: '',
  pendingCount: 0,
  notifTimers: [],
};

// ── HELPERS ────────────────────────────────────────────────
function today() { return dateKey(new Date()); }
function dateKey(d) { return d.toISOString().split('T')[0]; }
function startOfWeek(d) {
  const r = new Date(d);
  const day = r.getDay();
  r.setDate(r.getDate() - day);
  r.setHours(0,0,0,0);
  return r;
}
function addDays(d, n) { const r=new Date(d); r.setDate(r.getDate()+n); return r; }
function addWeeks(d, n) { return addDays(d, n*7); }
function parseDate(s) { const [y,m,d]=s.split('-'); return new Date(y,m-1,d); }
function fmtDate(s) {
  if (!s) return '';
  const d = parseDate(s);
  return `${d.getDate()} de ${MONTHS_PT[d.getMonth()].substring(0,3)} ${d.getFullYear()}`;
}
function fmtDateShort(s) {
  if (!s) return '';
  const d = parseDate(s);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
}
function fmtTime(t) { return t || ''; }
function endTime(startTime, duration) {
  if (!startTime || !duration) return '';
  const [h,m] = startTime.split(':').map(Number);
  const total = h*60+m+parseInt(duration);
  return `${String(Math.floor(total/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`;
}
function uid() { return Date.now().toString(36)+Math.random().toString(36).substr(2,6); }
function getInitials(name) {
  if (!name) return '?';
  return name.trim().split(/\s+/).slice(0,2).map(w=>w[0].toUpperCase()).join('');
}
function isoNow() { return new Date().toISOString(); }
function minutesUntil(dateStr, timeStr) {
  if (!dateStr || !timeStr) return Infinity;
  const [h,m] = timeStr.split(':').map(Number);
  const target = parseDate(dateStr);
  target.setHours(h, m, 0, 0);
  return (target - new Date()) / 60000;
}
function avatarColor(name) {
  const colors = ['#2D4464','#7099B8','#5c84a3','#3a5278','#4d7a9b'];
  if (!name) return colors[0];
  return colors[name.charCodeAt(0) % colors.length];
}

// ── STORAGE ────────────────────────────────────────────────
function loadAll() {
  try {
    const a = localStorage.getItem(STORAGE_KEY);
    state.appointments = a ? JSON.parse(a) : [];
  } catch { state.appointments = []; }
  try {
    const s = localStorage.getItem(SETTINGS_KEY);
    if (s) {
      const p = JSON.parse(s);
      state.theme = p.theme || 'navy';
      state.notificationsEnabled = p.notificationsEnabled || false;
      state.workStart = p.workStart ?? 8;
      state.workEnd = p.workEnd ?? 18;
      state.summaryTime = p.summaryTime ?? 8;
    }
  } catch {}
}
function saveAppointments() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.appointments));
}
function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({
    theme: state.theme,
    notificationsEnabled: state.notificationsEnabled,
    workStart: state.workStart,
    workEnd: state.workEnd,
    summaryTime: state.summaryTime,
  }));
}

// ── APPOINTMENT CRUD ───────────────────────────────────────
function getApptById(id) { return state.appointments.find(a=>a.id===id); }
function apptsByDate(dateStr) {
  return state.appointments
    .filter(a=>a.date===dateStr)
    .sort((a,b)=>a.startTime.localeCompare(b.startTime));
}
function apptsByWeek(weekStart) {
  const keys = Array.from({length:7},(_,i)=>dateKey(addDays(weekStart,i)));
  return state.appointments.filter(a=>keys.includes(a.date));
}
function saveAppt(data) {
  const now = isoNow();
  if (data.id) {
    const i = state.appointments.findIndex(a=>a.id===data.id);
    if (i>-1) { state.appointments[i] = {...state.appointments[i], ...data, updatedAt:now}; }
  } else {
    state.appointments.push({...data, id:uid(), status:'scheduled', createdAt:now, updatedAt:now});
  }
  saveAppointments();
  scheduleNotifications();
  updatePendingCount();
}
function deleteAppt(id) {
  state.appointments = state.appointments.filter(a=>a.id!==id);
  saveAppointments();
  updatePendingCount();
}
function updateStatus(id, status) {
  const a = getApptById(id);
  if (a) { a.status = status; a.updatedAt = isoNow(); saveAppointments(); }
  updatePendingCount();
}
function uniquePatients() {
  const map = {};
  state.appointments.forEach(a=>{
    const k = a.patientName?.toLowerCase();
    if (!k) return;
    if (!map[k]) map[k] = {name:a.patientName, phone:a.patientPhone, count:0, last:''};
    map[k].count++;
    if (!map[k].last || a.date>map[k].last) map[k].last = a.date;
  });
  return Object.values(map).sort((a,b)=>a.name.localeCompare(b.name));
}
function patientHistory(name) {
  return state.appointments
    .filter(a=>a.patientName?.toLowerCase()===name?.toLowerCase())
    .sort((a,b)=>b.date.localeCompare(a.date)||b.startTime.localeCompare(a.startTime));
}
function updatePendingCount() {
  const t = today();
  state.pendingCount = state.appointments.filter(a=>a.date===t&&(a.status==='scheduled'||a.status==='confirmed')).length;
  const badge = document.querySelector('.nav-btn-badge');
  if (badge) { badge.textContent = state.pendingCount; badge.style.display = state.pendingCount ? 'block' : 'none'; }
}

// ── NOTIFICATIONS ──────────────────────────────────────────
async function requestNotifications() {
  if (!('Notification' in window)) {
    showToast('Notificações não suportadas neste navegador', 3500);
    return;
  }
  // Already denied — guide user to browser settings
  if (Notification.permission === 'denied') {
    showToast('Notificações bloqueadas. Vá em Configurações do navegador → Site → Permissões.', 5000);
    return;
  }
  // Already granted — just enable
  if (Notification.permission === 'granted') {
    state.notificationsEnabled = true;
    saveSettings();
    scheduleNotifications();
    showToast('Notificações já estão ativas!');
    renderSettings();
    return;
  }
  // Request permission — handle both Promise and callback APIs
  let perm;
  try {
    perm = await Notification.requestPermission();
  } catch {
    perm = await new Promise(resolve => Notification.requestPermission(resolve));
  }
  state.notificationsEnabled = perm === 'granted';
  saveSettings();
  if (state.notificationsEnabled) {
    scheduleNotifications();
    showToast('Notificações ativadas!');
    // Confirmation notification so user knows it worked
    setTimeout(() => {
      try {
        new Notification('✅ AV Agenda ativada', {
          body: 'Você será avisado 30 e 15 min antes de cada consulta.',
          icon: '/icons/icon-192.png',
          tag: 'av-confirm',
        });
      } catch {}
    }, 400);
  } else {
    showToast('Permissão negada. Ative nas configurações do navegador.', 4000);
  }
  renderSettings();
}
function clearNotifTimers() { state.notifTimers.forEach(t=>clearTimeout(t)); state.notifTimers=[]; }
function scheduleNotifications() {
  if (!state.notificationsEnabled) return;
  clearNotifTimers();
  const now = new Date();
  state.appointments.forEach(a=>{
    if (a.status==='cancelled'||a.status==='completed'||a.status==='noshow') return;
    const mins = minutesUntil(a.date, a.startTime);
    [30, 15, 0].forEach(before=>{
      const delay = (mins - before) * 60000;
      if (delay > 0 && delay < 86400000) {
        const t = setTimeout(()=>fireNotif(a, before), delay);
        state.notifTimers.push(t);
      }
    });
  });
  scheduleDailySummary();
}
function fireNotif(appt, minutesBefore) {
  const a = getApptById(appt.id);
  if (!a || a.status==='cancelled'||a.status==='completed') return;
  let title, body;
  if (minutesBefore===0) {
    title = `⏰ Agora: ${a.patientName}`;
    body = `${a.procedure} — ${a.startTime}`;
  } else {
    title = `🦷 Em ${minutesBefore} min: ${a.patientName}`;
    body = `${a.procedure} às ${a.startTime}`;
  }
  new Notification(title, {body, icon:'/icons/icon-192.png', badge:'/icons/icon-192.png', tag:`appt-${a.id}-${minutesBefore}`});
}
function scheduleDailySummary() {
  const now = new Date();
  const target = new Date();
  target.setHours(state.summaryTime, 0, 0, 0);
  if (target <= now) target.setDate(target.getDate()+1);
  const delay = target - now;
  if (delay < 86400000) {
    const t = setTimeout(fireDailySummary, delay);
    state.notifTimers.push(t);
  }
}
function fireDailySummary() {
  const t = today();
  const list = apptsByDate(t);
  if (!state.notificationsEnabled) return;
  const title = `📋 Agenda de hoje — ${list.length} atendimento${list.length!==1?'s':''}`;
  const body = list.length ? list.slice(0,3).map(a=>`${a.startTime} ${a.patientName}`).join('\n') : 'Nenhum agendamento para hoje.';
  new Notification(title, {body, icon:'/icons/icon-192.png', tag:'daily-summary'});
  scheduleDailySummary();
}

// ── THEME ──────────────────────────────────────────────────
function applyTheme(t) {
  state.theme = t;
  document.body.className = `theme-${t}`;
  // All headers are navy (#2D4464) — only dark theme has black header
  const themeColors = {navy:'#2D4464',light:'#2D4464',blue:'#2D4464',dark:'#0A0A0A',white:'#2D4464'};
  document.querySelector('meta[name="theme-color"]').content = themeColors[t];
  // Icon on navy/dark/blue headers: use white cone; on any header use the appropriate variant
  const icon = document.querySelector('.hdr-logo-icon');
  if (icon) {
    // All themes now have dark headers — use white-transparent icon which shows on dark backgrounds
    const map = {
      navy:  'icon-white.png',  // white cone on navy header
      light: 'icon-light.png',  // gray/white cone on navy header
      blue:  'icon-white.png',  // white cone on navy header
      dark:  'icon-white.png',  // white cone on black header
      white: 'icon-light.png',  // gray/white cone on navy header
    };
    icon.src = `icons/${map[t]||'icon-white.png'}`;
  }
  saveSettings();
  renderSettingsThemePicker();
  updateInstallIcon();
}

// ── TOAST ──────────────────────────────────────────────────
function showToast(msg, duration=2500) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(()=>el.classList.remove('show'), duration);
}

// ── RENDER SYSTEM ──────────────────────────────────────────
function switchView(v) {
  state.view = v;
  // nav
  document.querySelectorAll('.nav-btn,.sb-item').forEach(b=>{
    b.classList.toggle('active', b.dataset.view===v);
  });
  renderView();
}
function renderView() {
  const main = document.getElementById('main-content');
  main.innerHTML = `<div class="view-wrap fade-in" id="view-wrap"></div>`;
  const wrap = document.getElementById('view-wrap');
  const renders = {today:renderToday, week:renderWeek, month:renderMonth, patients:renderPatients, settings:renderSettings};
  (renders[state.view]||renderToday)(wrap);
  updatePendingCount();
}
function renderHeader() {
  const now = new Date();
  const dow = DAYS_PT[now.getDay()];
  const dateStr = `${now.getDate()} ${MONTHS_PT[now.getMonth()].substring(0,3)}`;
  document.getElementById('hdr-dow').textContent = dow;
  document.getElementById('hdr-date').textContent = dateStr;
}

// ── TODAY VIEW ─────────────────────────────────────────────
function renderToday(wrap) {
  const dateStr = state.selectedDate;
  const appts = apptsByDate(dateStr);
  const dateObj = parseDate(dateStr);
  const isToday = dateStr === today();
  const totalCount = appts.length;
  const confirmedCount = appts.filter(a=>a.status==='confirmed').length;
  const doneCount = appts.filter(a=>a.status==='completed').length;
  const pendingCount = appts.filter(a=>a.status==='scheduled'||a.status==='confirmed').length;

  // Find next upcoming
  const now = new Date();
  const upcoming = isToday ? appts.find(a=>{
    if (a.status==='cancelled'||a.status==='completed'||a.status==='noshow') return false;
    return minutesUntil(a.date,a.startTime) > -10;
  }) : null;

  wrap.innerHTML = `
    <div class="today-topbar">
      <div>
        <div class="today-title">${isToday?'Hoje':DAYS_PT[dateObj.getDay()]}</div>
        <div class="today-sub">${dateStr===today()?`${DAYS_PT[dateObj.getDay()]}, ${dateObj.getDate()} de ${MONTHS_PT[dateObj.getMonth()]}`:fmtDate(dateStr)}</div>
      </div>
      <div class="date-nav">
        <button class="date-nav-btn" id="prev-day" title="Dia anterior">
          ${iconSVG('chevron-left')}
        </button>
        <button class="date-nav-btn" id="today-btn" title="Hoje" style="${isToday?'opacity:.4':''}" ${isToday?'disabled':''}>
          ${iconSVG('calendar')}
        </button>
        <button class="date-nav-btn" id="next-day" title="Próximo dia">
          ${iconSVG('chevron-right')}
        </button>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-v">${totalCount}</div>
        <div class="stat-l">Total</div>
      </div>
      <div class="stat-card">
        <div class="stat-v accent">${pendingCount}</div>
        <div class="stat-l">Pendentes</div>
      </div>
      <div class="stat-card">
        <div class="stat-v" style="color:var(--s-confirmed)">${confirmedCount}</div>
        <div class="stat-l">Confirm.</div>
      </div>
      <div class="stat-card">
        <div class="stat-v" style="color:var(--s-completed)">${doneCount}</div>
        <div class="stat-l">Concluídos</div>
      </div>
    </div>

    ${upcoming ? `
    <div class="next-banner show" id="next-banner">
      <div class="nb-label">Próximo atendimento</div>
      <div class="nb-name">${upcoming.patientName}</div>
      <div class="nb-meta">${upcoming.procedure}</div>
      <div class="nb-time">${upcoming.startTime}</div>
    </div>` : ''}

    ${isToday ? renderWeekMiniBar() : ''}

    <div class="sec-hdr mt-md">
      <span class="sec-title">Agenda do dia</span>
      <button class="sec-link" id="add-from-today">+ Novo</button>
    </div>

    ${appts.length === 0
      ? `<div class="empty">
          ${iconSVG('calendar-empty',60)}
          <div class="empty-title">Sem agendamentos</div>
          <div class="empty-sub">Nenhum atendimento para ${isToday?'hoje':fmtDate(dateStr)}. Adicione um novo!</div>
          <button class="empty-btn" id="empty-add">+ Novo Agendamento</button>
        </div>`
      : buildTimeline(appts)
    }
  `;

  wrap.querySelector('#prev-day')?.addEventListener('click',()=>{
    state.selectedDate = dateKey(addDays(parseDate(state.selectedDate),-1));
    renderView();
  });
  wrap.querySelector('#next-day')?.addEventListener('click',()=>{
    state.selectedDate = dateKey(addDays(parseDate(state.selectedDate),1));
    renderView();
  });
  wrap.querySelector('#today-btn')?.addEventListener('click',()=>{
    state.selectedDate = today();
    renderView();
  });
  wrap.querySelector('#add-from-today')?.addEventListener('click',()=>openModal('add', {date:state.selectedDate}));
  wrap.querySelector('#empty-add')?.addEventListener('click',()=>openModal('add', {date:state.selectedDate}));

  bindApptCards(wrap);
}

function renderWeekMiniBar() {
  const ws = startOfWeek(new Date());
  const days = Array.from({length:7},(_,i)=>dateKey(addDays(ws,i)));
  const max = Math.max(1, ...days.map(d=>apptsByDate(d).length));
  return `
    <div class="summary-banner">
      <div class="sb-title">Esta semana</div>
      <div class="sb-week-bars">
        ${days.map((d,i)=>{
          const cnt = apptsByDate(d).length;
          const pct = Math.round((cnt/max)*100);
          const isT = d===today();
          return `<div class="sb-bar-col">
            <div class="sb-bar-cnt">${cnt||''}</div>
            <div class="sb-bar-wrap">
              <div class="sb-bar-fill" style="height:${pct}%;${isT?'background:var(--s-confirmed)':''}"></div>
            </div>
            <div class="sb-bar-lbl" style="${isT?'font-weight:700;color:var(--tx1)':''}">${DAYS_PT[i].substring(0,1)}</div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
}

function buildTimeline(appts) {
  const start = state.workStart;
  const end = state.workEnd;
  let html = '<div class="timeline">';
  // Build slots
  const slots = {};
  appts.forEach(a=>{
    const h = parseInt(a.startTime?.split(':')[0]||start);
    if (!slots[h]) slots[h]=[];
    slots[h].push(a);
  });
  // Include work hours + any outside
  const allHours = [...new Set([...Array.from({length:end-start+1},(_,i)=>start+i),...Object.keys(slots).map(Number)])].sort((a,b)=>a-b);
  allHours.forEach(h=>{
    const slotAppts = slots[h]||[];
    html+=`<div class="tl-slot">
      <div class="tl-hour">${String(h).padStart(2,'0')}:00</div>
      <div class="tl-content">
        ${slotAppts.map((a,i)=>buildApptCard(a,i)).join('')}
      </div>
    </div>`;
  });
  html+='</div>';
  return html;
}

function buildApptCard(a, idx=0) {
  const dur = a.duration ? `${a.duration}min` : '';
  const end = endTime(a.startTime, a.duration);
  return `<div class="appt-card anim-delay-${Math.min(idx,4)}" data-id="${a.id}" data-s="${a.status}">
    <div class="ac-top">
      <div class="ac-patient">${a.patientName||'Paciente'}</div>
      <span class="ac-badge badge-${a.status}">${STATUS_LABELS[a.status]||a.status}</span>
    </div>
    <div class="ac-meta">
      <span class="ac-meta-item">${iconSVG('clock',13)} ${a.startTime}${end?' – '+end:''}</span>
      <span class="ac-meta-item">${iconSVG('tooth',13)} ${a.procedure||'—'}</span>
      ${dur?`<span class="ac-meta-item">${iconSVG('timer',13)} ${dur}</span>`:''}
      ${a.patientPhone?`<span class="ac-meta-item">${iconSVG('phone',13)} ${a.patientPhone}</span>`:''}
    </div>
    ${a.notes?`<div style="margin-top:5px;font-size:12px;color:var(--tx3);font-style:italic">${a.notes}</div>`:''}
    <div class="ac-actions">
      <button class="ac-btn" data-action="detail" data-id="${a.id}">${iconSVG('eye',13)} Ver</button>
      <button class="ac-btn" data-action="edit" data-id="${a.id}">${iconSVG('edit',13)} Editar</button>
      ${a.status==='scheduled'?`<button class="ac-btn ok" data-action="confirm" data-id="${a.id}">${iconSVG('check',13)} Confirmar</button>`:''}
      ${(a.status==='scheduled'||a.status==='confirmed')?`<button class="ac-btn done" data-action="complete" data-id="${a.id}">${iconSVG('check-circle',13)} Concluir</button>`:''}
      ${a.patientPhone?`<button class="ac-btn" data-action="call" data-id="${a.id}">${iconSVG('phone',13)} Ligar</button>`:''}
      <button class="ac-btn bad" data-action="cancel" data-id="${a.id}">${iconSVG('x',13)} Cancelar</button>
    </div>
  </div>`;
}

function bindApptCards(wrap) {
  wrap.querySelectorAll('[data-action]').forEach(btn=>{
    btn.addEventListener('click', e=>{
      e.stopPropagation();
      const {action, id} = btn.dataset;
      if (action==='detail') openModal('detail',{id});
      else if (action==='edit') openModal('edit',{id});
      else if (action==='confirm') { updateStatus(id,'confirmed'); renderView(); showToast('Consulta confirmada!'); }
      else if (action==='complete') { updateStatus(id,'completed'); renderView(); showToast('Consulta concluída!'); }
      else if (action==='cancel') { if(confirm('Cancelar este agendamento?')){ updateStatus(id,'cancelled'); renderView(); showToast('Agendamento cancelado.'); } }
      else if (action==='call') { const a=getApptById(id); if(a?.patientPhone) window.open(`tel:${a.patientPhone}`); }
    });
  });
  wrap.querySelectorAll('.appt-card').forEach(card=>{
    card.addEventListener('click', ()=>openModal('detail',{id:card.dataset.id}));
  });
}

// ── WEEK VIEW ──────────────────────────────────────────────
function renderWeek(wrap) {
  const ws = state.currentWeek;
  const days = Array.from({length:7},(_,i)=>addDays(ws,i));
  const t = today();
  const weekLabel = `${days[0].getDate()} ${MONTHS_PT[days[0].getMonth()].substr(0,3)} – ${days[6].getDate()} ${MONTHS_PT[days[6].getMonth()].substr(0,3)} ${days[6].getFullYear()}`;

  wrap.innerHTML = `
    <div class="week-hdr">
      <div class="week-title">${weekLabel}</div>
      <div class="date-nav">
        <button class="date-nav-btn" id="prev-week">${iconSVG('chevron-left')}</button>
        <button class="date-nav-btn" id="cur-week">${iconSVG('calendar')}</button>
        <button class="date-nav-btn" id="next-week">${iconSVG('chevron-right')}</button>
      </div>
    </div>
    <div class="week-grid">
      ${days.map((d,i)=>{
        const dk = dateKey(d);
        const appts = apptsByDate(dk).slice(0,5);
        const extra = Math.max(0, apptsByDate(dk).length - appts.length);
        return `<div class="week-col">
          <div class="week-day-hdr${dk===t?' today':''}" data-date="${dk}">
            <span class="wdh-dow">${DAYS_PT[d.getDay()].substr(0,1)}</span>
            <span class="wdh-num">${d.getDate()}</span>
          </div>
          <div class="week-chips">
            ${appts.map(a=>`<div class="wchip wchip-${a.status}" data-id="${a.id}" title="${a.startTime} ${a.patientName}">${a.startTime} ${a.patientName}</div>`).join('')}
            ${extra?`<div class="wchip-more">+${extra}</div>`:''}
          </div>
        </div>`;
      }).join('')}
    </div>

    <div class="divider"></div>
    <div id="week-day-detail"></div>
  `;

  wrap.querySelector('#prev-week').addEventListener('click',()=>{state.currentWeek=addWeeks(state.currentWeek,-1);renderView();});
  wrap.querySelector('#next-week').addEventListener('click',()=>{state.currentWeek=addWeeks(state.currentWeek,1);renderView();});
  wrap.querySelector('#cur-week').addEventListener('click',()=>{state.currentWeek=startOfWeek(new Date());renderView();});

  wrap.querySelectorAll('.week-day-hdr').forEach(h=>{
    h.addEventListener('click',()=>{
      state.selectedDate=h.dataset.date;
      state.view='today';
      switchView('today');
    });
  });
  wrap.querySelectorAll('.wchip[data-id]').forEach(c=>{
    c.addEventListener('click',e=>{e.stopPropagation();openModal('detail',{id:c.dataset.id});});
  });
}

// ── MONTH VIEW ─────────────────────────────────────────────
function renderMonth(wrap) {
  const cm = state.currentMonth;
  const year = cm.getFullYear();
  const month = cm.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const t = today();
  const sel = state.monthSelectedDate;

  let cells = [];
  // prev month padding
  const prevDays = new Date(year, month, 0).getDate();
  for (let i=firstDay-1; i>=0; i--) cells.push({date:dateKey(new Date(year,month-1,prevDays-i)),other:true});
  // this month
  for (let d=1; d<=daysInMonth; d++) cells.push({date:dateKey(new Date(year,month,d)),other:false});
  // next month padding
  while (cells.length%7!==0) { const next=cells.length-firstDay-daysInMonth+1; cells.push({date:dateKey(new Date(year,month+1,next)),other:true}); }

  wrap.innerHTML = `
    <div class="month-hdr">
      <div class="month-title">${MONTHS_PT[month]} ${year}</div>
      <div class="date-nav">
        <button class="date-nav-btn" id="prev-month">${iconSVG('chevron-left')}</button>
        <button class="date-nav-btn" id="cur-month">${iconSVG('calendar')}</button>
        <button class="date-nav-btn" id="next-month">${iconSVG('chevron-right')}</button>
      </div>
    </div>
    <div class="month-wdays">${DAYS_PT.map(d=>`<div class="mwd">${d.substr(0,1)}</div>`).join('')}</div>
    <div class="month-grid">
      ${cells.map(({date,other})=>{
        const appts = apptsByDate(date);
        const dots = [...new Set(appts.map(a=>a.status))].slice(0,4);
        return `<div class="mday${other?' other':''}${date===t?' today':''}${date===sel?' selected':''}" data-date="${date}">
          <div class="mday-num">${parseDate(date).getDate()}</div>
          ${dots.length?`<div class="mday-dots">${dots.map(s=>`<div class="mdot mdot-${s}"></div>`).join('')}</div>`:''}
        </div>`;
      }).join('')}
    </div>
    <div id="month-day-list"></div>
  `;

  wrap.querySelector('#prev-month').addEventListener('click',()=>{state.currentMonth=new Date(year,month-1,1);state.monthSelectedDate=null;renderView();});
  wrap.querySelector('#next-month').addEventListener('click',()=>{state.currentMonth=new Date(year,month+1,1);state.monthSelectedDate=null;renderView();});
  wrap.querySelector('#cur-month').addEventListener('click',()=>{state.currentMonth=new Date();state.monthSelectedDate=null;renderView();});

  wrap.querySelectorAll('.mday').forEach(d=>{
    d.addEventListener('click',()=>{
      state.monthSelectedDate = d.dataset.date;
      renderMonthDayList(d.dataset.date, wrap.querySelector('#month-day-list'));
      wrap.querySelectorAll('.mday').forEach(x=>x.classList.remove('selected'));
      d.classList.add('selected');
    });
  });

  if (sel) renderMonthDayList(sel, wrap.querySelector('#month-day-list'));
}

function renderMonthDayList(dateStr, container) {
  const appts = apptsByDate(dateStr);
  const dateObj = parseDate(dateStr);
  container.innerHTML = `
    <div class="month-day-list">
      <div class="sec-hdr mt-md">
        <span class="sec-title">${DAYS_PT[dateObj.getDay()]}, ${fmtDate(dateStr)}</span>
        <button class="sec-link" id="month-add-btn">+ Novo</button>
      </div>
      ${appts.length===0
        ? `<div style="text-align:center;padding:var(--sp-md);color:var(--tx3);font-size:13px">Sem agendamentos</div>`
        : appts.map((a,i)=>buildApptCard(a,i)).join('')
      }
    </div>`;
  container.querySelector('#month-add-btn')?.addEventListener('click',()=>openModal('add',{date:dateStr}));
  bindApptCards(container);
}

// ── PATIENTS VIEW ──────────────────────────────────────────
function renderPatients(wrap) {
  const q = state.searchQuery.toLowerCase();
  let patients = uniquePatients();
  if (q) patients = patients.filter(p=>p.name.toLowerCase().includes(q));

  wrap.innerHTML = `
    <div class="sec-hdr" style="margin-bottom:var(--sp-md)">
      <span class="today-title" style="font-size:20px">Pacientes</span>
      <span style="font-size:13px;color:var(--tx2)">${patients.length} paciente${patients.length!==1?'s':''}</span>
    </div>
    <div class="pat-search">
      ${iconSVG('search')}
      <input type="text" id="pat-search-inp" placeholder="Buscar paciente..." value="${state.searchQuery}">
    </div>
    <div class="pat-list">
      ${patients.length===0
        ? `<div class="empty">${iconSVG('users',50)}<div class="empty-title">${q?'Nenhum resultado':'Sem pacientes'}</div><div class="empty-sub">${q?'Tente outro nome.':'Adicione agendamentos para ver os pacientes aqui.'}</div></div>`
        : patients.map(p=>`
          <div class="pat-item" data-patient="${p.name}">
            <div class="pat-avatar" style="background:${avatarColor(p.name)}">${getInitials(p.name)}</div>
            <div class="pat-info">
              <div class="pat-name">${p.name}</div>
              <div class="pat-meta">${p.count} atendimento${p.count!==1?'s':''} · Último: ${fmtDateShort(p.last)}</div>
            </div>
            <div class="pat-acts">
              ${p.phone?`<button class="pat-act-btn" data-phone="${p.phone}" title="Ligar">${iconSVG('phone')}</button>`:''}
              <button class="pat-act-btn" data-patient-hist="${p.name}" title="Histórico">${iconSVG('clock')}</button>
              <button class="pat-act-btn" data-new-appt="${p.name}" data-phone="${p.phone||''}" title="Agendar">${iconSVG('calendar-plus')}</button>
            </div>
          </div>`).join('')
      }
    </div>
  `;

  wrap.querySelector('#pat-search-inp')?.addEventListener('input',e=>{
    state.searchQuery=e.target.value;
    renderPatients(wrap);
  });
  wrap.querySelectorAll('[data-phone]').forEach(b=>{
    b.addEventListener('click',e=>{e.stopPropagation(); if(b.dataset.phone) window.open(`tel:${b.dataset.phone}`);});
  });
  wrap.querySelectorAll('[data-patient-hist]').forEach(b=>{
    b.addEventListener('click',e=>{e.stopPropagation();openModal('patient',{name:b.dataset.patientHist});});
  });
  wrap.querySelectorAll('[data-new-appt]').forEach(b=>{
    b.addEventListener('click',e=>{e.stopPropagation();openModal('add',{patientName:b.dataset.newAppt,patientPhone:b.dataset.phone});});
  });
  wrap.querySelectorAll('.pat-item').forEach(item=>{
    item.addEventListener('click',()=>openModal('patient',{name:item.dataset.patient}));
  });
}

// ── SETTINGS VIEW ──────────────────────────────────────────
function renderSettings(wrap) {
  if (!wrap) wrap = document.getElementById('view-wrap');
  if (!wrap) return;
  wrap.innerHTML = `
    <div style="font-size:20px;font-weight:800;color:var(--tx1);margin-bottom:var(--sp-lg)">Configurações</div>

    <div class="set-section">
      <div class="set-section-title">Aparência</div>
      <div class="set-card">
        <div class="set-item" style="flex-direction:column;align-items:flex-start">
          <div class="set-lbl" style="margin-bottom:var(--sp-sm)">Tema</div>
          <div class="theme-picker" id="theme-picker">
            ${THEMES.map(t=>`
              <div class="theme-opt${state.theme===t?' sel':''}" data-theme="${t}">
                <div class="theme-sw sw-${t}"></div>
                <span class="theme-opt-lbl">${THEME_LABELS[t]}</span>
              </div>`).join('')}
          </div>
        </div>
      </div>
    </div>

    <div class="set-section">
      <div class="set-section-title">Notificações</div>
      <div class="set-card">
        <div class="set-item">
          <div class="set-item-l">
            <div class="set-icon">${iconSVG('bell')}</div>
            <div>
              <div class="set-lbl">Alertas de consulta</div>
              <div class="set-sub">30 e 15 min antes de cada atendimento${state.notificationsEnabled?' · Ativo ✅':' · Desativado'}</div>
            </div>
          </div>
          <div class="set-r" style="display:flex;gap:8px;align-items:center">
            ${state.notificationsEnabled?`<button class="ac-btn" id="test-notif-btn" style="white-space:nowrap">Testar</button>`:''}
            <div class="tog${state.notificationsEnabled?' on':''}" id="notif-tog"><div class="tog-thumb"></div></div>
          </div>
        </div>
        <div class="set-item">
          <div class="set-item-l">
            <div class="set-icon">${iconSVG('sun')}</div>
            <div>
              <div class="set-lbl">Resumo diário</div>
              <div class="set-sub">Notificação com agenda do dia</div>
            </div>
          </div>
          <div class="set-r">
            <select id="summary-time" style="width:100px">
              ${[6,7,8,9,10].map(h=>`<option value="${h}"${state.summaryTime===h?' selected':''}>${String(h).padStart(2,'0')}:00</option>`).join('')}
            </select>
          </div>
        </div>
      </div>
    </div>

    <div class="set-section">
      <div class="set-section-title">Horário de Trabalho</div>
      <div class="set-card">
        <div class="wh-row">
          <div class="form-group" style="margin:0">
            <label>Início</label>
            <select id="work-start">
              ${Array.from({length:14},(_,i)=>i+6).map(h=>`<option value="${h}"${state.workStart===h?' selected':''}>${String(h).padStart(2,'0')}:00</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="margin:0">
            <label>Fim</label>
            <select id="work-end">
              ${Array.from({length:14},(_,i)=>i+12).map(h=>`<option value="${h}"${state.workEnd===h?' selected':''}>${String(h).padStart(2,'0')}:00</option>`).join('')}
            </select>
          </div>
        </div>
      </div>
    </div>

    <div class="set-section">
      <div class="set-section-title">Dados</div>
      <div class="set-card">
        <div class="set-item">
          <div class="set-item-l">
            <div class="set-icon">${iconSVG('download')}</div>
            <div><div class="set-lbl">Exportar agenda</div><div class="set-sub">Salvar todos os agendamentos em JSON</div></div>
          </div>
          <button class="ac-btn" id="export-btn" style="flex:none">Exportar</button>
        </div>
        <div class="set-item">
          <div class="set-item-l">
            <div class="set-icon">${iconSVG('upload')}</div>
            <div><div class="set-lbl">Importar dados</div><div class="set-sub">Carregar agendamentos de um arquivo JSON</div></div>
          </div>
          <button class="ac-btn" id="import-btn" style="flex:none">Importar</button>
        </div>
        <div class="set-item">
          <div class="set-item-l">
            <div class="set-icon" style="background:rgba(231,76,60,.12);color:var(--s-cancelled)">${iconSVG('trash')}</div>
            <div><div class="set-lbl" style="color:var(--s-cancelled)">Limpar dados</div><div class="set-sub">Apagar todos os agendamentos</div></div>
          </div>
          <button class="ac-btn bad" id="clear-btn" style="flex:none">Limpar</button>
        </div>
      </div>
    </div>

    <div class="set-section">
      <div class="about-card">
        <img src="icons/icon-light.png" class="about-logo" alt="AV">
        <div class="about-name">Anderson Vale</div>
        <div class="about-cro">Cirurgião-Dentista · CRO-PI 006903</div>
        <div class="about-desc">Agenda profissional desenvolvida especialmente para organizar atendimentos, lembrar consultas e manter o histórico de cada paciente.</div>
        <div class="about-version">AV Agenda v1.0</div>
      </div>
    </div>

    <input type="file" id="import-file" accept=".json" style="display:none">
  `;

  wrap.querySelectorAll('.theme-opt').forEach(o=>{
    o.addEventListener('click',()=>{
      applyTheme(o.dataset.theme);
      renderSettingsThemePicker();
    });
  });
  wrap.querySelector('#notif-tog').addEventListener('click',()=>{
    if (!state.notificationsEnabled) requestNotifications();
    else { state.notificationsEnabled=false; saveSettings(); clearNotifTimers(); renderSettings(); showToast('Notificações desativadas'); }
  });
  wrap.querySelector('#test-notif-btn')?.addEventListener('click',()=>{
    if (!('Notification' in window) || Notification.permission !== 'granted') {
      showToast('Ative as notificações primeiro'); return;
    }
    try {
      new Notification('🦷 Teste — Anderson Vale Agenda', {
        body: 'Notificações funcionando corretamente!',
        icon: '/icons/icon-192.png',
        tag: 'av-test',
      });
      showToast('Notificação de teste enviada!');
    } catch(e) { showToast('Erro: ' + e.message, 4000); }
  });
  wrap.querySelector('#summary-time').addEventListener('change',e=>{state.summaryTime=parseInt(e.target.value);saveSettings();});
  wrap.querySelector('#work-start').addEventListener('change',e=>{state.workStart=parseInt(e.target.value);saveSettings();});
  wrap.querySelector('#work-end').addEventListener('change',e=>{state.workEnd=parseInt(e.target.value);saveSettings();});
  wrap.querySelector('#export-btn').addEventListener('click',exportData);
  wrap.querySelector('#import-btn').addEventListener('click',()=>wrap.querySelector('#import-file').click());
  wrap.querySelector('#import-file').addEventListener('change',importData);
  wrap.querySelector('#clear-btn').addEventListener('click',()=>{
    if(confirm('Apagar TODOS os agendamentos? Esta ação não pode ser desfeita.')){
      state.appointments=[];saveAppointments();renderView();showToast('Dados apagados.');
    }
  });
}
function renderSettingsThemePicker() {
  document.querySelectorAll('.theme-opt').forEach(o=>{
    o.classList.toggle('sel', o.dataset.theme===state.theme);
  });
}

// ── MODAL ──────────────────────────────────────────────────
function openModal(type, data={}) {
  state.modalType=type;
  const ovl = document.getElementById('modal-ovl');
  const sheet = document.getElementById('modal-sheet');
  if (!ovl||!sheet) return;

  if (type==='add') renderAddModal(data);
  else if (type==='edit') renderEditModal(data.id);
  else if (type==='detail') renderDetailModal(data.id);
  else if (type==='patient') renderPatientModal(data.name);

  ovl.classList.add('vis');
  requestAnimationFrame(()=>ovl.classList.add('vis'));
}
function closeModal() {
  const ovl=document.getElementById('modal-ovl');
  ovl?.classList.remove('vis');
  setTimeout(()=>{ if(document.getElementById('modal-sheet')) document.getElementById('modal-sheet').innerHTML='<div class="modal-handle"></div>'; }, 350);
}

function renderAddModal(prefill={}) {
  const sheet = document.getElementById('modal-sheet');
  const todayStr = today();
  const dateVal = prefill.date||todayStr;
  const quickDates = [
    {label:'Hoje', val:todayStr},
    {label:'Amanhã', val:dateKey(addDays(new Date(),1))},
    {label:DAYS_PT[addDays(new Date(),2).getDay()], val:dateKey(addDays(new Date(),2))},
    {label:DAYS_PT[addDays(new Date(),3).getDay()], val:dateKey(addDays(new Date(),3))},
  ];
  sheet.innerHTML = `
    <div class="modal-handle"></div>
    <div class="modal-hdr">
      <span class="modal-title">Novo Agendamento</span>
      <button class="modal-close" id="modal-close-btn">${iconSVG('x')}</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label>Paciente *</label>
        <div class="ac-wrap">
          <input type="text" id="f-patient" placeholder="Nome do paciente" value="${prefill.patientName||''}" autocomplete="off">
          <div class="ac-dropdown hidden" id="ac-drop"></div>
        </div>
      </div>
      <div class="form-group">
        <label>Telefone</label>
        <input type="tel" id="f-phone" placeholder="(00) 00000-0000" value="${prefill.patientPhone||''}">
      </div>
      <div class="form-group">
        <label>Procedimento *</label>
        <select id="f-proc">
          <option value="">Selecionar...</option>
          ${PROCEDURES.map(p=>`<option value="${p}"${prefill.procedure===p?' selected':''}>${p}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Data *</label>
        <div class="quick-dates">
          ${quickDates.map(q=>`<button type="button" class="chip-btn quick-dates${q.val===dateVal?' active':''}" data-qdate="${q.val}">${q.label}</button>`).join('')}
        </div>
        <input type="date" id="f-date" value="${dateVal}">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Horário *</label>
          <input type="time" id="f-time" value="${prefill.startTime||'08:00'}">
        </div>
        <div class="form-group">
          <label>Duração</label>
          <select id="f-dur">
            ${[15,20,30,45,60,90,120].map(d=>`<option value="${d}"${d===30?' selected':''}>${d} min</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>Observações</label>
        <textarea id="f-notes" placeholder="Anotações sobre o atendimento..." rows="2"></textarea>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-secondary" id="modal-cancel-btn">Cancelar</button>
      <button class="btn btn-primary" id="modal-save-btn">Salvar</button>
    </div>
  `;
  bindAddForm(sheet, null);
}

function renderEditModal(id) {
  const a = getApptById(id);
  if (!a) return;
  const sheet = document.getElementById('modal-sheet');
  sheet.innerHTML = `
    <div class="modal-handle"></div>
    <div class="modal-hdr">
      <span class="modal-title">Editar Agendamento</span>
      <button class="modal-close" id="modal-close-btn">${iconSVG('x')}</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label>Paciente *</label>
        <div class="ac-wrap">
          <input type="text" id="f-patient" value="${a.patientName||''}" autocomplete="off">
          <div class="ac-dropdown hidden" id="ac-drop"></div>
        </div>
      </div>
      <div class="form-group">
        <label>Telefone</label>
        <input type="tel" id="f-phone" value="${a.patientPhone||''}">
      </div>
      <div class="form-group">
        <label>Procedimento *</label>
        <select id="f-proc">
          ${PROCEDURES.map(p=>`<option value="${p}"${a.procedure===p?' selected':''}>${p}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Data *</label>
        <input type="date" id="f-date" value="${a.date}">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Horário *</label>
          <input type="time" id="f-time" value="${a.startTime||''}">
        </div>
        <div class="form-group">
          <label>Duração</label>
          <select id="f-dur">
            ${[15,20,30,45,60,90,120].map(d=>`<option value="${d}"${a.duration==d?' selected':''}>${d} min</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>Status</label>
        <select id="f-status">
          ${Object.entries(STATUS_LABELS).map(([v,l])=>`<option value="${v}"${a.status===v?' selected':''}>${l}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Observações</label>
        <textarea id="f-notes" rows="2">${a.notes||''}</textarea>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-danger" id="modal-delete-btn">Excluir</button>
      <button class="btn btn-secondary" id="modal-cancel-btn">Cancelar</button>
      <button class="btn btn-primary" id="modal-save-btn">Salvar</button>
    </div>
  `;
  bindAddForm(sheet, id);
  sheet.querySelector('#modal-delete-btn').addEventListener('click',()=>{
    if(confirm('Excluir este agendamento?')){ deleteAppt(id); closeModal(); renderView(); showToast('Agendamento excluído.'); }
  });
}

function bindAddForm(sheet, editId) {
  sheet.querySelector('#modal-close-btn').addEventListener('click', closeModal);
  sheet.querySelector('#modal-cancel-btn').addEventListener('click', closeModal);

  // Autocomplete
  const patInp = sheet.querySelector('#f-patient');
  const acDrop = sheet.querySelector('#ac-drop');
  patInp?.addEventListener('input',()=>{
    const q = patInp.value.toLowerCase().trim();
    if (!q) { acDrop.classList.add('hidden'); return; }
    const matches = uniquePatients().filter(p=>p.name.toLowerCase().includes(q)).slice(0,6);
    if (!matches.length) { acDrop.classList.add('hidden'); return; }
    acDrop.innerHTML = matches.map(p=>`<div class="ac-opt" data-name="${p.name}" data-phone="${p.phone||''}">${p.name}${p.phone?` <small style="opacity:.6">${p.phone}</small>`:''}</div>`).join('');
    acDrop.classList.remove('hidden');
    acDrop.querySelectorAll('.ac-opt').forEach(o=>{
      o.addEventListener('mousedown',e=>{
        e.preventDefault();
        patInp.value=o.dataset.name;
        const ph=sheet.querySelector('#f-phone');
        if(ph&&o.dataset.phone) ph.value=o.dataset.phone;
        acDrop.classList.add('hidden');
      });
    });
  });
  patInp?.addEventListener('blur',()=>setTimeout(()=>acDrop?.classList.add('hidden'),150));

  // Quick date buttons
  sheet.querySelectorAll('[data-qdate]').forEach(b=>{
    b.addEventListener('click',()=>{
      sheet.querySelector('#f-date').value=b.dataset.qdate;
      sheet.querySelectorAll('[data-qdate]').forEach(x=>x.classList.remove('active'));
      b.classList.add('active');
    });
  });

  sheet.querySelector('#modal-save-btn').addEventListener('click',()=>{
    const patient = sheet.querySelector('#f-patient').value.trim();
    const proc    = sheet.querySelector('#f-proc').value;
    const date    = sheet.querySelector('#f-date').value;
    const time    = sheet.querySelector('#f-time').value;
    if (!patient||!proc||!date||!time) { showToast('Preencha os campos obrigatórios'); return; }
    const data = {
      patientName: patient,
      patientPhone: sheet.querySelector('#f-phone').value.trim(),
      procedure: proc,
      date,
      startTime: time,
      duration: parseInt(sheet.querySelector('#f-dur').value)||30,
      notes: sheet.querySelector('#f-notes').value.trim(),
      status: sheet.querySelector('#f-status')?.value||'scheduled',
    };
    if (editId) data.id = editId;
    saveAppt(data);
    closeModal();
    state.selectedDate=date;
    if(state.view==='patients') renderView(); else switchView('today');
    showToast(editId?'Agendamento atualizado!':'Agendamento criado!');
  });
}

function renderDetailModal(id) {
  const a = getApptById(id);
  if (!a) return;
  const sheet = document.getElementById('modal-sheet');
  const end = endTime(a.startTime, a.duration);
  sheet.innerHTML = `
    <div class="modal-handle"></div>
    <div class="modal-hdr">
      <span class="modal-title">Detalhes</span>
      <button class="modal-close" id="modal-close-btn">${iconSVG('x')}</button>
    </div>
    <div class="detail-pat-hdr">
      <div class="detail-avatar" style="background:${avatarColor(a.patientName)}">${getInitials(a.patientName)}</div>
      <div>
        <div class="detail-pname">${a.patientName||'Paciente'}</div>
        <div class="detail-proc">${a.procedure||'—'}</div>
      </div>
    </div>
    <div class="detail-grid">
      <div class="detail-cell"><div class="detail-cell-lbl">Data</div><div class="detail-cell-val">${fmtDate(a.date)}</div></div>
      <div class="detail-cell"><div class="detail-cell-lbl">Horário</div><div class="detail-cell-val">${a.startTime}${end?' – '+end:''}</div></div>
      <div class="detail-cell"><div class="detail-cell-lbl">Duração</div><div class="detail-cell-val">${a.duration?a.duration+' min':'—'}</div></div>
      <div class="detail-cell"><div class="detail-cell-lbl">Telefone</div><div class="detail-cell-val">${a.patientPhone||'—'}</div></div>
    </div>
    ${a.notes?`<div style="padding:0 var(--sp-md) var(--sp-sm)"><div class="detail-cell-lbl">Observações</div><div style="font-size:14px;color:var(--tx2);margin-top:3px;line-height:1.5">${a.notes}</div></div>`:''}
    <div class="detail-status-row">
      <div class="set-section-title">Status</div>
      <div class="status-sel">
        ${Object.entries(STATUS_LABELS).map(([v,l])=>`<button class="st-btn ${v}${a.status===v?' active':''}" data-status="${v}">${l}</button>`).join('')}
      </div>
    </div>
    <div class="modal-foot">
      ${a.patientPhone?`<button class="btn btn-secondary" id="detail-call">${iconSVG('phone',16)} Ligar</button>`:''}
      <button class="btn btn-secondary" id="detail-edit">${iconSVG('edit',16)} Editar</button>
      <button class="btn btn-primary" id="detail-done">OK</button>
    </div>
  `;
  sheet.querySelector('#modal-close-btn').addEventListener('click',closeModal);
  sheet.querySelector('#detail-done').addEventListener('click',closeModal);
  sheet.querySelector('#detail-edit')?.addEventListener('click',()=>openModal('edit',{id}));
  sheet.querySelector('#detail-call')?.addEventListener('click',()=>window.open(`tel:${a.patientPhone}`));
  sheet.querySelectorAll('[data-status]').forEach(b=>{
    b.addEventListener('click',()=>{
      updateStatus(id, b.dataset.status);
      sheet.querySelectorAll('[data-status]').forEach(x=>x.classList.remove('active'));
      b.classList.add('active');
      renderView();
      showToast(`Status: ${STATUS_LABELS[b.dataset.status]}`);
    });
  });
}

function renderPatientModal(name) {
  const history = patientHistory(name);
  const phone = history[0]?.patientPhone||'';
  const total = history.length;
  const done = history.filter(a=>a.status==='completed').length;
  const miss = history.filter(a=>a.status==='noshow').length;
  const sheet = document.getElementById('modal-sheet');
  sheet.innerHTML = `
    <div class="modal-handle"></div>
    <div class="modal-hdr">
      <span class="modal-title">Histórico</span>
      <button class="modal-close" id="modal-close-btn">${iconSVG('x')}</button>
    </div>
    <div class="detail-pat-hdr">
      <div class="detail-avatar" style="background:${avatarColor(name)}">${getInitials(name)}</div>
      <div>
        <div class="detail-pname">${name}</div>
        <div class="detail-proc">${phone||'Sem telefone'}</div>
      </div>
    </div>
    <div class="pat-history-stats">
      <div class="detail-cell"><div class="detail-cell-lbl">Atendimentos</div><div class="detail-cell-val">${total}</div></div>
      <div class="detail-cell"><div class="detail-cell-lbl">Concluídos</div><div class="detail-cell-val" style="color:var(--s-confirmed)">${done}</div></div>
      <div class="detail-cell"><div class="detail-cell-lbl">Ausências</div><div class="detail-cell-val" style="color:var(--s-noshow)">${miss}</div></div>
    </div>
    <div style="padding:0 var(--sp-md) var(--sp-md)">
      <div class="sec-title" style="margin-bottom:var(--sp-sm)">Histórico de atendimentos</div>
      ${history.length===0
        ? `<div style="text-align:center;color:var(--tx3);font-size:13px;padding:var(--sp-md)">Sem histórico</div>`
        : history.map((a,i)=>`
          <div class="pat-item" style="margin-bottom:var(--sp-sm);cursor:pointer" data-id="${a.id}">
            <div style="flex:1">
              <div style="font-size:14px;font-weight:700;color:var(--tx1)">${a.procedure}</div>
              <div style="font-size:12px;color:var(--tx2)">${fmtDate(a.date)} · ${a.startTime}</div>
            </div>
            <span class="ac-badge badge-${a.status}" style="flex-shrink:0">${STATUS_LABELS[a.status]}</span>
          </div>`).join('')
      }
    </div>
    <div class="modal-foot">
      ${phone?`<button class="btn btn-secondary" id="ph-call">${iconSVG('phone',16)} Ligar</button>`:''}
      <button class="btn btn-primary" id="ph-new">+ Agendar</button>
    </div>
  `;
  sheet.querySelector('#modal-close-btn').addEventListener('click',closeModal);
  sheet.querySelector('#ph-call')?.addEventListener('click',()=>window.open(`tel:${phone}`));
  sheet.querySelector('#ph-new').addEventListener('click',()=>openModal('add',{patientName:name,patientPhone:phone}));
  sheet.querySelectorAll('[data-id]').forEach(item=>{
    item.addEventListener('click',()=>openModal('detail',{id:item.dataset.id}));
  });
}

// ── EXPORT / IMPORT ────────────────────────────────────────
function exportData() {
  const data = {appointments:state.appointments, exportedAt:isoNow(), version:'1.0'};
  const blob = new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href=url; a.download=`av-agenda-${today()}.json`; a.click();
  URL.revokeObjectURL(url);
  showToast('Dados exportados!');
}
function importData(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload=ev=>{
    try {
      const parsed = JSON.parse(ev.target.result);
      const appts = parsed.appointments||parsed;
      if (!Array.isArray(appts)) throw new Error('Formato inválido');
      if (confirm(`Importar ${appts.length} agendamento(s)? Isso vai juntar com os dados atuais.`)) {
        appts.forEach(a=>{ if(!state.appointments.find(x=>x.id===a.id)) state.appointments.push(a); });
        saveAppointments();
        renderView();
        showToast(`${appts.length} agendamentos importados!`);
      }
    } catch { showToast('Arquivo inválido.'); }
  };
  reader.readAsText(file);
  e.target.value='';
}

// ── ICONS ──────────────────────────────────────────────────
function iconSVG(name, size=20) {
  const s = `width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;
  const icons = {
    'calendar': `<svg ${s}><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
    'calendar-plus': `<svg ${s}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="12" y1="15" x2="12" y2="19"/><line x1="10" y1="17" x2="14" y2="17"/></svg>`,
    'calendar-empty': `<svg ${s}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
    'clock': `<svg ${s}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    'tooth': `<svg ${s}><path d="M12 2C9.8 2 8 4 8 6c0 3 1 5 2 7s1 4 2 4 1-2 2-4 2-4 2-7c0-2-1.8-4-4-4z"/><path d="M8 6C6 6 4 8 4 11c0 3 2 7 2 9h16c0-2 2-6 2-9 0-3-2-5-4-5"/></svg>`,
    'timer': `<svg ${s}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    'phone': `<svg ${s}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.27h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`,
    'check': `<svg ${s}><polyline points="20 6 9 17 4 12"/></svg>`,
    'check-circle': `<svg ${s}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
    'x': `<svg ${s}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    'edit': `<svg ${s}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
    'eye': `<svg ${s}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
    'plus': `<svg ${s}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
    'search': `<svg ${s}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
    'users': `<svg ${s}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    'settings': `<svg ${s}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
    'bell': `<svg ${s}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`,
    'sun': `<svg ${s}><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`,
    'download': `<svg ${s}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
    'upload': `<svg ${s}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`,
    'trash': `<svg ${s}><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`,
    'chevron-left': `<svg ${s}><polyline points="15 18 9 12 15 6"/></svg>`,
    'chevron-right': `<svg ${s}><polyline points="9 18 15 12 9 6"/></svg>`,
    'home': `<svg ${s}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
    'grid': `<svg ${s}><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>`,
  };
  return icons[name]||icons['calendar'];
}

// ── INSTALL PROMPT ─────────────────────────────────────────
let deferredPrompt = null;
const INSTALL_DISMISS_KEY = 'av_install_dismissed';
const ONBOARD_KEY = 'av_onboarded_v1';

function getInstallIcon() {
  const map = {navy:'icon-white.png',light:'icon-192.png',blue:'icon-white.png',dark:'icon-white.png',white:'icon-192.png'};
  return `icons/${map[state.theme]||'icon-192.png'}`;
}
function updateInstallIcon() {
  const el = document.getElementById('ip-icon');
  if (el) el.src = getInstallIcon();
}
function showInstallPrompt() {
  const el = document.getElementById('install-prompt');
  if (!el) return;
  updateInstallIcon();
  el.classList.add('show');
}
function hideInstallPrompt() {
  document.getElementById('install-prompt')?.classList.remove('show');
}

window.addEventListener('beforeinstallprompt', e=>{
  e.preventDefault();
  deferredPrompt=e;
  document.getElementById('install-btn')?.classList.remove('hidden');
  // Show install prompt if not recently dismissed and not in onboarding
  const dismissed = localStorage.getItem(INSTALL_DISMISS_KEY);
  const twoDaysAgo = Date.now() - 172800000;
  if (!dismissed || parseInt(dismissed) < twoDaysAgo) {
    // Delay to let onboarding appear first (onboarding shows at 800ms)
    const isFirstVisit = !localStorage.getItem(ONBOARD_KEY);
    setTimeout(showInstallPrompt, isFirstVisit ? 8000 : 3500);
  }
});
window.addEventListener('appinstalled', ()=>{
  hideInstallPrompt();
  deferredPrompt = null;
  document.getElementById('install-btn')?.classList.add('hidden');
  showToast('🎉 App instalado com sucesso!', 3500);
});

// ── ONBOARDING ──────────────────────────────────────────────
let _obStep = 0;
let _obTheme = 'navy';
const _TOTAL_OB_STEPS = 2;

function showOnboarding() {
  const ovl = document.getElementById('onboard-ovl');
  const sheet = document.getElementById('onboard-sheet');
  if (!ovl || !sheet) return;
  _obTheme = state.theme;
  _obStep = 1;
  _renderObStep(sheet, _obStep);
  requestAnimationFrame(()=> ovl.classList.add('vis'));
}
function closeOnboarding() {
  const ovl = document.getElementById('onboard-ovl');
  ovl?.classList.remove('vis');
  localStorage.setItem(ONBOARD_KEY, '1');
}
function _renderObStep(sheet, step) {
  const dots = Array.from({length:_TOTAL_OB_STEPS},(_,i)=>
    `<div class="ob-dot${i<step?' act':''}"></div>`).join('');

  if (step === 1) {
    sheet.innerHTML = `
      <div class="ob-handle"></div>
      <div class="ob-step ob-step-enter">
        <div class="ob-progress">${dots}</div>
        <div class="ob-icon ob-icon-bg">
          <img src="${getInstallIcon()}" alt="AV" id="ob-logo">
        </div>
        <div class="ob-title">Bem-vindo ao AV Agenda</div>
        <div class="ob-sub">Escolha o tema que mais combina com você — é possível mudar depois em Configurações.</div>
        <div class="ob-theme-grid" id="ob-theme-grid">
          ${THEMES.map(t=>`
            <div class="ob-theme-opt${_obTheme===t?' sel':''}" data-theme="${t}">
              <div class="ob-theme-sw sw-${t}"></div>
              <span class="ob-theme-lbl">${THEME_LABELS[t]}</span>
            </div>`).join('')}
        </div>
        <button class="ob-btn-primary" id="ob-next">Continuar →</button>
        <button class="ob-btn-secondary" id="ob-skip">Pular tudo</button>
      </div>`;

    sheet.querySelectorAll('.ob-theme-opt').forEach(o=>{
      o.addEventListener('click',()=>{
        _obTheme = o.dataset.theme;
        applyTheme(_obTheme);
        sheet.querySelectorAll('.ob-theme-opt').forEach(x=>x.classList.remove('sel'));
        o.classList.add('sel');
        const logo = sheet.querySelector('#ob-logo');
        if (logo) logo.src = getInstallIcon();
      });
    });
    sheet.querySelector('#ob-next').addEventListener('click',()=>{
      _obStep = 2; _renderObStep(sheet, 2);
    });
    sheet.querySelector('#ob-skip').addEventListener('click', closeOnboarding);

  } else if (step === 2) {
    sheet.innerHTML = `
      <div class="ob-handle"></div>
      <div class="ob-step ob-step-enter">
        <div class="ob-progress">${dots}</div>
        <div class="ob-icon" style="background:linear-gradient(135deg,#27AE60,#2ECC71);box-shadow:0 12px 32px rgba(39,174,96,.4);margin:0 auto var(--sp-lg)">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="position:relative;z-index:1">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
        </div>
        <div class="ob-title">Ativar lembretes?</div>
        <div class="ob-sub">Receba avisos antes de cada consulta e nunca perca um atendimento.</div>
        <div class="ob-notif-features">
          <div class="ob-feature"><span class="ob-feature-icon">⏰</span> Lembrete 30 min antes da consulta</div>
          <div class="ob-feature"><span class="ob-feature-icon">🔔</span> Lembrete 15 min antes da consulta</div>
          <div class="ob-feature"><span class="ob-feature-icon">📋</span> Resumo diário da agenda pela manhã</div>
        </div>
        <button class="ob-btn-primary" id="ob-notif-yes">🔔 Ativar Notificações</button>
        <button class="ob-btn-secondary" id="ob-notif-no">Não, obrigado</button>
      </div>`;

    sheet.querySelector('#ob-notif-yes').addEventListener('click', async ()=>{
      closeOnboarding();
      await requestNotifications();
    });
    sheet.querySelector('#ob-notif-no').addEventListener('click', closeOnboarding);
  }
}

// ── INIT ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', ()=>{
  loadAll();
  applyTheme(state.theme);
  renderHeader();
  renderView();

  // Nav buttons
  document.querySelectorAll('.nav-btn,.sb-item').forEach(btn=>{
    btn.addEventListener('click',()=>switchView(btn.dataset.view));
  });

  // FAB
  document.getElementById('fab-add')?.addEventListener('click',()=>openModal('add',{date:state.selectedDate}));

  // Modal overlay click-outside
  document.getElementById('modal-ovl')?.addEventListener('click',e=>{
    if(e.target===e.currentTarget) closeModal();
  });

  // Notification icon
  document.getElementById('btn-notify')?.addEventListener('click',()=>{
    switchView('settings');
  });

  // Install button (header)
  document.getElementById('install-btn')?.addEventListener('click',async()=>{
    if(!deferredPrompt) return;
    deferredPrompt.prompt();
    const {outcome} = await deferredPrompt.userChoice;
    if(outcome==='accepted') showToast('🎉 App instalado com sucesso!', 3000);
    deferredPrompt=null;
    document.getElementById('install-btn')?.classList.add('hidden');
  });

  // Install prompt card buttons
  document.getElementById('ip-install')?.addEventListener('click',async()=>{
    if(!deferredPrompt) { hideInstallPrompt(); return; }
    hideInstallPrompt();
    deferredPrompt.prompt();
    const {outcome} = await deferredPrompt.userChoice;
    deferredPrompt = null;
    document.getElementById('install-btn')?.classList.add('hidden');
    if(outcome==='accepted') showToast('🎉 App instalado com sucesso!', 3500);
  });
  document.getElementById('ip-dismiss')?.addEventListener('click',()=>{
    hideInstallPrompt();
    localStorage.setItem(INSTALL_DISMISS_KEY, Date.now().toString());
  });
  document.getElementById('ip-close')?.addEventListener('click',()=>{
    hideInstallPrompt();
    localStorage.setItem(INSTALL_DISMISS_KEY, Date.now().toString());
  });

  // Onboarding (first visit only)
  if (!localStorage.getItem(ONBOARD_KEY)) {
    setTimeout(showOnboarding, 900);
  }

  // Update header every minute
  setInterval(renderHeader, 60000);

  // Reschedule notifications whenever page becomes visible again (tab switch, lock screen, etc.)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      renderHeader();
      if (state.notificationsEnabled) scheduleNotifications();
    }
  });
  window.addEventListener('focus', () => {
    if (state.notificationsEnabled) scheduleNotifications();
  });
  window.addEventListener('pageshow', () => {
    if (state.notificationsEnabled) scheduleNotifications();
  });

  // Check notifications
  if('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').then(reg=>{
      console.log('SW registered');
    }).catch(e=>console.log('SW error',e));
  }

  // Handle URL params
  const params = new URLSearchParams(location.search);
  if(params.get('action')==='new') openModal('add',{});
  if(params.get('view')) switchView(params.get('view'));

  // Sync notification state with actual browser permission
  if ('Notification' in window) {
    if (Notification.permission !== 'granted') state.notificationsEnabled = false;
    else if (state.notificationsEnabled) scheduleNotifications();
  }
  updatePendingCount();
});
