// ========== CONFIG ==========
const API_BASE = '';
function getToken(){ return localStorage.getItem('token'); }
let currentUser = null;

// ========== AUTH CHECK ==========
if (!getToken()) {
    window.location.href = '/login';
}

// ========== API HELPERS ==========
async function apiGet(endpoint) {
    const res = await fetch(`${API_BASE}${endpoint}`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    if (res.status === 401) {
        showToast('Session expirée. Reconnexion...', 'error');
        setTimeout(logout, 1500);
        throw new Error('Unauthorized');
    }
    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Erreur serveur' }));
        throw new Error(err.detail || `HTTP ${res.status}`);
    }
    return res.json();
}
async function apiPut(endpoint, body) {
    const res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
        body: JSON.stringify(body)
    });
    if (res.status === 401) { showToast('Session expirée', 'error'); setTimeout(logout,1500); throw new Error('Unauthorized'); }
    if (!res.ok) { const err = await res.json().catch(()=>({detail:'Erreur'})); throw new Error(err.detail); }
    return res.json();
}
async function apiDelete(endpoint) {
    const res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    if (res.status === 401) { showToast('Session expirée', 'error'); setTimeout(logout,1500); throw new Error('Unauthorized'); }
    if (!res.ok) { const err = await res.json().catch(()=>({detail:'Erreur'})); throw new Error(err.detail); }
    return res.json();
}

// ========== UI HELPERS ==========
function showToast(message, type='info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    const bg = type==='error' ? 'bg-red-600' : type==='success' ? 'bg-emerald-600' : 'bg-slate-800';
    toast.className = `toast-enter pointer-events-auto ${bg} text-white px-4 py-3 rounded-xl shadow-lg text-sm font-medium`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(()=>{ toast.classList.add('toast-exit'); setTimeout(()=>toast.remove(),300); }, 3000);
}
function logout(){ localStorage.removeItem('token'); window.location.href='/login'; }

// ========== DARK MODE ==========
const darkToggle = document.getElementById('dark-toggle');
function applyDarkMode(){ const isDark = localStorage.getItem('admin-dark-mode')==='true'; document.documentElement.classList.toggle('dark', isDark); }
darkToggle?.addEventListener('click', ()=>{ const isDark = document.documentElement.classList.toggle('dark'); localStorage.setItem('admin-dark-mode', isDark); });
applyDarkMode();

// ========== TABS ==========
function switchTab(tab){
    ['overview','users','doctors','appointments','audit'].forEach(t=>{
        document.getElementById('view-'+t).classList.toggle('hidden', t!==tab);
        const btn = document.getElementById('tab-'+t);
        btn.classList.toggle('border-red-600', t===tab);
        btn.classList.toggle('text-red-600', t===tab);
        btn.classList.toggle('border-transparent', t!==tab);
        btn.classList.toggle('text-slate-500', t!==tab);
    });
    if(tab==='users') loadUsers();
    if(tab==='doctors') loadDoctors();
    if(tab==='appointments') loadAppointments();
    if(tab==='overview') loadOverview();
    if(tab==='audit') loadAudit();
}

// ========== INIT ==========
async function init(){
    try{
        const me = await apiGet('/me');
        currentUser = me;
        document.getElementById('user-name').textContent = me.full_name;
        loadOverview();
    }catch(e){ console.error(e); logout(); }
}

// ========== OVERVIEW ==========
async function loadOverview(){
    try{
        const stats = await apiGet('/api/admin/stats');
        document.getElementById('stat-users').textContent = stats.total_users ?? '-';
        document.getElementById('stat-doctors').textContent = stats.total_doctors ?? '-';
        document.getElementById('stat-appointments').textContent = stats.total_appointments ?? '-';
        document.getElementById('stat-pending').textContent = stats.pending_appointments ?? '-';
        // recent activity placeholder
        const recent = document.getElementById('recent-activity');
        recent.innerHTML = '<p class="text-slate-500 text-sm">Aucune activité récente.</p>';
    }catch(e){ console.error('overview', e); }
}

