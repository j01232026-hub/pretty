
const AdminNav = {
    init: function() {
        this.injectStyles();
        this.renderNav();
        this.setActiveState();
    },

    injectStyles: function() {
        if (document.getElementById('admin-nav-style')) return;

        const style = document.createElement('style');
        style.id = 'admin-nav-style';
        style.textContent = `
            .bottom-nav {
                position: fixed;
                bottom: 0;
                left: 0;
                right: 0;
                height: 80px;
                background: #FFFFFF !important; /* Override glass effect */
                display: flex;
                justify-content: space-around;
                align-items: center;
                box-shadow: 0 -2px 10px rgba(0,0,0,0.05);
                z-index: 50;
                padding: 0 !important; /* Override padding from admin-style.css */
                backdrop-filter: none !important;
                border-top: none !important;
            }
            .bottom-nav-item {
                display: flex;
                flex-direction: column;
                align-items: center;
                color: #8C8C9E;
                text-decoration: none;
                font-size: 0.75rem;
                gap: 4px;
                justify-content: center;
                width: auto !important; /* Override fixed width */
                transition: none !important; /* Remove unwanted transitions */
            }
            .bottom-nav-item.active {
                color: #8e5d7a !important;
            }
            /* Reset effects from admin-style.css */
            .bottom-nav-item.active .material-icons {
                transform: none !important;
                text-shadow: none !important;
            }
            /* Ensure Material Icons font settings are consistent */
            .bottom-nav .material-icons {
                font-family: 'Material Icons';
                font-weight: normal;
                font-style: normal;
                font-size: 24px;
                display: inline-block;
                line-height: 1;
                text-transform: none;
                letter-spacing: normal;
                word-wrap: normal;
                white-space: nowrap;
                direction: ltr;
                -webkit-font-smoothing: antialiased;
                text-rendering: optimizeLegibility;
                -moz-osx-font-smoothing: grayscale;
                font-feature-settings: 'liga';
            }
        `;
        document.head.appendChild(style);
    },

    renderNav: function() {
        const existingNav = document.querySelector('.bottom-nav');
        if (existingNav) existingNav.remove();

        // Preserve store_id
        const urlParams = new URLSearchParams(window.location.search);
        const storeId = urlParams.get('store_id');
        const query = storeId ? `?store_id=${storeId}` : '';

        const nav = document.createElement('nav');
        nav.className = 'bottom-nav';
        nav.innerHTML = `
            <a href="/admin.html${query}" class="bottom-nav-item" data-page="admin.html">
                <span class="material-icons">calendar_month</span>
                <span>預約管理</span>
            </a>
            <a href="/admin-chat.html${query}" class="bottom-nav-item" data-page="admin-chat.html">
                <span class="material-icons">forum</span>
                <span>訊息框</span>
            </a>
            <a href="/admin-account.html${query}" class="bottom-nav-item" data-page="admin-account.html">
                <span class="material-icons">manage_accounts</span>
                <span>帳號管理</span>
            </a>
        `;
        document.body.appendChild(nav);
    },

    setActiveState: function() {
        const path = window.location.pathname;
        let page = path.split('/').pop();
        if (page === '' || page === 'admin') page = 'admin.html'; // Handle root or extensionless
        
        // Exact match fallback
        const items = document.querySelectorAll('.bottom-nav-item');
        items.forEach(item => {
            const itemPage = item.getAttribute('data-page');
            if (path.includes(itemPage)) {
                 item.classList.add('active');
            } else {
                 item.classList.remove('active');
            }
        });
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => AdminNav.init());
} else {
    AdminNav.init();
}
