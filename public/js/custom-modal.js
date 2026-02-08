
class CustomModal {
    static instance = null;

    constructor() {
        if (CustomModal.instance) {
            return CustomModal.instance;
        }
        this.init();
        CustomModal.instance = this;
    }

    init() {
        // Create DOM structure
        const modalHtml = `
            <div id="custom-modal-overlay" class="fixed inset-0 z-[20000] bg-black/40 backdrop-blur-[2px] opacity-0 pointer-events-none transition-opacity duration-300"></div>
            <div id="custom-modal-container" class="fixed left-1/2 top-1/2 z-[20001] w-[85%] max-w-[320px] -translate-x-1/2 -translate-y-1/2 scale-90 opacity-0 pointer-events-none transition-all duration-300 ease-out">
                <div class="bg-[#ffffff] dark:bg-gray-800 rounded-[2rem] shadow-2xl p-6 border border-white/50 dark:border-gray-700 relative overflow-hidden">
                    <!-- Decor: Top Gradient -->
                    <div class="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#9D5B8B] via-pink-400 to-[#9D5B8B]"></div>
                    
                    <div class="text-center space-y-4 relative z-10">
                        <!-- Icon Placeholder -->
                        <div id="custom-modal-icon-container" class="mx-auto w-12 h-12 flex items-center justify-center rounded-full bg-[#9D5B8B]/10 text-[#9D5B8B] mb-2">
                            <span id="custom-modal-icon" class="material-symbols-outlined text-2xl">info</span>
                        </div>

                        <h3 id="custom-modal-title" class="text-lg font-bold text-gray-900 dark:text-white leading-tight"></h3>
                        <p id="custom-modal-message" class="text-sm text-gray-500 dark:text-gray-300 leading-relaxed"></p>

                        <div id="custom-modal-actions" class="grid grid-cols-2 gap-3 pt-2">
                            <button id="custom-modal-cancel" class="py-2.5 px-4 rounded-xl text-sm font-semibold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors active:scale-95">
                                取消
                            </button>
                            <button id="custom-modal-confirm" class="py-2.5 px-4 rounded-xl text-sm font-semibold text-white bg-[#9D5B8B] shadow-lg shadow-[#9D5B8B]/30 hover:opacity-90 transition-all active:scale-95">
                                確認
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Check if already exists (in case of SPA navigation re-init)
        if (!document.getElementById('custom-modal-overlay')) {
            const wrapper = document.createElement('div');
            wrapper.innerHTML = modalHtml;
            document.body.appendChild(wrapper);
        }

        this.overlay = document.getElementById('custom-modal-overlay');
        this.container = document.getElementById('custom-modal-container');
        this.titleEl = document.getElementById('custom-modal-title');
        this.messageEl = document.getElementById('custom-modal-message');
        this.cancelBtn = document.getElementById('custom-modal-cancel');
        this.confirmBtn = document.getElementById('custom-modal-confirm');
        this.iconEl = document.getElementById('custom-modal-icon');
        this.actionsContainer = document.getElementById('custom-modal-actions');

        this.resolvePromise = null;
    }

    /**
     * Show Alert Modal (Single Confirm Button)
     * @param {string} title 
     * @param {string} message 
     * @param {string} confirmText 
     * @returns {Promise<boolean>}
     */
    static alert(title, message, confirmText = '知道了') {
        return new CustomModal().show({
            title,
            message,
            type: 'alert',
            confirmText,
            icon: 'info'
        });
    }

    /**
     * Show Confirm Modal (Confirm & Cancel Buttons)
     * @param {string} title 
     * @param {string} message 
     * @param {string} confirmText 
     * @param {string} cancelText 
     * @returns {Promise<boolean>}
     */
    static confirm(title, message, confirmText = '確認', cancelText = '取消') {
        return new CustomModal().show({
            title,
            message,
            type: 'confirm',
            confirmText,
            cancelText,
            icon: 'help'
        });
    }

    /**
     * Show Success Modal
     */
    static success(title, message, confirmText = '好') {
        return new CustomModal().show({
            title,
            message,
            type: 'alert',
            confirmText,
            icon: 'check_circle',
            iconColor: 'text-green-500',
            iconBg: 'bg-green-50'
        });
    }

    /**
     * Show Error Modal
     */
    static error(title, message, confirmText = '關閉') {
        return new CustomModal().show({
            title,
            message,
            type: 'alert',
            confirmText,
            icon: 'error',
            iconColor: 'text-red-500',
            iconBg: 'bg-red-50'
        });
    }

    show({ title, message, type = 'alert', confirmText = '確認', cancelText = '取消', icon = 'info', iconColor = '', iconBg = '' }) {
        return new Promise((resolve) => {
            this.resolvePromise = resolve;

            // Set Content
            this.titleEl.textContent = title;
            this.messageEl.innerHTML = message.replace(/\n/g, '<br>');
            this.confirmBtn.textContent = confirmText;
            this.cancelBtn.textContent = cancelText;
            
            // Set Icon
            this.iconEl.textContent = icon;
            const iconContainer = document.getElementById('custom-modal-icon-container');
            // Reset colors
            iconContainer.className = `mx-auto w-12 h-12 flex items-center justify-center rounded-full mb-2 ${iconBg || 'bg-[#9D5B8B]/10'} ${iconColor || 'text-[#9D5B8B]'}`;

            // Configure Buttons
            if (type === 'alert') {
                this.cancelBtn.classList.add('hidden');
                this.actionsContainer.classList.remove('grid-cols-2');
                this.actionsContainer.classList.add('grid-cols-1');
            } else {
                this.cancelBtn.classList.remove('hidden');
                this.actionsContainer.classList.remove('grid-cols-1');
                this.actionsContainer.classList.add('grid-cols-2');
            }

            // Event Listeners (One-time binding per show isn't ideal, but safe enough if we clone or manage properly. 
            // Better to re-assign onclick to avoid stacking listeners)
            this.confirmBtn.onclick = () => this.close(true);
            this.cancelBtn.onclick = () => this.close(false);

            // Show UI
            this.overlay.classList.remove('opacity-0', 'pointer-events-none');
            this.container.classList.remove('opacity-0', 'pointer-events-none', 'scale-90');
            this.container.classList.add('scale-100');
        });
    }

    close(result) {
        this.overlay.classList.add('opacity-0', 'pointer-events-none');
        this.container.classList.add('opacity-0', 'pointer-events-none', 'scale-90');
        this.container.classList.remove('scale-100');

        if (this.resolvePromise) {
            this.resolvePromise(result);
            this.resolvePromise = null;
        }
    }
}

// Expose globally
window.CustomModal = CustomModal;
