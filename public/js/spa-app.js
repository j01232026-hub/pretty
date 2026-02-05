/**
 * SPA Application Logic
 * Handles routing, LIFF initialization, and page-specific logic.
 */

const App = {
    state: {
        liffId: '2009027968-BcsbldUe', // Updated LIFF ID
        userProfile: null,
        currentTab: 'upcoming', // For Status page
        supabase: null,
        currentUserId: null,
        staffMap: {}, // Shared staff data
        salonInfo: null // Shared salon info
    },

    utils: {
        normalizeName: (name) => {
            const map = App.state.staffMap;
            if (!name || name === '指定設計師' || name === 'Any Staff') return '指定設計師';
            if (map[name]) return name;
            
            const aliases = {
               "思容": "曾思容Phoebe",
               "思容Phoebe": "曾思容Phoebe",
               "Phoebe": "曾思容Phoebe",
               "曾思容": "曾思容Phoebe"
           };
           if (aliases[name]) return aliases[name];
           
           const cleanName = name.replace(/\s+/g, '').toLowerCase();
           const found = Object.keys(map).find(k => {
                const cleanK = k.replace(/\s+/g, '').toLowerCase();
                return cleanK.includes(cleanName) || cleanName.includes(cleanK);
           });
           return found || name;
       },
       fetchStaffData: async () => {
            try {
                const res = await fetch(`/api/staff?t=${Date.now()}`);
                if (res.ok) {
                    const staffList = await res.json();
                    staffList.forEach(s => {
                        App.state.staffMap[s.name] = s;
                    });
                    console.log('Staff data loaded:', Object.keys(App.state.staffMap).length);
                }
            } catch (e) {
                console.error('Failed to load staff data:', e);
            }
        },
        fetchSalonData: async () => {
            if (App.state.salonInfo) return; // Already loaded
            try {
                const res = await fetch('/api/get-salon-info');
                if (res.ok) {
                    App.state.salonInfo = await res.json();
                    console.log('Salon info loaded');
                    
                    // Reactive update if elements exist
                    const info = App.state.salonInfo;
                    const sName = document.querySelector('.salon-name');
                    const sAddr = document.querySelector('.salon-address');
                    const sImg = document.querySelector('.salon-image');
                    
                    if (sName && info.name) sName.textContent = info.name;
                    if (sAddr && info.address) sAddr.textContent = info.address;
                    if (sImg && info.image_url) sImg.style.backgroundImage = `url("${info.image_url}")`;
                }
            } catch (e) {
                console.error('Failed to load salon info:', e);
            }
        }
    },

    init: async () => {
        console.log('SPA App Initializing...');
        
        // Router Setup
        const links = document.querySelectorAll('nav a');
        const content = document.getElementById('app-content');

        App.navigate = async (pageName) => {
            // Update URL hash without scrolling (Deep Linking support)
            if (pageName !== 'booking') {
                 history.replaceState(null, null, `#${pageName}`);
            } else {
                 history.replaceState(null, null, ' '); // Clear hash for default page
            }

            // Update Nav UI
            links.forEach(l => {
                l.classList.remove('text-primary');
                l.classList.add('text-zinc-400');
                const icon = l.querySelector('span');
                if (icon) icon.classList.remove('fill-current');
                
                if (l.dataset.page === pageName) {
                    l.classList.add('text-primary');
                    l.classList.remove('text-zinc-400');
                    if (icon) icon.classList.add('fill-current');
                }
            });

            // Load Fragment
            try {
                // Map page names to fragments
                let fragmentName = pageName;
                if (pageName === 'home') fragmentName = 'booking'; // Default home to booking for now

                const res = await fetch(`fragments/${fragmentName}.html`);
                if (res.ok) {
                    content.innerHTML = await res.text();
                    // Execute Page Logic
                    if (App.pages[pageName]) {
                        await App.pages[pageName].init();
                    }
                } else {
                    content.innerHTML = '<p class="text-center mt-10 text-gray-500">Page not found</p>';
                }
            } catch (err) {
                console.error('Navigation Error:', err);
                content.innerHTML = '<p class="text-center mt-10 text-red-500">Error loading page</p>';
            }
        };

        links.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const page = link.dataset.page;
                App.navigate(page);
            });
        });

        // Initialize LIFF
        await App.initLiff();

        // Handle Deep Linking (Hash-based Routing)
        // Check if there is a hash in the URL (e.g., #status, #member)
        const hash = location.hash.replace('#', '');
        if (hash && App.pages[hash]) {
            console.log(`Deep linking to: ${hash}`);
            App.navigate(hash);
        } else {
            // Load default page (Booking)
            App.navigate('booking'); 
        }
    },

    initLiff: async () => {
        try {
            if (typeof liff === 'undefined') {
                console.warn('LIFF SDK not loaded');
                return;
            }
            await liff.init({ liffId: App.state.liffId });
            if (liff.isLoggedIn()) {
                const profile = await liff.getProfile();
                App.state.userProfile = profile;
                App.state.currentUserId = profile.userId;
                console.log('LIFF Logged in:', profile);
            } else {
                console.log('LIFF not logged in');
            }
        } catch (err) {
            console.error('LIFF Init Error:', err);
            // Fallback for dev
            if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
                App.state.currentUserId = 'U1234567890'; // Mock ID
                console.log('Dev Mode: Mock User ID set');
            }
        }
    },

    // Page Controllers
    pages: {
        booking: {
            state: {
                currentYear: new Date().getFullYear(),
                currentMonth: new Date().getMonth(),
                selectedStylist: null,
                selectedDate: null,
                selectedTimes: new Set()
            },
            init: async () => {
                console.log('Booking Page Initialized');
                
                // Expose global functions for onclick handlers in fragment
                window.changeMonth = App.pages.booking.changeMonth;
                window.closeModal = App.pages.booking.closeModal;
                window.submitBooking = App.pages.booking.submitBooking;
                
                // Set Default Date to Today
                const today = new Date();
                // Format YYYY-MM-DD manually to avoid timezone issues
                const y = today.getFullYear();
                const m = String(today.getMonth() + 1).padStart(2, '0');
                const d = String(today.getDate()).padStart(2, '0');
                App.pages.booking.state.selectedDate = `${y}-${m}-${d}`;
                
                // Initialize Calendar
                App.pages.booking.renderCalendar();
                
                // Load Stylists
                if (Object.keys(App.state.staffMap).length === 0) {
                    await App.utils.fetchStaffData();
                }
                App.pages.booking.renderStylists();
                
                // Fetch slots for today immediately
                App.pages.booking.fetchBookedSlots(App.pages.booking.state.selectedDate);
                
                // Bind Confirm Button
                const confirmBtn = document.getElementById('confirmBtn');
                if (confirmBtn) {
                    confirmBtn.onclick = App.pages.booking.openModal;
                }

                // Fill User Info if logged in
                if (App.state.userProfile) {
                    const nameInput = document.getElementById('nameInput');
                    if (nameInput && !nameInput.value) nameInput.value = App.state.userProfile.displayName;
                }
            },
            renderStylists: () => {
                const container = document.getElementById('stylistContainer');
                if (!container) return;
                
                const staffMap = App.state.staffMap;
                const staffList = Object.values(staffMap);
                
                if (staffList.length === 0) {
                    container.innerHTML = '<div class="text-sm text-gray-400 p-2">暫無設計師資料</div>';
                    return;
                }
                
                container.innerHTML = '';
                
                // Default select "曾思容Phoebe"
                // Check if Phoebe exists, otherwise use the first one
                const defaultStylist = staffList.find(s => s.name === '曾思容Phoebe') || staffList[0];
                if (!App.pages.booking.state.selectedStylist) {
                    App.pages.booking.state.selectedStylist = defaultStylist.name;
                }
                
                staffList.forEach(stylist => {
                    // Filter out '不指定' if it exists in the data (just in case)
                    if (stylist.name === '不指定') return;

                    const isSelected = App.pages.booking.state.selectedStylist === stylist.name;
                    
                    const div = document.createElement('div');
                    div.className = 'flex flex-col items-center gap-2 cursor-pointer stylist-item min-w-[72px]';
                    div.onclick = () => App.pages.booking.selectStylist(div, stylist.name);
                    
                    div.innerHTML = `
                        <div class="w-16 h-16 rounded-full bg-gray-100 border-2 ${isSelected ? 'border-primary' : 'border-transparent'} transition-all overflow-hidden bg-cover bg-center" style="background-image: url('${stylist.avatar_url || stylist.avatar || 'https://lh3.googleusercontent.com/d/1XqCjV9w9dM-vJj1_9WzJ9f8_6wz0_0_0'}')"></div>
                        <p class="text-xs font-bold ${isSelected ? 'text-primary' : 'text-gray-500 opacity-70'} text-center truncate w-full">${stylist.name}</p>
                    `;
                    container.appendChild(div);
                });
            },
            selectStylist: (el, name) => {
                App.pages.booking.state.selectedStylist = name;
                
                // Update UI
                document.querySelectorAll('.stylist-item div').forEach(div => {
                    div.classList.remove('border-primary');
                    div.classList.add('border-transparent');
                });
                document.querySelectorAll('.stylist-item p').forEach(p => {
                    p.classList.remove('text-primary');
                    p.classList.add('opacity-70');
                    p.classList.add('text-gray-500');
                });
                
                const avatar = el.querySelector('div');
                const label = el.querySelector('p');
                avatar.classList.remove('border-transparent');
                avatar.classList.add('border-primary');
                label.classList.remove('opacity-70');
                label.classList.remove('text-gray-500');
                label.classList.add('text-primary');
                
                // Re-fetch slots if date is selected
                if (App.pages.booking.state.selectedDate) {
                    App.pages.booking.fetchBookedSlots(App.pages.booking.state.selectedDate);
                }
            },
            changeMonth: (delta) => {
                const state = App.pages.booking.state;
                state.currentMonth += delta;
                if (state.currentMonth < 0) {
                    state.currentMonth = 11;
                    state.currentYear--;
                } else if (state.currentMonth > 11) {
                    state.currentMonth = 0;
                    state.currentYear++;
                }
                App.pages.booking.renderCalendar();
            },
            renderCalendar: () => {
                const state = App.pages.booking.state;
                const grid = document.getElementById('calendarGrid');
                const monthDisplay = document.getElementById('currentMonthDisplay');
                if (!grid || !monthDisplay) return;
                
                const firstDay = new Date(state.currentYear, state.currentMonth, 1);
                const lastDay = new Date(state.currentYear, state.currentMonth + 1, 0);
                const daysInMonth = lastDay.getDate();
                const startDay = firstDay.getDay(); // 0 = Sunday
                
                monthDisplay.textContent = `${state.currentYear}年 ${state.currentMonth + 1}月`;
                grid.innerHTML = '';
                
                // Empty slots
                for (let i = 0; i < startDay; i++) {
                    const div = document.createElement('div');
                    grid.appendChild(div);
                }
                
                // Days
                const today = new Date();
                today.setHours(0,0,0,0);
                
                for (let i = 1; i <= daysInMonth; i++) {
                    const date = new Date(state.currentYear, state.currentMonth, i);
                    const dateStr = date.toLocaleDateString('en-CA');
                    const isPast = date < today;
                    const isSelected = state.selectedDate === dateStr;
                    
                    const btn = document.createElement('button');
                    btn.className = `w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all mx-auto ${
                        isSelected 
                        ? 'bg-primary text-white shadow-lg shadow-purple-500/30' 
                        : isPast 
                            ? 'text-gray-300 cursor-not-allowed' 
                            : 'hover:bg-purple-100 text-[#1b0d18] dark:text-white dark:hover:bg-white/10'
                    }`;
                    btn.textContent = i;
                    
                    if (!isPast) {
                        btn.onclick = () => {
                            // Update selection UI
                            document.querySelectorAll('#calendarGrid button').forEach(b => {
                                b.className = b.className.replace('bg-primary text-white shadow-lg shadow-purple-500/30', 'hover:bg-purple-100 text-[#1b0d18] dark:text-white dark:hover:bg-white/10');
                            });
                            btn.className = 'w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all mx-auto bg-primary text-white shadow-lg shadow-purple-500/30';
                            
                            state.selectedDate = dateStr;
                            state.selectedTimes.clear(); // Clear time selection on date change
                            App.pages.booking.fetchBookedSlots(dateStr);
                        };
                    }
                    
                    grid.appendChild(btn);
                }
            },
            fetchBookedSlots: async (date) => {
                // Reset time buttons
                App.pages.booking.renderTimeSlots([]); // Temporarily clear/reset
                
                try {
                    const stylist = App.pages.booking.state.selectedStylist === '不指定' ? '' : App.pages.booking.state.selectedStylist;
                    const res = await fetch(`/api/get-busy-slots?date=${date}&stylist=${encodeURIComponent(stylist)}`);
                    const bookedSlots = await res.json();
                    App.pages.booking.renderTimeSlots(bookedSlots);
                } catch (err) {
                    console.error('Failed to fetch booked slots', err);
                    App.pages.booking.renderTimeSlots([]); // Fallback
                }
            },
            renderTimeSlots: (bookedSlots) => {
                // bookedSlots is array of strings e.g. ["10:00", "10:30"]
                const buttons = document.querySelectorAll('.time-btn');
                const state = App.pages.booking.state;
                
                // Check if selected date is today
                const now = new Date();
                const selectedDateStr = state.selectedDate;
                
                // Format now to YYYY-MM-DD for comparison
                const y = now.getFullYear();
                const m = String(now.getMonth() + 1).padStart(2, '0');
                const d = String(now.getDate()).padStart(2, '0');
                const todayStr = `${y}-${m}-${d}`;
                const isToday = selectedDateStr === todayStr;

                buttons.forEach(btn => {
                    const time = btn.dataset.time;
                    const isBooked = bookedSlots.includes(time);
                    
                    // Check if past time
                    let isPastTime = false;
                    if (isToday) {
                        const [h, min] = time.split(':').map(Number);
                        const slotDate = new Date();
                        slotDate.setHours(h, min, 0, 0);
                        
                        // User complained "17:41 can select 18:00"
                        // If current time is 17:41, next valid slot should be > 17:41.
                        // 18:00 is > 17:41, so it SHOULD be selectable?
                        // Wait, maybe the user means they CANNOT select it?
                        // Or maybe they mean "it's too close"?
                        // Let's assume standard booking buffer (e.g. 30 mins advance notice)
                        // If now is 17:41, 18:00 is only 19 mins away.
                        // Let's add a 30-minute buffer.
                        const bufferTime = new Date(now.getTime() + 30 * 60000); // Now + 30 mins

                        if (slotDate < bufferTime) {
                            isPastTime = true;
                        }
                    }

                    // Reset classes
                    btn.className = 'time-btn px-4 py-3 rounded-xl border border-black/5 dark:border-white/5 whitespace-nowrap text-sm font-semibold transition-colors'; // Base class
                    
                    if (state.selectedTimes.has(time)) {
                        btn.classList.add('bg-primary', 'text-white', 'shadow-lg', 'shadow-purple-500/30');
                    } else if (isBooked || isPastTime) {
                        btn.classList.add('bg-gray-100', 'text-gray-300', 'cursor-not-allowed', 'dark:bg-white/5', 'dark:text-gray-600');
                        btn.disabled = true;
                    } else {
                        btn.classList.add('bg-white', 'dark:bg-zinc-900', 'hover:border-primary', 'hover:text-primary');
                        btn.disabled = false;
                    }
                    
                    // Bind click if not bound (or re-bind)
                    btn.onclick = () => {
                        if (!btn.disabled) {
                            App.pages.booking.selectTime(time, btn);
                        }
                    };
                });
            },
            selectTime: (time, btn) => {
                const state = App.pages.booking.state;
                const selectedTimes = state.selectedTimes;
                
                if (selectedTimes.has(time)) {
                    // Deselect
                    selectedTimes.delete(time);
                    // Re-render to update UI (simpler than manual class toggle)
                    App.pages.booking.renderTimeSlots([]); // Need bookedSlots? 
                    // To avoid re-fetching, we should pass the current cached booked slots or just toggle classes.
                    // But re-rendering is safer to ensure state consistency. 
                    // However, we don't have bookedSlots here easily unless we store it.
                    // Let's just toggle classes manually as before.
                    btn.classList.remove('bg-primary', 'text-white', 'shadow-lg', 'shadow-purple-500/30');
                    btn.classList.add('bg-white', 'dark:bg-zinc-900', 'hover:border-primary', 'hover:text-primary');
                } else {
                    // Select
                    if (selectedTimes.size > 0) {
                        // Check continuity
                        const times = Array.from(selectedTimes).sort();
                        // Convert to minutes for easier diff
                        const toMins = (t) => {
                            const [h, m] = t.split(':').map(Number);
                            return h * 60 + m;
                        };
                        const currentMinutes = toMins(time);
                        const lastMinutes = toMins(times[times.length - 1]);
                        
                        // Strict Rule: Must be consecutive and later (Append only)
                        // "必須連續往後的時段，不能往前也不能不連續"
                        if (currentMinutes !== lastMinutes + 30) {
                            alert('只能往後連續預約 (例如: 14:00, 14:30...)');
                            return;
                        }
                    }
                    
                    selectedTimes.add(time);
                    btn.classList.remove('bg-white', 'dark:bg-zinc-900', 'hover:border-primary', 'hover:text-primary');
                    btn.classList.add('bg-primary', 'text-white', 'shadow-lg', 'shadow-purple-500/30');
                }
            },
            openModal: () => {
                const state = App.pages.booking.state;
                const nameInput = document.getElementById('nameInput');
                const phoneInput = document.getElementById('phoneInput');
                
                if (!state.selectedDate) { alert('請選擇日期'); return; }
                if (state.selectedTimes.size < 2) { alert('預約時間必須超過 30 分鐘 (至少選擇 2 個時段)'); return; }
                if (!nameInput.value.trim()) { alert('請輸入姓名'); return; }
                if (!phoneInput.value.trim()) { alert('請輸入手機'); return; }
                
                // Sort times
                const times = Array.from(state.selectedTimes).sort();
                
                document.getElementById('modalStylist').textContent = state.selectedStylist || '不指定';
                document.getElementById('modalDate').textContent = state.selectedDate;
                document.getElementById('modalTime').textContent = times.join(', ');
                document.getElementById('modalName').textContent = nameInput.value;
                document.getElementById('modalPhone').textContent = phoneInput.value;
                
                const modal = document.getElementById('confirmModal');
                const content = document.getElementById('modalContent');
                modal.classList.remove('hidden');
                setTimeout(() => {
                    content.classList.remove('translate-y-full');
                }, 10);
            },
            closeModal: () => {
                const modal = document.getElementById('confirmModal');
                const content = document.getElementById('modalContent');
                content.classList.add('translate-y-full');
                setTimeout(() => {
                    modal.classList.add('hidden');
                }, 300);
            },
            submitBooking: async () => {
                const state = App.pages.booking.state;
                const name = document.getElementById('nameInput').value.trim();
                const phone = document.getElementById('phoneInput').value.trim();
                const times = Array.from(state.selectedTimes).sort();
                
                // Calculate end time (last slot start + 30m)
                const lastTime = times[times.length - 1];
                const [h, m] = lastTime.split(':').map(Number);
                const endDate = new Date();
                endDate.setHours(h, m + 30);
                const endH = endDate.getHours().toString().padStart(2, '0');
                const endM = endDate.getMinutes().toString().padStart(2, '0');
                const endTime = `${endH}:${endM}`;
                
                const submitBtn = document.querySelector('#modalContent button');
                const originalContent = submitBtn.innerHTML;
                submitBtn.innerHTML = '<span>送出預約中...</span><i class="fa-solid fa-spinner fa-spin ml-2"></i>';
                submitBtn.disabled = true;
                
                try {
                    const res = await fetch('/api/submit', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            userId: App.state.currentUserId,
                            name,
                            date: state.selectedDate,
                            time: times[0], // Start time
                            endTime: endTime,
                            phone,
                            stylist: state.selectedStylist === '不指定' ? '' : state.selectedStylist,
                            pictureUrl: App.state.userProfile ? App.state.userProfile.pictureUrl : ''
                        })
                    });
                    
                    if (!res.ok) throw new Error('預約失敗');
                    
                    alert('預約成功！');
                    App.pages.booking.closeModal();
                    App.navigate('status');
                    
                } catch (err) {
                    console.error(err);
                    alert('發生錯誤: ' + err.message);
                    submitBtn.innerHTML = originalContent;
                    submitBtn.disabled = false;
                }
            }
        },

        status: {
            state: {
                currentTab: 'upcoming',
                appointments: [],
                history: []
            },
            init: async () => {
                console.log('Status Page Initialized');
                window.switchTab = App.pages.status.switchTab;
                
                // Show Skeleton if container empty
                const container = document.getElementById('appointments-container');
                if (container && !container.hasChildNodes()) {
                    const skel = document.getElementById('upcoming-skeleton-template');
                    if (skel) container.innerHTML = skel.innerHTML;
                }

                // Fetch Staff Data if missing
                if (Object.keys(App.state.staffMap).length === 0) {
                    await App.utils.fetchStaffData();
                }

                // Fetch Salon Info
                App.utils.fetchSalonData();

                // Initial Tab
                App.pages.status.switchTab('upcoming');
                
                // Fetch Data
                if (App.state.currentUserId) {
                    await App.pages.status.fetchAppointments();
                } else {
                     const checkUser = setInterval(async () => {
                        if (App.state.currentUserId) {
                            clearInterval(checkUser);
                            await App.pages.status.fetchAppointments();
                        }
                     }, 500);
                     setTimeout(() => clearInterval(checkUser), 5000);
                }
            },
            switchTab: (tab) => {
                App.pages.status.state.currentTab = tab;
                // Update Buttons
                const t1 = document.getElementById('tab-upcoming');
                const t2 = document.getElementById('tab-history');
                const controls = document.getElementById('history-controls');
                
                if (t1 && t2) {
                    if (tab === 'upcoming') {
                        t1.classList.add('tab-active'); t1.classList.remove('tab-inactive');
                        t2.classList.add('tab-inactive'); t2.classList.remove('tab-active');
                        if (controls) controls.classList.add('hidden');
                        App.pages.status.renderUpcoming();
                    } else {
                        t1.classList.add('tab-inactive'); t1.classList.remove('tab-active');
                        t2.classList.add('tab-active'); t2.classList.remove('tab-inactive');
                        if (controls) controls.classList.remove('hidden');
                        App.pages.status.renderHistory();
                    }
                }
            },
            fetchAppointments: async () => {
                const container = document.getElementById('appointments-container');
                if (!container) return;
                
                // Guard: If user not logged in, show loading or empty state
                if (!App.state.currentUserId) {
                     return;
                }

                // Skeleton HTML Definition
                const skeletonHTML = `
                    <div class="brand-card p-6 mb-4 relative overflow-hidden bg-white rounded-2xl shadow-sm border border-gray-100">
                        <div class="flex justify-between items-start mb-4">
                            <div class="w-3/4">
                                <div class="skeleton skeleton-text w-1/3 mb-2"></div>
                                <div class="skeleton skeleton-text w-1/2"></div>
                            </div>
                            <div class="skeleton skeleton-circle w-12 h-12"></div>
                        </div>
                        <div class="skeleton skeleton-block h-24 w-full rounded-xl mb-4"></div>
                        <div class="flex gap-2">
                             <div class="skeleton skeleton-block h-10 flex-1 rounded-lg"></div>
                             <div class="skeleton skeleton-block h-10 flex-1 rounded-lg"></div>
                        </div>
                    </div>
                `;

                // Show Skeleton (Insert 2 items to simulate loading)
                container.innerHTML = skeletonHTML + skeletonHTML;
                
                try {
                    const res = await fetch(`/api/get-appointments?user_id=${App.state.currentUserId}&type=all`);
                    if (!res.ok) {
                        let msg = `API Error: ${res.status}`;
                        try {
                            const errData = await res.json();
                            if (errData.error) msg += ` - ${errData.error}`;
                        } catch (e) {}
                        throw new Error(msg);
                    }
                    const data = await res.json();
                    
                    const now = new Date();
                    const todayStr = now.toLocaleDateString('en-CA');
                    const currentMinutes = now.getHours() * 60 + now.getMinutes();
                    
                    const isHistory = (a) => {
                         const d = new Date(a.date + ' ' + a.time);
                         if (a.date < todayStr) return true;
                         if (a.date === todayStr) {
                             const [h, m] = a.time.split(':').map(Number);
                             const startMins = h * 60 + m;
                             const endMins = startMins + 60; // Assume 60 mins
                             return endMins <= currentMinutes;
                         }
                         return false;
                    };

                    App.pages.status.state.appointments = data.filter(a => !isHistory(a)).sort((a,b) => new Date(a.date+' '+a.time) - new Date(b.date+' '+b.time));
                    App.pages.status.state.history = data.filter(a => isHistory(a)).sort((a,b) => new Date(b.date+' '+b.time) - new Date(a.date+' '+a.time));
                    
                    App.pages.status.switchTab(App.pages.status.state.currentTab);
                    
                } catch (err) {
                    console.error(err);
                    container.innerHTML = `<div class="text-center p-4 text-gray-500">
                        <p>載入失敗</p>
                        <p class="text-xs text-red-400 mt-2">${err.message}</p>
                    </div>`;
                }
            },
            renderUpcoming: () => {
                const container = document.getElementById('appointments-container');
                const data = App.pages.status.state.appointments;
                if (!container) return;
                
                container.innerHTML = '';
                
                if (data.length === 0) {
                    container.innerHTML = `
                        <div class="flex flex-col items-center justify-center py-10 opacity-70">
                            <i class="fa-regular fa-calendar-xmark text-4xl text-gray-300 mb-4"></i>
                            <p class="text-gray-500 text-sm">目前沒有即將到來的預約</p>
                            <button onclick="App.navigate('booking')" class="mt-6 px-6 py-2 bg-primary text-white rounded-full text-sm font-bold shadow-lg shadow-purple-500/20">
                                立即預約
                            </button>
                        </div>`;
                    return;
                }
                
                const template = document.getElementById('active-card-template');
                const clone = template.content.cloneNode(true);
                
                const first = data[0];
                
                // Helper to calculate end time (default +60 mins)
                const getEndTime = (timeStr) => {
                    if (!timeStr) return '';
                    const [h, m] = timeStr.split(':').map(Number);
                    const d = new Date();
                    d.setHours(h, m + 60);
                    return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
                };

                // Fill Hero Card
                clone.querySelector('.booking-service').textContent = first.service || '一般服務';
                clone.querySelector('.date-text').textContent = first.date;
                // Show Time Range
                clone.querySelector('.time-text').textContent = `${first.time} - ${getEndTime(first.time)}`;
                clone.querySelector('.duration-text').textContent = '60 分鐘';
                clone.querySelector('.stylist-name').textContent = App.utils.normalizeName(first.stylist);
                
                const staff = App.state.staffMap[first.stylist];
                if (staff && (staff.avatar_url || staff.avatar)) {
                    const avatar = clone.querySelector('.bg-cover.rounded-full');
                    if (avatar) avatar.style.backgroundImage = `url('${staff.avatar_url || staff.avatar}')`;
                }
                
                // In Progress Check
                const now = new Date();
                const todayStr = now.toLocaleDateString('en-CA');
                if (first.date === todayStr) {
                     const [currentH, currentM] = [now.getHours(), now.getMinutes()];
                     const currentVal = currentH * 60 + currentM;
                     const [startH, startM] = first.time.split(':').map(Number);
                     const startVal = startH * 60 + startM;
                     const endVal = startVal + 60; // Default 60 mins
                     
                     if (currentVal >= startVal && currentVal < endVal) {
                         const statusContainer = clone.querySelector('.fa-circle-check').parentElement;
                         if (statusContainer) {
                             statusContainer.innerHTML = `<div class="relative h-14 w-full flex justify-center items-center mb-2"><i class="fa-solid fa-spa text-5xl absolute animate-icon-1"></i><i class="fa-solid fa-hand-sparkles text-5xl absolute animate-icon-2"></i><i class="fa-solid fa-eye text-5xl absolute animate-icon-3"></i></div><p class="text-3xl font-bold">進行中</p>`;
                         }
                     }
                }
                
                // Bind Reschedule Button
                const rescheduleBtn = clone.querySelector('.btn-reschedule');
                if (rescheduleBtn) {
                    rescheduleBtn.onclick = () => {
                         alert('請聯繫客服進行更改'); 
                    };
                }

                // Update Salon Info from State
                const salonInfo = App.state.salonInfo;
                if (salonInfo) {
                    const sName = clone.querySelector('.salon-name');
                    const sAddr = clone.querySelector('.salon-address');
                    const sImg = clone.querySelector('.salon-image');
                    
                    if (sName && salonInfo.name) sName.textContent = salonInfo.name;
                    if (sAddr && salonInfo.address) sAddr.textContent = salonInfo.address;
                    if (sImg && salonInfo.image_url) sImg.style.backgroundImage = `url("${salonInfo.image_url}")`;
                }

                // Render Compact List (Same Day Later Schedule)
                const listContainer = clone.getElementById('compact-list-container');
                if (listContainer && data.length > 1) {
                    const sameDayApps = data.slice(1).filter(a => a.date === first.date);
                    
                    if (sameDayApps.length > 0) {
                        // Header
                        const header = document.createElement('h3');
                        header.className = 'text-[#1b0d18] dark:text-white text-lg font-bold leading-tight tracking-[-0.015em] pb-3 mt-4';
                        header.textContent = '當日稍後行程';
                        listContainer.appendChild(header);
                        
                        // Cards
                        sameDayApps.forEach(app => {
                            const staffInfo = App.state.staffMap[app.stylist] || {};
                            const avatarUrl = staffInfo.avatar_url || staffInfo.avatar || 'https://lh3.googleusercontent.com/aida-public/AB6AXuCL1YvZc9vWZJ9GiVuuWWM-av6u8YdeHm1Jgv8tYw8axrTwQq7ZR84wTe89nuC8A5dwR_oya7pRLN6xYwqXY8V-0NRIgWQ5hWQYbI9iVI30AvhTiRXo4NRXDFL5ZndEXlKm6RxxbKoZh000JC42yB5urx2De51L2d10BSBu_klGM0fcejTK5Q0QbbocZy6IOVWw3hV_fkczYRfPQpCjbbdHHyun9LGo16YDclE613E4Y6fLw_q4igKd9RsXCfy1sTzTNgW7Do_pC8u4';
                            const timeRange = `${app.time} - ${getEndTime(app.time)}`;
                            
                            const div = document.createElement('div');
                            // Updated to match user requested design (Image 2 style)
                            div.className = 'flex items-stretch bg-white dark:bg-[#2d1a29] rounded-[2rem] shadow-[0_2px_12px_rgba(0,0,0,0.04)] mb-4 overflow-hidden';
                            div.innerHTML = `
                                <div class="flex flex-col items-center justify-center w-[140px] border-r border-gray-100 dark:border-white/10 py-5">
                                   <i class="fa-regular fa-clock text-[#9d2bee] text-xl mb-2"></i>
                                   <span class="text-[#9d2bee] font-bold text-lg tracking-tight whitespace-nowrap">
                                       ${timeRange}
                                   </span>
                               </div>
                               <div class="flex-1 flex flex-col justify-center px-6 py-4">
                                   <p class="text-[#1b0d18] dark:text-white text-lg font-bold mb-2 leading-tight line-clamp-1">${app.service || '一般服務'}</p>
                                   <div class="flex items-center gap-2">
                                       <div class="w-6 h-6 rounded-full bg-cover bg-center shrink-0 border border-gray-100 dark:border-gray-700" style="background-image: url('${avatarUrl}')"></div>
                                       <p class="text-gray-500 dark:text-gray-400 font-medium text-sm line-clamp-1">${App.utils.normalizeName(app.stylist)}</p>
                                   </div>
                               </div>
                            `;
                            listContainer.appendChild(div);
                        });
                    }
                    
                    // Handle future dates if needed (Optional: currently hiding to keep it clean as requested)
                    const futureApps = data.slice(1).filter(a => a.date !== first.date);
                    if (futureApps.length > 0) {
                         const header = document.createElement('h3');
                         header.className = 'text-[#1b0d18] dark:text-white text-lg font-bold leading-tight tracking-[-0.015em] pb-3 mt-4';
                         header.textContent = '未來行程';
                         listContainer.appendChild(header);
                         
                         futureApps.forEach(app => {
                             const div = document.createElement('div');
                             div.className = 'compact-appointment-card mb-3';
                             div.innerHTML = `
                                <div class="flex flex-col flex-1">
                                    <p class="text-sm font-bold text-[#1b0d18] dark:text-white">${app.service || '一般服務'}</p>
                                    <p class="text-xs text-gray-500">${app.date} ${app.time}</p>
                                </div>
                                <div class="text-primary font-bold text-sm">
                                    ${App.utils.normalizeName(app.stylist)}
                                </div>
                             `;
                             listContainer.appendChild(div);
                         });
                    }
                }
                
                container.appendChild(clone);
            },
            renderHistory: () => {
                const container = document.getElementById('appointments-container');
                const data = App.pages.status.state.history;
                if (!container) return;
                
                container.innerHTML = '';
                
                if (data.length === 0) {
                     container.innerHTML = '<p class="text-center p-4 text-gray-500">無歷史紀錄</p>';
                     return;
                }
                
                const template = document.getElementById('history-card-template');
                
                data.forEach(app => {
                    const clone = template.content.cloneNode(true);
                    clone.querySelector('.stylist-name').textContent = App.utils.normalizeName(app.stylist);
                    clone.querySelector('.service-info').textContent = `${app.service || '一般服務'} • ${app.date}`;
                    clone.querySelector('.price-info').textContent = `NT$ ${app.price || '500'}`;
                    
                    const staff = App.state.staffMap[app.stylist];
                    if (staff && (staff.avatar_url || staff.avatar)) {
                        const avatar = clone.querySelector('.bg-cover');
                        if (avatar) avatar.style.backgroundImage = `url('${staff.avatar_url || staff.avatar}')`;
                    }
                    
                    const rebookBtn = clone.querySelector('.btn-rebook');
                    if (rebookBtn) {
                        rebookBtn.onclick = () => {
                            App.navigate('booking');
                        };
                    }
                    
                    container.appendChild(clone);
                });
            }
        },

        chat: {
            state: {
                messages: []
            },
            init: async () => {
                console.log('Chat Page Initialized');
                
                // Initialize Supabase if needed
                if (!App.state.supabase) {
                    await App.pages.chat.initSupabase();
                }
                
                // Load History
                if (App.state.currentUserId) {
                    await App.pages.chat.loadHistory();
                }
                
                // Subscribe
                App.pages.chat.subscribeRealtime();
                
                // Bind UI
                const sendBtn = document.getElementById('send-btn');
                const input = document.getElementById('message-input');
                
                if (sendBtn) sendBtn.onclick = App.pages.chat.sendMessage;
                if (input) {
                    input.addEventListener('input', function() {
                        this.style.height = 'auto';
                        this.style.height = (this.scrollHeight) + 'px';
                        sendBtn.disabled = !this.value.trim();
                    });
                }
                
                // Back button
                const backBtn = document.getElementById('back-btn');
                if (backBtn) {
                    backBtn.onclick = () => App.navigate('status');
                }
            },
            initSupabase: async () => {
                 try {
                    const res = await fetch('/api/config');
                    const config = await res.json();
                    if (window.supabase) {
                        App.state.supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseKey);
                    }
                } catch (e) {
                    console.error('Supabase init error', e);
                }
            },
            loadHistory: async () => {
                const container = document.getElementById('chat-container');
                if (!container) return;
                
                try {
                    const res = await fetch(`/api/get-messages?user_id=${App.state.currentUserId}`);
                    if (res.ok) {
                        const msgs = await res.json();
                        // Clear spinner if exists (handled by innerHTML='' in append if empty, but here we append)
                        // Actually first time clear default content
                        const spinner = document.getElementById('loading-spinner');
                        if(spinner) spinner.remove();
                        
                        msgs.forEach(m => App.pages.chat.appendMessage(m));
                        App.pages.chat.scrollToBottom();
                    }
                } catch (e) {
                    console.error(e);
                }
            },
            subscribeRealtime: () => {
                if (!App.state.supabase) return;
                App.state.supabase.channel('public:messages')
                    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
                         const newMsg = payload.new;
                         if (newMsg.receiver_id === App.state.currentUserId) {
                             App.pages.chat.appendMessage(newMsg);
                         }
                    })
                    .subscribe();
            },
            sendMessage: async () => {
                const input = document.getElementById('message-input');
                const content = input.value.trim();
                if (!content) return;
                
                input.value = '';
                input.style.height = 'auto';
                
                // Optimistic UI
                const tempMsg = {
                    content,
                    sender_id: App.state.currentUserId,
                    created_at: new Date().toISOString()
                };
                App.pages.chat.appendMessage(tempMsg);
                App.pages.chat.scrollToBottom();
                
                try {
                    await fetch('/api/send-message', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            content,
                            sender_id: App.state.currentUserId,
                            receiver_id: 'ADMIN',
                            sender_name: App.state.userProfile?.displayName || 'Guest',
                            sender_avatar: App.state.userProfile?.pictureUrl || ''
                        })
                    });
                } catch (e) {
                    console.error('Send failed', e);
                    alert('發送失敗');
                }
            },
            appendMessage: (msg) => {
                const container = document.getElementById('chat-container');
                if (!container) return;
                
                const isMe = msg.sender_id === App.state.currentUserId;
                const div = document.createElement('div');
                div.className = `flex w-full mb-4 ${isMe ? 'justify-end' : 'justify-start'}`;
                
                const time = new Date(msg.created_at).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
                
                if (isMe) {
                    div.innerHTML = `
                        <div class="flex flex-col items-end max-w-[75%]">
                            <div class="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-4 py-2 rounded-2xl rounded-tr-none shadow-lg shadow-purple-500/20 break-words text-sm relative">
                                ${msg.content.replace(/</g, '&lt;')}
                            </div>
                            <span class="text-[10px] text-gray-500 mt-1 mr-1 font-medium">${time}</span>
                        </div>
                    `;
                } else {
                    div.innerHTML = `
                         <div class="flex w-full max-w-[85%] gap-2">
                            <div class="flex-shrink-0 w-8 h-8 rounded-full bg-gray-200 overflow-hidden">
                                <img src="${msg.sender_avatar || 'https://api.dicebear.com/9.x/avataaars/svg?seed=Support'}" class="w-full h-full object-cover">
                            </div>
                            <div class="flex flex-col items-start">
                                <span class="text-[10px] text-gray-500 mb-1 ml-1">${msg.sender_name || '客服'}</span>
                                <div class="bg-white text-gray-800 px-4 py-2 rounded-2xl rounded-tl-none shadow-sm border border-gray-100 break-words text-sm">
                                     ${msg.content.replace(/</g, '&lt;')}
                                </div>
                                <span class="text-[10px] text-gray-500 mt-1 ml-1 font-medium">${time}</span>
                            </div>
                        </div>
                    `;
                }
                container.appendChild(div);
            },
            scrollToBottom: () => {
                const container = document.getElementById('chat-container');
                if (container) container.scrollTop = container.scrollHeight;
            }
        },
