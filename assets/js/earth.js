// Shared Earth background initialization for all pages
// Loads Three.js lazily and renders a rotating globe behind content when #earth-bg is present.
export async function initEarthBackground() {
  try {
    const container = document.getElementById('earth-bg');
    if (!container) return; // page doesn't want earth
    if (container.querySelector('canvas')) return; // already initialized

    // Resolve absolute site base to load earth.glb reliably on GitHub Pages subpaths
    function getSiteBase() {
      try {
        const link = document.querySelector('link[href*="assets/css/style.css"]');
        if (link && link.href) {
          return link.href.replace(/assets\/css\/style\.css.*/, '');
        }
      } catch (e) {}
      // Fallback: derive from current location (assumes earth.glb at one level up or root)
      const parts = location.pathname.split('/').filter(Boolean);
      // If we're in a subdir (e.g., /repo/settings/), drop last segment to get base
      if (parts.length >= 2) {
        return location.origin + '/' + parts.slice(0, 1).join('/') + '/';
      }
      return location.origin + '/';
    }
    const siteBase = getSiteBase();
    const modelUrl = siteBase + 'earth.glb';

    // Lazy import Three
    const THREE = await import('https://esm.sh/three@0.155.0');
    const { GLTFLoader } = await import('https://esm.sh/three@0.155.0/examples/jsm/loaders/GLTFLoader.js');

    const width = window.innerWidth;
    const height = window.innerHeight;
    const screenFraction = 0.5; // portion of screen width the globe should occupy

    // Renderer
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setClearColor(0x000000, 0);
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.toneMappingExposure = 1;
    // Canvas styling so it never blocks UI
    Object.assign(renderer.domElement.style, {
      position: 'fixed', top: '0', left: '0', width: '100%', height: '100%', zIndex: '-2', pointerEvents: 'none'
    });
    container.appendChild(renderer.domElement);

    // Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 0, 7);
    let baseDistance = camera.position.z;
    let desiredCameraY = 0;
    let desiredCameraZ = baseDistance;
    const cameraYRange = 4.0;
    const cameraZRangeFactor = 0.12;

    // Scene
    const scene = new THREE.Scene();
    let earthObj = null;
    const loader = new GLTFLoader();

    function createFallbackSphere() {
      const geom = new THREE.SphereGeometry(2.0, 32, 32);
      const mat = new THREE.MeshBasicMaterial({ color: 0x4aa3df });
      const sphere = new THREE.Mesh(geom, mat);
      const fov = camera.fov * (Math.PI / 180);
      const aspect = width / height;
      const desiredWorldWidth = 2 * camera.position.z * Math.tan(fov / 2) * aspect * screenFraction;
      const sphereScale = desiredWorldWidth / 4; // diameter is 4
      sphere.scale.setScalar(sphereScale || 1);
      sphere.position.y = 0;
      scene.add(sphere);
      earthObj = sphere;
      console.warn('Using fallback procedural globe (scaled/centered).');
    }

    function animate() {
      requestAnimationFrame(animate);
      if (earthObj) earthObj.rotation.y += 0.00012;
      camera.position.y += (desiredCameraY - camera.position.y) * 0.08;
      camera.position.z += (desiredCameraZ - camera.position.z) * 0.08;
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
    }
    animate();

    // Expose a tiny API for debugging
    window.EarthCamera = {
      setPosition: (x = 0, y = 0, z = undefined, instant = false) => {
        if (typeof x === 'object') { const o = x; x = o.x ?? 0; y = o.y ?? 0; z = o.z; }
        if (z === undefined) z = camera.position.z;
        if (instant) {
          camera.position.set(x, y, z);
          desiredCameraY = y; desiredCameraZ = z; baseDistance = z;
        } else { desiredCameraY = y; desiredCameraZ = z; }
      },
      setDesired: (y, z) => { if (typeof y === 'number') desiredCameraY = y; if (typeof z === 'number') desiredCameraZ = z; },
      setBaseDistance: (z) => { baseDistance = z; desiredCameraZ = z; camera.position.z = z; },
      get: () => ({ x: camera.position.x, y: camera.position.y, z: camera.position.z, desiredCameraY, desiredCameraZ, baseDistance })
    };

    function tryLoad() {
      loader.load(
        modelUrl,
        (gltf) => {
          try {
            const earth = gltf.scene || (gltf.scenes && gltf.scenes[0]);
            if (!earth) throw new Error('GLTF has no scene');
            scene.add(earth);
            const box = new THREE.Box3().setFromObject(earth);
            const center = box.getCenter(new THREE.Vector3());
            const radiusModel = box.getBoundingSphere(new THREE.Sphere()).radius;
            earth.position.x = center.x; earth.position.y = center.y; earth.position.z = center.z;
            const fov = camera.fov * (Math.PI / 180);
            const desiredWorldWidth = 2 * camera.position.z * Math.tan(fov / 2) * (width / height) * screenFraction;
            const scale = desiredWorldWidth / (2 * radiusModel);
            earth.scale.setScalar(scale || 1);
            camera.position.set(0, 0, 6);
            camera.lookAt(0, 0, 0);
            baseDistance = camera.position.z; desiredCameraZ = baseDistance; desiredCameraY = 0;
            window.addEventListener('scroll', () => {
              const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
              const frac = Math.min(1, window.scrollY / maxScroll);
              const centered = frac - 0.5;
              desiredCameraY = centered * cameraYRange * -1;
              desiredCameraZ = baseDistance * (1 + centered * cameraZRangeFactor);
            }, { passive: true });
            earth.rotation.x = 0.4;
            earth.traverse(node => {
              if (node.isMesh) {
                const oldMat = node.material;
                const map = oldMat && oldMat.map ? oldMat.map : null;
                if (map && THREE.SRGBColorSpace) map.colorSpace = THREE.SRGBColorSpace;
                node.material = new THREE.MeshBasicMaterial({ map, color: 0xffffff });
              }
            });
            renderer.domElement.style.filter = 'brightness(1.15)';
            earthObj = earth;
          } catch (e) {
            console.error('Error parsing GLTF', e);
            createFallbackSphere();
          }
        },
        undefined,
        (err) => { console.error('Failed to load GLTF', err); createFallbackSphere(); }
      );
    }
    tryLoad();

    window.addEventListener('resize', () => {
      const w = window.innerWidth, h = window.innerHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h; camera.updateProjectionMatrix();
    });
  } catch (e) {
    console.error('Earth background init failed:', e);
  }
}

// Auto-init lazily when DOM is ready
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    const kick = () => initEarthBackground();
    if ('requestIdleCallback' in window) requestIdleCallback(kick, { timeout: 2000 }); else setTimeout(kick, 600);
  });
}
