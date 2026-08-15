// ---- Types ----
export interface Vec3 { x: number; y: number; z: number; }
export type ComponentName = 'motherboard' | 'gpu' | 'psu' | 'cooler' | 'radiator';
export const COMPONENT_SET = new Set<ComponentName>(['motherboard', 'gpu', 'psu', 'cooler', 'radiator']);

export interface FrameConfig { w: number; d: number; h: number; levels: number[]; bottomBeams: number[]; }

export type TransformOp =
  | { kind: 'move'; x: number; y: number; z: number }
  | { kind: 'rotate'; x: number; y: number; z: number };

export interface ComponentPlacement {
  type: ComponentName;
  count: number;
  spacing: number;
  transforms: TransformOp[];
}

export interface SceneConfig {
  frame: FrameConfig;
  components: ComponentPlacement[];
}

// ---- Tokenizer ----
type Tok = { kind: 'ID' | 'NUM' | 'OP'; val: string | number };

function tokenize(input: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < input.length) {
    const c = input[i];
    if (c === '#' || (c === '/' && input[i + 1] === '/')) { while (i < input.length && input[i] !== '\n') i++; continue; }
    if (c === '\n' || c === ' ' || c === '\t' || c === '\r') { i++; continue; }
    if ('(){}=;'.includes(c)) { out.push({ kind: 'OP', val: c }); i++; continue; }
    if (c === '-' && i + 1 < input.length && /\d/.test(input[i + 1])) {
      let n = '-'; i++;
      while (i < input.length && /[\d.]/.test(input[i])) n += input[i++];
      out.push({ kind: 'NUM', val: parseFloat(n) }); continue;
    }
    if (/\d/.test(c)) {
      let n = ''; while (i < input.length && /[\d.]/.test(input[i])) n += input[i++];
      out.push({ kind: 'NUM', val: parseFloat(n) }); continue;
    }
    if (/[a-zA-Z_]/.test(c)) {
      let s = ''; while (i < input.length && /[a-zA-Z_0-9]/.test(input[i])) s += input[i++];
      out.push({ kind: 'ID', val: s }); continue;
    }
    throw new Error(`Неожиданный символ '${c}' в позиции ${i}`);
  }
  return out;
}

// ---- AST ----
interface FrameDecl { kind: 'FrameDecl'; w: number; d: number; h: number; levels: number[]; bottomBeams: number[] }
interface BottomEdge { kind: 'BottomEdge'; x: number }
interface ComponentStmt { kind: 'ComponentStmt'; transforms: TransformOp[]; name: ComponentName; count: number; spacing: number }
interface BlockStmt { kind: 'BlockStmt'; transforms: TransformOp[]; statements: AstNode[] }
type AstNode = FrameDecl | BottomEdge | ComponentStmt | BlockStmt;

// ---- Parser ----
class Parser {
  i = 0;
  constructor(public toks: Tok[]) {}

  cur(): Tok { return this.i < this.toks.length ? this.toks[this.i] : { kind: 'OP', val: '' }; }
  peek(): Tok { return this.i + 1 < this.toks.length ? this.toks[this.i + 1] : { kind: 'OP', val: '' }; }

  expect(kind: string, val?: string): Tok {
    const t = this.cur();
    if (t.kind !== kind || (val !== undefined && t.val !== val)) throw new Error(`Ожидалось ${val ?? kind}, получено ${t.kind}:${t.val}`);
    this.i++;
    return t;
  }

  parse(): AstNode[] {
    const stmts: AstNode[] = [];
    while (this.i < this.toks.length) stmts.push(this.stmt());
    return stmts;
  }

  stmt(): AstNode {
    const t = this.cur();
    if (t.kind === 'ID' && t.val === 'frame') return this.parseFrame();
    if (t.kind === 'ID' && t.val === 'bottomEdge') return this.parseBottomEdge();
    return this.parseTransformChain();
  }

  parseFrame(): FrameDecl {
    this.expect('ID', 'frame');
    this.expect('OP', '(');
    const params = this.namedParams();
    this.expect('OP', ')');
    const bottomBeams: number[] = [...(paramList(params, 'b'))];

    if (this.cur().kind === 'OP' && this.cur().val === '{') {
      this.expect('OP', '{');
      while (this.cur().val !== '}' && this.i < this.toks.length) {
        const s = this.stmt();
        if (s.kind === 'BottomEdge') bottomBeams.push(s.x);
      }
      this.expect('OP', '}');
    }

    return { kind: 'FrameDecl', w: paramReq(params, 'w'), d: paramReq(params, 'd'), h: paramReq(params, 'h'), levels: paramList(params, 'l'), bottomBeams };
  }

  parseBottomEdge(): BottomEdge {
    this.expect('ID', 'bottomEdge');
    this.expect('OP', '(');
    const p = this.namedParams();
    this.expect('OP', ')');
    return { kind: 'BottomEdge', x: paramReq(p, 'x') };
  }

  parseTransformChain(): AstNode {
    const transforms: TransformOp[] = [];
    while (this.cur().kind === 'ID' && (this.cur().val === 'move' || this.cur().val === 'rotate')) {
      transforms.push(this.parseTransform());
    }
    if (this.cur().kind === 'OP' && this.cur().val === '{') {
      this.expect('OP', '{');
      const statements: AstNode[] = [];
      while (this.cur().val !== '}' && this.i < this.toks.length) statements.push(this.stmt());
      this.expect('OP', '}');
      return { kind: 'BlockStmt', transforms, statements };
    }
    if (this.cur().kind === 'ID') {
      const name = String(this.cur().val) as ComponentName;
      this.i++;
      this.expect('OP', '(');
      const p = this.cur().val !== ')' ? this.namedParams() : {};
      this.expect('OP', ')');
      return { kind: 'ComponentStmt', transforms, name, count: paramOptI(p, 'n', 1), spacing: paramOptN(p, 's', 50) };
    }
    throw new Error("После transform ожидается компонент или '{'");
  }