// ========== USERS ==========
async function loadUsers(){
    const tbody = document.getElementById('users-table');
    tbody.innerHTML = '<tr><td colspan="5" class="py-8 text-center">Chargement...</td></tr>';
    try{
        const users = await apiGet('/api/admin/users');
        tbody.innerHTML = '';
        users.forEach(u=>{
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="py-3">${u.full_name}</td>
                <td>${u.email}</td>
                <td><span class="capitalize">${u.role}</span></td>
                <td>${u.is_active ? '<span class="text-emerald-600">Actif</span>' : '<span class="text-slate-400">Inactif</span>'}</td>
                <td>
                    <button onclick='openUserModal(${JSON.stringify(u).replace(/"/g,'&quot;')})' class="text-blue-600 hover:underline text-xs">Modifier</button>
                    <button onclick='deleteUser(${u.id})' class="text-red-600 hover:underline text-xs ml-3">Supprimer</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }catch(e){ showToast('Erreur chargement utilisateurs','error'); }
}
function openUserModal(user){
    document.getElementById('user-id').value = user.id;
    document.getElementById('user-fullname').value = user.full_name;
    document.getElementById('user-email').value = user.email;
    document.getElementById('user-role').value = user.role;
    document.getElementById('user-active').checked = user.is_active;
    document.getElementById('user-modal').classList.remove('hidden');
}
function closeUserModal(){ document.getElementById('user-modal').classList.add('hidden'); }

// Create user modal
function openCreateUserModal(){
    document.getElementById('create-user-form').reset();
    document.getElementById('create-active').checked = true;
    document.getElementById('doctor-fields').classList.add('hidden');
    document.getElementById('create-user-modal').classList.remove('hidden');
}
function closeCreateUserModal(){ document.getElementById('create-user-modal').classList.add('hidden'); }
// Toggle doctor fields
document.getElementById('create-role')?.addEventListener('change', e=>{
    document.getElementById('doctor-fields').classList.toggle('hidden', e.target.value !== 'doctor');
});
document.getElementById('create-user-form')?.addEventListener('submit', async e=>{
    e.preventDefault();
    const payload = {
        full_name: document.getElementById('create-fullname').value.trim(),
        email: document.getElementById('create-email').value.trim(),
        password: document.getElementById('create-password').value,
        role: document.getElementById('create-role').value,
        is_active: document.getElementById('create-active').checked
    };
    if(payload.role === 'doctor'){
        payload.specialization = document.getElementById('create-specialization').value.trim();
        payload.experience_years = document.getElementById('create-experience').value || null;
        payload.consultation_fee = document.getElementById('create-fee').value || null;
        payload.bio = document.getElementById('create-bio').value.trim();
    }
    try{
        const res = await fetch(`${API_BASE}/api/admin/users`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
            body: JSON.stringify(payload)
        });
        if(!res.ok){ const err = await res.json().catch(()=>({detail:'Erreur'})); throw new Error(err.detail); }
        showToast('Utilisateur créé avec succès','success');
        closeCreateUserModal();
        loadUsers();
    }catch(err){ showToast(err.message,'error'); }
});

// Bulk import
function openBulkImportModal(){
    document.getElementById('bulk-import-form').reset();
    document.getElementById('bulk-preview').classList.add('hidden');
    document.getElementById('bulk-import-modal').classList.remove('hidden');
}
function closeBulkImportModal(){ document.getElementById('bulk-import-modal').classList.add('hidden'); }
document.getElementById('bulk-csv-file')?.addEventListener('change', e=>{
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = ev=>{
        const text = ev.target.result;
        const lines = text.split('\n').slice(0,6).join('\n');
        document.querySelector('#bulk-preview div').textContent = lines;
        document.getElementById('bulk-preview').classList.remove('hidden');
    };
    reader.readAsText(file);
});
document.getElementById('bulk-import-form')?.addEventListener('submit', async e=>{
    e.preventDefault();
    const fileInput = document.getElementById('bulk-csv-file');
    const file = fileInput.files[0];
    if(!file){ showToast('Sélectionnez un fichier CSV','error'); return; }
    const formData = new FormData();
    formData.append('file', file);
    try{
        const res = await fetch(`${API_BASE}/api/admin/users/bulk`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${getToken()}` },
            body: formData
        });
        const data = await res.json();
        if(!res.ok) throw new Error(data.detail || 'Erreur import');
        showToast(`Importé: ${data.created} utilisateurs. Erreurs: ${data.errors.length}`,'success');
        if(data.errors.length) console.warn(data.errors);
        closeBulkImportModal();
        loadUsers();
    }catch(err){ showToast(err.message,'error'); }
});

document.getElementById('user-form')?.addEventListener('submit', async e=>{
    e.preventDefault();
    const id = document.getElementById('user-id').value;
    const payload = {
        full_name: document.getElementById('user-fullname').value,
        role: document.getElementById('user-role').value,
        is_active: document.getElementById('user-active').checked
    };
    try{
        await apiPut(`/api/admin/users/${id}`, payload);
        showToast('Utilisateur mis à jour','success');
        closeUserModal();
        loadUsers();
    }catch(err){ showToast(err.message,'error'); }
});
async function deleteUser(id){
    if(!confirm('Supprimer cet utilisateur ?')) return;
    try{
        await apiDelete(`/api/admin/users/${id}`);
        showToast('Utilisateur supprimé','success');
        loadUsers();
    }catch(err){ showToast(err.message,'error'); }
}

// ========== DOCTORS ==========
async function loadDoctors(){
    const container = document.getElementById('doctors-list');
    container.innerHTML = '<div class="skeleton h-32 w-full"></div>';
    try{
        const doctors = await apiGet('/api/admin/doctors');
        container.innerHTML = '';
        doctors.forEach(d=>{
            const card = document.createElement('div');
            card.className = 'bg-white dark:bg-slate-900 border border-slate-200 rounded-xl p-4';
            card.innerHTML = `
                <div class="flex justify-between">
                    <div>
                        <div class="font-bold">${d.user.full_name}</div>
                        <div class="text-sm text-slate-500">${d.specialization}</div>
                    </div>
                    <span class="text-xs px-2 py-1 rounded bg-slate-100">${d.experience_years ?? 0} ans</span>
                </div>
                <div class="mt-2 text-sm">${d.bio ?? ''}</div>
                <div class="mt-3 text-xs text-slate-500">Frais: ${d.consultation_fee ?? 0} FCFA</div>
            `;
            container.appendChild(card);
        });
    }catch(e){ showToast('Erreur chargement médecins','error'); }
}

// ========== APPOINTMENTS ==========
async function loadAppointments(){
    const tbody = document.getElementById('appointments-table');
    tbody.innerHTML = '<tr><td colspan="5" class="py-8 text-center">Chargement...</td></tr>';
    try{
        const appts = await apiGet('/api/admin/appointments');
        tbody.innerHTML = '';
        appts.forEach(a=>{
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="py-2">${a.patient_name}</td>
                <td>${a.doctor_name}</td>
                <td>${new Date(a.appointment_time).toLocaleString('fr-FR')}</td>
                <td><span class="capitalize">${a.status}</span></td>
                <td>
                    <button onclick='updateApptStatus(${a.id}, "confirmed")' class="text-xs text-emerald-600 hover:underline">Confirmer</button>
                    <button onclick='updateApptStatus(${a.id}, "cancelled")' class="text-xs text-red-600 hover:underline ml-2">Annuler</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }catch(e){ showToast('Erreur chargement rendez-vous','error'); }
}
async function updateApptStatus(id, status){
    try{
        await apiPut(`/api/admin/appointments/${id}`, {status});
        showToast('Statut mis à jour','success');
        loadAppointments();
    }catch(err){ showToast(err.message,'error'); }
}

// ========== AUDIT ==========
async function loadAudit(){
    const tbody = document.getElementById('audit-table');
    tbody.innerHTML = '<tr><td colspan="7" class="py-8 text-center">Chargement...</td></tr>';
    try{
        const logs = await apiGet('/api/admin/audit-logs');
        tbody.innerHTML = '';
        logs.forEach(l=>{
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="py-2 text-xs">${new Date(l.created_at).toLocaleString('fr-FR')}</td>
                <td class="text-xs">${l.admin_user_id}</td>
                <td class="text-xs capitalize">${l.action}</td>
                <td class="text-xs">${l.target_type}</td>
                <td class="text-xs">${l.target_id ?? '-'}</td>
                <td class="text-xs">${l.ip_address ?? '-'}</td>
                <td class="text-xs max-w-xs truncate" title="${l.changes_json ?? ''}">${l.changes_json ? JSON.stringify(l.changes_json).slice(0,80) : '-'}</td>
            `;
            tbody.appendChild(tr);
        });
    }catch(e){ showToast('Erreur chargement audit','error'); }
}

// ========== START ==========
init();
