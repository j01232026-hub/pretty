let currentBookingType = 'staff_booking'; // 'staff_booking' or 'block'
let searchTimeout = null;

// Calendar & Time Logic Variables
let currentCalendarDate = new Date();
let selectedDate = null;
let selectedTime = null;
let selectedTimeSlots = [];

// Ensure we have access to the secret
const SEARCH_API_SECRET = (typeof ADMIN_SECRET !== 'undefined') ? ADMIN_SECRET : 'MyBeautyShop_2026_Boss_Only!';

function openAdminBookingModal() {
    const modal = document.getElementById('adminBookingModal');
    if (modal) {
        modal.classList.remove('hidden');
        loadModalStylists();
        
        // Initialize Calendar and Time
        currentCalendarDate = new Date();
        const todayStr = formatDate(new Date());
        
        // Set default selected date to today
        selectDate(todayStr);
        
        // Reset time
        selectedTime = null;
        selectedTimeSlots = [];
        document.getElementById('hiddenTimeInput').value = '';
        renderTimeSlots();
        
        // Reset search
        const searchInput = document.getElementById('memberSearchInput');
        if (searchInput) searchInput.value = '';
        const searchResults = document.getElementById('memberSearchResults');
        if (searchResults) {
            searchResults.classList.add('hidden');
            searchResults.innerHTML = '';
        }
    }
}

function closeAdminBookingModal() {
    const modal = document.getElementById('adminBookingModal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

function setBookingType(type) {
    currentBookingType = type;
    
    // Update UI
    const staffBtn = document.getElementById('typeBtn_staff_booking');
    const blockBtn = document.getElementById('typeBtn_block');
    
    // Define classes based on 001.html
    // Active: bg-[#ffffff] dark:bg-primary shadow-sm text-primary dark:text-white
    // Inactive: text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200
    
    const activeClasses = ['bg-[#ffffff]', 'dark:bg-primary', 'shadow-sm', 'text-primary', 'dark:text-white', 'font-semibold'];
    const inactiveClasses = ['text-slate-500', 'dark:text-slate-400', 'hover:text-slate-700', 'dark:hover:text-slate-200', 'font-medium'];
    
    // Helper to swap classes
    const setBtnState = (btn, isActive) => {
        if (isActive) {
            btn.classList.add(...activeClasses);
            btn.classList.remove(...inactiveClasses.filter(c => !activeClasses.includes(c))); // Remove only conflicting
            // Specifically handle font weight which might overlap
             btn.classList.remove('font-medium');
             btn.classList.add('font-semibold');
        } else {
            btn.classList.remove(...activeClasses);
            btn.classList.add(...inactiveClasses);
             btn.classList.remove('font-semibold');
             btn.classList.add('font-medium');
        }
    };

    if (type === 'staff_booking') {
        setBtnState(staffBtn, true);
        setBtnState(blockBtn, false);
        
        document.getElementById('customerInfoSection').classList.remove('hidden');
        document.getElementById('blockNoteSection').classList.add('hidden');
        
        const nameInput = document.querySelector('input[name="name"]');
        const phoneInput = document.querySelector('input[name="phone"]');
        if(nameInput) nameInput.setAttribute('required', 'required');
        if(phoneInput) phoneInput.setAttribute('required', 'required');
        
        // Hide All Day option
        document.getElementById('allDayWrapper').classList.add('hidden');
    } else {
        setBtnState(blockBtn, true);
        setBtnState(staffBtn, false);
        
        document.getElementById('customerInfoSection').classList.add('hidden');
        document.getElementById('blockNoteSection').classList.remove('hidden');
        
        const nameInput = document.querySelector('input[name="name"]');
        const phoneInput = document.querySelector('input[name="phone"]');
        if(nameInput) nameInput.removeAttribute('required');
        if(phoneInput) phoneInput.removeAttribute('required');
        
        // Show All Day option
        document.getElementById('allDayWrapper').classList.remove('hidden');
    }
}

function toggleAllDay(checked) {
    const timeInput = document.getElementById('hiddenTimeInput');
    if (checked) {
        selectedTime = null;
        selectedTimeSlots = [];
        if(timeInput) timeInput.value = '00:00';
        renderTimeSlots();
    } else {
        if(timeInput) timeInput.value = '';
    }
}

// --- Calendar & Time Slot Functions ---

function formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function renderCalendar() {
    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();
    
    // Update Header
    const monthNames = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];
    const headerEl = document.getElementById('calendarMonthYear');
    if (headerEl) {
        headerEl.textContent = `${year}年 ${monthNames[month]}`;
    }
    
    const grid = document.getElementById('calendarGrid');
    if (!grid) return;
    
    grid.innerHTML = '';
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDay = firstDay.getDay(); // 0 is Sunday
    
    // Previous month padding
    for (let i = 0; i < startingDay; i++) {
        const div = document.createElement('div');
        div.className = 'py-2 text-sm text-slate-300 dark:text-slate-700'; // Match spacing
        grid.appendChild(div);
    }
    
    // Days
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const currentDate = new Date(year, month, day);
        const isPast = currentDate < today;
        const isSelected = selectedDate === dateStr;
        const isToday = dateStr === formatDate(new Date());

        // Wrapper to center
        const wrapper = document.createElement('div');
        wrapper.className = 'relative flex justify-center py-1';

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = day;
        
        if (isPast) {
             btn.className = 'w-9 h-9 flex items-center justify-center text-sm font-medium text-slate-300 dark:text-slate-600 cursor-not-allowed';
             btn.disabled = true;
        } else {
             btn.onclick = () => selectDate(dateStr);
             
            if (isSelected) {
                // MATCH IMAGE: w-9 h-9 flex items-center justify-center bg-primary text-white rounded-full font-bold shadow-lg shadow-primary/30 z-10
                btn.className = 'w-9 h-9 flex items-center justify-center bg-[#9D5B8B] text-white rounded-full font-bold shadow-lg shadow-primary/30 z-10 transition-all transform scale-105';
            } else {
                // Unselected: py-2 text-sm font-medium
                btn.className = 'w-9 h-9 flex items-center justify-center text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-all';
                
                if (isToday) {
                    btn.classList.add('ring-1', 'ring-primary', 'text-primary', 'font-bold');
                }
            }
        }
        
        wrapper.appendChild(btn);
        grid.appendChild(wrapper);
    }
}

