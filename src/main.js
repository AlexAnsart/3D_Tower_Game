import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Game } from './Game.js';
import { TestSuite } from './TestSuite.js';

window.game = null;
window.testSuite = null;

window.startGame = async function() {
    document.getElementById('start-screen').style.display = 'none';
    document.getElementById('ui').style.display = 'block';

    const canvas = document.createElement('canvas');
    canvas.style.position = 'fixed';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    document.body.appendChild(canvas);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB);
    // Very light fog for depth only
    scene.fog = new THREE.Fog(0x87CEEB, 340, 1900);

    const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 2600);
    // Higher angle for bigger map
    camera.position.set(0, 80, 120);

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2.1;
    controls.minDistance = 24;
    controls.maxDistance = 900;
    controls.target.set(0, 0, 0);
    controls.autoRotate = false;
    // Disable default keys so we can use ZQSD
    controls.enableKeys = false;

    window.game = new Game(scene, camera, controls, renderer);

    // Run self-test suite
    window.testSuite = new TestSuite(window.game);
    document.getElementById('test-overlay').style.display = 'block';
    await window.testSuite.runAllTests();

    setTimeout(() => {
        if (window.testSuite.allPassed) {
            document.getElementById('test-overlay').style.display = 'none';
        }
    }, 3000);

    const clock = new THREE.Clock();
    let frameCount = 0;
    let lastTime = performance.now();
    let fps = 60;

    function animate() {
        requestAnimationFrame(animate);
        const delta = Math.min(clock.getDelta(), 0.05);

        frameCount++;
        const now = performance.now();
        if (now - lastTime >= 1000) {
            fps = frameCount;
            frameCount = 0;
            lastTime = now;
            document.getElementById('fps').textContent = fps;
        }

        window.game.update(delta);
        controls.update();
        renderer.render(scene, camera);
    }
    animate();

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
};

window.selectTower = function(type) {
    const selectedButton = document.querySelector(`[data-type="${type}"]`);
    if (!selectedButton) return;

    const isAlreadySelected = selectedButton.classList.contains('selected');
    const nextSelectedType = isAlreadySelected ? null : type;

    document.querySelectorAll('.tower-btn').forEach((btn) => btn.classList.remove('selected'));
    if (nextSelectedType) selectedButton.classList.add('selected');

    if (window.game) {
        window.game.selectedTowerType = nextSelectedType;
        window.game.updatePreview();
    }
};
