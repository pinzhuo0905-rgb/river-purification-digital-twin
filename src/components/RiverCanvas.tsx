import { useEffect, useRef } from 'react';
import type { SimulationResultV3, CatalystPlacement, RiverSegmentV3 } from '../engine/simulation';

interface RiverCanvasProps {
  result: SimulationResultV3 | null;
  gridWidth: number;
  gridHeight: number;
  animProgress: number;
  catalystPlacements: CatalystPlacement[];
  segments: RiverSegmentV3[];
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

/** 催化投放点专用色（按索引循环） */
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

function perpNorm(p0: Point2D, p1: Point2D): { nx: number; ny: number } {
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  return { nx: -dy / len, ny: dx / len };
}

// ═══════════════════════════════════════════════════════════════════
//  绘制工具
// ═══════════════════════════════════════════════════════════════════

/** 绘制单段河流四边形 */
function fillQuad(
  ctx: CanvasRenderingContext2D,
  p0: Point2D,
  p1: Point2D,
  hw0: number,
  hw1: number,
  style: string | CanvasGradient,
) {
  const { nx, ny } = perpNorm(p0, p1);
  ctx.beginPath();
  ctx.moveTo(p0.x + nx * hw0, p0.y + ny * hw0);
  ctx.lineTo(p1.x + nx * hw1, p1.y + ny * hw1);
  ctx.lineTo(p1.x - nx * hw1, p1.y - ny * hw1);
  ctx.lineTo(p0.x - nx * hw0, p0.y - ny * hw0);
  ctx.closePath();
  ctx.fillStyle = style;
  ctx.fill();
}

/** 绘制逐段变化的河流层 */
function drawRiverLayer(
  ctx: CanvasRenderingContext2D,
  pts: Point2D[],
  widths: number[],
  layerScale: number,
  colorFn: (i: number) => string,
) {
  for (let i = 1; i < pts.length; i++) {
    const hw0 = (widths[i - 1] * layerScale) / 2;
    const hw1 = (widths[i] * layerScale) / 2;
    fillQuad(ctx, pts[i - 1], pts[i], hw0, hw1, colorFn(i));
  }
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
}: RiverCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !result || result.riverPath.length < 2) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const t = frameRef.current++;
    const scaleX = W / gridWidth;
    const scaleY = H / gridHeight;

    // ── 动画：根据 progress 决定可见采样点数 ──────────────
    const totalPoints = result.riverPath.length;
    const visibleCount = Math.max(2, Math.round(totalPoints * Math.max(animProgress, 0.01)));
    const visiblePath = result.riverPath.slice(0, visibleCount);

    // ── 计算弯曲中心线（方向角累积 y 偏移）──────────────
    const centerPts: Point2D[] = [];
    // 构建 segIndex → directionAngle 快速查找
    const segAngles = new Map<number, number>();
    for (const seg of segments) {
      segAngles.set(seg.id - 1, seg.directionAngle); // id 是 1-based
    }

    let cumY = gridHeight * 0.5;
    let lastSegIdx = -1;
    for (let i = 0; i < visiblePath.length; i++) {
      const pp = visiblePath[i];
      if (pp.segIndex !== lastSegIdx && lastSegIdx !== -1) {
        const angle = segAngles.get(pp.segIndex) ?? 0;
        cumY += Math.sin((angle * Math.PI) / 180) * 40;
      }
      lastSegIdx = pp.segIndex;
      centerPts.push({
        x: pp.x * scaleX,
        y: cumY * scaleY,
      });
    }

    // ── 每点实际河宽（像素）─────────────────────────────
    const widthPxs = visiblePath.map(p => p.widthPx * scaleY);

    // ══════════════════════════════════════════════════════════
    //  1. 背景噪声纹理
    // ══════════════════════════════════════════════════════════
    ctx.clearRect(0, 0, W, H);
    const imageData = ctx.createImageData(W, H);
    for (let py = 0; py < H; py++) {
      for (let px = 0; px < W; px++) {
        const idx = (py * W + px) * 4;
        const n = smoothNoise(px, py, 24) * 0.16;
        const n2 = smoothNoise(px + 500, py, 70) * 0.08;
        imageData.data[idx] = 78 + n * 42 + n2 * 28;
        imageData.data[idx + 1] = 132 + n * 30 + n2 * 20 - (py / H) * 22;
        imageData.data[idx + 2] = 58 + n * 18 + n2 * 10;
        imageData.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imageData, 0, 0);

    // ══════════════════════════════════════════════════════════
    //  2. 河岸底色（最外层）
    // ══════════════════════════════════════════════════════════
    drawRiverLayer(ctx, centerPts, widthPxs, 1.48, () => 'rgba(128, 105, 65, 0.78)');

    // ══════════════════════════════════════════════════════════
    //  3. 水体底色
    // ══════════════════════════════════════════════════════════
    drawRiverLayer(ctx, centerPts, widthPxs, 1.15, () => '#138fc1');

    // ══════════════════════════════════════════════════════════
    //  4. 浓度渐变色（逐段着色）
    // ══════════════════════════════════════════════════════════
    for (let i = 1; i < centerPts.length; i++) {
      const conc = visiblePath[i].concentration;
      const [r, g, b] = riverColor(conc);
      const ripple = (smoothNoise(i * 16 + t * 1.7, 120, 48) - 0.5) * 14;
      const hw0 = (widthPxs[i - 1] * 0.94) / 2;
      const hw1 = (widthPxs[i] * 0.94) / 2;
      fillQuad(
        ctx, centerPts[i - 1], centerPts[i], hw0, hw1,
        `rgb(${Math.max(0, r + ripple)},${Math.max(0, g + ripple)},${Math.max(0, b + ripple)})`,
      );
    }

    // ══════════════════════════════════════════════════════════
    //  5. 水面高光
    // ══════════════════════════════════════════════════════════
    drawRiverLayer(ctx, centerPts, widthPxs, 0.72, () => 'rgba(68, 190, 226, 0.82)');

    // ══════════════════════════════════════════════════════════
    //  6. 水面波纹虚线
    // ══════════════════════════════════════════════════════════
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash([6, 10]);
    ctx.lineDashOffset = -t * 0.45;
    ctx.strokeStyle = 'rgba(240, 255, 255, 0.38)';
    for (let i = 1; i < centerPts.length; i++) {
      const w = Math.max(2, (widthPxs[i - 1] + widthPxs[i]) / 2 * 0.08);
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(centerPts[i - 1].x, centerPts[i - 1].y);
      ctx.lineTo(centerPts[i].x, centerPts[i].y);
      ctx.stroke();
    }
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
        ctx.strokeStyle = 'rgba(43, 83, 31, 0.62)';
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + nx * side * halfW * 0.28, by + ny * side * halfW * 0.28);
        ctx.stroke();
      }
    }

    // ══════════════════════════════════════════════════════════
    //  8. 分段标签
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
    //  9. 催化剂投放标记（多点）
    // ══════════════════════════════════════════════════════════
    if (catalystPlacements.length > 0) {
      for (let cpIdx = 0; cpIdx < catalystPlacements.length; cpIdx++) {
        const cp = catalystPlacements[cpIdx];
        // 找到该段在可见路径中的第一个点
        const firstPtIdx = visiblePath.findIndex(p => p.segIndex === cp.segmentIndex);
        if (firstPtIdx < 0 || firstPtIdx >= centerPts.length) continue;

        const p = centerPts[firstPtIdx];
        const hw = widthPxs[firstPtIdx] * 0.6;
        const color = MARKER_COLORS[cpIdx % MARKER_COLORS.length];

        // 外光环
        ctx.save();
        ctx.beginPath();
        ctx.arc(p.x, p.y - hw * 0.3, 10, 0, Math.PI * 2);
        ctx.fillStyle = `${color}44`;
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();

        // 十字标记
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(p.x - 5, p.y - hw * 0.3);
        ctx.lineTo(p.x + 5, p.y - hw * 0.3);
        ctx.moveTo(p.x, p.y - hw * 0.3 - 5);
        ctx.lineTo(p.x, p.y - hw * 0.3 + 5);
        ctx.stroke();

        // 标签
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 9px sans-serif';
        ctx.textAlign = 'center';
        const label = `投药${cpIdx + 1} 活性${cp.activity.toFixed(1)}`;
        ctx.fillText(label, p.x, p.y - hw * 0.9);
        ctx.restore();
      }
    }

    // ══════════════════════════════════════════════════════════
    //  10. 动画前缘渐变遮罩（"伸出"效果）
    // ══════════════════════════════════════════════════════════
    if (animProgress < 1 && centerPts.length >= 2) {
      const tip = centerPts[centerPts.length - 1];
      const tipW = widthPxs[widthPxs.length - 1];

      // 流动粒子
      for (let k = 0; k < 6; k++) {
        const spread = tipW * 0.7;
        const px = tip.x + (Math.random() - 0.5) * spread * 0.6;
        const py = tip.y + (Math.random() - 0.5) * spread;
        const alpha = 0.4 + Math.random() * 0.4;
        ctx.beginPath();
        ctx.arc(px, py, 1.5 + Math.random() * 2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(200, 240, 255, ${alpha})`;
        ctx.fill();
      }

      // 前缘发光
      const glowGrad = ctx.createRadialGradient(tip.x, tip.y, 0, tip.x, tip.y, tipW * 0.8);
      glowGrad.addColorStop(0, 'rgba(255, 255, 255, 0.7)');
      glowGrad.addColorStop(0.5, 'rgba(100, 200, 255, 0.3)');
      glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, tipW * 0.8, 0, Math.PI * 2);
      ctx.fillStyle = glowGrad;
      ctx.fill();
    }

    // ══════════════════════════════════════════════════════════
    //  11. 图例
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
  }, [result, gridWidth, gridHeight, animProgress, catalystPlacements, segments]);

  if (!result || result.riverPath.length < 2) {
    return (
      <div className="w-full h-full bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden p-3 flex flex-col">
        <h2 className="text-lg font-semibold text-gray-800 mb-2 px-1 flex items-center gap-2">
          <span>🌊</span> 河流 2D 仿真视图
        </h2>
        <div className="flex-1 rounded-lg overflow-hidden border border-gray-200 relative flex items-center justify-center bg-gray-50">
          <p className="text-gray-400 text-sm">等待仿真计算...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden p-3 flex flex-col">
      <h2 className="text-lg font-semibold text-gray-800 mb-2 px-1 flex items-center gap-2">
        <span>🌊</span> 河流 2D 仿真视图
      </h2>
      <div className="flex-1 rounded-lg overflow-hidden border border-gray-200 relative">
        <canvas
          ref={canvasRef}
          width={900}
          height={500}
          className="w-full h-full"
        />
      </div>
    </div>
  );
}
