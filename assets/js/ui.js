// Minimal toast UI for MUNify
(function(){
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

  window.MUNui = { toast };
})();
