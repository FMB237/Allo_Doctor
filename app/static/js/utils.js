// Allo Doctor shared utilities
const API_BASE = '';

function getToken() {
    return localStorage.getItem('token');
}

function logout() {
    localStorage.removeItem('token');
    window.location.href = '/login';
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    const bgColor = type === 'success' ? 'bg-emerald-500' : 'bg-red-500';
    const icon = type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation';

    toast.className = `${bgColor} text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 toast-enter pointer-events-auto max-w-sm`;
    toast.innerHTML = `<i class="fa-solid ${icon} text-lg"></i> <span class="font-semibold text-sm">${message}</span>`;

    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.remove('toast-enter');
        toast.classList.add('toast-exit');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

async function apiRequest(method, endpoint, body = null) {
    const token = getToken();
    const opts = {
        method,
        headers: { 'Authorization': `Bearer ${token}` }
    };
    if (body !== null) {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
    }
    const res = await fetch(`${API_BASE}${endpoint}`, opts);
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

async function apiGet(endpoint) {
    return apiRequest('GET', endpoint);
}

async function apiPost(endpoint, body) {
    return apiRequest('POST', endpoint, body);
}

async function apiPut(endpoint, body) {
    return apiRequest('PUT', endpoint, body);
}

async function apiPatch(endpoint, body) {
    return apiRequest('PATCH', endpoint, body);
}

// Auth guard
function requireAuth() {
    if (!getToken()) {
        window.location.href = '/login';
    }
}
