function $(s){return document.querySelector(s)}

// Ajouter le header bypass-tunnel-reminder à toutes les requêtes
const originalFetch = window.fetch;
window.fetch = function(...args) {
  const options = args[1] || {};
  if (!options.headers) options.headers = {};
  options.headers['bypass-tunnel-reminder'] = 'true';
  return originalFetch.apply(this, [args[0], options]);
};

const form = $('#entry-form');
const chantierSelect = $('#chantier-select');
const chantierOther = $('#chantier-other');
const labelChantierOther = $('#label-chantier-other');
const dateInput = $('#date');
const hoursSelect = $('#hours-select');
const hoursOther = $('#hours-other');
const labelHoursOther = $('#label-hours-other');
const monthInput = $('#month');
const loadBtn = $('#load');
const exportBtn = $('#export');
const tbody = $('#table tbody');
const totalEl = $('#total');

const chantierForm = $('#chantier-form');
const chantierNameInput = $('#chantier-name');
const chantierList = $('#chantier-list');
const homeScreen = $('#home-screen');
const homeUserSelect = $('#home-user-select');
const enterBtn = $('#enter-btn');
const enterGuest = $('#enter-guest');
const appMain = $('#app-main');
const currentUserName = $('#current-user-name');
const homeBtn = $('#home-btn');
let activeUser = null;

const tabButtons = document.querySelectorAll('.tab-btn');
document.querySelector('.tab-btn[data-tab="recap-tab"]')?.addEventListener('click', ()=>{
  setTimeout(loadMonth, 80);
});

function switchTab(name){
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(name).classList.add('active');
  document.querySelector(`.tab-btn[data-tab="${name}"]`).classList.add('active');
}

tabButtons.forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));

document.querySelector('.tab-btn[data-tab="users-tab"]')?.addEventListener('click', ()=>{
  setTimeout(()=> { if (typeof loadUsers === 'function') loadUsers(); }, 80);
});

document.getElementById('reload-users')?.addEventListener('click', ()=>{ if (typeof loadUsers === 'function') loadUsers(); });

const usersTabBtn = document.querySelector('.tab-btn[data-tab="users-tab"]');
const userForm = document.getElementById('user-form');
const userNameInput = document.getElementById('user-name');
const userList = document.getElementById('user-list');
const reloadUsersBtn = document.getElementById('reload-users');
const userStatus = document.getElementById('user-status');

function showToast(message, type='success', title=''){
  const container = document.getElementById('toast-container');
  if (!container) return;
  const t = document.createElement('div');
  t.className = 'toast ' + (type === 'error' ? 'error' : 'success');
  if (title) {
    const dTitleElem = document.createElement('div');
    dTitleElem.className = 'title';
    dTitleElem.textContent = title;
    const dMsgElem = document.createElement('div');
    dMsgElem.className = 'msg';
    dMsgElem.textContent = message;
    t.appendChild(dTitleElem);
    t.appendChild(dMsgElem);
  } else {
    const dMsg = document.createElement('div');
    dMsg.className = 'msg';
    dMsg.textContent = message;
    t.appendChild(dMsg);
  }
  container.appendChild(t);
  requestAnimationFrame(()=> t.classList.add('show'));
  setTimeout(()=>{ t.classList.remove('show'); setTimeout(()=> t.remove(), 300); }, 3500);
}

chantierSelect.addEventListener('change', () => {
  if (chantierSelect.value === 'other') {
    labelChantierOther.style.display = 'block';
    chantierOther.focus();
  } else {
    labelChantierOther.style.display = 'none';
    chantierOther.value = '';
  }
});

hoursSelect.addEventListener('change', () => {
  if (hoursSelect.value === 'other') {
    labelHoursOther.style.display = 'block';
    hoursOther.focus();
  } else {
    labelHoursOther.style.display = 'none';
    hoursOther.value = '';
  }
});

