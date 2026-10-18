import type { Dataset, TimelineState } from './types.ts';

export function durationOf(data: Dataset): number {
  return data.records.reduce((sum, r) => sum + (r.duration ?? data.defaultDuration), 0);
}
export function recordStart(data: Dataset, index: number): number {
  return data.records
    .slice(0, index)
    .reduce((sum, r) => sum + (r.duration ?? data.defaultDuration), 0);
}
export function atTime(data: Dataset, timeMs: number): TimelineState {
  const durationMs = durationOf(data);
  const t = Math.min(durationMs, Math.max(0, timeMs));
  let start = 0;
  let index = 0;
  while (
    index < data.records.length - 1 &&
    t >= start + (data.records[index].duration ?? data.defaultDuration)
  ) {
    start += data.records[index].duration ?? data.defaultDuration;
    index++;
  }
  const record = data.records[index];
  const localMs = t - start;
  return {
    index,
    record,
    previous: data.records[Math.max(0, index - 1)],
    localMs,
    timeMs: t,
    durationMs,
    itemProgress: Math.min(1, localMs / (record.duration ?? data.defaultDuration)),
    globalProgress: t / durationMs,
  };
}
export function smooth(t: number): number {
  const p = Math.max(0, Math.min(1, t));
  return p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2;
}
export function scoresAt(
  state: TimelineState,
  data: Dataset,
  field: string,
  transitionMs: number,
): number[] {
  const target = state.record[field] as number[];
  const from = state.record.playEntranceAnimation
    ? data.dimensions.map((d) => d.min)
    : (state.previous[field] as number[]);
  const p = smooth(state.localMs / transitionMs);
  if (p === 1) return [...target];
  return target.map((v, i) => from[i] + (v - from[i]) * p);
}
