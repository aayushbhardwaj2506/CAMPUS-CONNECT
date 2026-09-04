document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('bg-canvas');
  if (!canvas || typeof THREE === 'undefined') return;

  // Setup Scene, Camera, Renderer
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  // Create Anime Speed Line Particles
  const particleCount = 2000;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);
  const speeds = new Float32Array(particleCount);

  for (let i = 0; i < particleCount; i++) {
    // Random position in a wide cylinder
    positions[i * 3] = (Math.random() - 0.5) * 200; // x
    positions[i * 3 + 1] = (Math.random() - 0.5) * 200; // y
    positions[i * 3 + 2] = (Math.random() - 0.5) * 1000 - 100; // z (depth)

    // Base speed for each particle
    speeds[i] = Math.random() * 2 + 0.5;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  
  // Parse CSS variable for brand color
  const styles = getComputedStyle(document.documentElement);
  const brandHex = styles.getPropertyValue('--brand').trim() || '#7941a5';

  const material = new THREE.PointsMaterial({
    color: new THREE.Color(brandHex),
    size: 1.5,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.8
  });

  const particles = new THREE.Points(geometry, material);
  scene.add(particles);

  camera.position.z = 50;

  // Reactivity variables
  let mouseX = 0;
  let mouseY = 0;
  let targetX = 0;
  let targetY = 0;
  let scrollSpeedMultiplier = 1;

  // Mouse Interaction
  window.addEventListener('mousemove', (e) => {
    // Normalize mouse coordinates from -1 to 1
    mouseX = (e.clientX / window.innerWidth) * 2 - 1;
    mouseY = -(e.clientY / window.innerHeight) * 2 + 1;
  });

  // Scroll Interaction (Anime Speed effect!)
  let scrollTimeout;
  window.addEventListener('scroll', () => {
    scrollSpeedMultiplier = 5; // Zoom fast on scroll
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      scrollSpeedMultiplier = 1; // Return to normal
    }, 150);
  });

  // Handle Resize
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Animation Loop
  function animate() {
    requestAnimationFrame(animate);

    // Smooth mouse follow
    targetX = mouseX * 25; // Max rotation angle
    targetY = mouseY * 25;

    camera.position.x += (targetX - camera.position.x) * 0.05;
    camera.position.y += (targetY - camera.position.y) * 0.05;
    camera.lookAt(scene.position);

    // Move particles forward
    const positions = particles.geometry.attributes.position.array;
    for (let i = 0; i < particleCount; i++) {
      // z index
      positions[i * 3 + 2] += speeds[i] * scrollSpeedMultiplier;

      // Reset if it flies past the camera
      if (positions[i * 3 + 2] > 100) {
        positions[i * 3 + 2] = -900;
        positions[i * 3] = (Math.random() - 0.5) * 200;
        positions[i * 3 + 1] = (Math.random() - 0.5) * 200;
      }
    }
    particles.geometry.attributes.position.needsUpdate = true;

    // Slowly rotate the entire particle field
    particles.rotation.z += 0.001 * scrollSpeedMultiplier;

    renderer.render(scene, camera);
  }

  animate();
});
