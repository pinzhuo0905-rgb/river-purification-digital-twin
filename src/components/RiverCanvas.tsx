import { useEffect, useRef, useState } from 'react';
import { getSegmentAngle, type SimulationResultV3, type CatalystPlacement, type RiverSegmentV3 } from '../engine/simulation';

interface RiverCanvasProps {
  result: SimulationResultV3 | null;
  gridWidth: number;
  gridHeight: number;
  animProgress: number;
  catalystPlacements: CatalystPlacement[];
  segments: RiverSegmentV3[];
  showDrifter: boolean;
  drifterInteractive: boolean;
}

// ═══════════════════════════════════════════════════════════════════
//  噪声 / 颜色工具
// ═══════════════════════════════════════════════════════════════════

function hash(x: number, y: number): number {
  let h = x * 374761393 + y * 668265263 + 1274126177;
  h = (h ^ (h >> 13)) * 1274126177;
  return (h ^ (h >> 16)) / 2147483648;
}

function smoothNoise(x: number, y: number, scale: number): number {
  const sx = x / scale;
  const sy = y / scale;
  const ix = Math.floor(sx);
  const iy = Math.floor(sy);
  const fx = sx - ix;
  const fy = sy - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  return (
    hash(ix, iy) * (1 - ux) * (1 - uy) +
    hash(ix + 1, iy) * ux * (1 - uy) +
    hash(ix, iy + 1) * (1 - ux) * uy +
    hash(ix + 1, iy + 1) * ux * uy
  );
}

function riverColor(conc: number): [number, number, number] {
  const c = Math.min(1, Math.max(0, conc));
  return [
    Math.round(18 + c * 88),
    Math.round(142 - c * 18),
    Math.round(188 - c * 86),
  ];
}

/** 催化剂投放点专用色（按索引循环） */
const MARKER_COLORS = [
  '#ff4444', '#ff8800', '#ffdd00', '#44ff44',
  '#44ddff', '#8844ff', '#ff44aa', '#00cc88',
];

// ═══════════════════════════════════════════════════════════════════
//  几何工具
// ═══════════════════════════════════════════════════════════════════

interface Point2D {
  x: number;
  y: number;
}

interface RenderGeometry {
  centerPts: Point2D[];
  widths: number[];
  segRatios: number[];
}

interface DrifterMood {
  label: string;
  level: 'clean' | 'mild' | 'medium' | 'heavy';
  face: string;
  accent: string;
  cheek: string;
}

function perpNorm(p0: Point2D, p1: Point2D): { nx: number; ny: number } {
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  return { nx: -dy / len, ny: dx / len };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getPollutionMood(conc: number): DrifterMood {
  if (conc < 0.22) {
    return {
      label: '清爽',
      level: 'clean',
      face: '#fde7c8',
      accent: '#34c759',
      cheek: 'rgba(244, 114, 182, 0.34)',
    };
  }
  if (conc < 0.48) {
    return {
      label: '略浑',
      level: 'mild',
      face: '#f8dcae',
      accent: '#ffcc00',
      cheek: 'rgba(251, 146, 60, 0.3)',
    };
  }
  if (conc < 0.72) {
    return {
      label: '难受',
      level: 'medium',
      face: '#f5c38e',
      accent: '#ff9500',
      cheek: 'rgba(248, 113, 113, 0.34)',
    };
  }
  return {
    label: '高污染',
    level: 'heavy',
    face: '#efb2a3',
    accent: '#ff3b30',
    cheek: 'rgba(220, 38, 38, 0.4)',
  };
}

function lerpPoint(a: Point2D, b: Point2D, t: number): Point2D {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
  };
}

function offsetPoint(p0: Point2D, p1: Point2D, p: Point2D, halfWidth: number, side: 1 | -1): Point2D {
  const { nx, ny } = perpNorm(p0, p1);
  return { x: p.x + nx * halfWidth * side, y: p.y + ny * halfWidth * side };
}

function catmullRom(p0: Point2D, p1: Point2D, p2: Point2D, p3: Point2D, t: number): Point2D {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x: 0.5 * (
      2 * p1.x +
      (-p0.x + p2.x) * t +
      (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
      (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3
    ),
    y: 0.5 * (
      2 * p1.y +
      (-p0.y + p2.y) * t +
      (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
      (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3
    ),
  };
}

function buildBoundary(pts: Point2D[], widths: number[], side: 1 | -1): Point2D[] {
  if (pts.length < 2) return pts;

  const boundary: Point2D[] = [];
  for (let i = 0; i < pts.length; i++) {
    const hw = widths[i] / 2;
    if (i === 0) {
      boundary.push(offsetPoint(pts[0], pts[1], pts[0], hw, side));
      continue;
    }
    if (i === pts.length - 1) {
      boundary.push(offsetPoint(pts[i - 1], pts[i], pts[i], hw, side));
      continue;
    }

    boundary.push(offsetPoint(pts[i - 1], pts[i + 1], pts[i], hw, side));
  }
  return boundary;
}

function buildFluidBoundary(
  pts: Point2D[],
  widths: number[],
  side: 1 | -1,
  seconds: number,
  waveScale: number,
): Point2D[] {
  if (pts.length < 2) return pts;

  const boundary: Point2D[] = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    const { nx, ny } = perpNorm(prev, next);
    const halfWidth = widths[i] / 2;
    const primary = Math.sin(i * 0.45 - seconds * 2.4 + side * 0.9);
    const secondary = Math.sin(i * 0.17 + seconds * 1.35 + side * 2.1);
    const micro = (smoothNoise(i * 21 + seconds * 48, side * 37, 66) - 0.5) * 2;
    const ripple = (primary * 0.55 + secondary * 0.28 + micro * 0.17) * halfWidth * waveScale;
    const edgeWidth = halfWidth + ripple;
    boundary.push({ x: p.x + nx * edgeWidth * side, y: p.y + ny * edgeWidth * side });
  }
  return boundary;
}

function traceSmoothPath(ctx: CanvasRenderingContext2D, pts: Point2D[], options?: { move?: boolean; closed?: boolean }) {
  if (pts.length === 0) return;
  const shouldMove = options?.move ?? true;
  if (pts.length === 1) {
    if (shouldMove) ctx.moveTo(pts[0].x, pts[0].y);
    else ctx.lineTo(pts[0].x, pts[0].y);
    return;
  }

  if (shouldMove) ctx.moveTo(pts[0].x, pts[0].y);
  else ctx.lineTo(pts[0].x, pts[0].y);
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const tension = 0.5;
    const cp1 = {
      x: p1.x + (p2.x - p0.x) * tension / 6,
      y: p1.y + (p2.y - p0.y) * tension / 6,
    };
    const cp2 = {
      x: p2.x - (p3.x - p1.x) * tension / 6,
      y: p2.y - (p3.y - p1.y) * tension / 6,
    };
    ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, p2.x, p2.y);
  }
  if (options?.closed) ctx.closePath();
}

