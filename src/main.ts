import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { parseScript, DEFAULT_SCRIPT, SceneConfig } from './dsl';
import { buildFrameMeshes, buildComponentMeshes } from './scene';
import { generateReport } from './profiles';

// ---- DOM ----
const container = document.getElementById('canvas-container')!;
const editor = document.getElementById('dsl-editor')! as HTMLTextAreaElement;
const errorBox = document.getElementById('error-box')!;
const btnApply = document.getElementById('btn-apply')!;
const btnResetFrame = document.getElementById('btn-reset-frame')!;
const btnReport = document.getElementById('btn-report')!;

// Любой рантайм-ошибка видна в интерфейсе, а не как пустой экран
window.addEventListener('error', (e) => {
  errorBox.textContent = `Ошибка: ${e.message}`;
  errorBox.style.display = 'block';
});

// ---- Three.js ----
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x404040); // как в Android-приложении (glClearColor 0.25,0.25,0.25)

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 10000);
camera.up.set(0, 0, 1);
camera.position.set(0, -600, 600);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;

// ---- State ----
let currentConfig: SceneConfig | null = null;
let sceneObjects: THREE.Object3D[] = [];

// ---- Pan (Ctrl+Drag) ----
const panStart = new THREE.Vector2();
const panEnd = new THREE.Vector2();
let isPanning = false;

// ---- Syntax Highlighting ----
const hlCode = document.querySelector('#hl-layer code')!;
const hlLayer = document.getElementById('hl-layer')! as HTMLPreElement;

const HL_KEYWORDS = new Set(['frame', 'bottomEdge', 'move', 'rotate']);
const HL_RE = /#[^\n]*|\/\/[^\n]*|-?\d+(?:\.\d+)?|[A-Za-z_][A-Za-z0-9_]*|\s+|./gs;

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function updateHighlight() {
  const src = editor.value;
  let out = '';
  HL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = HL_RE.exec(src))) {
    const t = m[0];
    if (t === '#' || t.startsWith('//')) out += `<span class="c">${esc(t)}</span>`;
    else if (/^-?\d/.test(t)) out += `<span class="n">${t}</span>`;
    else if (/^[A-Za-z_]/.test(t)) {
      const cls = HL_KEYWORDS.has(t) ? 'k' : /^\s*=(?!=)/.test(src.slice(HL_RE.lastIndex)) ? 'p' : 'f';
      out += `<span class="${cls}">${t}</span>`;
    } else if ('(){}='.includes(t)) out += `<span class="o">${esc(t)}</span>`;
    else if (!/^\s/.test(t)) out += `<span class="e">${esc(t)}</span>`;
    else out += esc(t);
  }
  hlCode.innerHTML = out + (src.endsWith('\n') ? '\n' : '');
}

editor.addEventListener('input', updateHighlight);
editor.addEventListener('scroll', () => {
  hlLayer.scrollTop = editor.scrollTop;
  hlLayer.scrollLeft = editor.scrollLeft;
});

const STORAGE_KEY = 'pc_case_script';

function loadSavedScript(): string {
  try { return localStorage.getItem(STORAGE_KEY) || DEFAULT_SCRIPT; } catch { return DEFAULT_SCRIPT; }
}
function saveScript(script: string) {
  try { localStorage.setItem(STORAGE_KEY, script); } catch { /* приватный режим — просто не сохраняем */ }
}

// Ключевой свет идёт со стороны камеры и чуть выше неё — как будто светит в лицо сцене
const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
scene.add(keyLight);
const LIGHT_ABOVE_CAMERA = new THREE.Vector3(0, 0, 350); // +Z — вертикаль сцены

function syncLightToCamera() {
  keyLight.position.copy(camera.position).add(LIGHT_ABOVE_CAMERA);
}

// ---- Init ----
scene.add(new THREE.AmbientLight(0xffffff, 0.7));
syncLightToCamera();
editor.value = loadSavedScript();
updateHighlight();
loadScene(editor.value);

window.addEventListener('resize', resize);
resize();

function resize() {
  const r = container.getBoundingClientRect();
  camera.aspect = r.width / r.height;
  camera.updateProjectionMatrix();
  renderer.setSize(r.width, r.height);
}

