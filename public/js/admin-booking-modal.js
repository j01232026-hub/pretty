let currentBookingType = 'staff_booking'; // 'staff_booking' or 'block'
let searchTimeout = null;

// Ensure we have access to the secret
const SEARCH_API_SECRET = (typeof ADMIN_SECRET !== 'undefined') ? ADMIN_SECRET : 'MyBeautyShop_2026_Boss_Only!';

function openAdminBookingModal() {
    const modal = document.getElementById('adminBookingModal');
    if (modal) {
        modal.classList.remove('hidden');
        loadModalStylists();
        
        // Set default date to today
        const today = new Date().toISOString().split('T')[0];
        const dateInput = modal.querySelector('input[name="date"]');
        if (dateInput && !dateInput.value) dateInput.value = today;
        
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
    const activeClasses = ['bg-white', 'shadow', 'text-primary', 'dark:bg-gray-700', 'dark:text-white'];
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
    const timeInput = document.querySelector('input[name="time"]');
    if (checked) {
        timeInput.value = '00:00'; // Or just keep it but in backend treat as full day? 
        // For visual feedback, maybe disable it or set to a standard start time
        // But user might want to adjust.
        // Actually "All Day" usually means occupying the whole slot.
        // Let's set it to opening time or 00:00. 
        // If we want to be precise, maybe disable time input?
        // Let's just set a flag or handle logic. 
        // Since backend expects start time, let's pick 00:00 or current day start.
        // But for simplicity let's just leave it enabled but maybe default to opening time if we knew it.
        // Let's just disable it to indicate "All Day covers everything"
        timeInput.disabled = true;
        timeInput.classList.add('bg-gray-100', 'text-gray-400');
    } else {
        timeInput.disabled = false;
        timeInput.classList.remove('bg-gray-100', 'text-gray-400');
    }
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
