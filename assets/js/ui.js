// Minimal toast UI for MUNify
(function(){
  // Track active overlay elements for ESC handling
  const activeOverlays = new Set();
  
  // Dark mode functionality
  function initDarkMode() {
    // Check for saved dark mode preference or default to light mode
    const isDarkMode = localStorage.getItem('munify-dark-mode') === 'true';
    
    // Apply dark mode to document
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    
    // Update any existing toggle buttons
    updateDarkModeToggleState(isDarkMode);
  }
  
  function toggleDarkMode() {
    const isDarkMode = document.documentElement.classList.contains('dark');
    const newDarkMode = !isDarkMode;
    
    // Toggle the class
    if (newDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    
    // Save preference
    localStorage.setItem('munify-dark-mode', newDarkMode.toString());
    
    // Update toggle buttons
    updateDarkModeToggleState(newDarkMode);
    
    // Show toast
    toast(newDarkMode ? 'Dark mode enabled' : 'Light mode enabled', { type: 'success', duration: 2000 });
  }
  
  function updateDarkModeToggleState(isDarkMode) {
    const toggleButtons = document.querySelectorAll('[data-dark-mode-toggle]');
    toggleButtons.forEach(btn => {
      const sunIcon = btn.querySelector('[data-icon="sun"]');
      const moonIcon = btn.querySelector('[data-icon="moon"]');
      if (sunIcon && moonIcon) {
        if (isDarkMode) {
          sunIcon.classList.remove('hidden');
          moonIcon.classList.add('hidden');
        } else {
          sunIcon.classList.add('hidden');
          moonIcon.classList.remove('hidden');
        }
      }
      // Update aria-label
      btn.setAttribute('aria-label', isDarkMode ? 'Switch to light mode' : 'Switch to dark mode');
    });
  }
  
  // Initialize dark mode on page load
  document.addEventListener('DOMContentLoaded', initDarkMode);
  
  function createContainer(){
    let c = document.getElementById('munify-toasts');
    if (c) return c;
    c = document.createElement('div');
    c.id = 'munify-toasts';
    c.style.position = 'fixed';
    c.style.right = '20px';
    c.style.bottom = '20px';
    c.style.zIndex = 99999;
    c.style.display = 'flex';
    c.style.flexDirection = 'column';
    c.style.gap = '8px';
    document.body.appendChild(c);
    return c;
  }

  function toast(message, opts={}){
    const container = createContainer();
    const id = 't_' + Math.random().toString(36).slice(2,9);
    const el = document.createElement('div');
    el.id = id;
    el.className = 'munify-toast';
    el.style.minWidth = '220px';
    el.style.maxWidth = '420px';
    el.style.padding = '10px 12px';
    el.style.borderRadius = '8px';
    el.style.boxShadow = '0 6px 18px rgba(0,0,0,0.12)';
    el.style.background = opts.type === 'error' ? '#fee2e2' : (opts.type === 'warn' ? '#fff7ed' : '#f8fafc');
    el.style.color = '#0f172a';
    el.style.fontSize = '13px';
    el.style.display = 'flex';
    el.style.alignItems = 'center';
    el.style.justifyContent = 'space-between';

    const text = document.createElement('div');
    text.style.flex = '1';
    text.style.marginRight = '8px';
    text.textContent = message;
    el.appendChild(text);

    if (opts.copy) {
      const btn = document.createElement('button');
      btn.className = 'munify-btn-copy';
      btn.textContent = 'Copy';
      btn.style.marginLeft = '6px';
      btn.style.border = 'none';
      btn.style.background = '#e2e8f0';
      btn.style.padding = '6px 8px';
      btn.style.borderRadius = '6px';
      btn.style.cursor = 'pointer';
      btn.addEventListener('click', ()=>{ navigator.clipboard.writeText(opts.copy); btn.textContent = 'Copied'; setTimeout(()=>btn.textContent='Copy',1500); });
      el.appendChild(btn);
    }

    const close = document.createElement('button');
    close.innerHTML = '✕';
    close.style.marginLeft = '8px';
    close.style.border = 'none';
    close.style.background = 'transparent';
    close.style.cursor = 'pointer';
    close.style.opacity = '0.7';
    close.addEventListener('click', ()=>{ container.removeChild(el); });
    el.appendChild(close);

    container.appendChild(el);
    const duration = typeof opts.duration === 'number' ? opts.duration : 5000;
    if (duration > 0) setTimeout(()=>{ if (el.parentNode) el.parentNode.removeChild(el); }, duration);
    return id;
  }

  // confirmation dialog helper: returns a Promise<boolean>
  function confirm(message, opts={}){
    return new Promise(resolve => {
      // overlay
      const ov = document.createElement('div');
      ov.className = 'munify-modal-overlay';
      ov.style.position = 'fixed';
      ov.style.left = 0; ov.style.top = 0; ov.style.right = 0; ov.style.bottom = 0;
      ov.style.background = 'rgba(2,6,23,0.45)';
      ov.style.zIndex = 100000;
      ov.style.display = 'flex';
      ov.style.alignItems = 'center';
      ov.style.justifyContent = 'center';

      const box = document.createElement('div');
      box.style.background = '#fff';
      box.style.padding = '18px';
      box.style.borderRadius = '10px';
      box.style.minWidth = '300px';
      box.style.boxShadow = '0 8px 30px rgba(2,6,23,0.2)';

      const txt = document.createElement('div');
      txt.style.marginBottom = '12px';
      txt.style.color = '#0f172a';
      txt.style.fontSize = '15px';
      txt.textContent = message;
      box.appendChild(txt);

      const actions = document.createElement('div');
      actions.style.display = 'flex';
      actions.style.justifyContent = 'flex-end';
      actions.style.gap = '8px';

      const no = document.createElement('button');
      no.textContent = opts.noText || 'Cancel';
      no.style.padding = '8px 10px';
      no.style.border = 'none';
      no.style.background = 'transparent';
      no.style.cursor = 'pointer';

      const yes = document.createElement('button');
      yes.textContent = opts.yesText || 'OK';
      yes.style.padding = '8px 10px';
      yes.style.border = 'none';
      yes.style.background = '#0f172a';
      yes.style.color = '#fff';
      yes.style.borderRadius = '6px';
      yes.style.cursor = 'pointer';

      actions.appendChild(no);
      actions.appendChild(yes);
      box.appendChild(actions);
      ov.appendChild(box);
      document.body.appendChild(ov);

      function cleanup(){ activeOverlays.delete(ov); if (ov && ov.parentNode) ov.parentNode.removeChild(ov); }
      no.addEventListener('click', ()=>{ cleanup(); resolve(false); });
      yes.addEventListener('click', ()=>{ cleanup(); resolve(true); });
      activeOverlays.add(ov);
    });
  }
  // Global ESC listener
  document.addEventListener('keydown', (e)=>{
    if (e.key === 'Escape') {
      // Close the most recently added overlay
      const last = Array.from(activeOverlays).pop();
      if (last) {
        e.preventDefault();
        if (last.parentNode) last.parentNode.removeChild(last);
        activeOverlays.delete(last);
        return;
      }
      // Fallback: hide any element with data-esc-close attribute
      const modal = document.querySelector('.munify-modal[data-esc-close]');
      if (modal) modal.classList.add('hidden');
    }
  });

  window.MUNui = { toast, confirm, toggleDarkMode, initDarkMode };
})();
