import * as THREE from 'three';
import { SceneConfig, ComponentPlacement, TransformOp, formatScene } from './dsl';
import {
  buildFrameVertical, buildFrameHorizontal,
  buildMotherboard, buildGpu, buildPsu, buildCooler, buildRadiator,
} from './components';

// Цвета 1-в-1 с Android-приложением (PcCaseModelFactory.kt)
const COLORS: Record<string, THREE.Color> = {
  motherboard: new THREE.Color(0 / 255, 255 / 255, 0 / 255),   // Color.GREEN
  gpu: new THREE.Color(200 / 255, 30 / 255, 30 / 255),        // (200, 30, 30)
  psu: new THREE.Color(60 / 255, 60 / 255, 60 / 255),         // (60, 60, 60)
  cooler: new THREE.Color(180 / 255, 180 / 255, 180 / 255),   // (180, 180, 180)
  radiator: new THREE.Color(50 / 255, 50 / 255, 55 / 255),    // (50, 50, 55)
  frameVert: new THREE.Color(100 / 255, 140 / 255, 200 / 255),// (100, 140, 200)
  frameHoriz: new THREE.Color(128 / 255, 128 / 255, 128 / 255), // GRAY
};

export interface MovableComponent {
  group: THREE.Group;
  placement: ComponentPlacement;
  baseGeo: THREE.BufferGeometry;
}

// flatShading — плоские сочные грани, как в GL-рендерере Android-приложения
const MAT = { vertexColors: true, side: THREE.DoubleSide as THREE.Side, flatShading: true };

function colorize(geo: THREE.BufferGeometry, color: THREE.Color): THREE.BufferGeometry {
  const count = geo.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

// Текстуры материнской платы — те же файлы, что в Android-приложении (assets/motherboard*.png)
let mbTextures: { top: THREE.Texture; bottom: THREE.Texture } | null = null;
function getMbTextures() {
  if (!mbTextures) {
    const loader = new THREE.TextureLoader();
    const base = import.meta.env.BASE_URL + 'textures/';
    const load = (f: string) => {
      const t = loader.load(base + f);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };
    mbTextures = { top: load('motherboard.png'), bottom: load('motherboard_down.png') };
  }
  return mbTextures;
}

// Текстурированные грани верха/низа платы (как в MultipleObjectsRenderer.java)
function buildMbTexturePlanes(): THREE.Mesh[] {
  const { top, bottom } = getMbTextures();
  const W = 305, D = 205.8; // размер платы из components.ts
  const mk = (tex: THREE.Texture, z: number) => {
    const g = new THREE.PlaneGeometry(W, D);
    if (z < 0) g.rotateX(Math.PI); // нижняя грань смотрит вниз
    g.translate(0, 0, z);
    return new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide }));
  };
  return [mk(top, 1.2), mk(bottom, -1.2)];
}

export function buildFrameMeshes(config: SceneConfig): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];

  const fv = colorize(
    buildFrameVertical(config.frame.w, config.frame.d, config.frame.h),
    COLORS.frameVert
  );
  meshes.push(new THREE.Mesh(fv, new THREE.MeshStandardMaterial(MAT)));

  const fh = colorize(
    buildFrameHorizontal(config.frame.w, config.frame.d, config.frame.h, config.frame.bottomBeams, config.frame.edges),
    COLORS.frameHoriz
  );
  meshes.push(new THREE.Mesh(fh, new THREE.MeshStandardMaterial(MAT)));

  return meshes;
}

export function buildComponentMeshes(config: SceneConfig): MovableComponent[] {
  const components: MovableComponent[] = [];

  for (const cp of config.components) {
    const geo = getComponentGeo(cp);
    const color = COLORS[cp.type] || new THREE.Color(0.5, 0.5, 0.5);
    const colored = colorize(geo, color);

    // Apply transforms: rotation first, then translation (accumulated)
    let tx = 0, ty = 0, tz = 0;
    const rotations: { x: number; y: number; z: number }[] = [];

    for (const t of cp.transforms) {
      if (t.kind === 'move') { tx += t.x; ty += t.y; tz += t.z; }
      else rotations.push({ x: t.x, y: t.y, z: t.z });
    }

    // Create a group to hold the mesh with transforms
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(colored, new THREE.MeshStandardMaterial(MAT));

    // Apply rotations
    if (rotations.length) {
      const euler = new THREE.Euler(
        THREE.MathUtils.degToRad(rotations[0].x),
        THREE.MathUtils.degToRad(rotations[0].y),
        THREE.MathUtils.degToRad(rotations[0].z),
        'XYZ'
      );
      mesh.rotation.copy(euler);
    }

    mesh.position.set(tx, ty, tz);
    if (cp.type === 'motherboard') for (const p of buildMbTexturePlanes()) mesh.add(p);
    group.add(mesh);

    components.push({ group, placement: cp, baseGeo: geo });
  }

  return components;
}

function getComponentGeo(cp: ComponentPlacement): THREE.BufferGeometry {
  switch (cp.type) {
    case 'motherboard': return buildMotherboard();
    case 'gpu': return buildGpu(cp.count, cp.spacing);
    case 'psu': return buildPsu();
    case 'cooler': return buildCooler();
    case 'radiator': return buildRadiator();
    default: return new THREE.BoxGeometry(50, 50, 50);
  }
}

export function syncEditor(config: SceneConfig, components: MovableComponent[]) {
  const placements = components.map(c => ({ ...c.placement }));
  return formatScene({ ...config, components: placements });
}
