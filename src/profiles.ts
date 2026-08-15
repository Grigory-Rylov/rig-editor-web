import { FrameConfig } from './dsl';

export const PROFILE_SIZE = 20;

export type ProfileAxis = 'X' | 'Y' | 'Z';

export interface ProfileCut {
  length: number;
  axis: ProfileAxis;
}

// Тот же набор балок, что и в PcFrame.kt (csg_pc_editor):
// 4 стойки по Z + слои (низ, верх, уровни) 2xX + 2xY + нижние балки bottomBeams по Y
export function computeProfileCuts(frame: FrameConfig): ProfileCut[] {
  const p = PROFILE_SIZE;
  const bw = frame.w - 2 * p;
  const bd = frame.d - 2 * p;
  const cuts: ProfileCut[] = [];

  for (let i = 0; i < 4; i++) cuts.push({ length: frame.h, axis: 'Z' });

  const layer = () => {
    cuts.push({ length: bw, axis: 'X' }, { length: bw, axis: 'X' });
    cuts.push({ length: bd, axis: 'Y' }, { length: bd, axis: 'Y' });
  };
  layer(); // низ (z = p/2)
  layer(); // верх (z = h - p/2)
  for (const _level of frame.levels) layer();
  for (const _bx of frame.bottomBeams) cuts.push({ length: bd, axis: 'Y' });

  return cuts;
}

function fmt(n: number): string {
  const r = Math.round(n * 1000) / 1000;
  return String(r);
}

export function generateReport(frame: FrameConfig): string {
  const grouped = new Map<string, { length: number; axis: ProfileAxis; count: number }>();
  for (const c of computeProfileCuts(frame)) {
    const key = `${c.length}|${c.axis}`;
    const g = grouped.get(key);
    if (g) g.count++;
    else grouped.set(key, { length: c.length, axis: c.axis, count: 1 });
  }

  const rows = [...grouped.values()].sort((a, b) => a.length - b.length || a.axis.localeCompare(b.axis));

  let totalLength = 0;
  let totalPieces = 0;
  const lines: string[] = [];
  lines.push('=== Спецификация профиля ===');
  lines.push('');

  for (const r of rows) {
    const total = r.length * r.count;
    totalLength += total;
    totalPieces += r.count;
    lines.push(`  По оси ${r.axis}: ${fmt(r.length)}мм x ${r.count}шт = ${fmt(total)}мм`);
  }

  lines.push('');
  lines.push(`  Всего кусков: ${totalPieces}`);
  lines.push(`  Всего резов: ${totalPieces}`);
  lines.push(`  Общая длина: ${fmt(totalLength)}мм (${(totalLength / 1000).toFixed(1)}м)`);
  lines.push('  Профиль: 20x20мм');
  lines.push('=========================================');
  return lines.join('\n');
}