async function addEntry(e){
  e.preventDefault();
  const month = monthInput.value || new Date().toISOString().slice(0,7);
  const body = {
    date: dateInput.value
  };
  let hoursVal = null;
  if (hoursSelect.value === 'other') {
    hoursVal = parseFloat(hoursOther.value);
    if (isNaN(hoursVal) || hoursVal <= 0) { showToast('Veuillez saisir le temps travaillé (heures)', 'error'); return }
  } else if (hoursSelect.value) {
    hoursVal = parseFloat(hoursSelect.value);
  } else {
    showToast('Veuillez choisir le temps travaillé', 'error');
    return;
  }
  body.hours = hoursVal;
  if (chantierSelect.value === 'other') {
    const other = (chantierOther.value || '').trim();
    if (!other) { showToast('Veuillez saisir le nom du chantier (autre)', 'error'); return }
    body.chantier = other;
  } else if (chantierSelect.value) {
    body.chantierId = parseInt(chantierSelect.value, 10);
  } else {
    showToast('Veuillez choisir un chantier ou sélectionner "Autre"', 'error');
    return;
  }

  if (activeUser) {
    body.userId = parseInt(activeUser, 10);
  } else {
    showToast('Aucun utilisateur actif — connectez-vous depuis l\'accueil', 'error');
    return;
  }

  const res = await fetch('/api/entries', {
    method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body)
  });
  if (!res.ok) { showToast('Erreur en ajoutant l\'entrée', 'error'); return }
  chantierSelect.value = '';
  chantierOther.value = '';
  labelChantierOther.style.display = 'none';
  dateInput.value = new Date().toISOString().slice(0,10);
  hoursSelect.value = '';
  hoursOther.value = '';
  labelHoursOther.style.display = 'none';
  showToast('Entrée ajoutée', 'success');
}

function showAppForUser(userId, userName){
  activeUser = userId ? String(userId) : '';
  if (currentUserName) currentUserName.textContent = userName || '—';
  if (homeScreen) homeScreen.style.display = 'none';
  if (appMain) appMain.style.display = '';
  const isAdmin = (userName || '').toLowerCase() === 'admin';
  if (usersTabBtn) usersTabBtn.style.display = isAdmin ? '' : 'none';
  const activeTab = document.querySelector('.tab.active')?.id || '';
  if (!isAdmin && activeTab === 'users-tab') switchTab('heures-tab');
  if (isAdmin) loadUsers();
}

async function refreshHomeUsers(){
  try {
    const res = await fetch('/api/users');
    if (!res.ok) return;
    const users = await res.json();
    if (homeUserSelect) {
      homeUserSelect.innerHTML = '<option value="">-- Choisir un utilisateur --</option>';
      users.forEach(u => { const o3 = document.createElement('option'); o3.value = String(u.id); o3.textContent = u.name; homeUserSelect.appendChild(o3); });
    }
  } catch (e) {}
}

async function loadUsers(){
  if (!userList) return;
  userList.innerHTML = '<li>Chargement...</li>';
  try {
    const res = await fetch('/api/users_with_counts');
    if (!res.ok) { userList.innerHTML = '<li>Erreur chargement</li>'; return }
    const users = await res.json();
    if (!users || users.length === 0) { userList.innerHTML = '<li>Aucun utilisateur</li>'; if (userStatus) userStatus.textContent = 'Aucun utilisateur trouvé.'; return }
    userList.innerHTML = '';
    users.forEach(u => {
      const li = document.createElement('li');
      const nameSpan = document.createElement('span');
      nameSpan.textContent = u.name;
      li.appendChild(nameSpan);
      li.appendChild(document.createTextNode(' '));
      if (typeof u.entries_count !== 'undefined') {
        const cnt = document.createElement('small'); cnt.style.marginLeft = '8px'; cnt.style.opacity = 0.8; cnt.textContent = `(${u.entries_count} entrées)`; li.appendChild(cnt);
      }
      const renameBtn = document.createElement('button'); renameBtn.textContent = 'Renommer';
      renameBtn.style.marginLeft = '8px';
      renameBtn.addEventListener('click', async ()=>{
        const newName = prompt('Nouveau nom pour ' + u.name, u.name);
        if (!newName || newName.trim() === '' || newName.trim() === u.name) return;
        const r = await fetch('/api/users/' + u.id, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ name: newName.trim() }) });
        if (r.ok) { showToast('Utilisateur renommé', 'success'); loadUsers(); refreshHomeUsers(); } else { const txt = await r.text(); showToast('Erreur renommage: ' + txt, 'error'); }
      });
      li.appendChild(renameBtn);

      const canDelete = (u.name.toLowerCase() !== 'admin') && (typeof u.entries_count === 'undefined' || u.entries_count === 0);
      if (canDelete) {
        const del = document.createElement('button'); del.textContent = 'Supprimer'; del.style.marginLeft = '8px';
        del.addEventListener('click', async ()=>{
          if (!confirm('Supprimer cet utilisateur ?')) return;
          const r = await fetch('/api/users/' + u.id, { method: 'DELETE' });
          if (r.ok) { showToast('Utilisateur supprimé', 'success'); loadUsers(); refreshHomeUsers(); } else { const txt = await r.text(); showToast('Erreur suppression: ' + txt, 'error'); }
        });
        li.appendChild(del);
      } else if (u.name.toLowerCase() === 'admin') {
        const span = document.createElement('span'); span.style.opacity = 0.8; span.style.marginLeft = '6px'; span.textContent = '(admin)'; li.appendChild(span);
      } else {
        const note = document.createElement('em'); note.style.marginLeft = '8px'; note.style.opacity = 0.8; note.textContent = 'Suppression impossible — entrées existantes'; li.appendChild(note);
      }

      if (String(u.id) === String(activeUser)) { const me = document.createElement('strong'); me.textContent = ' • Vous'; me.style.marginLeft = '6px'; li.appendChild(me); }
      userList.appendChild(li);
    });
    if (userStatus) userStatus.textContent = `Chargé ${users.length} utilisateur(s)`;
  } catch (e) { userList.innerHTML = '<li>Erreur</li>'; if (userStatus) userStatus.textContent = 'Erreur lors du chargement'; }
}

