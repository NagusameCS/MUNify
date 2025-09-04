// Theme (light/dark) management for MUNify
// Applies data-theme attribute to <html>. Persists preference in localStorage.
(function(){
  const STORAGE_KEY = 'munifyTheme';
  const root = document.documentElement;

  function systemPref(){
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function getStored(){ try { return localStorage.getItem(STORAGE_KEY); } catch(e){ return null; } }
  function store(val){ try { localStorage.setItem(STORAGE_KEY, val); } catch(e){} }

  function apply(theme){
    const t = theme || getStored() || systemPref();
    root.setAttribute('data-theme', t);
    // update toggle buttons text/icon
    document.querySelectorAll('[data-theme-toggle]')?.forEach(btn=>{
      if (!btn.dataset.originalLabel) btn.dataset.originalLabel = btn.textContent.trim();
      btn.textContent = t === 'dark' ? 'Light Mode' : 'Dark Mode';
    });
  }

  function toggle(){ const current = root.getAttribute('data-theme') || systemPref(); const next = current === 'dark' ? 'light' : 'dark'; store(next); apply(next); }

  // Expose API
  window.MUNtheme = { apply, toggle, current: ()=>root.getAttribute('data-theme') };

  // React to system changes if user never explicitly chose
  if (window.matchMedia){
    try {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e=>{
        if (!getStored()) apply(e.matches ? 'dark' : 'light');
      });
    } catch(e){}
  }

  // Initial apply ASAP
  document.addEventListener('DOMContentLoaded', ()=> apply());
})();