function changeMonth(delta) {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + delta);
    renderCalendar();
}

function selectDate(dateStr) {
    selectedDate = dateStr;
    const dateInput = document.getElementById('hiddenDateInput');
    if (dateInput) dateInput.value = dateStr;
    
    // Sync calendar view if needed
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
        if (date.getFullYear() !== currentCalendarDate.getFullYear() || date.getMonth() !== currentCalendarDate.getMonth()) {
            currentCalendarDate = new Date(date);
        }
    }
    
    renderCalendar();
    renderTimeSlots();
}

function renderTimeSlots() {
    const container = document.getElementById('timeSlotsContainer');
    if (!container) return;
    
    container.innerHTML = '';
    
    // Define slots (Every 30 mins from 10:00 to 20:00)
    const startHour = 10;
    const endHour = 20;
    const slots = [];
    
    // Calculate current time buffer (now + 30 mins)
    const now = new Date();
    const isToday = selectedDate === formatDate(now);
    const bufferTime = new Date(now.getTime() + 30 * 60 * 1000); // Now + 30m

    for (let h = startHour; h <= endHour; h++) {
        slots.push(`${String(h).padStart(2, '0')}:00`);
        if (h !== endHour) { 
             slots.push(`${String(h).padStart(2, '0')}:30`);
        }
    }
    
    const groups = [
        { label: '上午', icon: 'wb_sunny', slots: slots.filter(t => parseInt(t.split(':')[0]) < 12) },
        { label: '下午', icon: 'light_mode', slots: slots.filter(t => parseInt(t.split(':')[0]) >= 12 && parseInt(t.split(':')[0]) < 18) },
        { label: '晚上', icon: 'bedtime', slots: slots.filter(t => parseInt(t.split(':')[0]) >= 18) }
    ];
    
    for (const group of groups) {
        if (group.slots.length === 0) continue;
        
        const groupDiv = document.createElement('div');
        groupDiv.className = 'space-y-3';
        
        // Header
        const headerP = document.createElement('p');
        headerP.className = 'text-xs font-bold text-slate-400 dark:text-slate-500 flex items-center gap-2';
        headerP.innerHTML = `<span class="material-symbols-outlined text-sm">${group.icon}</span> ${group.label}`;
        groupDiv.appendChild(headerP);
        
        // Grid
        const gridDiv = document.createElement('div');
        gridDiv.className = 'grid grid-cols-4 gap-3';
        
        group.slots.forEach(time => {
            const isSelected = selectedTimeSlots.includes(time);
            
            // Check disable logic
            let isDisabled = false;
            if (isToday) {
                const [h, m] = time.split(':').map(Number);
                const slotDate = new Date();
                slotDate.setHours(h, m, 0, 0);
                if (slotDate < bufferTime) {
                    isDisabled = true;
                }
            }

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = time;
            
            if (isDisabled) {
                btn.className = 'w-full py-3 px-1 text-sm font-semibold rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-300 dark:text-slate-600 cursor-not-allowed shadow-none ring-0';
                btn.disabled = true;
            } else {
                // Base: py-3 px-1 text-sm font-semibold rounded-xl bg-card-light dark:bg-card-dark shadow-sm ring-1 ring-slate-100 dark:ring-slate-800
                let classes = 'w-full py-3 px-1 text-sm font-semibold rounded-xl shadow-sm transition-all active:scale-95';
                
                if (isSelected) {
                    classes += ' bg-[#9D5B8B] text-white shadow-md ring-2 ring-primary';
                } else {
                    classes += ' bg-card-light dark:bg-card-dark ring-1 ring-slate-100 dark:ring-slate-800 hover:shadow-md dark:text-slate-200';
                }
                
                btn.className = classes;
                btn.onclick = () => selectTimeSlot(time);
            }

            gridDiv.appendChild(btn);
        });
        
        groupDiv.appendChild(gridDiv);
        container.appendChild(groupDiv);
    }
}

