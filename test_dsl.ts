import { parseScript, DEFAULT_SCRIPT } from './src/dsl';
import { resolveFrameBeams } from './src/components';
import { computeProfileCuts } from './src/profiles';

const userScript = `# PC Case Configuration
frame(w=530 d=330 h=350) {
    bottomEdge(x=-200)
    bottomEdge(x=-120)

  bottomEdge(x=-46)
    bottomEdge(x=200)
}
move(90 40 20.8) motherboard()
move(-120 0 260) gpu(n=5 s=55)

move(x=-160 z=64){
 move(y=85) rotate(90 0 0) psu()
 move(y=-85) rotate(90 0 0) psu()
}

move(150 35 105) cooler()
move(z=363.5)  {
 radiator()
 move(x=200) radiator()
 move(x=-200)radiator()
}`;

const cfg = parseScript(userScript);
let pass = 0, fail = 0;

function assert(cond: boolean, msg: string) {
  if (cond) { console.log('  OK', msg); pass++; }
  else { console.error('  FAIL', msg); fail++; }
}

console.log('=== Frame ===');
assert(cfg.frame.w === 530, 'w=530');
assert(cfg.frame.d === 330, 'd=330');
assert(cfg.frame.h === 350, 'h=350');
assert(cfg.frame.edges.length === 0, 'no edges');
assert(cfg.frame.bottomBeams.length === 4, 'bottomBeams=4');
assert(cfg.frame.bottomBeams[0] === -200, 'bb[0]=-200');
assert(cfg.frame.bottomBeams[1] === -120, 'bb[1]=-120');
assert(cfg.frame.bottomBeams[2] === -46, 'bb[2]=-46');
assert(cfg.frame.bottomBeams[3] === 200, 'bb[3]=200');

console.log('=== Components ===');
assert(cfg.components.length === 8, 'total=8');

const mb = cfg.components[0];
assert(mb.type === 'motherboard', '0: motherboard');
assert(mb.transforms.length === 1, '0: 1 tx');
const mbMove = mb.transforms[0];
assert(mbMove.kind === 'move', '0: move');
assert(mbMove.kind === 'move' && mbMove.x === 90, '0: x=90');
assert(mbMove.kind === 'move' && mbMove.y === 40, '0: y=40');
assert(mbMove.kind === 'move' && mbMove.z === 20.8, '0: z=20.8');

const gpu = cfg.components[1];
assert(gpu.type === 'gpu', '1: gpu');
assert(gpu.count === 5, '1: count=5');
assert(gpu.spacing === 55, '1: spacing=55');
assert(gpu.transforms.length === 1, '1: 1 tx');

const psu1 = cfg.components[2];
assert(psu1.type === 'psu', '2: psu');
assert(psu1.transforms.length === 3, '2: 3 tx');
assert(psu1.transforms[0].kind === 'move', '2: t0=move');
assert(psu1.transforms[0].kind === 'move' && psu1.transforms[0].x === -160, '2: t0.x=-160');
assert(psu1.transforms[0].kind === 'move' && psu1.transforms[0].z === 64, '2: t0.z=64');
assert(psu1.transforms[1].kind === 'move', '2: t1=move');
assert(psu1.transforms[1].kind === 'move' && psu1.transforms[1].y === 85, '2: t1.y=85');
assert(psu1.transforms[2].kind === 'rotate', '2: t2=rotate');
assert(psu1.transforms[2].kind === 'rotate' && psu1.transforms[2].x === 90, '2: t2.x=90');

const psu2 = cfg.components[3];
assert(psu2.type === 'psu', '3: psu');
assert(psu2.transforms.length === 3, '3: 3 tx');
assert(psu2.transforms[1].kind === 'move' && psu2.transforms[1].y === -85, '3: t1.y=-85');

const cooler = cfg.components[4];
assert(cooler.type === 'cooler', '4: cooler');
assert(cooler.transforms[0].kind === 'move' && cooler.transforms[0].x === 150, '4: x=150');

const rad1 = cfg.components[5];
assert(rad1.type === 'radiator', '5: radiator');
assert(rad1.transforms.length === 1, '5: 1 tx');
assert(rad1.transforms[0].kind === 'move' && rad1.transforms[0].z === 363.5, '5: z=363.5');

const rad2 = cfg.components[6];
assert(rad2.type === 'radiator', '6: radiator');
assert(rad2.transforms.length === 2, '6: 2 tx');
assert(rad2.transforms[1].kind === 'move' && rad2.transforms[1].x === 200, '6: t1.x=200');

const rad3 = cfg.components[7];
assert(rad3.type === 'radiator', '7: radiator');
assert(rad3.transforms.length === 2, '7: 2 tx');
assert(rad3.transforms[1].kind === 'move' && rad3.transforms[1].x === -200, '7: t1.x=-200');