// Removed duplicate Status and Chat controllers
        history: {
            init: async () => {
                console.log('History Page Initialized');
                if (Object.keys(App.state.staffMap).length === 0) {
                    await App.utils.fetchStaffData();
                }
                await App.pages.history.fetchHistory();
            },
            fetchHistory: async () => {
                const container = document.getElementById('history-container');
                if (!container) return;

                const userId = App.state.currentUserId;
                if (!userId) {
                        console.warn('User ID missing for history');
                        return;
                }

                // Skeleton HTML Definition
                const skeletonHTML = `
                    <div class="bg-white rounded-xl p-4 mb-3 shadow-sm flex gap-3 items-center">
                        <div class="skeleton skeleton-block w-16 h-16 rounded-lg shrink-0"></div>
                        <div class="flex-1 flex flex-col gap-2">
                            <div class="skeleton skeleton-text w-1/3 h-4"></div>
                            <div class="skeleton skeleton-text w-3/4 h-3"></div>
                            <div class="skeleton skeleton-text w-1/4 h-3"></div>
                        </div>
                        <div class="skeleton skeleton-block w-20 h-8 rounded-full"></div>
                    </div>
                `;

                // Show Skeleton
                container.innerHTML = skeletonHTML + skeletonHTML + skeletonHTML;
                
                try {
                    const res = await fetch(`/api/get-appointments?user_id=${userId}&type=history`);
                    if (!res.ok) throw new Error('API Error');
                    const data = await res.json();
                    
                    App.pages.history.renderHistory(data);

                } catch (err) {
                    console.error('Fetch Error:', err);
                    container.innerHTML = `<p class="text-center text-gray-500 mt-10">無法載入歷史紀錄</p>`;
                }
            },
            renderHistory: (appointments) => {
                const container = document.getElementById('history-container');
                if (!container) return;
                container.innerHTML = '';

                if (!appointments || appointments.length === 0) {
                    container.innerHTML = `
                        <div class="py-12 flex flex-col items-center justify-center text-gray-400 opacity-60">
                            <i class="fa-solid fa-clock-rotate-left text-6xl mb-4"></i>
                            <p class="text-sm">目前沒有歷史預約紀錄</p>
                        </div>
                    `;
                    return;
                }

                const template = document.getElementById('history-card-template');
                if (!template) return;

                appointments.forEach(appt => {
                    const clone = template.content.cloneNode(true);
                    
                    const stylistName = appt.stylist || '指定設計師';
                    const nameEl = clone.querySelector('.stylist-name');
                    if(nameEl) nameEl.textContent = stylistName;
                    
                    // Update History Avatar
                    const historyAvatarEl = clone.querySelector('.bg-cover.rounded-lg.shrink-0'); 
                    if (historyAvatarEl) {
                        let avatarUrl = "https://lh3.googleusercontent.com/aida-public/AB6AXuCMkStRV5clh0STCcvx_LWc9Vpp_VBOkSH_dWLFtqa_sDAyQmRXubyOk5l8Vr9e18QjvMAaGqZ3ete56yz2J5TaYDSUDg4KoVadJig1m9hZX9mtZ_Tz7BD4Qay9WaQ1SDOEQq7BWAt7zynSJ10s6c7SUeQHXA735GkRYttcb9hRiJw9MIkUMhNSGZP5mVphsrJmc82Hx5j-FDHlUzqU1I4UUEiSY488Pc0O_ES_tGYwo9q8VIcT7CFDgwb0dKscUUwvh3PxL2rhDn3O";
                        const staff = App.state.staffMap[stylistName];
                        if (staff && staff.avatar_url) {
                            avatarUrl = staff.avatar_url;
                        }
                        historyAvatarEl.style.backgroundImage = `url("${avatarUrl}")`;
                    }

                    // Format Date
                    let timeDisplay = appt.time;
                    if (appt.endTime) {
                        timeDisplay += ` - ${appt.endTime}`;
                    }
                    clone.querySelector('.service-info').textContent = `一般服務 • ${appt.date} • ${timeDisplay}`;
                    
                    clone.querySelector('.price-info').textContent = `NT$ ${appt.price || 500}`;

                    // Rebook Button
                    const rebookBtn = clone.querySelector('.btn-rebook');
                    if (rebookBtn) {
                        rebookBtn.onclick = () => {
                            App.navigate('booking');
                        };
                    }

                    container.appendChild(clone);
                });
                
                // End of list indicator
                const endIndicator = document.createElement('div');
                endIndicator.className = 'py-8 flex flex-col items-center justify-center text-gray-400 opacity-60';
                endIndicator.innerHTML = `
                    <i class="fa-solid fa-clock-rotate-left text-4xl mb-2"></i>
                    <p class="text-sm">已顯示所有紀錄</p>
                `;
                container.appendChild(endIndicator);
            }
        },
        member: {
            state: { pendingAvatar: null, currentProfile: null },
            compressImage: (file) => {
                return new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.readAsDataURL(file);
                    reader.onload = (e) => {
                        const img = new Image();
                        img.src = e.target.result;
                        img.onload = () => {
                            const canvas = document.createElement('canvas');
                            const ctx = canvas.getContext('2d');
                            const MAX_WIDTH = 500;
                            const MAX_HEIGHT = 500;
                            let width = img.width;
                            let height = img.height;
                            if (width > height) {
                                if (width > MAX_WIDTH) {
                                    height *= MAX_WIDTH / width;
                                    width = MAX_WIDTH;
                                }
                            } else {
                                if (height > MAX_HEIGHT) {
                                    width *= MAX_HEIGHT / height;
                                    height = MAX_HEIGHT;
                                }
                            }
                            canvas.width = width;
                            canvas.height = height;
                            ctx.drawImage(img, 0, 0, width, height);
                            resolve(canvas.toDataURL('image/jpeg', 0.7));
                        };
                        img.onerror = reject;
                    };
                    reader.onerror = reject;
                });
            },
            handleAvatarChange: async (event) => {
                const file = event.target.files[0];
                if (!file) return;
                try {
                    const compressed = await App.pages.member.compressImage(file);
                    const profileAvatarEdit = document.getElementById('profile-avatar-edit');
                    if (profileAvatarEdit) profileAvatarEdit.style.backgroundImage = `url("${compressed}")`;
                    App.pages.member.state.pendingAvatar = compressed;
                } catch (e) {
                    console.error('Avatar error', e);
                    alert('圖片處理失敗');
                }
            },
            init: async () => {
                console.log('Member Page Initialized');
                
                // Expose global functions for fragment onclicks
                window.submitProfile = App.pages.member.submitProfile;
                window.editProfile = App.pages.member.editProfile;
                window.handleAvatarChange = App.pages.member.handleAvatarChange;

                const loadingScreen = document.getElementById('loading-screen');
                
                // Bind Back Button
                const backBtn = document.querySelector('header button');
                if(backBtn) {
                     // Override default history.back() if needed, but SPA nav handles it mostly. 
                     // Ideally, it should go to Home/Booking or just use history.back()
                }

                await App.pages.member.checkMemberStatus();
                
                // Bind Form Events
                const submitBtn = document.getElementById('submit-btn');
                if (submitBtn) {
                    submitBtn.onclick = App.pages.member.submitProfile;
                }
                
                const editBtn = document.getElementById('edit-profile-btn');
                if (editBtn) {
                    editBtn.onclick = App.pages.member.editProfile;
                }
            },
            editProfile: () => {
                const completeSection = document.getElementById('complete-profile-section');
                const cardSection = document.getElementById('member-card-section');
                const pageTitle = document.getElementById('page-title');
                
                if (completeSection) completeSection.style.display = 'block';
                if (cardSection) cardSection.style.display = 'none';
                if (pageTitle) pageTitle.textContent = '修改資料';
                
                const realNameInput = document.getElementById('real-name');
                const phoneInput = document.getElementById('phone');
                const birthdayInput = document.getElementById('birthday');
                const emailInput = document.getElementById('email');
                const profileAvatarEdit = document.getElementById('profile-avatar-edit');
                
                // Try to load from state first
                const profile = App.pages.member.state.currentProfile;
                if (profile) {
                    if (realNameInput) realNameInput.value = profile.display_name || '';
                    if (phoneInput) phoneInput.value = profile.phone || '';
                    if (birthdayInput) birthdayInput.value = profile.birthday || '';
                    if (emailInput) emailInput.value = profile.email || '';
                    if (profileAvatarEdit) {
                        if (profile.picture_url) {
                            profileAvatarEdit.style.backgroundImage = `url("${profile.picture_url}")`;
                        } else if (App.state.userProfile && App.state.userProfile.pictureUrl) {
                            profileAvatarEdit.style.backgroundImage = `url("${App.state.userProfile.pictureUrl}")`;
                        }
                    }
                    return; // Done if state exists
                }

                // Fallback to DOM scraping (Legacy)
                const cardName = document.getElementById('card-name');
                const cardPhone = document.getElementById('card-phone');
                const cardBirthday = document.getElementById('card-birthday');
                const cardAvatar = document.getElementById('card-avatar');
                
                if (cardName && realNameInput) realNameInput.value = cardName.textContent;
                if (cardPhone && phoneInput && cardPhone.textContent !== '-') phoneInput.value = cardPhone.textContent;
                if (cardBirthday && birthdayInput && cardBirthday.textContent !== '-') birthdayInput.value = cardBirthday.textContent;
                
                if (cardAvatar && profileAvatarEdit) {
                     // Extract URL from background-image
                     const style = cardAvatar.style.backgroundImage;
                     if (style) {
                         profileAvatarEdit.style.backgroundImage = style;
                     }
                }
            },
            checkMemberStatus: async () => {
                const loadingScreen = document.getElementById('loading-screen');
                try {
                    const userId = App.state.currentUserId;
                    if (!userId) {
                         if (loadingScreen) loadingScreen.style.display = 'none';
                         return;
                    }

                    const res = await fetch(`/api/check-member-status?user_id=${userId}`);
                    const data = await res.json();

                    if (loadingScreen) loadingScreen.style.display = 'none';

                    App.pages.member.state.currentProfile = data.profile;

                    if (data.is_complete) {
                        App.pages.member.showMemberCard(data.profile);
                    } else {
                        App.pages.member.showCompleteProfile(data.profile);
                    }
                } catch (err) {
                    console.error('Check Status Error:', err);
                    if (loadingScreen) loadingScreen.style.display = 'none';
                    App.pages.member.showCompleteProfile({});
                }
            },
            showCompleteProfile: (profileData) => {
                // Reset pending avatar state
                App.pages.member.state.pendingAvatar = null;

                const completeSection = document.getElementById('complete-profile-section');
                const cardSection = document.getElementById('member-card-section');
                const pageTitle = document.getElementById('page-title');
                const realNameInput = document.getElementById('real-name');
                const phoneInput = document.getElementById('phone');
                const birthdayInput = document.getElementById('birthday');
                const emailInput = document.getElementById('email');
                const profileAvatarEdit = document.getElementById('profile-avatar-edit');

                if (completeSection) completeSection.style.display = 'block';
                if (cardSection) cardSection.style.display = 'none';
                if (pageTitle) pageTitle.textContent = '完善個人資料';

                // Auto-fill Logic
                if (profileData) {
                    if (profileData.display_name && realNameInput) realNameInput.value = profileData.display_name;
                    else if (App.state.userProfile && App.state.userProfile.displayName && realNameInput) realNameInput.value = App.state.userProfile.displayName;
                    
                    if (profileData.phone && phoneInput) phoneInput.value = profileData.phone;
                    if (profileData.birthday && birthdayInput) birthdayInput.value = profileData.birthday;
                    if (profileData.email && emailInput) emailInput.value = profileData.email;

                    // Avatar
                    if (profileAvatarEdit) {
                         if (profileData.picture_url) {
                             profileAvatarEdit.style.backgroundImage = `url("${profileData.picture_url}")`;
                         } else if (App.state.userProfile && App.state.userProfile.pictureUrl) {
                             profileAvatarEdit.style.backgroundImage = `url("${App.state.userProfile.pictureUrl}")`;
                         }
                    }
                } else if (App.state.userProfile && realNameInput) {
                    realNameInput.value = App.state.userProfile.displayName;
                    if (profileAvatarEdit && App.state.userProfile.pictureUrl) {
                         profileAvatarEdit.style.backgroundImage = `url("${App.state.userProfile.pictureUrl}")`;
                    }
                }
            },
            showMemberCard: (profileData) => {
                const completeSection = document.getElementById('complete-profile-section');
                const cardSection = document.getElementById('member-card-section');
                const pageTitle = document.getElementById('page-title');
                
                const cardName = document.getElementById('card-name');
                const cardPhone = document.getElementById('card-phone');
                const cardAvatar = document.getElementById('card-avatar');
                const cardBirthday = document.getElementById('card-birthday');
                const cardJoinDate = document.getElementById('card-join-date');

                if (completeSection) completeSection.style.display = 'none';
                if (cardSection) cardSection.style.display = 'block';
                if (pageTitle) pageTitle.textContent = '會員中心';

                if (profileData) {
                    if (cardName) cardName.textContent = profileData.display_name || '會員';
                    if (cardPhone) cardPhone.textContent = profileData.phone || '-';
                    if (cardBirthday) cardBirthday.textContent = profileData.birthday || '-';
                    
                    if (cardJoinDate) {
                        if (profileData.created_at) {
                            const date = new Date(profileData.created_at);
                            cardJoinDate.textContent = date.toLocaleDateString('zh-TW');
                        } else if (profileData.updated_at) {
                            const date = new Date(profileData.updated_at);
                            cardJoinDate.textContent = date.toLocaleDateString('zh-TW');
                        } else {
                            cardJoinDate.textContent = '2025/01/01'; // Fallback
                        }
                    }

                    if (cardAvatar) {
                        if (profileData.picture_url) {
                            cardAvatar.style.backgroundImage = `url("${profileData.picture_url}")`;
                        } else if (App.state.userProfile && App.state.userProfile.pictureUrl) {
                             cardAvatar.style.backgroundImage = `url("${App.state.userProfile.pictureUrl}")`;
                        }
                    }
                }
            },
            submitProfile: async () => {
                const realNameInput = document.getElementById('real-name');
                const birthdayInput = document.getElementById('birthday');
                const phoneInput = document.getElementById('phone');
                const emailInput = document.getElementById('email');
                const submitBtn = document.getElementById('submit-btn');

                if (!phoneInput.value || !birthdayInput.value) {
                    alert('請填寫手機和生日');
                    return;
                }
                
                if (submitBtn) {
                    submitBtn.disabled = true;
                    submitBtn.textContent = '送出中...';
                }

                try {
                    const userId = App.state.currentUserId;
                    const pendingAvatar = App.pages.member.state.pendingAvatar;
                    const currentAvatar = App.state.userProfile ? App.state.userProfile.pictureUrl : '';
                    const finalAvatar = pendingAvatar || currentAvatar;

                    const res = await fetch('/api/update-member-profile', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            user_id: userId,
                            name: realNameInput.value,
                            phone: phoneInput.value,
                            birthday: birthdayInput.value,
                            email: emailInput.value,
                            picture_url: finalAvatar
                        })
                    });
                    
                    if (res.ok) {
                        const result = await res.json();
                        alert('資料更新成功！');
                        App.pages.member.state.currentProfile = result.profile;
                        App.pages.member.showMemberCard(result.profile);
                    } else {
                        const errData = await res.json();
                        alert(`更新失敗: ${errData.error || '請稍後再試'}`);
                    }
                } catch (err) {
                    console.error(err);
                    alert('發生錯誤');
                } finally {
                    if (submitBtn) {
                        submitBtn.disabled = false;
                        submitBtn.innerHTML = `<span>確認送出</span><span class="material-symbols-outlined text-[20px]">check_circle</span>`;
                    }
                }
            }
        }
    }
};

// Expose App globally for inline onclick handlers
window.App = App;

document.addEventListener('DOMContentLoaded', App.init);
