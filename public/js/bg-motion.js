document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('bg-canvas');
  if (!canvas || typeof THREE === 'undefined') return;

  // Setup Scene, Camera, Renderer
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  // Ambient Starfield / Particle Cloud
  const particleCount = 1600;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);
  const speeds = new Float32Array(particleCount);

  for (let i = 0; i < particleCount; i++) {
    // Spread in comfortable depth cylinder
    positions[i * 3] = (Math.random() - 0.5) * 220; // x
    positions[i * 3 + 1] = (Math.random() - 0.5) * 220; // y
    positions[i * 3 + 2] = (Math.random() - 0.5) * 1000 - 100; // z (depth)

    // Gentle, calm base speed (relaxed ambient drift)
    speeds[i] = Math.random() * 0.35 + 0.15;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  
  // Parse CSS variable for brand color
  const styles = getComputedStyle(document.documentElement);
  const brandHex = styles.getPropertyValue('--brand').trim() || '#7941a5';

  const material = new THREE.PointsMaterial({
    color: new THREE.Color(brandHex),
    size: 1.4,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.65
  });

  const particles = new THREE.Points(geometry, material);
  scene.add(particles);

  camera.position.z = 50;

  // Reactivity variables
  let mouseX = 0;
  let mouseY = 0;
  let targetX = 0;
  let targetY = 0;

  // Smooth, comfortable scroll multipliers (Lerped to prevent sudden speed spikes)
  let currentScrollMultiplier = 1.0;
  let targetScrollMultiplier = 1.0;
  let scrollTimeout;
  let scrollParallaxY = 0;

  // Mouse Interaction (subtle parallax)
  window.addEventListener('mousemove', (e) => {
    mouseX = (e.clientX / window.innerWidth) * 2 - 1;
    mouseY = -(e.clientY / window.innerHeight) * 2 + 1;
  }, { passive: true });

  // Gentle, comfortable scroll response
  window.addEventListener('scroll', () => {
    // Modest gentle boost (only 1.35x instead of jarring 5x)
    targetScrollMultiplier = 1.35;
    scrollParallaxY = -(window.scrollY || window.pageYOffset || 0) * 0.015;

    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      targetScrollMultiplier = 1.0; // Gracefully ease back to 1.0
    }, 200);
  }, { passive: true });

  // Handle Resize
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Animation Loop
  function animate() {
    requestAnimationFrame(animate);

    // Smooth lerping for comfortable scroll multiplier
    currentScrollMultiplier += (targetScrollMultiplier - currentScrollMultiplier) * 0.06;

    // Smooth mouse follow + subtle vertical scroll parallax
    targetX = mouseX * 18;
    targetY = mouseY * 18;

    camera.position.x += (targetX - camera.position.x) * 0.05;
    camera.position.y += (targetY + scrollParallaxY - camera.position.y) * 0.05;
    camera.lookAt(scene.position);

    // Move particles forward at calm, comfortable pace
    const posArr = particles.geometry.attributes.position.array;
    for (let i = 0; i < particleCount; i++) {
      posArr[i * 3 + 2] += speeds[i] * currentScrollMultiplier;

      // Reset if it passes the camera smoothly
      if (posArr[i * 3 + 2] > 80) {
        posArr[i * 3 + 2] = -900;
        posArr[i * 3] = (Math.random() - 0.5) * 220;
        posArr[i * 3 + 1] = (Math.random() - 0.5) * 220;
      }
    }
    particles.geometry.attributes.position.needsUpdate = true;

    // Very gentle ambient rotation
    particles.rotation.z += 0.0003;

    renderer.render(scene, camera);
  }

  animate();
});
