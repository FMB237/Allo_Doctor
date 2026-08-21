        // ========== CONFIG ==========
        const API_BASE = '';
        let token = localStorage.getItem('token');
        function getToken(){ return localStorage.getItem('token'); }
let currentUser = null;
let eventSource = null;
let hasNewAppointment = false;

        // ========== AUTH CHECK ==========
        if (!token) {
            window.location.href = '/login';
        }

        // ========== API HELPERS ==========
        async function apiGet(endpoint) {
            const res = await fetch(`${API_BASE}${endpoint}`, {
                headers: { 'Authorization': `Bearer ${token}` }
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
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(body)
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

        async function apiPatch(endpoint, body) {
            const res = await fetch(`${API_BASE}${endpoint}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(body)
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

        // ========== SSE (SERVER-SENT EVENTS) ==========
        function connectSSE() {
            if (eventSource) {
                eventSource.close();
            }

            eventSource = new EventSource(`/events/doctor?token=${token}`);

            eventSource.onopen = () => {
                updateConnectionStatus(true);
                console.log('🔌 SSE connected');
            };

            eventSource.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    handleSSEMessage(msg);
                } catch (e) {
                    console.error('SSE parse error:', e);
                }
            };

            eventSource.onerror = (err) => {
                updateConnectionStatus(false);
                console.error('SSE error:', err);
                // Auto-reconnect after 3 seconds
                setTimeout(() => {
                    if (eventSource.readyState === EventSource.CLOSED) {
                        console.log('🔄 SSE reconnecting...');
                        connectSSE();
                    }
                }, 3000);
            };
        }

        function handleSSEMessage(msg) {
            console.log('📨 SSE event:', msg.type, msg);

            switch (msg.type) {
                case 'connected':
                    showToast('Connecté en temps réel 🟢');
                    break;

                case 'new_appointment':
                    // Show notification
                    showToast(`📅 Nouveau rendez-vous de ${msg.data.patient_name} !`, 'success');
                    // Show banner
                    showLiveBanner(`Nouveau rendez-vous de ${msg.data.patient_name}`);
                    // Mark new badge
                    hasNewAppointment = true;
                    document.getElementById('new-badge').classList.remove('hidden');
                    // Refresh schedule
                    loadSchedule();
                    break;

                case 'status_update':
                    // Another doctor/patient updated status — refresh to stay in sync
                    loadSchedule();
                    break;

                case 'heartbeat':
                    // Keep-alive, ignore
                    break;

                default:
                    console.log('Unknown SSE event type:', msg.type);
            }
        }

        function updateConnectionStatus(connected) {
            const dot = document.getElementById('connection-dot');
            const text = document.getElementById('connection-text');
            const badge = document.getElementById('connection-status');

            if (connected) {
                dot.className = 'w-2 h-2 rounded-full bg-emerald-400 live-badge';
                text.innerText = 'En direct';
                badge.className = 'flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-600 text-xs font-bold transition-all';
            } else {
                dot.className = 'w-2 h-2 rounded-full bg-red-400';
                text.innerText = 'Déconnecté';
                badge.className = 'flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-50 text-red-600 text-xs font-bold transition-all';
            }
        }

        function showLiveBanner(text) {
            const banner = document.getElementById('live-banner');
            document.getElementById('live-banner-text').innerText = text;
            banner.classList.remove('hidden');
            // Auto-dismiss after 10 seconds
            setTimeout(() => {
                if (!banner.classList.contains('hidden')) {
                    dismissLiveBanner();
                }
            }, 10000);
        }

        function dismissLiveBanner() {
            document.getElementById('live-banner').classList.add('hidden');
        }

// ========== INIT ==========
        async function init() {
            if (!getToken()) return;

            // Connect SSE first for real-time updates
            connectSSE();

            // Load data independently
            const promises = [
                fetchUser().catch(e => console.error('fetchUser failed:', e)),
                loadSchedule().catch(e => console.error('loadSchedule failed:', e)),
                loadProfile().catch(e => console.error('loadProfile failed:', e))
            ];
            await Promise.allSettled(promises);
        }

        // ========== USER ==========
        async function fetchUser() {
            try {
                const data = await apiGet('/me');
                currentUser = data;
                document.getElementById('user-name').innerText = data.full_name;
                document.getElementById('welcome-name').innerText = data.full_name.split(' ')[0];
            } catch (e) {
                document.getElementById('user-name').innerText = 'Erreur de chargement';
                throw e;
            }
        }

        // ========== SCHEDULE ==========
        async function loadSchedule() {
            const list = document.getElementById('schedule-list');

            try {
                const appts = await apiGet('/appointments/my-schedule');

                // Update stats
                const stats = { total: 0, pending: 0, confirmed: 0, completed: 0 };
                (appts || []).forEach(a => {
                    stats.total++;
                    if (a.status === 'pending') stats.pending++;
                    if (a.status === 'confirmed') stats.confirmed++;
                    if (a.status === 'completed') stats.completed++;
                });
                document.getElementById('stat-total').innerText = stats.total;
                document.getElementById('stat-pending').innerText = stats.pending;
                document.getElementById('stat-confirmed').innerText = stats.confirmed;
                document.getElementById('stat-completed').innerText = stats.completed;

                if (!appts || appts.length === 0) {
                    list.innerHTML = `
                        <div class="text-center py-20 bg-white rounded-3xl border border-dashed border-slate-300">
                            <div class="text-5xl mb-4">📅</div>
                            <h3 class="text-lg font-bold text-slate-800 mb-2">Aucun rendez-vous prévu</h3>
                            <p class="text-slate-500 max-w-md mx-auto">Votre planning est vide. Les rendez-vous apparaîtront ici lorsque les patients feront des réservations.</p>
                        </div>`;
                    return;
                }

                list.innerHTML = appts.map(appt => {
                    const dateObj = new Date(appt.appointment_time);
                    const dateStr = dateObj.toLocaleString('fr-FR', { 
                        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' 
                    });

                    const statusConfig = {
                        'confirmed': { class: 'bg-emerald-100 text-emerald-700', label: 'Confirmé' },
                        'completed': { class: 'bg-blue-100 text-blue-700', label: 'Terminé' },
                        'cancelled': { class: 'bg-red-100 text-red-700', label: 'Annulé' },
                        'pending': { class: 'bg-yellow-100 text-yellow-700', label: 'En attente' }
                    };
                    const status = statusConfig[appt.status] || { class: 'bg-slate-100 text-slate-700', label: appt.status };

                    const isNew = appt.status === 'pending';
                    const newIndicator = isNew ? '<span class="ml-2 w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>' : '';

                    const actionButtons = [];
                    if (appt.status === 'pending') {
                        actionButtons.push(`<button onclick="updateStatus(${appt.id}, 'confirmed')" class="bg-emerald-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-emerald-700 transition shadow-sm"><i class="fa-solid fa-check mr-1"></i>Confirmer</button>`);
                    }
                    if (appt.status === 'confirmed') {
                        actionButtons.push(`<button onclick="updateStatus(${appt.id}, 'completed')" class="bg-blue-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-blue-700 transition shadow-sm"><i class="fa-solid fa-check-double mr-1"></i>Terminer</button>`);
                    }
                    actionButtons.push(`<button onclick="updateStatus(${appt.id}, 'cancelled')" class="bg-slate-100 text-slate-500 px-4 py-2 rounded-lg text-xs font-bold hover:bg-red-100 hover:text-red-600 transition"><i class="fa-solid fa-xmark mr-1"></i>Annuler</button>`);

                    return `
                    <div class="bg-white p-5 rounded-2xl border ${isNew ? 'border-blue-300 shadow-md' : 'border-slate-200'} flex flex-col md:flex-row md:items-center justify-between gap-4 hover:shadow-lg transition-all ${isNew ? 'pulse-ring' : ''}">
                        <div class="flex items-center gap-4">
                            <div class="w-12 h-12 bg-gradient-to-br from-blue-50 to-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold shadow-sm">
                                <i class="fa-solid fa-user"></i>
                            </div>
                            <div>
                                <h4 class="font-bold text-slate-800 text-lg flex items-center">
                                    ${appt.patient_name || 'Patient inconnu'}
                                    ${newIndicator}
                                </h4>
                                <div class="flex items-center gap-2 text-sm text-slate-500 mt-0.5">
                                    <i class="fa-regular fa-calendar text-blue-400"></i>
                                    <span class="capitalize">${dateStr}</span>
                                </div>
                            </div>
                        </div>
                        <div class="flex items-center gap-3 flex-wrap">
                            <span class="px-4 py-1.5 rounded-full text-xs font-extrabold uppercase tracking-wider ${status.class}">${status.label}</span>
                            <div class="flex gap-2">
                                ${actionButtons.join('')}
                            </div>
                        </div>
                    </div>`;
                }).join('');
            } catch (e) {
                console.error('loadSchedule error:', e);
                list.innerHTML = `
                    <div class="text-center py-16 bg-white rounded-3xl border border-slate-200">
                        <div class="text-5xl mb-4">⚠️</div>
                        <h3 class="text-lg font-bold text-slate-700 mb-2">Erreur de chargement</h3>
                        <p class="text-slate-500 mb-4">${e.message || 'Impossible de charger votre planning.'}</p>
                        <button onclick="loadSchedule()" class="bg-blue-600 text-white px-6 py-2 rounded-xl font-bold hover:bg-blue-700 transition">
                            <i class="fa-solid fa-rotate-right mr-2"></i>Réessayer
                        </button>
                    </div>`;
            }
        }

        async function updateStatus(id, status) {
            try {
                await apiPatch(`/appointments/${id}/status`, { status });
                showToast(`Statut mis à jour : ${status}`);
                await loadSchedule();
            } catch (e) {
                showToast(e.message || 'Erreur lors de la mise à jour', 'error');
            }
        }

        // ========== PROFILE ==========
        async function loadProfile() {
            try {
                const data = await apiGet('/doctor/profile');
                document.getElementById('specialization').value = data.specialization || '';
                document.getElementById('consultation_fee').value = data.consultation_fee || '';
                document.getElementById('bio').value = data.bio || '';
                document.getElementById('experience_years').value = data.experience_years || '';
            } catch (e) {
                console.error('loadProfile error:', e);
                const form = document.getElementById('profile-form');
                const errorDiv = document.createElement('div');
                errorDiv.id = 'profile-error';
                errorDiv.className = 'bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm font-medium mb-4';
                errorDiv.innerHTML = `<i class="fa-solid fa-triangle-exclamation mr-2"></i>Impossible de charger votre profil. <button onclick="loadProfile()" class="underline font-bold">Réessayer</button>`;
                if (!document.getElementById('profile-error')) {
                    form.insertBefore(errorDiv, form.firstChild);
                }
            }
        }

        document.getElementById('profile-form').onsubmit = async (e) => {
            e.preventDefault();
            const btn = document.getElementById('profile-submit-btn');
            const btnText = document.getElementById('profile-btn-text');

            const data = {
                specialization: document.getElementById('specialization').value.trim(),
                consultation_fee: parseInt(document.getElementById('consultation_fee').value) || 0,
                bio: document.getElementById('bio').value.trim(),
                experience_years: parseInt(document.getElementById('experience_years').value) || 0
            };

            const errDiv = document.getElementById('profile-error');
            if (errDiv) errDiv.remove();

            btn.disabled = true;
            btnText.innerText = 'Enregistrement...';

            try {
                await apiPut('/doctor/profile', data);
                showToast('Profil mis à jour avec succès ! ✅');
            } catch (e) {
                showToast(e.message || 'Erreur lors de la mise à jour', 'error');
            } finally {
                btn.disabled = false;
                btnText.innerText = 'Enregistrer les modifications';
            }
        };

        // ========== TABS ==========
        function switchTab(tab) {
            const schedView = document.getElementById('view-schedule');
            const profView = document.getElementById('view-profile');
            const schedTab = document.getElementById('tab-schedule');
            const profTab = document.getElementById('tab-profile');

            if (tab === 'schedule') {
                schedView.classList.remove('hidden');
                profView.classList.add('hidden');
                schedTab.className = 'pb-4 px-2 text-sm font-bold border-b-2 border-blue-600 text-blue-600 transition';
                profTab.className = 'pb-4 px-2 text-sm font-medium text-slate-500 hover:text-blue-600 transition';
                // Clear new badge when viewing schedule
                hasNewAppointment = false;
                document.getElementById('new-badge').classList.add('hidden');
                loadSchedule();
            } else {
                schedView.classList.add('hidden');
                profView.classList.remove('hidden');
                profTab.className = 'pb-4 px-2 text-sm font-bold border-b-2 border-blue-600 text-blue-600 transition';
                schedTab.className = 'pb-4 px-2 text-sm font-medium text-slate-500 hover:text-blue-600 transition';
            }
        }

        // ========== UTILS ==========
        function logout() {
            if (eventSource) {
                eventSource.close();
            }
            localStorage.removeItem('token');
            window.location.href = '/login';
        }

        function showToast(message, type = 'success') {
            const container = document.getElementById('toast-container');
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

        // ========== CLEANUP ON PAGE UNLOAD ==========
        window.addEventListener('beforeunload', () => {
            if (eventSource) {
                eventSource.close();
            }
        });

        // Dark mode toggle
        const darkToggle = document.getElementById('dark-toggle');
        const htmlEl = document.documentElement;
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark') htmlEl.classList.add('dark');
        darkToggle?.addEventListener('click', () => {
            htmlEl.classList.toggle('dark');
            localStorage.setItem('theme', htmlEl.classList.contains('dark') ? 'dark' : 'light');
        });

        // ========== START ==========
        init();