function selectTimeSlot(time) {
    if (selectedTimeSlots.length === 0) {
        selectedTimeSlots = [time];
    } else {
        if (selectedTimeSlots.includes(time)) {
            // Deselect logic: remove this slot and ALL subsequent slots
            // Find index
            const idx = selectedTimeSlots.indexOf(time);
            // If user clicks the first one, clear all? Or just remove from there?
            // "Clicking an already selected slot deselects it and all subsequent slots."
            selectedTimeSlots = selectedTimeSlots.slice(0, idx);
        } else {
            // Add logic
            // Check if consecutive to the LAST selected slot
            const lastTime = selectedTimeSlots[selectedTimeSlots.length - 1];
            
            const [lastH, lastM] = lastTime.split(':').map(Number);
            const [currH, currM] = time.split(':').map(Number);
            
            const lastDate = new Date(); lastDate.setHours(lastH, lastM, 0, 0);
            const currDate = new Date(); currDate.setHours(currH, currM, 0, 0);
            
            const diff = (currDate - lastDate) / (1000 * 60); // Difference in minutes
            
            if (diff < 0) {
                CustomModal.alert('提示', '只能往後連續選擇');
                return;
            } else if (diff === 30) {
                // Consecutive
                selectedTimeSlots.push(time);
            } else {
                // Not consecutive (diff > 30)
                CustomModal.alert('提示', '只能連續選擇');
                return;
            }
        }
    }

    // Sort just in case, though logic ensures order
    selectedTimeSlots.sort();

    // Update UI & Inputs
    // Start time is the first slot
    const startTime = selectedTimeSlots.length > 0 ? selectedTimeSlots[0] : '';
    selectedTime = startTime;
    
    const timeInput = document.getElementById('hiddenTimeInput');
    if (timeInput) timeInput.value = startTime;
    
    // Uncheck "All Day" if specific time selected
    const allDayCheck = document.getElementById('allDayCheck');
    if (allDayCheck && allDayCheck.checked) {
        allDayCheck.checked = false;
    }
    
    renderTimeSlots();
}

function addBlockTag(tag) {
    const noteInput = document.getElementById('blockNoteInput');
    if (noteInput) {
        if (noteInput.value.trim() === '') {
            noteInput.value = tag;
        } else {
            if (!noteInput.value.includes(tag)) {
                noteInput.value += ` ${tag}`;
            }
        }
    }
}

async function loadModalStylists() {
    const select = document.getElementById('modalStylistSelect');
    if (!select || select.options.length > 1) return; 

    try {
        const res = await fetch('/api/staff');
        if (res.ok) {
            const staff = await res.json();
            staff.forEach(s => {
                if (s.visible !== false) {
                    const opt = document.createElement('option');
                    opt.value = s.name;
                    opt.textContent = s.name;
                    select.appendChild(opt);
                }
            });
        }
    } catch (e) { console.error('Failed to load staff', e); }
}