async function addUser(e){
  e.preventDefault();
  const name = (userNameInput && userNameInput.value || '').trim();
  if (!name) return;
  try {
    const res = await fetch('/api/users', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ name }) });
    if (!res.ok) { const txt = await res.text(); showToast('Erreur ajout user: ' + txt, 'error'); return }
    userNameInput.value = '';
    showToast('Utilisateur ajouté', 'success');
    await loadUsers();
    await refreshHomeUsers();
  } catch (e) { showToast('Erreur réseau', 'error'); }
}

if (userForm) userForm.addEventListener('submit', addUser);



enterBtn && enterBtn.addEventListener('click', ()=>{
  const uid = homeUserSelect.value;
  const name = homeUserSelect.options[homeUserSelect.selectedIndex]?.text || '';
  if (!uid) { showToast('Veuillez choisir un utilisateur', 'error'); return }
  localStorage.setItem('selectedUserId', uid);
  localStorage.setItem('selectedUserName', name);
  showAppForUser(uid, name);
});

enterGuest && enterGuest.addEventListener('click', ()=>{
  localStorage.removeItem('selectedUserId');
  localStorage.removeItem('selectedUserName');
  showAppForUser('', 'Invité');
});

const adminPasswordLabel = document.getElementById('admin-password-label');
const adminPasswordInput = document.getElementById('admin-password');
if (adminPasswordInput) {
  adminPasswordInput.addEventListener('keydown', (e)=>{
    if (e.key === 'Enter') {
      e.preventDefault();
      enterBtn && enterBtn.click();
    }
  });
}
homeUserSelect && homeUserSelect.addEventListener('change', ()=>{
  const uid = homeUserSelect.value;
  const name = homeUserSelect.options[homeUserSelect.selectedIndex]?.text || '';
  if (name.toLowerCase() === 'admin') {
    adminPasswordLabel.style.display = 'block';
    adminPasswordInput.value = '';
    adminPasswordInput.focus();
    return;
  } else {
    adminPasswordLabel.style.display = 'none';
    adminPasswordInput.value = '';
  }
  if (!uid) return;
  localStorage.setItem('selectedUserId', uid);
  localStorage.setItem('selectedUserName', name);
  showAppForUser(uid, name);
  switchTab('heures-tab');
  loadMonth();
});

if (enterBtn) {
  enterBtn.addEventListener('click', function() {
    const uid = homeUserSelect.value;
    const name = homeUserSelect.options[homeUserSelect.selectedIndex]?.text || '';
    if (name.toLowerCase() === 'admin') {
      if (adminPasswordInput.value === '0902') {
        localStorage.setItem('selectedUserId', uid);
        localStorage.setItem('selectedUserName', name);
        showAppForUser(uid, name);
        homeScreen.style.display = 'none';
        appMain.style.display = '';
        switchTab('heures-tab');
        loadMonth();
      } else {
        showToast('Mot de passe incorrect', 'error', 'Accès admin refusé');
        try {
          if (homeUserSelect) homeUserSelect.value = '';
          if (adminPasswordInput) adminPasswordInput.value = '';
          if (adminPasswordLabel) adminPasswordLabel.style.display = 'none';
          if (homeScreen) homeScreen.style.display = '';
          if (appMain) appMain.style.display = 'none';
          localStorage.removeItem('selectedUserId');
          localStorage.removeItem('selectedUserName');
        } catch (e) {}
        adminPasswordInput && adminPasswordInput.focus();
        return;
      }
    }
  });
}

