        // ========== CONFIG ==========
        const API_BASE = ''; // Same origin
        let token = localStorage.getItem('token');
        let currentUser = null;
        let doctorsCache = [];
        let searchTimeout = null;

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

        async function apiPost(endpoint, body) {
            const res = await fetch(`${API_BASE}${endpoint}`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}` 
                },
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

        // ========== INIT ==========
        async function init() {
            if (!token) return;

            // Run all independently so one failure doesn't block others
            const promises = [
                fetchUser().catch(e => console.error('fetchUser failed:', e)),
                loadDoctors().catch(e => console.error('loadDoctors failed:', e)),
                loadMyAppointments().catch(e => console.error('loadMyAppointments failed:', e))
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

        // ========== DOCTORS ==========
        async function loadDoctors() {
            const grid = document.getElementById('doctors-grid');
            const specialty = document.getElementById('search-specialty').value.trim();

            try {
                const url = specialty ? `/doctors?specialization=${encodeURIComponent(specialty)}` : '/doctors';
                const doctors = await fetch(url).then(r => r.json());
                doctorsCache = doctors;

                if (!doctors || doctors.length === 0) {
                    grid.innerHTML = `
                        <div class="col-span-full text-center py-16">
                            <div class="text-5xl mb-4">🔍</div>
                            <h3 class="text-lg font-bold text-slate-700 mb-2">Aucun médecin trouvé</h3>
                            <p class="text-slate-500">Essayez une autre spécialité.</p>
                        </div>`;
                    return;
                }

                grid.innerHTML = doctors.map(doc => `
                    <div class="glass-card p-6 rounded-3xl hover:shadow-xl transition-all group border border-slate-100">
                        <div class="flex items-start justify-between mb-4">
                            <div class="w-16 h-16 bg-gradient-to-br from-blue-100 to-blue-200 text-blue-600 rounded-2xl flex items-center justify-center text-2xl font-bold shadow-sm">
                                ${doc.name ? doc.name.charAt(0).toUpperCase() : '?'}
                            </div>
                            <span class="bg-blue-50 text-blue-600 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide">${doc.specialization || 'Généraliste'}</span>
                        </div>
                        <h3 class="text-lg font-bold text-slate-800 mb-1">${doc.name || 'Dr. Inconnu'}</h3>
                        <p class="text-slate-500 text-sm mb-4 line-clamp-2 min-h-[2.5rem]">${doc.bio || 'Aucune description disponible.'}</p>
                        <div class="flex items-center justify-between pt-4 border-t border-slate-100">
                            <span class="text-blue-600 font-bold text-lg">${doc.fee || 0} FCFA</span>
                            <button onclick="openBookingModal(${doc.id}, '${(doc.name || '').replace(/'/g, "\'")}', '${(doc.specialization || '').replace(/'/g, "\'")}')" 
                                    class="bg-slate-900 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-blue-600 transition shadow-md">
                                <i class="fa-solid fa-calendar-plus mr-1"></i> Réserver
                            </button>
                        </div>
                    </div>
                `).join('');
            } catch (e) {
                console.error('loadDoctors error:', e);
                grid.innerHTML = `
                    <div class="col-span-full text-center py-16">
                        <div class="text-5xl mb-4">⚠️</div>
                        <h3 class="text-lg font-bold text-slate-700 mb-2">Erreur de chargement</h3>
                        <p class="text-slate-500 mb-4">Impossible de charger la liste des médecins.</p>
                        <button onclick="loadDoctors()" class="bg-blue-600 text-white px-6 py-2 rounded-xl font-bold hover:bg-blue-700 transition">
                            <i class="fa-solid fa-rotate-right mr-2"></i>Réessayer
                        </button>
                    </div>`;
            }
        }

        function debouncedLoadDoctors() {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(loadDoctors, 300);
        }

        // ========== APPOINTMENTS ==========
        async function loadMyAppointments() {
            const list = document.getElementById('appointments-list');

            try {
                const appts = await apiGet('/appointments/my-appointments');

                if (!appts || appts.length === 0) {
                    list.innerHTML = `
                        <div class="text-center py-20 bg-white rounded-3xl border border-dashed border-slate-300">
                            <div class="text-5xl mb-4">📅</div>
                            <h3 class="text-lg font-bold text-slate-800 mb-2">Aucun rendez-vous prévu</h3>
                            <p class="text-slate-500 mb-6 max-w-md mx-auto">Vous n'avez pas encore de consultations programmées. Prenez rendez-vous avec un spécialiste.</p>
                            <button onclick="switchTab('directory')" class="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-blue-700 transition shadow-lg shadow-blue-200">
                                <i class="fa-solid fa-user-doctor mr-2"></i>Trouver un docteur
                            </button>
                        </div>`;
                    return;
                }

                list.innerHTML = appts.map(appt => {
                    const dateObj = new Date(appt.appointment_time);
                    const dateStr = dateObj.toLocaleString('fr-FR', { 
                        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' 
                    });
                    const statusClass = {
                        'confirmed': 'bg-green-100 text-green-700',
                        'completed': 'bg-blue-100 text-blue-700',
                        'cancelled': 'bg-red-100 text-red-700',
                        'pending': 'bg-yellow-100 text-yellow-700'
                    }[appt.status] || 'bg-slate-100 text-slate-700';

                    return `
                    <div class="bg-white p-6 rounded-3xl border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-6 hover:shadow-lg transition-all">
                        <div class="flex items-center gap-5">
                            <div class="w-14 h-14 bg-gradient-to-br from-blue-50 to-blue-100 text-blue-600 rounded-2xl flex items-center justify-center text-xl font-bold shadow-sm">
                                <i class="fa-solid fa-user-doctor"></i>
                            </div>
                            <div>
                                <h4 class="font-bold text-slate-800 text-lg">${appt.doctor_name || 'Dr. Inconnu'}</h4>
                                <p class="text-sm text-slate-400 font-medium">${appt.specialization || ''}</p>
                                <div class="flex items-center gap-2 text-sm text-slate-500 mt-1">
                                    <i class="fa-regular fa-calendar text-blue-400"></i>
                                    <span class="capitalize">${dateStr}</span>
                                </div>
                            </div>
                        </div>
                        <div class="flex items-center gap-4">
                            <span class="px-5 py-2 rounded-full text-xs font-extrabold uppercase tracking-wider ${statusClass}">
                                ${appt.status || 'inconnu'}
                            </span>
                        </div>
                    </div>`;
                }).join('');
            } catch (e) {
                console.error('loadMyAppointments error:', e);
                list.innerHTML = `
                    <div class="text-center py-16 bg-white rounded-3xl border border-slate-200">
                        <div class="text-5xl mb-4">⚠️</div>
                        <h3 class="text-lg font-bold text-slate-700 mb-2">Erreur de chargement</h3>
                        <p class="text-slate-500 mb-4">${e.message || 'Impossible de charger vos rendez-vous.'}</p>
                        <button onclick="loadMyAppointments()" class="bg-blue-600 text-white px-6 py-2 rounded-xl font-bold hover:bg-blue-700 transition">
                            <i class="fa-solid fa-rotate-right mr-2"></i>Réessayer
                        </button>
                    </div>`;
            }
        }

        // ========== BOOKING MODAL ==========
        function openBookingModal(id, name, specialty) {
            document.getElementById('modal-doctor-id').value = id;
            document.getElementById('modal-doctor-info').innerHTML = `
                <div class="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-full flex items-center justify-center font-bold text-lg shadow-md">${name ? name.charAt(0).toUpperCase() : '?'}</div>
                <div>
                    <p class="font-bold text-slate-800">${name || 'Dr. Inconnu'}</p>
                    <p class="text-xs text-slate-500 font-medium">${specialty || 'Spécialiste'}</p>
                </div>
            `;
            // Set min datetime to now
            const now = new Date();
            now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
            document.getElementById('appointment-time').min = now.toISOString().slice(0, 16);
            document.getElementById('booking-modal').classList.remove('hidden');
        }

        function closeModal() {
            document.getElementById('booking-modal').classList.add('hidden');
            document.getElementById('booking-form').reset();
        }

        document.getElementById('booking-form').onsubmit = async (e) => {
            e.preventDefault();
            const btn = document.getElementById('submit-booking');
            const btnText = document.getElementById('btn-text');

            const doctorId = document.getElementById('modal-doctor-id').value;
            const time = document.getElementById('appointment-time').value;

            if (!time) {
                showToast('Veuillez sélectionner une date et heure', 'error');
                return;
            }

            btn.disabled = true;
            btnText.innerText = 'Traitement...';

            try {
                await apiPost('/appointments/book', { 
                    doctor_id: parseInt(doctorId), 
                    appointment_time: time 
                });
                showToast('Rendez-vous réservé avec succès ! 🎉');
                closeModal();
                await loadMyAppointments();
                switchTab('my-appointments');
            } catch (e) {
                showToast(e.message || 'Une erreur est survenue', 'error');
            } finally {
                btn.disabled = false;
                btnText.innerText = 'Confirmer le Rendez-vous';
            }
        };

        // Close modal on backdrop click
        document.getElementById('booking-modal').addEventListener('click', (e) => {
            if (e.target === document.getElementById('booking-modal')) closeModal();
        });

        // ========== TABS ==========
        function switchTab(tab) {
            const dirView = document.getElementById('view-directory');
            const apptView = document.getElementById('view-my-appointments');
            const dirTab = document.getElementById('tab-directory');
            const apptTab = document.getElementById('tab-appointments');

            if (tab === 'directory') {
                dirView.classList.remove('hidden');
                apptView.classList.add('hidden');
                dirTab.className = 'pb-4 px-2 text-sm font-bold border-b-2 border-blue-600 text-blue-600 transition';
                apptTab.className = 'pb-4 px-2 text-sm font-medium text-slate-500 hover:text-blue-600 transition';
            } else {
                dirView.classList.add('hidden');
                apptView.classList.remove('hidden');
                apptTab.className = 'pb-4 px-2 text-sm font-bold border-b-2 border-blue-600 text-blue-600 transition';
                dirTab.className = 'pb-4 px-2 text-sm font-medium text-slate-500 hover:text-blue-600 transition';
                loadMyAppointments(); // Refresh when switching to appointments
            }
        }

        // ========== UTILS ==========
        function logout() {
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

        // ========== START ==========
        init();
