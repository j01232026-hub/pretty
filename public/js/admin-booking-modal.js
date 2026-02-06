let currentBookingType = 'staff_booking'; // 'staff_booking' or 'block'
let searchTimeout = null;

// Calendar & Time Logic Variables
let currentCalendarDate = new Date();
let selectedDate = null;
let selectedTime = null;

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
        document.getElementById('hiddenTimeInput').value = '';
        renderTimeSlots();
        
        // Reset search
        const searchInput = document.getElementById('memberSearchInput');
        if (searchInput) searchInput.value = '';
        document.getElementById('memberSearchResults').classList.add('hidden');
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
    
    // Define classes
    const activeClasses = ['bg-white', 'shadow-sm', 'text-primary', 'dark:bg-gray-700', 'dark:text-white'];
    const inactiveClasses = ['text-gray-500', 'hover:text-gray-700', 'dark:text-gray-400', 'dark:hover:text-gray-200'];
    
    // Reset base classes for safety (though not strictly needed if we manage add/remove correctly)
    // Better to just add/remove the diff
    
    if (type === 'staff_booking') {
        staffBtn.classList.add(...activeClasses);
        staffBtn.classList.remove(...inactiveClasses);
        
        blockBtn.classList.remove(...activeClasses);
        blockBtn.classList.add(...inactiveClasses);
        
        document.getElementById('customerInfoSection').classList.remove('hidden');
        document.getElementById('blockNoteSection').classList.add('hidden');
        
        document.querySelector('input[name="name"]').setAttribute('required', 'required');
        document.querySelector('input[name="phone"]').setAttribute('required', 'required');
        
        // Hide All Day option
        document.getElementById('allDayWrapper').classList.add('hidden');
    } else {
        blockBtn.classList.add(...activeClasses);
        blockBtn.classList.remove(...inactiveClasses);
        
        staffBtn.classList.remove(...activeClasses);
        staffBtn.classList.add(...inactiveClasses);
        
        document.getElementById('customerInfoSection').classList.add('hidden');
        document.getElementById('blockNoteSection').classList.remove('hidden');
        
        document.querySelector('input[name="name"]').removeAttribute('required');
        document.querySelector('input[name="phone"]').removeAttribute('required');
        
        // Show All Day option
        document.getElementById('allDayWrapper').classList.remove('hidden');
    }
}

function toggleAllDay(checked) {
    const timeInput = document.getElementById('hiddenTimeInput');
    if (checked) {
        selectedTime = null;
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
        div.className = 'h-7 flex items-center justify-center text-xs text-gray-300';
        grid.appendChild(div);
    }
    
    // Days
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const isSelected = selectedDate === dateStr;
        
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = day;
        // Use primary color (purple) for selection
        btn.className = `h-7 w-7 mx-auto rounded-full flex items-center justify-center text-sm transition-colors ${
            isSelected 
            ? 'bg-primary text-white font-bold shadow-md' 
            : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
        }`;
        btn.onclick = () => selectDate(dateStr);
        
        // Mark today with a border if not selected
        const todayStr = formatDate(new Date());
        if (dateStr === todayStr && !isSelected) {
            btn.classList.add('border', 'border-primary', 'text-primary');
        }
        
        grid.appendChild(btn);
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
    
    for (let h = startHour; h <= endHour; h++) {
        slots.push(`${String(h).padStart(2, '0')}:00`);
        if (h !== endHour) { 
             slots.push(`${String(h).padStart(2, '0')}:30`);
        }
    }
    
    const groups = {
        '上午': slots.filter(t => parseInt(t.split(':')[0]) < 12),
        '下午': slots.filter(t => parseInt(t.split(':')[0]) >= 12 && parseInt(t.split(':')[0]) < 18),
        '晚上': slots.filter(t => parseInt(t.split(':')[0]) >= 18)
    };
    
    for (const [label, groupSlots] of Object.entries(groups)) {
        if (groupSlots.length === 0) continue;
        
        const groupDiv = document.createElement('div');
        groupDiv.className = 'mb-1';
        
        const labelDiv = document.createElement('div');
        labelDiv.className = 'text-xs text-gray-400 mb-1 font-bold';
        labelDiv.textContent = label;
        groupDiv.appendChild(labelDiv);
        
        const gridDiv = document.createElement('div');
        gridDiv.className = 'grid grid-cols-4 gap-1';
        
        groupSlots.forEach(time => {
            const isSelected = selectedTime === time;
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = time;
            // Use primary color (purple) for selection
            // FORCE HEIGHT and CAPSULE SHAPE
            btn.className = `h-7 w-full flex items-center justify-center rounded-full text-sm border transition-all ${
                isSelected
                ? 'bg-primary border-primary text-white shadow-sm font-bold'
                : 'bg-white border-gray-200 text-gray-600 hover:border-primary hover:text-primary dark:bg-gray-700 dark:border-gray-600 dark:text-gray-300'
            }`;
            btn.onclick = () => selectTimeSlot(time);
            gridDiv.appendChild(btn);
        });
        
        groupDiv.appendChild(gridDiv);
        container.appendChild(groupDiv);
    }
}