const userScript2 = `# PC Case Configuration
frame (w=540 d=340 h=400) {
 bottomEdge (x=-40)
 bottomEdge (x=100)
  bottomEdge (x=-100)
 frontEdge(z=170)
 backEdge(z=170)
 leftEdge(z=170)
 rightEdge(z=170)
}
move(114 30 20.8) motherboard()
move(-120 0 270) gpu (n=5 s=55)
move(x=-170 z=80) {
  move(y=75) rotate(90 0 0) psu()
  move(y=-75) rotate(90 0 0) psu()
}
move(150 35 105) cooler()
move(0 0 420) {
 radiator()
 move(x=200) radiator ()
}`;

console.log('=== User script #2 ===');
{
  const cfg = parseScript(userScript2);
  assert(cfg.frame.w === 540 && cfg.frame.d === 340 && cfg.frame.h === 400, 'frame 540/340/400');
  assert(cfg.frame.edges.length === 4, `edges=4 (got ${cfg.frame.edges.length})`);
  assert(JSON.stringify(cfg.frame.edges.map(e => e.side)) === '["front","back","left","right"]', 'edge sides order');
  assert(cfg.frame.edges.every(e => e.z === 170), 'all edges z=170');
  assert(JSON.stringify(cfg.frame.bottomBeams) === '[-40,100,-100]', 'bottomBeams=[-40,100,-100]');
  assert(cfg.components.length === 7, `total=7 (got ${cfg.components.length})`);

  const [mb, gpu, psu1, psu2, cooler, rad1, rad2] = cfg.components;
  assert(mb.type === 'motherboard', '0: motherboard');
  assert((mb.transforms[0] as any).x === 114 && (mb.transforms[0] as any).y === 30 && (mb.transforms[0] as any).z === 20.8, '0: move(114 30 20.8)');

  assert(gpu.type === 'gpu' && gpu.count === 5 && gpu.spacing === 55, '1: gpu n=5 s=55');
  assert((gpu.transforms[0] as any).x === -120 && (gpu.transforms[0] as any).z === 270, '1: move(-120 0 270)');

  let pi = 2;
  for (const [psu, yExp] of [[psu1, 75], [psu2, -75]] as const) {
    assert(psu.type === 'psu', `${pi}: psu`);
    assert(psu.transforms.length === 3, `${pi}: 3 tx`);
    assert((psu.transforms[0] as any).x === -170 && (psu.transforms[0] as any).z === 80, `${pi}: outer move(x=-170 z=80)`);
    assert((psu.transforms[1] as any).y === yExp, `${pi}: inner y=${yExp}`);
    assert(psu.transforms[2].kind === 'rotate' && (psu.transforms[2] as any).x === 90, `${pi}: rotate(90)`);
    pi++;
  }

  assert(cooler.type === 'cooler', '4: cooler');
  assert((cooler.transforms[0] as any).x === 150 && (cooler.transforms[0] as any).y === 35 && (cooler.transforms[0] as any).z === 105, '4: move(150 35 105)');

  assert(rad1.type === 'radiator', '5: radiator');
  assert(rad1.transforms.length === 1 && (rad1.transforms[0] as any).z === 420, '5: move(0 0 420) only');

  assert(rad2.type === 'radiator', '6: radiator');
  assert(rad2.transforms.length === 2, '6: 2 tx');
  assert((rad2.transforms[0] as any).z === 420, '6: outer z=420');
  assert((rad2.transforms[1] as any).x === 200, '6: inner x=200');
}

function assertThrows(fn: () => void, msg: string) {
  try { fn(); console.error('  FAIL', msg, '(no throw)'); fail++; }
  catch (e) { console.log('  OK', msg); pass++; }
}

console.log('=== Default script ===');
{
  const cfg = parseScript(DEFAULT_SCRIPT);
  assert(cfg.frame.w === 540 && cfg.frame.d === 340 && cfg.frame.h === 400, 'default frame 540/340/400');
  assert(JSON.stringify(cfg.frame.bottomBeams) === '[-40,100,-100]', 'default bottomBeams');
  assert(cfg.frame.edges.length === 4, `default edges=4 (got ${cfg.frame.edges.length})`);
  const fe = cfg.frame.edges.find(e => e.side === 'front')!;
  assert(fe && fe.y === 60 && fe.z === 200 && fe.length === null, 'frontEdge(y=60 z=200) full span');
  const be = cfg.frame.edges.find(e => e.side === 'back')!;
  assert(be && be.z === 310, 'backEdge(z=310)');
  assert(cfg.components.length === 8, `default components=8 (got ${cfg.components.length})`);
  const rads = cfg.components.filter(c => c.type === 'radiator');
  assert(rads.length === 3 && rads.every(r => (r.transforms[0] as any).z === 420), '3 radiators inherit z=420');
}

