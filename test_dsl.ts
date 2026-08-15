import { parseScript } from './src/dsl';

const userScript = `# PC Case Configuration
frame(w=530 d=330 h=350 l=190) {
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
assert(cfg.frame.levels.length === 1 && cfg.frame.levels[0] === 190, 'levels=[190]');
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

function assertThrows(fn: () => void, msg: string) {
  try { fn(); console.error('  FAIL', msg, '(no throw)'); fail++; }
  catch (e) { console.log('  OK', msg); pass++; }
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
assertThrows(() => parseScript('frame(w=530 d=330 h=350 l=140,)'), 'unknown character -> error');
assertThrows(() => parseScript(`frame(w=530 d=330 h=350)\nmove( x = ) motherboard()`), "missing value after '=' -> error");

console.log(`\n${pass} OK, ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
