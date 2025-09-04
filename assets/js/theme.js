// Dark mode toggle logic for MUNify (class-based)
(function(){
  const STORAGE_KEY = 'munify-dark-mode';
  function isDark(){ return document.documentElement.classList.contains('dark'); }
  function apply(d){
    document.documentElement.classList.toggle('dark', !!d);
    try { localStorage.setItem(STORAGE_KEY, d ? 'true' : 'false'); } catch(e){}
    const btns = document.querySelectorAll('[data-theme-toggle]');
    btns.forEach(b=>{
      b.setAttribute('aria-pressed', d ? 'true':'false');
      const sun = b.querySelector('[data-icon=sun]');
      const moon = b.querySelector('[data-icon=moon]');
      if (sun) sun.style.display = d ? 'none':'inline-block';
      if (moon) moon.style.display = d ? 'inline-block':'none';
      b.title = d ? 'Switch to light mode' : 'Switch to dark mode';
    });
    if (window.MUNui && window.MUNui.toast) {
      window.MUNui.toast(d ? 'Dark mode enabled' : 'Light mode enabled', { type:'info', duration: 2000 });
    }
  }
  function toggle(){ apply(!isDark()); }
  document.addEventListener('DOMContentLoaded', ()=>{
    const saved = (function(){ try { return localStorage.getItem(STORAGE_KEY); } catch(e){ return null; } })();
    if (saved === 'true') document.documentElement.classList.add('dark');
    apply(document.documentElement.classList.contains('dark'));
    document.body.addEventListener('click', (e)=>{
      const t = e.target.closest('[data-theme-toggle]');
      if (!t) return;
      e.preventDefault();
      toggle();
    });
  });
  window.MUNtheme = { toggle, apply };
})();
