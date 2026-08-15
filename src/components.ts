import * as THREE from 'three';
import { CSG } from 'three-csg-ts';
import type { EdgeBeam } from './dsl';

const PROFILE = 20;
const ID = new THREE.Matrix4();

function cube(x: number, y: number, z: number): THREE.BufferGeometry {
  return new THREE.BoxGeometry(x, y, z);
}

function cyl(radius: number, height: number, seg: number = 16): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(radius, radius, height, seg);
}

function csgUnion(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  if (geos.length === 1) return geos[0];
  let r = CSG.fromGeometry(geos[0]);
  for (let i = 1; i < geos.length; i++) r = r.union(CSG.fromGeometry(geos[i]));
  return r.toGeometry(ID);
}

function csgSubtract(base: THREE.BufferGeometry, sub: THREE.BufferGeometry): THREE.BufferGeometry {
  return CSG.fromGeometry(base).subtract(CSG.fromGeometry(sub)).toGeometry(ID);
}

// ---- Frame ----
export interface BeamBox { x: number; y: number; z: number; sx: number; sy: number; sz: number; }

// Полный список балок рамки (чистая функция — используется и для сборки, и для тестов):
// нижний/верхний слои + bottomBeams (вдоль Y снизу) + edges (front/back — вдоль X у стенок, left/right — вдоль Y)
export function resolveFrameBeams(w: number, d: number, h: number, bottomBeams: number[], edges: EdgeBeam[]): BeamBox[] {
  const p = PROFILE, hw = w / 2, hd = d / 2;
  const bw = w - 2 * p, bd = d - 2 * p;
  const beams: BeamBox[] = [];

  for (const z of [p / 2, h - p / 2]) {
    beams.push({ x: 0, y: -hd + p / 2, z, sx: bw, sy: p, sz: p }); // передняя стенка
    beams.push({ x: 0, y: hd - p / 2, z, sx: bw, sy: p, sz: p });  // задняя стенка
    beams.push({ x: -hw + p / 2, y: 0, z, sx: p, sy: bd, sz: p }); // левая
    beams.push({ x: hw - p / 2, y: 0, z, sx: p, sy: bd, sz: p });  // правая
  }

  for (const bx of bottomBeams) beams.push({ x: bx, y: 0, z: p / 2, sx: p, sy: bd, sz: p });

  for (const e of edges) {
    if (e.side === 'front' || e.side === 'back') {
      const wallY = (e.side === 'front' ? -hd + p / 2 : hd - p / 2) + e.y;
      beams.push({ x: e.x, y: wallY, z: e.z, sx: e.length ?? bw, sy: p, sz: p });
    } else {
      const wallX = e.side === 'right' ? hw - p / 2 : -hw + p / 2;
      beams.push({ x: wallX, y: 0, z: e.z, sx: p, sy: bd, sz: p });
    }
  }

  return beams;
}

export function buildFrameVertical(w: number, d: number, h: number): THREE.BufferGeometry {
  const hw = w / 2, hd = d / 2, hh = h / 2;
  return csgUnion([
    cube(PROFILE, PROFILE, h).translate(-hw + PROFILE / 2, -hd + PROFILE / 2, hh),
    cube(PROFILE, PROFILE, h).translate(hw - PROFILE / 2, -hd + PROFILE / 2, hh),
    cube(PROFILE, PROFILE, h).translate(-hw + PROFILE / 2, hd - PROFILE / 2, hh),
    cube(PROFILE, PROFILE, h).translate(hw - PROFILE / 2, hd - PROFILE / 2, hh),
  ]);
}

export function buildFrameHorizontal(
  w: number, d: number, h: number, bottomBeams: number[], edges: EdgeBeam[]
): THREE.BufferGeometry {
  const geos = resolveFrameBeams(w, d, h, bottomBeams, edges).map(b => cube(b.sx, b.sy, b.sz).translate(b.x, b.y, b.z));
  return csgUnion(geos);
}

// ---- Motherboard ----
export function buildMotherboard(): THREE.BufferGeometry {
  // Tyan S8030 single-socket SP3 ATX (305×205.8) — отверстия 1-в-1 с pccase/Motherboard.kt:
  let r = cube(305, 205.8, 1.6);
  const screwPositions: [number, number][] = [
    // Rear I/O area (Y+ edge)
    [-138, 92.5], [146, 76], [-14, 93],
    // Front edge / PCIe area (Y- edge)
    [-138, -93], [-138, -34], [146, -93],
    [-14, -93], [-14, -34],
  ];
  for (const [hx, hy] of screwPositions) {
    r = csgSubtract(r, cyl(1.5, 10, 8).rotateX(Math.PI / 2).translate(hx, hy, 0));
  }
  return r;
}

// ---- GPU ----
export function buildGpu(count: number, spacing: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < count; i++) {
    const off = count > 1 ? i * spacing : 0;
    const gL = 290, gH = 112, gT = 38;
    const halfL = gL / 2, halfH = gH / 2;
    const gp: THREE.BufferGeometry[] = [];
    gp.push(cube(gT - 6, 1.6, gH - 4).translate(0, -halfL + 0.8, 0));
    gp.push(cube(gT, gL, gH));
    for (let j = 0; j < 36; j++) {
      const fy = -halfL + 50 + j * ((gL - 80) / 36);
      gp.push(cube(gT - 6, 0.8, gH - 10).translate(0, fy, 0));
    }
    gp.push(cube(gT + 4, 3, gH - 20).translate(0, -halfL - 1.5, 8));
    gp.push(cube(gT + 6, 20, 10).translate(0, -halfL + 50, halfH));
    gp.push(cube(gT + 6, 20, 10).translate(0, -halfL + 75, halfH));
    const merged = csgUnion(gp);
    // Apply per-GPU offset via matrix
    const m = new THREE.Matrix4().makeTranslation(off, 0, 0);
    merged.applyMatrix4(m);
    parts.push(merged);
  }
  return csgUnion(parts);
}

// ---- PSU ----
export function buildPsu(): THREE.BufferGeometry {
  const pw = 150, ph = 86, pd = 140;
  const hw = pw / 2, hh = ph / 2, hd = pd / 2;
  const parts: THREE.BufferGeometry[] = [];
  parts.push(cube(pw, ph, pd));
  parts.push(cube(pw - 4, ph - 4, 2).translate(0, 0, -hd - 1));
  parts.push(cube(10, 10, 3).translate(hw - 25, hh - 15, hd + 1.5));
  parts.push(cube(25, 15, 5).translate(-hw + 30, hh - 15, hd + 2.5));
  parts.push(cube(4, 20, 50).translate(hw + 2, -hh / 2, 0));
  parts.push(cube(50, 0.5, 30).translate(-hw / 2, hh + 0.25, -20));
  for (const dx of [-1, 1]) for (const dz of [-1, 1])
    parts.push(cube(4, ph + 2, 4).translate(dx * (hw - 8), 0, dz * (hd - 8)));
  parts.push(cube(80, 0.3, 40).translate(0, hh + 0.15, 0));
  return csgUnion(parts);
}

// ---- Cooler ----
export function buildCooler(): THREE.BufferGeometry {
  return cube(124, 145, 156).translate(10, 0, 0);
}

// ---- Radiator ----
export function buildRadiator(): THREE.BufferGeometry {
  const w = 120, l = 395, t = 27, hl = l / 2;
  return csgUnion([
    cube(w, l, t),
    cube(w + 4, 14, t + 3).translate(0, -hl + 7, 0),
    cube(w + 4, 14, t + 3).translate(0, hl - 7, 0),
  ]);
}