function selectTimeSlot(time) {
    selectedTime = time;
    const timeInput = document.getElementById('hiddenTimeInput');
    if (timeInput) timeInput.value = time;
    
    // Uncheck "All Day" if specific time selected
    const allDayCheck = document.getElementById('allDayCheck');
    if (allDayCheck && allDayCheck.checked) {
        allDayCheck.checked = false;
        // Logic for toggleAllDay(false) without clearing time
    }
    
    renderTimeSlots();
}

function addBlockTag(tag) {
    const noteInput = document.getElementById('blockNoteInput');
    if (noteInput) {
        // If empty, just set. If not, append.
        if (noteInput.value.trim() === '') {
            noteInput.value = tag;
        } else {
            // Check if tag already exists to avoid duplication
            if (!noteInput.value.includes(tag)) {
                noteInput.value += ` ${tag}`;
            }
        }
    }
}

async function loadModalStylists() {
    const select = document.getElementById('modalStylistSelect');
    if (!select || select.options.length > 1) return; // Already loaded or missing

    try {
        const res = await fetch('/api/staff');
        if (res.ok) {
            const staff = await res.json();
            staff.forEach(s => {
                if (s.visible !== false) { // Only show visible staff
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
            resultsDiv.innerHTML = '<div class="p-3 text-center text-gray-400 text-xs">搜尋中...</div>';
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
        resultsDiv.innerHTML = '<div class="p-3 text-center text-gray-400 text-xs">找不到符合的會員</div>';
        return;
    }

    resultsDiv.innerHTML = results.map(member => `
        <div class="p-3 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer flex items-center gap-3 border-b border-gray-50 last:border-0"
             onclick="selectMember('${member.name}', '${member.phone}', '${member.userId}')">
            <div class="w-8 h-8 rounded-full bg-gray-200 overflow-hidden flex-shrink-0">
                ${member.avatar ? `<img src="${member.avatar}" class="w-full h-full object-cover">` : '<span class="material-icons text-gray-400 text-sm p-2">person</span>'}
            </div>
            <div>
                <div class="text-sm font-bold text-gray-800 dark:text-gray-200">${member.name}</div>
                <div class="text-xs text-gray-500">${member.phone || '無電話'}</div>
            </div>
        </div>
    `).join('');
}

function selectMember(name, phone, userId) {
    document.querySelector('input[name="name"]').value = name;
    document.querySelector('input[name="phone"]').value = phone;
    
    // Store userId if needed, maybe in a hidden field or just use it logic wise
    // For now we just fill the visible fields as requested.
    // If we want to link the booking to the user, we might need a hidden input for userId.
    // Let's check if the form has userId input, if not create/set it.
    let userIdInput = document.querySelector('input[name="userId"]');
    if (!userIdInput) {
        userIdInput = document.createElement('input');
        userIdInput.type = 'hidden';
        userIdInput.name = 'userId';
        document.getElementById('adminBookingForm').appendChild(userIdInput);
    }
    userIdInput.value = userId;

    // Clear search
    document.getElementById('memberSearchInput').value = '';
    document.getElementById('memberSearchResults').classList.add('hidden');
    document.getElementById('memberSearchResults').innerHTML = '';
}

async function handleAdminBookingSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const formData = new FormData(form);
    const isAllDay = document.getElementById('allDayCheck').checked;
    
    const payload = {
        date: formData.get('date'),
        time: formData.get('time'),
        stylist: formData.get('stylist'),
        admin_override: formData.get('admin_override') === 'on',
        type: currentBookingType,
        isAllDay: isAllDay
    };

    if (currentBookingType === 'staff_booking') {
        payload.name = formData.get('name');
        payload.phone = formData.get('phone');
        // Use the hidden userId if present (from search), otherwise null
        payload.userId = formData.get('userId') || null; 
    } else {
        payload.name = formData.get('note') || '內部保留';
        payload.phone = ''; // No phone needed
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
            alert('新增成功！');
            closeAdminBookingModal();
            form.reset();
            // Clear hidden userId
            const userIdInput = document.querySelector('input[name="userId"]');
            if (userIdInput) userIdInput.value = '';
            
            // Assuming loadBookings is globally available from admin.html
            if (typeof loadBookings === 'function') {
                loadBookings();
            } else {
                window.location.reload();
            }
        } else {
            alert('失敗: ' + (data.message || data.error));
        }
    } catch (err) {
        alert('系統錯誤: ' + err.message);
    }
}
