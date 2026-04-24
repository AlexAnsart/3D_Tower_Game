import * as THREE from 'three';
import { Game } from './Game.js';
import { TestSuite } from './TestSuite.js';
import { clampTowerLevel, SETTINGS } from './settings.js';

window.game = null;
window.testSuite = null;
window.closeTestOverlay = function() {
    const overlay = document.getElementById('test-overlay');
    if (overlay) overlay.style.display = 'none';
};

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
    scene.fog = new THREE.Fog(0x87CEEB, 340 * SETTINGS.world.globalScale, 1900 * SETTINGS.world.globalScale);

    const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 2600);
    // Spawn near the map center at low altitude for spectator navigation
    camera.position.set(0, 14, 0);

    const controls = {
        domElement: canvas,
        update() {}
    };

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

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            window.closeTestOverlay();
        }
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
        if (nextSelectedType) {
            const btn = document.querySelector(`.tower-btn[data-type="${nextSelectedType}"]`);
            const level = clampTowerLevel(parseInt(btn?.querySelector('.tower-level-hidden')?.value || '1', 10));
            window.game.selectedTowerLevel = level;
        }
        window.game.updatePreview();
        window.game.updateUI();
    }
};

window.setTowerLevel = function(type, level) {
    const lv = clampTowerLevel(parseInt(level, 10));
    const btn = document.querySelector(`.tower-btn[data-type="${type}"]`);
    if (btn) {
        const hidden = btn.querySelector('.tower-level-hidden');
        const trigger = btn.querySelector('.tower-level-trigger');
        const options = btn.querySelectorAll('.tower-level-option');
        if (hidden) hidden.value = `${lv}`;
        if (trigger) trigger.textContent = `Level ${lv}`;
        options.forEach((option, index) => {
            option.classList.toggle('active', index + 1 === lv);
        });
        btn.querySelector('.tower-level-picker')?.classList.remove('open');
    }
    if (window.game && window.game.selectedTowerType === type) {
        window.game.selectedTowerLevel = lv;
        window.game.updatePreview();
    }
    if (window.game) window.game.updateUI();
};

window.toggleTowerLevelMenu = function(event, type) {
    event.stopPropagation();
    const btn = document.querySelector(`.tower-btn[data-type="${type}"]`);
    if (!btn) return;
    const picker = btn.querySelector('.tower-level-picker');
    if (!picker) return;
    const openPickers = document.querySelectorAll('.tower-level-picker.open');
    openPickers.forEach((node) => {
        if (node !== picker) node.classList.remove('open');
    });
    picker.classList.toggle('open');
};

document.addEventListener('click', () => {
    document.querySelectorAll('.tower-level-picker.open').forEach((node) => node.classList.remove('open'));
});
