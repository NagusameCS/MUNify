// Minimal toast UI for MUNify
(function(){
  // Track active overlay elements for ESC handling
  const activeOverlays = new Set();
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

  // Dark mode removed; keep a no-op helper in case any legacy calls exist
  function isDark(){ return false; }

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
  // Border previously only in dark mode; omit now for cleaner look

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

  window.MUNui = { toast, confirm };
})();

// Shared reveal + frost activation across pages
(function(){
  document.addEventListener('DOMContentLoaded', () => {
    const reveals = Array.from(document.querySelectorAll('.reveal'));
    const frosts = Array.from(document.querySelectorAll('[data-frost]'));
    if (!reveals.length && !frosts.length) return;
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries)=>{
        entries.forEach(e=>{ if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); } });
      }, { threshold: 0.18 });
      reveals.forEach(r=> io.observe(r));
      const ioFrost = new IntersectionObserver((entries)=>{
        entries.forEach(entry=>{ if (entry.isIntersecting) entry.target.classList.add('frost-active'); else if (entry.intersectionRatio===0) entry.target.classList.remove('frost-active'); });
      }, { threshold: [0,0.3] });
      frosts.forEach(f=> ioFrost.observe(f));
    } else {
      reveals.forEach(r=> r.classList.add('visible'));
      frosts.forEach(f=> f.classList.add('frost-active'));
    }
    // Stagger pop-targets
    const items = Array.from(document.querySelectorAll('.pop-target'));
    items.forEach((el,i)=> setTimeout(()=> el.classList.add('pop-animate'), i*80+60));
  });
})();