homeBtn && homeBtn.addEventListener('click', ()=>{
  if (homeScreen) homeScreen.style.display = '';
  if (appMain) appMain.style.display = 'none';
});

async function loadMonth(){
  const month = monthInput.value || new Date().toISOString().slice(0,7);
  if (!activeUser) {
    tbody.innerHTML = '';
    totalEl.textContent = '0.00';
    showToast('Aucun utilisateur sélectionné — connectez-vous', 'error');
    return;
  }

  const currentName = (currentUserName && currentUserName.textContent || '').toLowerCase();
  const qs = (currentName.toLowerCase() === 'admin') ? `month=${month}` : `month=${month}&userId=${activeUser}`;
  let usersMap = {};
  try { const ru = await fetch('/api/users'); if (ru.ok) { const us = await ru.json(); us.forEach(u => usersMap[u.id] = u.name); } } catch (e) {}
  const res = await fetch(`/api/entries?${qs}`);
  if (!res.ok) { showToast('Erreur lors du chargement', 'error'); return }
  const rows = await res.json();
  tbody.innerHTML='';
  let total = 0;
  rows.forEach(r => {
    const tr = document.createElement('tr');
    const d = document.createElement('td'); d.textContent = formatRecapDate(r.date); tr.appendChild(d);
    const c = document.createElement('td'); c.textContent = r.chantier; tr.appendChild(c);
    const u = document.createElement('td'); u.textContent = usersMap[r.user_id] || r.user_id || ''; tr.appendChild(u);
    const h = document.createElement('td'); h.textContent = r.hours; tr.appendChild(h);
    const a = document.createElement('td');
    const editBtn = document.createElement('button'); editBtn.textContent = 'Modifier';
    editBtn.addEventListener('click', () => editEntry(tr, r));
    const delBtn = document.createElement('button'); delBtn.textContent = 'Supprimer';
    delBtn.addEventListener('click', async () => {
      if (!confirm('Supprimer cette entrée ?')) return;
      const resp = await fetch('/api/entries/' + r.id, { method: 'DELETE' });
      if (resp.ok) { showToast('Entrée supprimée', 'success'); loadMonth(); } else showToast('Erreur suppression', 'error');
    });
    a.appendChild(editBtn); a.appendChild(delBtn);
    tr.appendChild(a);
    tbody.appendChild(tr);
    total += parseFloat(r.hours);
  });
  totalEl.textContent = total.toFixed(2);
}

function createInput(tag, value, type='text'){
  const el = document.createElement(tag === 'select' ? 'select' : (type === 'textarea' ? 'textarea' : 'input'));
  if (el.tagName === 'INPUT') el.type = type;
  el.value = value;
  return el;
}

function formatRecapDate(dateStr){
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d)) return dateStr;
  const dayMonth = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  const weekday = d.toLocaleDateString('fr-FR', { weekday: 'long' });
  return `${dayMonth} (${weekday})`;
}