function handleMemberSearch(keyword) {
    clearTimeout(searchTimeout);
    const resultsDiv = document.getElementById('memberSearchResults');
    
    if (!keyword || keyword.trim().length === 0) {
        resultsDiv.classList.add('hidden');
        resultsDiv.innerHTML = '';
        return;
    }

    searchTimeout = setTimeout(async () => {
        try {
            resultsDiv.innerHTML = '<div class="p-3 text-center text-slate-400 text-xs">搜尋中...</div>';
            resultsDiv.classList.remove('hidden');

            const res = await fetch(`/api/search-members?q=${encodeURIComponent(keyword)}&secret=${SEARCH_API_SECRET}`);
            if (!res.ok) throw new Error('Search failed');
            
            const results = await res.json();
            renderSearchResults(results);
        } catch (e) {
            console.error(e);
            resultsDiv.innerHTML = '<div class="p-3 text-center text-red-400 text-xs">搜尋發生錯誤</div>';
        }
    }, 300);
}

function renderSearchResults(results) {
    const resultsDiv = document.getElementById('memberSearchResults');
    
    if (results.length === 0) {
        resultsDiv.innerHTML = '<div class="p-3 text-center text-slate-400 text-xs">找不到符合的會員</div>';
        return;
    }

    resultsDiv.innerHTML = results.map(member => `
        <div class="p-3 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer flex items-center gap-3 border-b border-slate-50 last:border-0"
             onclick="selectMember('${member.name}', '${member.phone}', '${member.userId}')">
            <div class="w-8 h-8 rounded-full bg-slate-200 overflow-hidden flex-shrink-0">
                ${member.avatar ? `<img src="${member.avatar}" class="w-full h-full object-cover">` : '<span class="material-symbols-outlined text-slate-400 text-sm p-2">person</span>'}
            </div>
            <div>
                <div class="text-sm font-bold text-slate-800 dark:text-slate-200">${member.name}</div>
                <div class="text-xs text-slate-500">${member.phone || '無電話'}</div>
            </div>
        </div>
    `).join('');
}

function selectMember(name, phone, userId) {
    document.querySelector('input[name="name"]').value = name;
    document.querySelector('input[name="phone"]').value = phone;
    
    const userIdInput = document.getElementById('userIdInput');
    if (userIdInput) userIdInput.value = userId;

    document.getElementById('memberSearchInput').value = '';
    document.getElementById('memberSearchResults').classList.add('hidden');
    document.getElementById('memberSearchResults').innerHTML = '';
}

async function handleAdminBookingSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const formData = new FormData(form);
    const isAllDay = document.getElementById('allDayCheck') ? document.getElementById('allDayCheck').checked : false;
    
    // Calculate End Time from selected slots
    let endTime = '';
    if (selectedTimeSlots.length > 0) {
        // Last slot + 30 mins
        const lastSlot = selectedTimeSlots[selectedTimeSlots.length - 1];
        const [h, m] = lastSlot.split(':').map(Number);
        const d = new Date();
        d.setHours(h, m + 30, 0, 0);
        endTime = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }

    const payload = {
        date: formData.get('date'),
        time: formData.get('time'),
        endTime: endTime,
        stylist: formData.get('stylist'),
        admin_override: formData.get('admin_override') === 'on',
        type: currentBookingType,
        isAllDay: isAllDay
    };

    if (currentBookingType === 'staff_booking') {
        payload.name = formData.get('name');
        payload.phone = formData.get('phone');
        payload.userId = formData.get('userId') || null; 
    } else {
        payload.name = formData.get('note') || '內部保留';
        payload.phone = '';
        payload.userId = null;
    }

    try {
        const res = await fetch('/api/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        
        if (res.ok) {
            await CustomModal.success('成功', '新增成功！');
            closeAdminBookingModal();
            form.reset();
            const userIdInput = document.getElementById('userIdInput');
            if (userIdInput) userIdInput.value = '';
            
            if (typeof loadBookings === 'function') {
                loadBookings();
            } else {
                window.location.reload();
            }
        } else {
            CustomModal.error('失敗', data.message || data.error);
        }
    } catch (err) {
        CustomModal.error('錯誤', '系統錯誤: ' + err.message);
    }
}