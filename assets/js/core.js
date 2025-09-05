// Core shared behaviors for all pages (navigation, globe init, reveal, frost)
import { initGlobe } from './globe.js';

export function bootPage({ enableGlobe = true } = {}) {
  document.addEventListener('DOMContentLoaded', () => {
    // Reveal animations & frost activation
    const reveals = Array.from(document.querySelectorAll('.reveal'));
    const frosts = Array.from(document.querySelectorAll('[data-frost]'));
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries)=>{
        entries.forEach(e=>{ if (e.isIntersecting){ e.target.classList.add('visible'); io.unobserve(e.target);} });
      }, { threshold: 0.18 });
      reveals.forEach(r=>io.observe(r));
      const ioFrost = new IntersectionObserver((entries)=>{
        entries.forEach(e=>{ if (e.isIntersecting) e.target.classList.add('frost-active'); else if (e.intersectionRatio===0) e.target.classList.remove('frost-active'); });
      }, { threshold:[0,0.3] });
      frosts.forEach(f=>ioFrost.observe(f));
    } else {
      reveals.forEach(r=>r.classList.add('visible'));
      frosts.forEach(f=>f.classList.add('frost-active'));
    }

    // Pop targets stagger
    const items = Array.from(document.querySelectorAll('.pop-target'));
    items.forEach((el,i)=>{ setTimeout(()=>el.classList.add('pop-animate'), i*80+60); });

    // Globe
    if (enableGlobe && document.getElementById('earth-bg')) {
      const start = ()=> initGlobe();
      if ('requestIdleCallback' in window) requestIdleCallback(start, { timeout: 2500 }); else setTimeout(start, 1200);
    }
  });
}

// Auto-run if imported via <script type="module" src=".../core.js" data-auto>
if (document.currentScript && document.currentScript.dataset.auto !== undefined) {
  bootPage();
}
