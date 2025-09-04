// Dark mode toggle logic for MUNify (class-based)
(function(){
  const STORAGE_KEY = 'munify-dark-mode';
  const root = document.documentElement;
  const prefersDark = () => window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  let lastToastTime = 0;

  function isDark(){ return root.classList.contains('dark'); }
  function setAttr(d){ root.classList.toggle('dark', !!d); }
  function persist(d){ try { localStorage.setItem(STORAGE_KEY, d ? 'true':'false'); } catch(e){} }
  function updateButtons(d){
    document.querySelectorAll('[data-theme-toggle]').forEach(b=>{
      b.setAttribute('aria-pressed', d ? 'true':'false');
      const sun = b.querySelector('[data-icon=sun]');
      const moon = b.querySelector('[data-icon=moon]');
      if (sun) sun.style.display = d ? 'none':'inline-block';
      if (moon) moon.style.display = d ? 'inline-block':'none';
      b.title = d ? 'Switch to light mode' : 'Switch to dark mode';
    });
  }
  function announce(d){
    let live = document.getElementById('theme-status-live');
    if(!live){
      live = document.createElement('div');
      live.id='theme-status-live';
      live.className='sr-only';
      live.setAttribute('role','status');
      live.setAttribute('aria-live','polite');
      document.body.appendChild(live);
    }
    live.textContent = d ? 'Dark mode' : 'Light mode';
  }
  function maybeToast(d){
    const now = Date.now();
    if (!window.MUNui || !window.MUNui.toast) return;
    if (now - lastToastTime < 800) return; // throttle bursts (e.g. shortcut spam)
    lastToastTime = now;
    window.MUNui.toast(d ? 'Dark mode' : 'Light mode', { type:'info', duration:1600 });
  }
  function apply(d, opts={}){
    // Force dark mode regardless of requested value
    d = true;
    setAttr(true);
    persist(true);
    updateButtons(true);
    announce(true);
    if(!opts.quiet) maybeToast(true);
  }
  function toggle(opts={}){ /* disabled: always dark */ apply(true, opts); }

  // Initialization after DOM ready
  document.addEventListener('DOMContentLoaded', ()=>{
    // Add transition class once page loaded to avoid FOUC
    requestAnimationFrame(()=>{ root.classList.add('theme-transition'); });
  // Always enforce dark mode
  setAttr(true);
  apply(true, { quiet:true });
    document.body.addEventListener('click', (e)=>{
      const t = e.target.closest('[data-theme-toggle]');
      if (!t) return;
      e.preventDefault();
      toggle();
    });
    // Keyboard shortcut: Alt+T
    window.addEventListener('keydown', (e)=>{
  if ((e.altKey || e.metaKey) && (e.key==='t' || e.key==='T')) { e.preventDefault(); /* disabled */ }
    });
    // React to system preference changes if user never explicitly chose
    if (window.matchMedia){
      try {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', ev=>{
          const explicit = (()=>{ try { return localStorage.getItem(STORAGE_KEY); } catch(e){ return null; } })();
          if (explicit === null) { apply(ev.matches, { quiet:false }); }
        });
      } catch(_){/* ignore */}
    }
  });
  window.MUNtheme = { toggle, apply, isDark };
})();