async function editEntry(tr, r){
  tr.innerHTML = '';
  const tdDate = document.createElement('td');
  const inDate = createInput('input', r.date, 'date');
  inDate.value = r.date;
  tdDate.appendChild(inDate);
  tr.appendChild(tdDate);

  const tdChant = document.createElement('td');
  const inChant = createInput('input', r.chantier, 'text');
  tdChant.appendChild(inChant);
  tr.appendChild(tdChant);

  const tdUser = document.createElement('td');
  const selUser = document.createElement('select');
  selUser.innerHTML = '<option value="">-- Choisir --</option>';
  try {
    const ru = await fetch('/api/users');
    if (ru.ok) {
      const users = await ru.json();
      users.forEach(u => { const op = document.createElement('option'); op.value = String(u.id); op.textContent = u.name; selUser.appendChild(op); });
    }
  } catch (e) {}
  selUser.value = r.user_id || '';
  tdUser.appendChild(selUser);
  tr.appendChild(tdUser);

  const tdHours = document.createElement('td');
  const inHours = createInput('input', r.hours, 'number');
  inHours.step = '0.25'; inHours.min = '0';
  tdHours.appendChild(inHours);
  tr.appendChild(tdHours);

  const tdActions = document.createElement('td');
  const saveBtn = document.createElement('button'); saveBtn.textContent = 'Enregistrer';
  const cancelBtn = document.createElement('button'); cancelBtn.textContent = 'Annuler';

  saveBtn.addEventListener('click', async () => {
    const payload = { chantier: inChant.value.trim(), date: inDate.value, hours: parseFloat(inHours.value), userId: parseInt(selUser.value, 10) };
    if (!payload.chantier || !payload.date || isNaN(payload.hours) || !payload.userId) { showToast('Remplissez tous les champs valides', 'error'); return }
    const resp = await fetch('/api/entries/' + r.id, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    if (resp.ok) { showToast('Entrée modifiée', 'success'); loadMonth(); } else { const txt = await resp.text(); showToast('Erreur mise à jour: ' + txt, 'error'); }
  });

  cancelBtn.addEventListener('click', () => loadMonth());

  tdActions.appendChild(saveBtn); tdActions.appendChild(cancelBtn);
  tr.appendChild(tdActions);
}

async function exportPDF(){
  const month = monthInput.value || new Date().toISOString().slice(0,7);
  const res = await fetch(`/api/export?month=${month}`);
  if (!res.ok) { showToast('Erreur lors de la génération du PDF', 'error'); return }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `recap-${month}.pdf`; document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

async function loadChantiers(){
  const res = await fetch('/api/chantiers');
  if (!res.ok) { chantierList.innerHTML = '<li>Erreur</li>'; showToast('Erreur chargement chantiers', 'error'); return }
  const rows = await res.json();
  chantierList.innerHTML = '';
  chantierSelect.innerHTML = '<option value="">-- Choisir un chantier --</option>';
  rows.forEach(c => {
    const li = document.createElement('li');
    li.textContent = c.name + ' ';
    const useBtn = document.createElement('button'); useBtn.textContent = 'Utiliser';
    useBtn.addEventListener('click', () => { chantierSelect.value = String(c.id); chantierSelect.dispatchEvent(new Event('change')); switchTab('heures-tab'); });
    const delBtn = document.createElement('button'); delBtn.textContent = 'Supprimer';
    delBtn.addEventListener('click', async () => { if (!confirm('Supprimer ce chantier ?')) return; const r = await fetch('/api/chantiers/' + c.id, { method: 'DELETE' }); if (r.ok) { showToast('Chantier supprimé', 'success'); loadChantiers(); } else showToast('Erreur suppression chantier', 'error'); });
    li.appendChild(useBtn); li.appendChild(delBtn);
    chantierList.appendChild(li);

    const opt = document.createElement('option'); opt.value = String(c.id); opt.textContent = c.name; chantierSelect.appendChild(opt);
  });
  const otherOpt = document.createElement('option'); otherOpt.value = 'other'; otherOpt.textContent = 'Autre...'; chantierSelect.appendChild(otherOpt);
  try {
    const resU = await fetch('/api/users');
    if (resU.ok) {
      const users = await resU.json();
      if (homeUserSelect) {
        homeUserSelect.innerHTML = '<option value="">-- Choisir un utilisateur --</option>';
        users.forEach(u => { const o3 = document.createElement('option'); o3.value = String(u.id); o3.textContent = u.name; homeUserSelect.appendChild(o3); });
      }
    }
  } catch (e) {}
}

async function addChantier(e){
  e.preventDefault();
  const name = chantierNameInput.value.trim();
  if (!name) return;
  const res = await fetch('/api/chantiers', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ name }) });
  if (!res.ok) { showToast('Erreur ajout chantier', 'error'); return }
  chantierNameInput.value = '';
  await loadChantiers();
  showToast('Chantier ajouté', 'success');
}

form.addEventListener('submit', addEntry);
loadBtn.addEventListener('click', loadMonth);
exportBtn.addEventListener('click', exportPDF);
chantierForm.addEventListener('submit', addChantier);

monthInput.value = new Date().toISOString().slice(0,7);
dateInput.value = new Date().toISOString().slice(0,10);
loadChantiers();
loadMonth();

if (homeScreen) homeScreen.style.display = '';