function fillOutline(
  ctx: CanvasRenderingContext2D,
  pts: Point2D[],
  widths: number[],
  layerScale: number,
  style: string | CanvasGradient,
  seconds = 0,
  waveScale = 0,
) {
  if (pts.length < 2) return;
  const scaledWidths = widths.map(w => w * layerScale);
  const left = waveScale > 0
    ? buildFluidBoundary(pts, scaledWidths, 1, seconds, waveScale)
    : buildBoundary(pts, scaledWidths, 1);
  const right = waveScale > 0
    ? buildFluidBoundary(pts, scaledWidths, -1, seconds, waveScale)
    : buildBoundary(pts, scaledWidths, -1);

  ctx.beginPath();
  traceSmoothPath(ctx, left);
  traceSmoothPath(ctx, right.slice().reverse(), { move: false });
  ctx.closePath();
  ctx.fillStyle = style;
  ctx.fill();
}

function strokeSmoothPath(
  ctx: CanvasRenderingContext2D,
  pts: Point2D[],
  offsetFn?: (p: Point2D, i: number) => Point2D,
) {
  if (pts.length < 2) return;
  ctx.beginPath();
  traceSmoothPath(ctx, offsetFn ? pts.map(offsetFn) : pts);
  ctx.stroke();
}

function createTerrainLayer(width: number, height: number): HTMLCanvasElement {
  const layer = document.createElement('canvas');
  layer.width = width;
  layer.height = height;
  const ctx = layer.getContext('2d');
  if (!ctx) return layer;

  const base = ctx.createLinearGradient(0, 0, width, height);
  base.addColorStop(0, '#061523');
  base.addColorStop(0.42, '#0f2a36');
  base.addColorStop(1, '#142616');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, width, height);

  const imageData = ctx.createImageData(width, height);
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const idx = (py * width + px) * 4;
      const n = smoothNoise(px, py, 24) * 0.16;
      const n2 = smoothNoise(px + 500, py, 70) * 0.08;
      imageData.data[idx] = 26 + n * 55 + n2 * 36;
      imageData.data[idx + 1] = 48 + n * 58 + n2 * 24 - (py / height) * 10;
      imageData.data[idx + 2] = 44 + n * 36 + n2 * 20;
      imageData.data[idx + 3] = 105;
    }
  }
  ctx.putImageData(imageData, 0, 0);

  const scan = ctx.createLinearGradient(0, 0, 0, height);
  scan.addColorStop(0, 'rgba(34, 211, 238, 0.16)');
  scan.addColorStop(0.32, 'rgba(14, 116, 144, 0)');
  scan.addColorStop(1, 'rgba(16, 185, 129, 0.08)');
  ctx.fillStyle = scan;
  ctx.fillRect(0, 0, width, height);
  return layer;
}

