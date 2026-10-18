import type { Dataset } from '../model/types.ts';
import type { Theme } from '../themes/types.ts';

export function formatValue(value: number, dimension: Dataset['dimensions'][number]): string {
  return `${(dimension.format === 'percent' ? value * 100 : value).toFixed(dimension.decimals ?? (dimension.format === 'percent' ? 0 : 1))}${dimension.format === 'percent' ? '%' : ''}`;
}
export function drawRadar(
  canvas: HTMLCanvasElement,
  scores: number[],
  data: Dataset,
  theme: Theme,
  hideAverage: boolean,
  width: number,
  height: number,
  scale: number,
  pixelScale: number,
): void {
  const bw = Math.max(1, Math.round(width * pixelScale));
  const bh = Math.max(1, Math.round(height * pixelScale));
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw;
    canvas.height = bh;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('浏览器不支持 Canvas 2D');
  ctx.setTransform(bw / width, 0, 0, bh / height, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const cx = width / 2,
    cy = height / 2;
  let radius = Math.min(width, height) * 0.33;
  const n = data.dimensions.length;
  const point = (i: number, r: number) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, cos: Math.cos(a), sin: Math.sin(a) };
  };
  const normalized = (value: number, i: number) =>
    (value - data.dimensions[i].min) / (data.dimensions[i].max - data.dimensions[i].min);
  // Reserve measured label space, including scores beyond the configured maximum.
  // Changing aspect ratio must not crop the labels at the edge of the component.
  data.dimensions.forEach((dimension, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const cos = Math.abs(Math.cos(a)),
      sin = Math.abs(Math.sin(a));
    ctx.font = `600 ${theme.radar.labelSize * scale}px ${theme.radar.font}`;
    const labelWidth = ctx.measureText(dimension.label).width;
    ctx.font = `500 ${theme.radar.valueSize * scale}px ${theme.radar.mono}`;
    const textWidth = Math.max(
      labelWidth,
      ctx.measureText(formatValue(scores[i], dimension)).width,
    );
    const norm = Math.max(
      1,
      normalized(scores[i], i),
      hideAverage ? 1 : normalized(dimension.average, i),
    );
    if (cos > 0.001)
      radius = Math.min(
        radius,
        ((width / 2 - textWidth * (cos < 0.2 ? 0.5 : 1) - 10 * scale) / cos - 30 * scale) / norm,
      );
    if (sin > 0.001)
      radius = Math.min(
        radius,
        ((height / 2 - (14 + theme.radar.labelSize / 2 + 10) * scale) / sin - 30 * scale) / norm,
      );
  });
  radius = Math.max(scale, radius);
  function polygon(values: number[], stroke: string, line: number, fill?: string): void {
    ctx!.beginPath();
    values.forEach((v, i) => {
      const p = point(i, radius * v);
      if (i) ctx!.lineTo(p.x, p.y);
      else ctx!.moveTo(p.x, p.y);
    });
    ctx!.closePath();
    ctx!.strokeStyle = stroke;
    ctx!.lineWidth = line * scale;
    if (fill) {
      ctx!.fillStyle = fill;
      ctx!.fill();
    }
    ctx!.stroke();
  }
  for (let level = 1; level <= 5; level++) polygon(Array(n).fill(level / 5), theme.radar.grid, 1.3);
  ctx.strokeStyle = theme.radar.grid;
  ctx.lineWidth = 1.3 * scale;
  for (let i = 0; i < n; i++) {
    const p = point(i, radius);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }
  if (!hideAverage)
    polygon(
      data.dimensions.map((d, i) => normalized(d.average, i)),
      theme.radar.average,
      2.6,
    );
  polygon(scores.map(normalized), theme.radar.stroke, 2, theme.radar.fill);
  scores.forEach((value, i) => {
    const norm = normalized(value, i);
    const p = point(i, Math.max(radius, radius * norm) + 30 * scale);
    ctx.textAlign = Math.abs(p.cos) < 0.2 ? 'center' : p.cos > 0 ? 'left' : 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = norm >= 1.1999 ? theme.radar.highlight : theme.radar.text;
    ctx.font = `600 ${theme.radar.labelSize * scale}px ${theme.radar.font}`;
    ctx.fillText(data.dimensions[i].label, p.x, p.y + 14 * scale);
    ctx.font = `500 ${theme.radar.valueSize * scale}px ${theme.radar.mono}`;
    ctx.fillText(formatValue(value, data.dimensions[i]), p.x, p.y - 14 * scale);
  });
}
