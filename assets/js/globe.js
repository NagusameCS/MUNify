// Globe initialization module extracted from index.html for reuse
export async function initGlobe(options = {}) {
  const {
    screenFraction = 0.5,
    modelPath = './earth.glb',
    targetId = 'earth-bg'
  } = options;
  try {
    const container = document.getElementById(targetId);
    if (!container) return;
    const [{ default: THREE }, { GLTFLoader }] = await Promise.all([
      import('https://esm.sh/three@0.155.0'),
      import('https://esm.sh/three@0.155.0/examples/jsm/loaders/GLTFLoader.js')
    ]);

    const width = window.innerWidth;
    const height = window.innerHeight;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setClearColor(0x000000, 0);
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.toneMappingExposure = 1;
    Object.assign(renderer.domElement.style, {
      position: 'fixed', top: '0', left: '0', width: '100%', height: '100%', zIndex: '-2', pointerEvents: 'none'
    });
    container.appendChild(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 0, 7);
    const scene = new THREE.Scene();

    let earthObj = null;
    let baseDistance = camera.position.z;
    let desiredCameraY = 0;
    let desiredCameraZ = baseDistance;
    const cameraYRange = 4.0;
    const cameraZRangeFactor = 0.12;

    let running = true;
    const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function animate() {
      if (!running) return;
      requestAnimationFrame(animate);
      if (!prefersReducedMotion && earthObj) earthObj.rotation.y += 0.00012;
      camera.position.y += (desiredCameraY - camera.position.y) * 0.08;
      camera.position.z += (desiredCameraZ - camera.position.z) * 0.08;
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
    }
    animate();
    document.addEventListener('visibilitychange', ()=>{ running = !document.hidden; if (running) animate(); });

    function createFallbackSphere() {
      const geom = new THREE.SphereGeometry(2.0, 32, 32);
      const mat = new THREE.MeshBasicMaterial({ color: 0x4aa3df });
      const sphere = new THREE.Mesh(geom, mat);
      const fov = camera.fov * (Math.PI / 180);
      const aspect = width / height;
      const desiredWorldWidth = 2 * camera.position.z * Math.tan(fov / 2) * aspect * screenFraction;
      const sphereScale = desiredWorldWidth / 4; // diameter 4
      sphere.scale.setScalar(sphereScale || 1);
      sphere.position.y = 0;
      scene.add(sphere);
      earthObj = sphere;
      console.warn('Using fallback procedural globe (scaled/offset).');
    }

    const loader = new GLTFLoader();
    loader.load(
      modelPath,
      (gltf) => {
        try {
          const earth = gltf.scene || (gltf.scenes && gltf.scenes[0]);
          if (!earth) throw new Error('GLTF has no scene');
          scene.add(earth);
          const box = new THREE.Box3().setFromObject(earth);
          const center = new THREE.Vector3();
          box.getCenter(center);
          earth.position.x = center.x;
          earth.position.y = center.y;
          earth.position.z = center.z;
          const boundingSphere = box.getBoundingSphere(new THREE.Sphere());
          const radiusModel = boundingSphere.radius;
          const fov = camera.fov * (Math.PI / 180);
          const desiredWorldWidth = 2 * camera.position.z * Math.tan(fov / 2) * (width / height) * screenFraction;
          const scale = desiredWorldWidth / (2 * radiusModel);
          earth.scale.setScalar(scale || 1);
          camera.position.set(0, 0, 6);
          camera.lookAt(0, 0, 0);
          earth.position.y = 0;
          baseDistance = camera.position.z;
          desiredCameraZ = baseDistance;
          desiredCameraY = 0;
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
              let map = oldMat && oldMat.map ? oldMat.map : null;
              if (map) { map.colorSpace = THREE.SRGBColorSpace || THREE.sRGBEncoding; }
              node.material = new THREE.MeshBasicMaterial({ map, color: 0xffffff });
            }
          });
          renderer.domElement.style.filter = 'brightness(1.15)';
          earthObj = earth;
          console.log('Globe model loaded', { scale: earth.scale.x });
        } catch (e) {
          console.error('Error parsing GLTF', e);
          createFallbackSphere();
        }
      },
      undefined,
      (err) => { console.error('Failed to load GLTF', err); createFallbackSphere(); }
    );

    window.addEventListener('resize', () => {
      const w = window.innerWidth, h = window.innerHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    });

    window.EarthCamera = {
      setPosition: (x = 0, y = 0, z = camera.position.z, instant = false) => {
        if (typeof x === 'object') { const o = x; x = o.x ?? 0; y = o.y ?? 0; z = o.z ?? z; }
        if (instant) {
          camera.position.set(x, y, z);
          desiredCameraY = y; desiredCameraZ = z; baseDistance = z;
        } else {
          desiredCameraY = y; desiredCameraZ = z;
        }
      },
      setDesired: (y, z) => { if (typeof y === 'number') desiredCameraY = y; if (typeof z === 'number') desiredCameraZ = z; },
      setBaseDistance: (z) => { baseDistance = z; desiredCameraZ = z; camera.position.z = z; },
      get: () => ({ x: camera.position.x, y: camera.position.y, z: camera.position.z, desiredCameraY, desiredCameraZ, baseDistance })
    };
  } catch (e) {
    console.error('initGlobe failed', e);
  }
}