function buildRenderGeometry(
  result: SimulationResultV3,
  segments: RiverSegmentV3[],
  canvasW: number,
  canvasH: number,
  gridHeight: number,
): RenderGeometry {
  const totalLength = Math.max(0.0001, segments.reduce((acc, seg) => acc + Math.max(seg.length, 0), 0));
  const vertices: Point2D[] = [{ x: 0, y: 0 }];
  const segmentLengths: number[] = [];
  const cumulativeLengths: number[] = [0];
  let cursor: Point2D = { x: 0, y: 0 };
  let absoluteAngle = 0;

  for (const seg of segments) {
    absoluteAngle += getSegmentAngle(seg);
    const rad = (absoluteAngle * Math.PI) / 180;
    const len = Math.max(seg.length, 0.0001) / totalLength;
    segmentLengths.push(len);
    const end = {
      x: cursor.x + Math.cos(rad) * len,
      y: cursor.y + Math.sin(rad) * len,
    };
    vertices.push(end);
    cumulativeLengths.push(cumulativeLengths[cumulativeLengths.length - 1] + len);
    cursor = end;
  }

  const ranges = new Map<number, { first: number; last: number }>();
  result.riverPath.forEach((p, i) => {
    const range = ranges.get(p.segIndex);
    if (range) range.last = i;
    else ranges.set(p.segIndex, { first: i, last: i });
  });

  const rawPts = result.riverPath.map((p, i) => {
    const range = ranges.get(p.segIndex);
    const ratio = range && range.last > range.first
      ? (i - range.first) / (range.last - range.first)
      : 0;
    const segIndex = Math.min(Math.max(p.segIndex, 0), Math.max(0, segments.length - 1));
    const smoothRatio = smoothstep(ratio);
    const p0 = vertices[Math.max(0, segIndex - 1)] ?? vertices[0];
    const p1 = vertices[segIndex] ?? vertices[0];
    const p2 = vertices[segIndex + 1] ?? p1;
    const p3 = vertices[Math.min(vertices.length - 1, segIndex + 2)] ?? p2;
    const curved = catmullRom(p0, p1, p2, p3, smoothRatio);
    const linear = {
      x: lerp(p1.x, p2.x, ratio),
      y: lerp(p1.y, p2.y, ratio),
    };
    const segLen = segmentLengths[segIndex] ?? 0;
    const localBlend = Math.sin(Math.PI * ratio);
    const curveWeight = Math.min(0.72, localBlend * Math.min(1, segLen * 8));
    return {
      ratio,
      distance: (cumulativeLengths[segIndex] ?? 0) + ratio * segLen,
      point: {
        x: lerp(linear.x, curved.x, curveWeight),
        y: lerp(linear.y, curved.y, curveWeight),
      },
    };
  });

  const xs = rawPts.map(p => p.point.x);
  const ys = rawPts.map(p => p.point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const padX = canvasW * 0.06;
  const padY = canvasH * 0.16;
  const sx = (canvasW - padX * 2) / Math.max(0.001, maxX - minX);
  const sy = (canvasH - padY * 2) / Math.max(0.001, maxY - minY);
  const fitScale = Math.min(sx, sy);
  const offsetX = (canvasW - (maxX - minX) * fitScale) / 2 - minX * fitScale;
  const offsetY = (canvasH - (maxY - minY) * fitScale) / 2 - minY * fitScale;

  const segmentWidths = segments.map(seg => (seg.width ?? 1) * (canvasH / gridHeight) * gridHeight * 0.12);
  const widths = result.riverPath.map((p, i) => {
    const base = p.widthPx * (canvasH / gridHeight);
    const segWidth = segmentWidths[p.segIndex] ?? base;
    const prevWidth = segmentWidths[p.segIndex - 1] ?? segWidth;
    const nextWidth = segmentWidths[p.segIndex + 1] ?? segWidth;
    const ratio = rawPts[i].ratio;
    const transition = 0.22;
    if (ratio < transition && p.segIndex > 0) {
      return lerp((prevWidth + segWidth) / 2, segWidth, smoothstep(ratio / transition));
    }
    if (ratio > 1 - transition && p.segIndex < segments.length - 1) {
      return lerp(segWidth, (segWidth + nextWidth) / 2, smoothstep((ratio - (1 - transition)) / transition));
    }
    return base;
  });

  return {
    centerPts: rawPts.map(({ point }) => ({
      x: point.x * fitScale + offsetX,
      y: point.y * fitScale + offsetY,
    })),
    widths,
    segRatios: rawPts.map(p => p.ratio),
  };
}

// ═══════════════════════════════════════════════════════════════════
//  绘制工具
// ═══════════════════════════════════════════════════════════════════

function drawRiverLayer(
  ctx: CanvasRenderingContext2D,
  pts: Point2D[],
  widths: number[],
  layerScale: number,
  colorFn: (i: number) => string,
  seconds = 0,
  waveScale = 0,
) {
  fillOutline(ctx, pts, widths, layerScale, colorFn(0), seconds, waveScale);
}

function drawFlowArrow(ctx: CanvasRenderingContext2D, from: Point2D, to: Point2D, size: number, alpha: number) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  ctx.save();
  ctx.translate(from.x, from.y);
  ctx.rotate(angle);
  ctx.strokeStyle = `rgba(219, 249, 255, ${alpha})`;
  ctx.fillStyle = `rgba(219, 249, 255, ${alpha})`;
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-size * 0.65, 0);
  ctx.lineTo(size * 0.45, 0);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(size * 0.45, 0);
  ctx.lineTo(size * 0.08, -size * 0.26);
  ctx.lineTo(size * 0.08, size * 0.26);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawObservationSign(
  ctx: CanvasRenderingContext2D,
  pts: Point2D[],
  widths: number[],
  ratio: number,
  title: string,
  side: 1 | -1,
) {
  if (pts.length < 2) return;
  const idx = clamp(Math.floor((pts.length - 1) * ratio), 1, pts.length - 2);
  const p = pts[idx];
  const prev = pts[idx - 1];
  const next = pts[idx + 1];
  const { nx, ny } = perpNorm(prev, next);
  const bankX = p.x + nx * side * widths[idx] * 0.74;
  const bankY = p.y + ny * side * widths[idx] * 0.74;
  const labelX = bankX + nx * side * 18;
  const labelY = bankY + ny * side * 18;

  ctx.save();
  ctx.strokeStyle = 'rgba(203, 213, 225, 0.64)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(bankX, bankY);
  ctx.lineTo(labelX, labelY);
  ctx.stroke();

  ctx.fillStyle = 'rgba(241, 245, 249, 0.9)';
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.38)';
  ctx.beginPath();
  ctx.roundRect(labelX - 38, labelY - 11, 76, 20, 5);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 9px "Noto Sans SC", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, labelX, labelY);

  ctx.fillStyle = 'rgba(14, 116, 144, 0.8)';
  ctx.fillRect(bankX - 1.5, bankY - 14, 3, 18);
  for (let k = 0; k < 4; k++) {
    ctx.fillStyle = k % 2 === 0 ? 'rgba(241, 245, 249, 0.95)' : 'rgba(14, 116, 144, 0.86)';
    ctx.fillRect(bankX - 6, bankY - 13 + k * 4, 12, 3);
  }
  ctx.restore();
}