console.log('=== Edge beams ===');
{
  const cfg = parseScript(`frame(w=540 d=340 h=400)\nfrontEdge(z=170 x=-50 y=10 l=300)\nbackEdge(z=200)\nleftEdge(z=100)\nrightEdge(z=120)`);
  assert(cfg.frame.edges.length === 4, '4 edges parsed');
  const [f, b, le, r] = cfg.frame.edges;
  assert(f.side === 'front' && f.x === -50 && f.y === 10 && f.z === 170 && f.length === 300, 'frontEdge custom params');
  assert(b.side === 'back' && b.x === 0 && b.y === 0 && b.z === 200 && b.length === null, 'backEdge defaults (full span)');
  assert(le.side === 'left' && le.z === 100, 'leftEdge z=100');
  assert(r.side === 'right' && r.z === 120, 'rightEdge z=120');

  // Геометрия: p=20, w=540 → bw=500; d=340 → bd=300; front wall y=-160, back +160, left x=-260, right +260
  const beams = resolveFrameBeams(540, 340, 400, [90], cfg.frame.edges);
  assert(beams.length === 8 + 1 + 4, `beam count=13 (got ${beams.length})`); // 2 слоя x4 + bottomBeam + 4 edges
  const bf = beams.find(bm => bm.z === 170 && bm.sx === 300)!;   // frontEdge с l=300
  assert(!!bf, 'frontEdge beam found');
  if (bf) {
    assert(Math.abs(bf.y - (-160 + 10)) < 1e-9 && Math.abs(bf.x - (-50)) < 1e-9, `frontEdge pos x=-50 y=${bf.y} (wall+10)`);
  }
  const bb = beams.find(bm => bm.z === 200 && bm.sx === 500)!;   // backEdge полный пролёт у задней стенки
  assert(!!bb, 'backEdge beam found');
  if (bb) assert(Math.abs(bb.y - 160) < 1e-9 && bb.sy === 20, `backEdge at y=${bb.y} full span`);
  const bl = beams.find(bm => bm.z === 100 && bm.sx === 20)!;    // leftEdge вдоль Y у левой стенки
  assert(!!bl, 'leftEdge beam found');
  if (bl) assert(Math.abs(bl.x - (-260)) < 1e-9 && bl.sy === 300, `leftEdge at x=${bl.x} full depth`);
  const br = beams.find(bm => bm.z === 120 && bm.sx === 20)!;    // rightEdge вдоль Y у правой стенки
  assert(!!br, 'rightEdge beam found');
  if (br) assert(Math.abs(br.x - 260) < 1e-9 && br.sy === 300, `rightEdge at x=${br.x} full depth`);

  // BOM: стойки 4x400Z; слои 2x(2x500X+2x300Y); edges: 300X + 500X + 2x300Y (bottomBeams в cfg пустые)
  const cuts = computeProfileCuts(cfg.frame);
  assert(cuts.length === 4 + 8 + 4, `cut count=16 (got ${cuts.length})`);
  const sumX = cuts.filter(c => c.axis === 'X').reduce((s, c) => s + c.length * 1, 0);
  assert(sumX === 4 * 500 + 300 + 500, `sum X lengths=${sumX}`);
  const sumY = cuts.filter(c => c.axis === 'Y').reduce((s, c) => s + c.length * 1, 0);
  assert(sumY === 4 * 300 + 2 * 300, `sum Y lengths=${sumY}`);

  // l= в frame() больше не поддерживается; z у edges обязателен
  assertThrows(() => parseScript('frame(w=530 d=330 h=350 l=140)'), 'l= in frame -> error');
  assertThrows(() => parseScript('frame(w=530 d=330 h=350)\nfrontEdge(x=1)'), 'edge without z -> error');
}

console.log('=== Parity with csg_pc_editor ===');
{
  const cfg2 = parseScript(`frame(w=530 d=330 h=350 b=200)\nbottomEdge(x=-46)`);
  assert(JSON.stringify(cfg2.frame.bottomBeams) === '[200,-46]', 'top-level bottomEdge appended after b param');
}
{
  const cfg3 = parseScript(`frame(w=530 d=330 h=350)\nmove(1 2 3) {\n motherboard()\n bottomEdge(x=-77)\n}`);
  assert(JSON.stringify(cfg3.frame.bottomBeams) === '[-77]', 'bottomEdge inside transform block kept');
}
assertThrows(() => parseScript(`frame(w=530 d=330 h=350)\nmove(1 2 3) {\n frame(w=1 d=1 h=1)\n motherboard()\n}`), 'frame inside block -> error');
assertThrows(() => parseScript('frame(w=530 d=330 h=350 b=140,)'), 'unknown character -> error');
assertThrows(() => parseScript(`frame(w=530 d=330 h=350)\nmove( x = ) motherboard()`), "missing value after '=' -> error");

console.log(`\n${pass} OK, ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
