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
            checkReminders();
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
            const maxFee = document.getElementById('filter-max-fee').value.trim();
            const minExp = document.getElementById('filter-min-exp').value.trim();

            try {
                const params = new URLSearchParams();
                if (specialty) params.append('specialization', specialty);
                if (maxFee) params.append('max_fee', maxFee);
                if (minExp) params.append('min_experience', minExp);
                const url = '/doctors?' + params.toString();
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

                grid.innerHTML = doctors.map(doc => {
                    const availabilityBadge = doc.has_availability_this_week
                        ? '<span class="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wide"><span class="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>Disponible cette semaine</span>'
                        : '<span class="inline-flex items-center gap-1 bg-slate-100 text-slate-500 text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wide"><span class="w-1.5 h-1.5 bg-slate-400 rounded-full"></span>Indisponible</span>';
                    const reserveBtn = doc.has_availability_this_week
                        ? `<button onclick="openBookingModal(${doc.id}, '${(doc.name || '').replace(/'/g, "\'")}', '${(doc.specialization || '').replace(/'/g, "\'")}')" class="bg-slate-900 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-blue-600 transition shadow-md"><i class="fa-solid fa-calendar-plus mr-1"></i> Réserver</button>`
                        : `<button disabled title="Ce médecin n'a pas de créneaux disponibles cette semaine" class="bg-slate-200 text-slate-400 px-5 py-2.5 rounded-xl text-sm font-bold cursor-not-allowed"><i class="fa-solid fa-calendar-xmark mr-1"></i> Indisponible</button>`;
                    return `
                    <div class="glass-card p-6 rounded-3xl hover:shadow-xl transition-all group border border-slate-100">
                        <div class="flex items-start justify-between mb-4">
                            <div class="w-16 h-16 bg-gradient-to-br from-blue-100 to-blue-200 text-blue-600 rounded-2xl flex items-center justify-center text-2xl font-bold shadow-sm">
                                ${doc.name ? doc.name.charAt(0).toUpperCase() : '?'}
                            </div>
                            <div class="flex flex-col items-end gap-2">
                                <span class="bg-blue-50 text-blue-600 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide">${doc.specialization || 'Généraliste'}</span>
                                ${availabilityBadge}
                            </div>
                        </div>
                        <h3 class="text-lg font-bold text-slate-800 mb-1">${doc.name || 'Dr. Inconnu'}</h3>
                        <p class="text-slate-500 text-sm mb-4 line-clamp-2 min-h-[2.5rem]">${doc.bio || 'Aucune description disponible.'}</p>
                        <div class="flex items-center justify-between pt-4 border-t border-slate-100">
                            <span class="text-blue-600 font-bold text-lg">${doc.fee || 0} FCFA</span>
                            ${reserveBtn}
                        </div>
                    </div>
                `;
                }).join('');
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
        let selectedSlot = null;
        let currentDoctorId = null;

        function openBookingModal(id, name, specialty) {
            currentDoctorId = id;
            document.getElementById('modal-doctor-info').innerHTML = `
                <div class="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-full flex items-center justify-center font-bold text-lg shadow-md">${name ? name.charAt(0).toUpperCase() : '?'}</div>
                <div>
                    <p class="font-bold text-slate-800">${name || 'Dr. Inconnu'}</p>
                    <p class="text-xs text-slate-500 font-medium">${specialty || 'Spécialiste'}</p>
                </div>
            `;
            document.getElementById('booking-modal').classList.remove('hidden');
            loadAvailableSlots(id);
        }

        async function loadAvailableSlots(doctorId) {
            const container = document.getElementById('slots-container');
            container.innerHTML = `<div class="text-center py-8"><div class="skeleton h-6 w-48 mx-auto mb-4"></div><p class="text-sm text-slate-500">Chargement des créneaux...</p></div>`;
            try {
                const slots = await apiGet(`/appointments/doctor/${doctorId}/available-slots`);
                if (!slots || Object.keys(slots).length === 0) {
                    container.innerHTML = `
                        <div class="text-center py-16">
                            <div class="text-6xl mb-4">🗓️</div>
                            <h3 class="text-lg font-bold text-slate-700 mb-2">Aucun créneau disponible</h3>
                            <p class="text-slate-500 mb-6 max-w-sm mx-auto">Ce médecin n’a pas de disponibilités dans les 14 prochains jours. Revenez plus tard ou essayez un autre spécialiste.</p>
                            <button onclick="closeModal()" class="bg-slate-900 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-blue-600 transition">Fermer</button>
                        </div>`;
                    return;
                }
                let html = '';
                Object.entries(slots).sort((a,b) => a[0].localeCompare(b[0])).forEach(([date, times]) => {
                    const d = new Date(date);
                    const dateStr = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
                    html += `<div class="mb-4">
                        <h4 class="font-bold text-slate-700 mb-2 capitalize">${dateStr}</h4>
                        <div class="grid grid-cols-3 sm:grid-cols-4 gap-2">`;
                    times.forEach(t => {
                        const timeStr = new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                        html += `<button onclick="selectSlot('${t}')" class="slot-btn px-3 py-2 rounded-xl border border-slate-200 hover:border-blue-500 hover:bg-blue-50 text-sm font-medium transition">${timeStr}</button>`;
                    });
                    html += `</div></div>`;
                });
                html += `<button id="confirm-slot-btn" onclick="confirmBooking()" disabled class="w-full bg-blue-600 text-white py-4 rounded-xl font-bold hover:bg-blue-700 transition shadow-lg shadow-blue-200 disabled:opacity-50 disabled:cursor-not-allowed mt-4">Sélectionnez un créneau</button>`;
                container.innerHTML = html;
            } catch (e) {
                container.innerHTML = `<div class="text-center py-16"><div class="text-5xl mb-4">⚠️</div><h3 class="text-lg font-bold text-slate-700 mb-2">Erreur de chargement</h3><p class="text-slate-500 mb-4">${e.message}</p><button onclick="loadAvailableSlots(${doctorId})" class="bg-blue-600 text-white px-6 py-2 rounded-xl font-bold hover:bg-blue-700">Réessayer</button></div>`;
            }
        }

        function selectSlot(slotIso) {
            selectedSlot = slotIso;
            document.querySelectorAll('.slot-btn').forEach(btn => {
                btn.classList.remove('bg-blue-600', 'text-white', 'border-blue-600');
                btn.classList.add('border-slate-200');
            });
            event.target.classList.add('bg-blue-600', 'text-white', 'border-blue-600');
            event.target.classList.remove('border-slate-200');
            document.getElementById('confirm-slot-btn').disabled = false;
            document.getElementById('confirm-slot-btn').innerText = `Confirmer le rendez-vous le ${new Date(slotIso).toLocaleString('fr-FR')}`;
        }

        async function confirmBooking() {
            if (!selectedSlot || !currentDoctorId) return;
            const btn = document.getElementById('confirm-slot-btn');
            btn.disabled = true;
            btn.innerText = 'Traitement...';
            try {
                await apiPost('/appointments/book', { 
                    doctor_id: parseInt(currentDoctorId), 
                    appointment_time: selectedSlot 
                });
                showToast('Rendez-vous réservé avec succès ! 🎉');
                closeModal();
                await loadMyAppointments();
                switchTab('my-appointments');
            } catch (e) {
                showToast(e.message || 'Une erreur est survenue', 'error');
                btn.disabled = false;
                btn.innerText = `Confirmer le rendez-vous le ${new Date(selectedSlot).toLocaleString('fr-FR')}`;
            }
        }

        function closeModal() {
            document.getElementById('booking-modal').classList.add('hidden');
            selectedSlot = null;
            currentDoctorId = null;
        }

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

        // ========== REMINDERS ==========
        async function checkReminders() {
            try {
                const appts = await apiGet('/appointments/my-appointments');
                const now = new Date();
                const in24h = new Date(now.getTime() + 24*60*60*1000);
                const upcoming = appts.filter(a => {
                    const t = new Date(a.appointment_time);
                    return t > now && t <= in24h && a.status !== 'cancelled';
                });
                if (upcoming.length > 0) {
                    upcoming.forEach(a => {
                        const t = new Date(a.appointment_time).toLocaleString('fr-FR');
                        showToast(`Rappel: Rendez-vous avec Dr ${a.doctor_name} le ${t}`, 'success');
                    });
                }
            } catch(e){ console.error('checkReminders failed', e); }
        }

        // ========== START ==========
        init();