function drawOutfallGate(ctx: CanvasRenderingContext2D, pts: Point2D[], widths: number[]) {
  if (pts.length < 2) return;
  const idx = pts.length - 1;
  const p = pts[idx];
  const prev = pts[Math.max(0, idx - 1)];
  const { nx, ny } = perpNorm(prev, p);
  const x = p.x + nx * widths[idx] * 0.74;
  const y = p.y + ny * widths[idx] * 0.74;

  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(51, 65, 85, 0.9)';
  ctx.strokeStyle = 'rgba(186, 230, 253, 0.42)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.roundRect(-18, -10, 36, 20, 4);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(125, 211, 252, 0.55)';
  for (let k = -10; k <= 10; k += 10) {
    ctx.beginPath();
    ctx.moveTo(k, -8);
    ctx.lineTo(k, 8);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(240, 249, 255, 0.92)';
  ctx.font = 'bold 9px "Noto Sans SC", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('出水口', 0, -16);
  ctx.restore();
}

function drawHydroContext(ctx: CanvasRenderingContext2D, pts: Point2D[], widths: number[], seconds: number) {
  if (pts.length < 8) return;

  for (let r = 0.12; r < 0.9; r += 0.18) {
    const idx = Math.min(pts.length - 2, Math.max(1, Math.floor((pts.length - 1) * r)));
    drawFlowArrow(ctx, pts[idx], pts[idx + 1], 17, 0.26 + Math.sin(seconds * 1.2 + r * 8) * 0.08);
  }

  drawObservationSign(ctx, pts, widths, 0.04, '上游来水', -1);
  drawObservationSign(ctx, pts, widths, 0.52, '桥下观察', 1);
  drawObservationSign(ctx, pts, widths, 0.86, '下游水色', -1);
  drawOutfallGate(ctx, pts, widths);
}

function findNearestPointIndex(pts: Point2D[], point: Point2D): number {
  let bestIdx = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < pts.length; i++) {
    const dx = pts[i].x - point.x;
    const dy = pts[i].y - point.y;
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function drawDrifter(
  ctx: CanvasRenderingContext2D,
  point: Point2D,
  width: number,
  conc: number,
  seconds: number,
  options: { pinned: boolean; interactive: boolean },
) {
  const mood = getPollutionMood(conc);
  const bob = Math.sin(seconds * 3.1) * 2.2;
  const scale = clamp(width / 54, 0.74, 1.12);
  const raftW = 42 * scale;
  const raftH = 18 * scale;
  const headR = 12 * scale;
  const x = point.x;
  const y = point.y - width * 0.16 + bob;

  ctx.save();
  ctx.translate(x, y);

  const glow = ctx.createRadialGradient(0, 4 * scale, 0, 0, 4 * scale, 46 * scale);
  glow.addColorStop(0, `${mood.accent}44`);
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 4 * scale, 46 * scale, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(15, 23, 42, 0.34)';
  ctx.beginPath();
  ctx.ellipse(0, 16 * scale, raftW * 0.6, raftH * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(226, 232, 240, 0.9)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.lineWidth = 1.2 * scale;
  ctx.beginPath();
  ctx.roundRect(-raftW / 2, 7 * scale, raftW, raftH, 8 * scale);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = 'rgba(48, 213, 200, 0.42)';
  ctx.beginPath();
  ctx.roundRect(-raftW * 0.36, 10 * scale, raftW * 0.72, 5 * scale, 3 * scale);
  ctx.fill();

  ctx.strokeStyle = '#2f4658';
  ctx.lineWidth = 2.2 * scale;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-9 * scale, 8 * scale);
  ctx.lineTo(-13 * scale, 17 * scale);
  ctx.moveTo(9 * scale, 8 * scale);
  ctx.lineTo(13 * scale, 17 * scale);
  ctx.stroke();

  ctx.fillStyle = '#3b82f6';
  ctx.beginPath();
  ctx.roundRect(-10 * scale, -1 * scale, 20 * scale, 17 * scale, 8 * scale);
  ctx.fill();

  ctx.fillStyle = mood.face;
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.24)';
  ctx.lineWidth = 1 * scale;
  ctx.beginPath();
  ctx.arc(0, -13 * scale, headR, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#21445d';
  ctx.beginPath();
  ctx.arc(-4.4 * scale, -15 * scale, 1.35 * scale, 0, Math.PI * 2);
  ctx.arc(4.4 * scale, -15 * scale, mood.level === 'heavy' ? 0.65 * scale : 1.35 * scale, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#21445d';
  ctx.lineWidth = 1.3 * scale;
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (mood.level === 'clean') {
    ctx.moveTo(-7 * scale, -19 * scale);
    ctx.lineTo(-3 * scale, -20 * scale);
    ctx.moveTo(3 * scale, -20 * scale);
    ctx.lineTo(7 * scale, -19 * scale);
    ctx.moveTo(-5 * scale, -10 * scale);
    ctx.quadraticCurveTo(0, -6.2 * scale, 5 * scale, -10 * scale);
  } else if (mood.level === 'mild') {
    ctx.moveTo(-7 * scale, -19.5 * scale);
    ctx.lineTo(-3 * scale, -18.2 * scale);
    ctx.moveTo(3 * scale, -18.2 * scale);
    ctx.lineTo(7 * scale, -19.5 * scale);
    ctx.moveTo(-4.5 * scale, -8.8 * scale);
    ctx.quadraticCurveTo(0, -10.6 * scale, 4.5 * scale, -8.8 * scale);
  } else if (mood.level === 'medium') {
    ctx.moveTo(-7.2 * scale, -18 * scale);
    ctx.lineTo(-2.4 * scale, -20.2 * scale);
    ctx.moveTo(2.4 * scale, -20.2 * scale);
    ctx.lineTo(7.2 * scale, -18 * scale);
    ctx.moveTo(-4.8 * scale, -8.2 * scale);
    ctx.quadraticCurveTo(0, -11.8 * scale, 4.8 * scale, -8.2 * scale);
  } else {
    ctx.moveTo(-7.2 * scale, -18 * scale);
    ctx.lineTo(-2.2 * scale, -20.6 * scale);
    ctx.moveTo(2.2 * scale, -20.6 * scale);
    ctx.lineTo(7.2 * scale, -18 * scale);
    ctx.moveTo(-5.4 * scale, -8.2 * scale);
    ctx.bezierCurveTo(-2.8 * scale, -11.8 * scale, 2.8 * scale, -5.8 * scale, 5.4 * scale, -9.5 * scale);
  }
  ctx.stroke();

  ctx.fillStyle = mood.cheek;
  ctx.beginPath();
  ctx.ellipse(-7 * scale, -11.8 * scale, 2.3 * scale, 1.5 * scale, 0, 0, Math.PI * 2);
  ctx.ellipse(7 * scale, -11.8 * scale, 2.3 * scale, 1.5 * scale, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = mood.accent;
  ctx.strokeStyle = 'rgba(255,255,255,0.72)';
  ctx.lineWidth = 1 * scale;
  ctx.beginPath();
  ctx.roundRect(-25 * scale, -43 * scale, 50 * scale, 16 * scale, 8 * scale);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 ${9 * scale}px "Noto Sans SC", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(mood.label, 0, -35 * scale);

  if (options.interactive) {
    ctx.strokeStyle = options.pinned ? `${mood.accent}dd` : 'rgba(255,255,255,0.68)';
    ctx.setLineDash(options.pinned ? [3 * scale, 3 * scale] : []);
    ctx.lineWidth = 1.3 * scale;
    ctx.beginPath();
    ctx.arc(0, -5 * scale, 31 * scale, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

// ═══════════════════════════════════════════════════════════════════
//  主组件
// ═══════════════════════════════════════════════════════════════════

export function RiverCanvas({
  result,
  gridWidth,
  gridHeight,
  animProgress,
  catalystPlacements,
  segments,
  showDrifter,
  drifterInteractive,
}: RiverCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);
  const progressRef = useRef(animProgress);
  const [pinnedDrifterIndex, setPinnedDrifterIndex] = useState<number | null>(null);
  const [isDraggingDrifter, setIsDraggingDrifter] = useState(false);
  const geometryRef = useRef<RenderGeometry | null>(null);
  const drifterHitRef = useRef<{ point: Point2D; radius: number } | null>(null);
  const pinnedDrifterIndexRef = useRef<number | null>(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    progressRef.current = animProgress;
  }, [animProgress]);

  useEffect(() => {
    pinnedDrifterIndexRef.current = pinnedDrifterIndex;
  }, [pinnedDrifterIndex]);

  useEffect(() => {
    if (!drifterInteractive) {
      draggingRef.current = false;
    }
  }, [drifterInteractive]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !result || result.riverPath.length < 2) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const terrainLayer = createTerrainLayer(W, H);
    const geometry = buildRenderGeometry(result, segments, W, H, gridHeight);
    geometryRef.current = geometry;
    let rafId = 0;
    let lastFrame = performance.now();
    let flowSeconds = frameRef.current / 60;

    const draw = (now = performance.now()) => {
    const delta = clamp((now - lastFrame) / 1000, 0, 1 / 20);
    lastFrame = now;
    flowSeconds += delta;
    frameRef.current += delta * 60;
    const t = flowSeconds;
    void gridWidth;

    // ── 动画：根据 progress 决定可见路径，前缘在采样点间连续插值 ──────────────
    const totalPoints = result.riverPath.length;
    const revealProgress = smoothstep(clamp(progressRef.current, 0.006, 1));
    const exactTip = revealProgress * (totalPoints - 1);
    const baseTip = Math.min(totalPoints - 2, Math.max(0, Math.floor(exactTip)));
    const tipBlend = clamp(exactTip - baseTip, 0, 1);
    const visibleCount = Math.max(2, baseTip + 2);
    const visiblePath = result.riverPath.slice(0, visibleCount);
    const centerPts = geometry.centerPts.slice(0, visibleCount);
    const widthPxs = geometry.widths.slice(0, visibleCount);
    const segRatios = geometry.segRatios.slice(0, visibleCount);

    if (progressRef.current < 1 && centerPts.length >= 2) {
      const lastIdx = centerPts.length - 1;
      const prevPath = result.riverPath[baseTip];
      const nextPath = result.riverPath[baseTip + 1];
      centerPts[lastIdx] = lerpPoint(geometry.centerPts[baseTip], geometry.centerPts[baseTip + 1], tipBlend);
      widthPxs[lastIdx] = lerp(geometry.widths[baseTip], geometry.widths[baseTip + 1], tipBlend);
      segRatios[lastIdx] = lerp(geometry.segRatios[baseTip], geometry.segRatios[baseTip + 1], tipBlend);
      visiblePath[lastIdx] = {
        ...nextPath,
        concentration: lerp(prevPath.concentration, nextPath.concentration, tipBlend),
        widthPx: lerp(prevPath.widthPx, nextPath.widthPx, tipBlend),
        ntu: lerp(prevPath.ntu, nextPath.ntu, tipBlend),
        catalystActive: prevPath.catalystActive || nextPath.catalystActive,
      };
    }

    // ══════════════════════════════════════════════════════════
    //  1. 背景噪声纹理
    // ══════════════════════════════════════════════════════════
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(terrainLayer, 0, 0);

    const skyGrad = ctx.createLinearGradient(0, 0, 0, H * 0.28);
    skyGrad.addColorStop(0, 'rgba(20, 184, 166, 0.18)');
    skyGrad.addColorStop(1, 'rgba(15, 23, 42, 0)');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, H * 0.28);
    ctx.beginPath();
    ctx.moveTo(0, H * 0.22);
    for (let mx = 0; mx <= W; mx += 55) {
      ctx.lineTo(mx + 25, H * (0.15 + smoothNoise(mx + t * 8, 40, 120) * 0.08));
      ctx.lineTo(mx + 55, H * 0.22);
    }
    ctx.lineTo(W, H * 0.32);
    ctx.lineTo(0, H * 0.32);
    ctx.closePath();
    ctx.fillStyle = 'rgba(6, 18, 26, 0.56)';
    ctx.fill();

    // ══════════════════════════════════════════════════════════
    //  2. 河岸底色（最外层）
    // ══════════════════════════════════════════════════════════
    drawRiverLayer(ctx, centerPts, widthPxs, 1.62, () => 'rgba(13, 23, 26, 0.92)', t, 0.01);

    // ══════════════════════════════════════════════════════════
    //  3. 水体底色
    // ══════════════════════════════════════════════════════════
    drawRiverLayer(ctx, centerPts, widthPxs, 1.16, () => 'rgba(7, 148, 188, 0.96)', t, 0.018);

    // ══════════════════════════════════════════════════════════
    //  4. 浓度渐变色（逐段着色）
    // ══════════════════════════════════════════════════════════
    if (centerPts.length >= 2) {
      const start = centerPts[0];
      const end = centerPts[centerPts.length - 1];
      const concentrationGrad = ctx.createLinearGradient(start.x, start.y, end.x, end.y);
      const stopStride = Math.max(1, Math.floor(visiblePath.length / 28));
      for (let i = 0; i < visiblePath.length; i += stopStride) {
        const conc = visiblePath[i].concentration;
        const [r, g, b] = riverColor(conc);
        const ripple = (smoothNoise(i * 16 + t * 1.7, 120, 48) - 0.5) * 10;
        concentrationGrad.addColorStop(
          i / Math.max(1, visiblePath.length - 1),
          `rgb(${Math.max(0, r + ripple)},${Math.max(0, g + ripple)},${Math.max(0, b + ripple)})`,
        );
      }
      const tailConc = visiblePath[visiblePath.length - 1].concentration;
      const [tr, tg, tb] = riverColor(tailConc);
      concentrationGrad.addColorStop(1, `rgb(${tr},${tg},${tb})`);
      fillOutline(ctx, centerPts, widthPxs, 0.95, concentrationGrad, t, 0.026);

      const plumeGrad = ctx.createLinearGradient(start.x, start.y, end.x, end.y);
      for (let i = 0; i < visiblePath.length; i += stopStride) {
        const conc = visiblePath[i].concentration;
        const stop = i / Math.max(1, visiblePath.length - 1);
        const pulse = 0.7 + Math.sin(t * 2.1 - stop * 8) * 0.18;
        plumeGrad.addColorStop(stop, `rgba(248, 81, 73, ${clamp(conc * 0.46 * pulse, 0.02, 0.48)})`);
      }
      plumeGrad.addColorStop(1, `rgba(248, 113, 113, ${clamp(tailConc * 0.42, 0.02, 0.45)})`);
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      fillOutline(ctx, centerPts, widthPxs, 0.52, plumeGrad, t + 1.4, 0.04);
      ctx.restore();

      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (let k = 0; k < 56; k++) {
        const drift = (k / 56 + t * 0.055) % 1;
        const idx = Math.min(centerPts.length - 2, Math.max(1, Math.floor(drift * (centerPts.length - 1))));
        const conc = visiblePath[idx]?.concentration ?? 0;
        if (conc < 0.08) continue;
        const p = centerPts[idx];
        const prev = centerPts[Math.max(0, idx - 1)];
        const next = centerPts[Math.min(centerPts.length - 1, idx + 1)];
        const { nx, ny } = perpNorm(prev, next);
        const lane = Math.sin(k * 12.989 + t * 1.7) * widthPxs[idx] * 0.18;
        const px = p.x + nx * lane;
        const py = p.y + ny * lane;
        const radius = widthPxs[idx] * (0.07 + (k % 5) * 0.012);
        const alpha = clamp(conc * (0.16 + Math.sin(t * 2.8 + k) * 0.05), 0.03, 0.22);
        const particleGrad = ctx.createRadialGradient(px, py, 0, px, py, radius * 3.4);
        particleGrad.addColorStop(0, `rgba(255, 178, 146, ${alpha})`);
        particleGrad.addColorStop(0.45, `rgba(248, 81, 73, ${alpha * 0.55})`);
        particleGrad.addColorStop(1, 'rgba(248, 81, 73, 0)');
        ctx.fillStyle = particleGrad;
        ctx.beginPath();
        ctx.ellipse(px, py, radius * 2.8, radius * 1.05, Math.atan2(next.y - prev.y, next.x - prev.x), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // ══════════════════════════════════════════════════════════
    //  5. 水面高光
    // ══════════════════════════════════════════════════════════
    drawRiverLayer(ctx, centerPts, widthPxs, 0.72, () => 'rgba(103, 232, 249, 0.28)', t, 0.018);

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let stripe = 0; stripe < 3; stripe++) {
      ctx.setLineDash([18 + stripe * 7, 34]);
      ctx.lineDashOffset = -t * (42 + stripe * 13);
      ctx.strokeStyle = `rgba(236, 254, 255, ${0.16 - stripe * 0.03})`;
      ctx.lineWidth = 2 + stripe;
      strokeSmoothPath(ctx, centerPts, (p, i) => {
        const prev = centerPts[Math.max(0, i - 1)];
        const next = centerPts[Math.min(centerPts.length - 1, i + 1)];
        const { nx, ny } = perpNorm(prev, next);
        const wave = Math.sin(i * 0.32 + t * 2.2 + stripe) * widthPxs[i] * 0.09;
        return { x: p.x + nx * wave, y: p.y + ny * wave };
      });
    }
    ctx.restore();

    // ══════════════════════════════════════════════════════════
    //  6. 水面波纹虚线
    // ══════════════════════════════════════════════════════════
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash([6, 10]);
    ctx.lineDashOffset = -t * 34;
    ctx.strokeStyle = 'rgba(240, 255, 255, 0.38)';
    ctx.lineWidth = Math.max(2, widthPxs.reduce((acc, w) => acc + w, 0) / widthPxs.length * 0.07);
    strokeSmoothPath(ctx, centerPts);
    ctx.restore();

    // ══════════════════════════════════════════════════════════
    //  7. 河岸植被短线
    // ══════════════════════════════════════════════════════════
    for (let i = 8; i < centerPts.length - 8; i += 10) {
      const p = centerPts[i];
      const { nx, ny } = perpNorm(
        centerPts[Math.max(0, i - 1)],
        centerPts[Math.min(centerPts.length - 1, i + 1)],
      );
      const halfW = widthPxs[i] * 0.78;
      ctx.lineWidth = 1.2;
      for (const side of [-1, 1] as const) {
        const bx = p.x + nx * side * halfW;
        const by = p.y + ny * side * halfW;
        ctx.strokeStyle = i % 20 === 8 ? 'rgba(61, 116, 45, 0.74)' : 'rgba(35, 88, 58, 0.72)';
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + nx * side * halfW * 0.28, by + ny * side * halfW * 0.28);
        ctx.stroke();
        if (i % 20 === 8) {
          ctx.fillStyle = 'rgba(170, 158, 132, 0.82)';
          ctx.beginPath();
          ctx.arc(bx - ny * side * 5, by + nx * side * 5, 1.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // ══════════════════════════════════════════════════════════
    //  8. 河道生活化标记：流向、观察牌、出水口
    // ══════════════════════════════════════════════════════════
    drawHydroContext(ctx, centerPts, widthPxs, t);

    // ══════════════════════════════════════════════════════════
    //  9. 分段标签
    // ══════════════════════════════════════════════════════════
    let lastSeg = -1;
    for (let i = 0; i < visiblePath.length; i++) {
      if (visiblePath[i].segIndex !== lastSeg && lastSeg !== -1) {
        const p = centerPts[i];
        const hw = widthPxs[i] * 0.55;
        ctx.save();
        ctx.fillStyle = 'rgba(28, 33, 22, 0.72)';
        ctx.fillRect(p.x - 18, p.y - hw - 22, 36, 15);
        ctx.fillStyle = '#f8d94a';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`第${visiblePath[i].segIndex + 1}段`, p.x, p.y - hw - 11);
        ctx.restore();
      }
      lastSeg = visiblePath[i].segIndex;
    }

    // ══════════════════════════════════════════════════════════
    //  10. 催化剂投放标记 — 多点增强版
    // ══════════════════════════════════════════════════════════
    if (catalystPlacements.length > 0) {
      for (let cpIdx = 0; cpIdx < catalystPlacements.length; cpIdx++) {
        const cp = catalystPlacements[cpIdx];
        const targetRatio = cp.effectiveAfterRatio ?? 0;
        let bestIdx = -1;
        let bestDist = Number.POSITIVE_INFINITY;

        for (let i = 0; i < visiblePath.length; i++) {
          if (visiblePath[i].segIndex !== cp.segmentIndex) continue;
          const dist = Math.abs(segRatios[i] - targetRatio);
          if (dist < bestDist) {
            bestDist = dist;
            bestIdx = i;
          }
        }
        if (bestIdx < 0) continue;

        const p = centerPts[bestIdx];
        const hw = widthPxs[bestIdx] * 0.6;
        const px = p.x;
        const py = p.y - hw * 0.25;
        const color = MARKER_COLORS[cpIdx % MARKER_COLORS.length];

        // ── 粒子喷射环（脉冲动画） ─────────────────
        const particlePhase = (t * 2.2 + cpIdx * 1.7) % (Math.PI * 2);
        const pulseR = 10 + Math.sin(particlePhase) * 5;
        const pulseAlpha = 0.3 + Math.sin(particlePhase * 1.3) * 0.2;

        // 外光环脉冲
        ctx.save();
        ctx.beginPath();
        ctx.arc(px, py, pulseR + 6, 0, Math.PI * 2);
        ctx.fillStyle = `${color}${Math.round(pulseAlpha * 44).toString(16).padStart(2, '0')}`;
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.7 + Math.sin(particlePhase) * 0.3;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.globalAlpha = 1;

        // 第二光环（大圈）
        ctx.beginPath();
        ctx.arc(px, py, pulseR + 16, 0, Math.PI * 2);
        ctx.strokeStyle = `${color}55`;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();

        // ── 粒子群 ────────────────────────────────
        for (let k = 0; k < 12; k++) {
          const angle = (k / 12) * Math.PI * 2 + particlePhase * 0.5;
          const orbit = Math.sin(t * 3.4 + cpIdx * 4.1 + k * 1.7);
          const dist = pulseR + 8 + orbit * 10;
          const ppx = px + Math.cos(angle) * dist;
          const ppy = py + Math.sin(angle) * dist;
          const alpha = 0.34 + (Math.sin(t * 4.1 + k * 2.3) + 1) * 0.22;
          ctx.beginPath();
          ctx.arc(ppx, ppy, 1.8 + (Math.sin(t * 2.6 + cpIdx + k) + 1) * 0.9, 0, Math.PI * 2);
          ctx.fillStyle = `${color}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`;
          ctx.fill();
        }

        // ── 十字标记 ──────────────────────────────
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.shadowColor = color;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(px - 6, py);
        ctx.lineTo(px + 6, py);
        ctx.moveTo(px, py - 6);
        ctx.lineTo(px, py + 6);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.restore();

        // ── 标签卡片 ──────────────────────────────
        ctx.save();
        const labelW = 72;
        const labelH = 32;
        const labelX = px - labelW / 2;
        const labelY = py - hw * 0.85 - labelH;

        // 背景
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.beginPath();
        ctx.roundRect(labelX, labelY, labelW, labelH, 6);
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(labelX, labelY, labelW, labelH, 6);
        ctx.stroke();

        // 文字
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`投药点 ${cpIdx + 1}`, px, labelY + 14);
        ctx.fillStyle = color;
        ctx.font = '9px sans-serif';
        ctx.fillText(`活性${cp.activity.toFixed(1)} · ${cp.doseRatio.toFixed(1)}×`, px, labelY + 27);
        ctx.restore();
      }
    }

    // ══════════════════════════════════════════════════════════
    //  11. 动画前缘 "伸出" 特效
    // ══════════════════════════════════════════════════════════
    if (progressRef.current < 1 && centerPts.length >= 2) {
      const tip = centerPts[centerPts.length - 1];
      const tipW = widthPxs[widthPxs.length - 1];

      // 流动粒子（前缘喷涌）
      for (let k = 0; k < 10; k++) {
        const angle = (Math.sin(t * 4 + k * 1.9) * 0.5) * Math.PI * 0.7;
        const dist = ((Math.sin(t * 3.2 + k * 2.7) + 1) / 2) * tipW * 0.9;
        const ppx = tip.x + Math.cos(angle) * dist;
        const ppy = tip.y + Math.sin(angle) * dist;
        const alpha = 0.25 + ((Math.sin(t * 5.3 + k) + 1) / 2) * 0.45;
        const size = 1.2 + ((Math.sin(t * 3.7 + k * 1.4) + 1) / 2) * 2.5;
        ctx.beginPath();
        ctx.arc(ppx, ppy, size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(200, 245, 255, ${alpha})`;
        ctx.fill();
      }

      // 羽流轨迹线（从后方流向尖端）
      if (centerPts.length > 6) {
        const trailLen = Math.min(6, centerPts.length - 1);
        ctx.save();
        ctx.globalAlpha = 0.35;
        for (let k = 1; k <= trailLen; k++) {
          const pt = centerPts[centerPts.length - 1 - k];
          const progressAlpha = k / trailLen;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 2 + progressAlpha * 4, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(180, 225, 255, ${0.5 * (1 - progressAlpha)})`;
          ctx.fill();
        }
        ctx.restore();
      }

      // 前缘发光
      const glowGrad = ctx.createRadialGradient(tip.x, tip.y, 0, tip.x, tip.y, tipW * 0.9);
      glowGrad.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
      glowGrad.addColorStop(0.3, 'rgba(140, 220, 255, 0.4)');
      glowGrad.addColorStop(0.7, 'rgba(60, 140, 220, 0.12)');
      glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, tipW * 0.9, 0, Math.PI * 2);
      ctx.fillStyle = glowGrad;
      ctx.fill();
    }

    // ══════════════════════════════════════════════════════════
    //  12. 漂流小人污染探针
    // ══════════════════════════════════════════════════════════
    if (showDrifter && centerPts.length >= 2) {
      const pinnedIndex = pinnedDrifterIndexRef.current;
      const sourcePts = pinnedIndex === null ? centerPts : geometry.centerPts;
      const sourcePath = pinnedIndex === null ? visiblePath : result.riverPath;
      const sourceWidths = pinnedIndex === null ? widthPxs : geometry.widths;
      const autoIndex = sourcePts.length - 1;
      const drifterIndex = clamp(
        pinnedIndex ?? autoIndex,
        0,
        Math.max(0, sourcePts.length - 1),
      );
      const drifterPoint = sourcePts[drifterIndex];
      const drifterWidth = sourceWidths[drifterIndex] ?? widthPxs[widthPxs.length - 1] ?? 40;
      const drifterConc = sourcePath[drifterIndex]?.concentration ?? 0;
      drawDrifter(ctx, drifterPoint, drifterWidth, drifterConc, t, {
        pinned: pinnedIndex !== null,
        interactive: drifterInteractive,
      });
      drifterHitRef.current = {
        point: drifterPoint,
        radius: clamp(drifterWidth * 0.72, 30, 58),
      };
    } else {
      drifterHitRef.current = null;
    }

    // ══════════════════════════════════════════════════════════
    //  13. 图例
    // ══════════════════════════════════════════════════════════
    const legendX = W - 130;
    const legendY = H - 48;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(legendX - 8, legendY - 8, 106, 34);
    const legendGrad = ctx.createLinearGradient(legendX, legendY, legendX + 80, legendY);
    for (let lt = 0; lt <= 1; lt += 0.05) {
      const [r, g, b] = riverColor(lt);
      legendGrad.addColorStop(lt, `rgb(${r},${g},${b})`);
    }
    ctx.fillStyle = legendGrad;
    ctx.fillRect(legendX, legendY, 80, 12);
    ctx.fillStyle = '#fff';
    ctx.font = '10px sans-serif';
    ctx.fillText('清洁', legendX - 2, legendY + 25);
    ctx.fillText('污染', legendX + 55, legendY + 25);
      rafId = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      cancelAnimationFrame(rafId);
      geometryRef.current = null;
      drifterHitRef.current = null;
    };
  }, [result, gridWidth, gridHeight, catalystPlacements, segments, showDrifter, drifterInteractive]);

  function canvasPointFromEvent(event: React.PointerEvent<HTMLCanvasElement>): Point2D {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function pinDrifterToPoint(point: Point2D) {
    const geometry = geometryRef.current;
    if (!geometry || geometry.centerPts.length === 0) return;
    setPinnedDrifterIndex(findNearestPointIndex(geometry.centerPts, point));
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!showDrifter || !drifterInteractive || !drifterHitRef.current) return;
    const point = canvasPointFromEvent(event);
    const hit = drifterHitRef.current;
    const dx = point.x - hit.point.x;
    const dy = point.y - hit.point.y;
    if (dx * dx + dy * dy > hit.radius * hit.radius) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    draggingRef.current = true;
    setIsDraggingDrifter(true);
    pinDrifterToPoint(point);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!draggingRef.current) return;
    pinDrifterToPoint(canvasPointFromEvent(event));
  }

  function handlePointerUp(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setIsDraggingDrifter(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    pinDrifterToPoint(canvasPointFromEvent(event));
  }

  if (!result || result.riverPath.length < 2) {
    return (
      <div className="w-full h-full glass-panel overflow-hidden p-3 flex flex-col">
        <h2 className="text-lg font-semibold text-slate-100 mb-2 px-1 flex items-center gap-2">
          <span>水流观察窗</span>
        </h2>
        <div className="flex-1 rounded-lg overflow-hidden border border-white/10 relative flex items-center justify-center bg-slate-950/50">
          <p className="text-slate-400 text-sm">等待仿真计算...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full glass-panel overflow-hidden p-3 flex flex-col">
      <h2 className="text-lg font-semibold text-slate-100 mb-2 px-1 flex items-center gap-2">
        <span>水流观察窗</span>
        {catalystPlacements.length > 0 && (
          <span className="text-xs text-amber-100 bg-amber-300/15 px-2 py-0.5 rounded-full font-normal border border-amber-200/20">
            {catalystPlacements.length} 个投药点
          </span>
        )}
        {showDrifter && (
          <span className={`text-xs px-2 py-0.5 rounded-full font-normal border ${
            pinnedDrifterIndex === null
              ? 'text-cyan-100 bg-cyan-300/15 border-cyan-200/20'
              : 'text-emerald-100 bg-emerald-300/15 border-emerald-200/20'
          }`}>
            {pinnedDrifterIndex === null ? '小人跟随漂流' : '小人探针停留'}
          </span>
        )}
        {showDrifter && drifterInteractive && pinnedDrifterIndex !== null && (
          <button
            type="button"
            onClick={() => setPinnedDrifterIndex(null)}
            className="ml-auto text-xs text-cyan-100 bg-cyan-400/15 hover:bg-cyan-400/25 px-2 py-0.5 rounded-full border border-cyan-200/20 transition"
          >
            跟随漂流
          </button>
        )}
      </h2>
      <div className="flex-1 rounded-lg overflow-hidden border border-white/10 relative">
        <canvas
          ref={canvasRef}
          width={900}
          height={500}
          className={`w-full h-full ${showDrifter && drifterInteractive ? 'touch-none cursor-grab' : ''} ${isDraggingDrifter ? 'cursor-grabbing' : ''}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />
      </div>
    </div>
  );
}