// ---- Scene Building ----
function loadScene(script: string) {
  try {
    errorBox.style.display = 'none';

    for (const obj of sceneObjects) {
      scene.remove(obj);
      obj.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
          else if (child.material) child.material.dispose();
        }
      });
    }
    sceneObjects = [];

    const config = parseScript(script);
    currentConfig = config;
    saveScript(script); // последнее успешно применённое — переживёт перезапуск сервиса

    const frameMeshes = buildFrameMeshes(config);
    for (const m of frameMeshes) { scene.add(m); sceneObjects.push(m); }

    const movableComponents = buildComponentMeshes(config);
    for (const c of movableComponents) { scene.add(c.group); sceneObjects.push(c.group); }

    controls.target.set(0, 0, config.frame.h / 2);
    controls.update();
  } catch (e: any) {
    errorBox.textContent = e.message;
    errorBox.style.display = 'block';
  }
}

// ---- UI ----
btnApply.addEventListener('click', () => loadScene(editor.value));
editor.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') { e.preventDefault(); document.execCommand('insertText', false, '  '); return; }
  if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); loadScene(editor.value); }
});

// Сброс: дефолтный скрипт + очищаем сохранённое (после перезапуска снова будет он)
btnResetFrame.addEventListener('click', () => {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  editor.value = DEFAULT_SCRIPT;
  updateHighlight();
  loadScene(DEFAULT_SCRIPT);
});

// ---- Report ----
const overlay = document.getElementById('report-overlay')!;
const reportText = document.getElementById('report-text')! as HTMLPreElement;
const btnDownload = document.getElementById('btn-download-report')! as HTMLAnchorElement;

function closeReport() { overlay.classList.add('hidden'); }
document.getElementById('btn-close-report')!.addEventListener('click', closeReport);
document.getElementById('btn-close-report-2')!.addEventListener('click', closeReport);
overlay.addEventListener('click', (e) => { if (e.target === overlay) closeReport(); });

btnReport.addEventListener('click', () => {
  if (!currentConfig) return;
  const report = generateReport(currentConfig.frame);
  reportText.textContent = report;
  btnDownload.href = URL.createObjectURL(new Blob([report], { type: 'text/plain;charset=utf-8' }));
  overlay.classList.remove('hidden');
});

// ---- Pointer Events (Ctrl+Drag to pan) ----
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (!e.ctrlKey) return;
  controls.enabled = false;
  isPanning = true;
  panStart.set(e.clientX, e.clientY);
});

window.addEventListener('pointermove', (e) => {
  if (!isPanning) return;
  panEnd.set(e.clientX, e.clientY);
  const dx = panEnd.x - panStart.x, dy = panEnd.y - panStart.y;
  panStart.copy(panEnd);

  const rect = renderer.domElement.getBoundingClientRect();
  const fov = camera.fov * Math.PI / 180;
  const viewH = 2 * camera.position.distanceTo(controls.target) * Math.tan(fov / 2);
  const viewW = viewH * camera.aspect;
  const px = (dx / rect.width) * viewW * 0.5, py = (dy / rect.height) * viewH * 0.5;

  const right = new THREE.Vector3().crossVectors(camera.getWorldDirection(new THREE.Vector3()), camera.up).normalize();
  const up = camera.up.clone().normalize();

  controls.target.addScaledVector(right, -px);
  controls.target.addScaledVector(up, py);
  camera.position.addScaledVector(right, -px);
  camera.position.addScaledVector(up, py);
  controls.update();
});

window.addEventListener('pointerup', () => {
  if (isPanning) { isPanning = false; controls.enabled = true; }
});

// ---- Keyboard ----
window.addEventListener('keydown', (e) => {
  if (document.activeElement === editor) return;
  if (e.key === 'r' || e.key === 'R') {
    camera.position.set(0, -600, 600);
    if (currentConfig) { controls.target.set(0, 0, currentConfig.frame.h / 2); controls.update(); }
  }
});

// ---- Loop ----
function animate() { requestAnimationFrame(animate); controls.update(); syncLightToCamera(); renderer.render(scene, camera); }
animate();