  parseTransform(): TransformOp {
    const kw = String(this.cur().val);
    this.i++;
    this.expect('OP', '(');
    const v = this.parseVec3();
    this.expect('OP', ')');
    return kw === 'move' ? { kind: 'move', ...v } : { kind: 'rotate', ...v };
  }

  parseVec3(): Vec3 {
    if (this.cur().kind === 'ID' && this.peek().kind === 'OP' && this.peek().val === '=') {
      const p = this.namedParams();
      return { x: paramOptN(p, 'x', 0), y: paramOptN(p, 'y', 0), z: paramOptN(p, 'z', 0) };
    }
    const vals: number[] = [];
    while (this.cur().kind === 'NUM') { vals.push(Number(this.cur().val)); this.i++; }
    while (vals.length < 3) vals.push(0);
    return { x: vals[0], y: vals[1], z: vals[2] };
  }

  namedParams(): Record<string, string> {
    const p: Record<string, string> = {};
    while (this.cur().kind === 'ID' && this.peek().kind === 'OP' && this.peek().val === '=') {
      const k = String(this.cur().val).toLowerCase();
      this.i++;
      this.expect('OP', '=');
      const t = this.cur();
      if (t.kind !== 'NUM' && t.kind !== 'ID') throw new Error("Ожидалось значение после '='");
      p[k] = String(t.val);
      this.i++;
    }
    return p;
  }
}

// ---- Param helpers ----
function paramReq(p: Record<string, string>, k: string) { const v = p[k]; if (v == null) throw new Error(`Отсутствует параметр '${k}'`); return parseFloat(v); }
function paramOptN(p: Record<string, string>, k: string, d: number) { const v = p[k]; return v != null ? parseFloat(v) : d; }
function paramOptI(p: Record<string, string>, k: string, d: number) { const v = p[k]; return v != null ? parseInt(v) : d; }
function paramList(p: Record<string, string>, k: string): number[] { const v = p[k]; return v ? v.split(/[\s,]+/).map(Number) : []; }

// ---- Interpret AST → SceneConfig ----
export function parseScript(text: string): SceneConfig {
  const stmts = new Parser(tokenize(text)).parse();
  let frame: FrameConfig | null = null;
  const components: ComponentPlacement[] = [];
  const externalBottomEdges: number[] = [];

  for (const s of stmts) {
    if (s.kind === 'FrameDecl') {
      if (frame) throw new Error('Дублирующее объявление frame');
      frame = { w: s.w, d: s.d, h: s.h, levels: [...s.levels], bottomBeams: [...s.bottomBeams] };
    } else if (s.kind === 'BottomEdge') {
      externalBottomEdges.push(s.x);
    } else if (s.kind === 'ComponentStmt') {
      components.push({ type: s.name, count: s.count, spacing: s.spacing, transforms: s.transforms });
    } else if (s.kind === 'BlockStmt') {
      flattenBlock(s, [], components, externalBottomEdges);
    }
  }

  if (!frame) throw new Error('Не найдено объявление frame');
  const bottomBeams = [...frame.bottomBeams, ...externalBottomEdges];
  return { frame: { ...frame, bottomBeams }, components };
}

function flattenBlock(b: BlockStmt, outer: TransformOp[], result: ComponentPlacement[], edges: number[]) {
  const combined = [...outer, ...b.transforms];
  for (const s of b.statements) {
    if (s.kind === 'FrameDecl') throw new Error('frame нельзя объявлять внутри блока');
    if (s.kind === 'BottomEdge') edges.push(s.x);
    else if (s.kind === 'ComponentStmt') {
      result.push({ type: s.name, count: s.count, spacing: s.spacing, transforms: [...combined, ...s.transforms] });
    } else if (s.kind === 'BlockStmt') {
      flattenBlock(s, combined, result, edges);
    }
  }
}

// ---- Format back ----
export function formatScene(cfg: SceneConfig): string {
  const lines: string[] = [];
  const f = cfg.frame;
  const parts = [`w=${f.w}`, `d=${f.d}`, `h=${f.h}`];
  if (f.levels.length) parts.push(`l=${f.levels.join(' ')}`);
  if (f.bottomBeams.length) parts.push(`b=${f.bottomBeams.join(' ')}`);
  lines.push(`frame(${parts.join(' ')})`);

  for (const c of cfg.components) {
    let line = '';
    for (const t of c.transforms) {
      if (t.kind === 'move') line += `move(${t.x} ${t.y} ${t.z}) `;
      else line += `rotate(${t.x} ${t.y} ${t.z}) `;
    }
    line += `${c.type}(`;
    const cp: string[] = [];
    if (c.count > 1) cp.push(`n=${c.count}`);
    if (c.spacing !== 50) cp.push(`s=${c.spacing}`);
    line += cp.join(' ') + ')';
    lines.push(line);
  }

  return lines.join('\n');
}

export const DEFAULT_FRAME = { w: 530, d: 330, h: 350, levels: [140] as number[] };

export const DEFAULT_SCRIPT = `# Конфигурация корпуса ПК
frame(w=530 d=330 h=350 l=140)
move(90 0 20.8) motherboard()
move(0 0 100) gpu(n=5 s=55)
move(-240 95 0) rotate(90 0 0) psu()
move(-240 -95 0) rotate(90 0 0) psu()
move(150 35 105) cooler()
move(0 0 363.5) rotate(0 0 90) radiator()`;
