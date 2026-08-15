import * as THREE from 'three';
import { SceneConfig, ComponentPlacement, TransformOp, formatScene } from './dsl';
import {
  buildFrameVertical, buildFrameHorizontal,
  buildMotherboard, buildGpu, buildPsu, buildCooler, buildRadiator,
} from './components';

const COLORS: Record<string, THREE.Color> = {
  motherboard: new THREE.Color(0, 200 / 255, 0),
  gpu: new THREE.Color(200 / 255, 30 / 255, 30 / 255),
  psu: new THREE.Color(60 / 255, 60 / 255, 60 / 255),
  cooler: new THREE.Color(180 / 255, 180 / 255, 180 / 255),
  radiator: new THREE.Color(50 / 255, 50 / 255, 55 / 255),
  frameVert: new THREE.Color(100 / 255, 140 / 255, 200 / 255),
  frameHoriz: new THREE.Color(128 / 255, 128 / 255, 128 / 255),
};

export interface MovableComponent {
  group: THREE.Group;
  placement: ComponentPlacement;
  baseGeo: THREE.BufferGeometry;
}

const MAT = { vertexColors: true, side: THREE.DoubleSide as THREE.Side };

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
