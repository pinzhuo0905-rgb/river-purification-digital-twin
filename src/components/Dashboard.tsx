import { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import type { SimulationResultV3, SegmentMetricsV3 } from '../engine/simulation';
import type { ParetoPoint } from '../engine/optimizer';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Title, Tooltip, Legend);

export interface DashboardProps {
  riverPath?: SimulationResultV3['riverPath'];
  optX: number;
  optY: number;
  segmentOutConcentrations?: number[];
  segmentOutNtu?: number[];
  segmentMetrics?: SegmentMetricsV3[];
  optimalSegmentIndex?: number;
  animProgress: number;
  waterQualityStandard?: SimulationResultV3['waterQualityStandard'];
  /** 帕累托前沿数据（来自优化结果） */
  paretoFrontier?: ParetoPoint[];
  /** 基线浓度 */
  baselineConcentration?: number;
  /** 正在优化中 */
  isOptimizing?: boolean;
  /** 触发优化 */
  onOptimize?: () => void;
  /** 选择帕累托曲线上的点 */
  onSelectParetoPoint?: (point: ParetoPoint) => void;
  /** 最大投药次数 */
  maxDosingPoints?: number;
  /** 设置最大投药次数 */
  onMaxDosingPointsChange?: (n: number) => void;
}

// ═══════════════════════════════════════════════════════════════════
//  水质合规状态卡片（含脉冲动画）
// ═══════════════════════════════════════════════════════════════════

function WaterQualityBadge({ standard }: { standard?: SimulationResultV3['waterQualityStandard'] }) {
  if (!standard) {
    return (
      <div className="px-4 py-3 bg-gray-100 rounded-xl border border-gray-200">
        <p className="text-sm font-semibold text-gray-500">水质评估：等待数据...</p>
      </div>
    );
  }

  const isMet = standard.classIMet;
  const residualPct = (standard.residualRatio * 100).toFixed(1);

  return (
    <div
      className={`relative px-4 py-3 rounded-xl border-2 backdrop-blur transition-all duration-500 ${
        isMet
          ? 'bg-emerald-50 border-emerald-400'
          : 'bg-red-50 border-red-400'
      }`}
    >
      {/* 达标时脉冲环 */}
      {isMet && (
        <div className="absolute inset-0 rounded-xl pointer-events-none overflow-hidden">
          <div className="absolute inset-0 bg-emerald-400/10 animate-ping rounded-xl"
            style={{ animationDuration: '2.5s' }} />
        </div>
      )}
      <div className="flex items-center gap-3 relative z-10">
        <div
          className={`w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold ${
            isMet ? 'bg-emerald-200 text-emerald-700' : 'bg-red-200 text-red-700'
          } ${isMet ? 'animate-pulse' : ''}`}
          style={isMet ? { animationDuration: '2s' } : {}}
        >
          {isMet ? '✓' : '✗'}
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold text-gray-800">
            {isMet ? '🎉 I 类地表水全面达标' : '⚠️ 未达 I 类地表水标准'}
          </p>
          <p className="text-xs text-gray-600 mt-0.5">
            出水口残留污染物{' '}
            <span className={isMet ? 'font-bold text-emerald-700 text-base' : 'font-bold text-red-700'}>
              {residualPct}%
            </span>
            {' '}/ 标准限值 10%（GB3838-2002）
          </p>
          {standard.distanceToStandard !== undefined && !isMet && (
            <p className="text-xs text-gray-500 mt-0.5">
              📏 预估达标距离：约 {(standard.distanceToStandard * 100).toFixed(0)}% 流程处仍需延长 {(((1 - standard.distanceToStandard) * 100).toFixed(0))}% 流程
            </p>
          )}
        </div>
        {/* 达标指示条 */}
        <div className="w-16 h-3 bg-gray-200 rounded-full overflow-hidden flex-shrink-0">
          <div
            className={`h-full rounded-full transition-all duration-700 ${isMet ? 'bg-emerald-500' : 'bg-red-500'}`}
            style={{ width: `${Math.min(100, standard.residualRatio * 100 * 10)}%` }}
          />
        </div>
        <span className="text-xs text-gray-500 w-12 flex-shrink-0">达标 ≤10%</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  帕累托曲线组件
// ═══════════════════════════════════════════════════════════════════

interface ParetoChartProps {
  paretoFrontier?: ParetoPoint[];
  baselineConcentration?: number;
  onSelectPoint?: (point: ParetoPoint) => void;
}

function ParetoChart({ paretoFrontier, baselineConcentration, onSelectPoint }: ParetoChartProps) {
  const data = useMemo(() => ({
    labels: paretoFrontier?.map(p => `N=${p.dosingCount}`) ?? [],
    datasets: [
      {
        label: '最优最终浓度',
        data: paretoFrontier?.map(p => p.finalConcentration) ?? [],
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        tension: 0.3,
        pointRadius: 5,
        pointBackgroundColor: paretoFrontier?.map(p =>
          p.classIMet ? 'rgb(16, 185, 129)' : 'rgb(239, 68, 68)'
        ) ?? [],
        fill: true,
      },
      ...(baselineConcentration !== undefined ? [{
        label: '无催化剂基线',
        data: Array(paretoFrontier?.length ?? 0).fill(baselineConcentration),
        borderColor: 'rgb(156, 163, 175)',
        borderDash: [6, 4] as number[],
        borderWidth: 1.5,
        pointRadius: 0,
        fill: false,
      }] : []),
    ],
  }), [paretoFrontier, baselineConcentration]);

  const options = useMemo(() => ({
    responsive: true,
    interaction: { mode: 'index' as const, intersect: false },
    animation: { duration: 500 },
    onClick: (_event: unknown, elements: Array<{ index: number }>) => {
      if (elements.length > 0 && onSelectPoint && paretoFrontier) {
        const idx = elements[0].index;
        onSelectPoint(paretoFrontier[idx]);
      }
    },
    plugins: {
      legend: { position: 'top' as const, labels: { usePointStyle: true, font: { size: 11 } } },
      title: {
        display: true,
        text: '帕累托前沿：投药次数 vs 最优浓度',
        font: { size: 13, weight: 'bold' as const },
      },
      tooltip: {
        callbacks: {
          label: (ctx: any) => {
            if (ctx.datasetIndex === 1) return `基线: ${(ctx.raw * 100).toFixed(1)}%`;
            const idx = ctx.dataIndex;
            const pt = paretoFrontier?.[idx];
            if (!pt) return '';
            const lines = [
              `浓度: ${(pt.finalConcentration * 100).toFixed(1)}%`,
              `达标: ${pt.classIMet ? '✓' : '✗'}`,
            ];
            for (const dp of pt.dosingPoints) {
              lines.push(
                `  段${dp.segmentIndex + 1} pos=${(dp.positionRatio * 100).toFixed(0)}% dose=${dp.doseRatio.toFixed(1)} act=${dp.activity.toFixed(1)}`
              );
            }
            lines.push(`耗时: ${pt.computeTimeMs.toFixed(0)}ms`);
            return lines;
          },
        },
      },
    },
    scales: {
      y: {
        type: 'linear' as const,
        min: 0,
        max: 1.05,
        title: { display: true, text: '最终浓度', color: 'rgb(59,130,246)' },
        grid: { color: 'rgba(0,0,0,0.06)' },
      },
      x: {
        title: { display: true, text: '投药次数 N' },
      },
    },
  }), [paretoFrontier, onSelectPoint]);

  if (!paretoFrontier || paretoFrontier.length === 0) return null;

  return (
    <div className="relative">
      <Line options={options} data={data} />
      <div className="absolute left-[9%] right-[5%] top-[24%] border-t border-dashed border-emerald-400/40 pointer-events-none" />
      <span className="absolute left-[7%] top-[23%] text-[9px] text-emerald-500/50 pointer-events-none">
        I类水达标线 10%
      </span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  主组件
// ═══════════════════════════════════════════════════════════════════

export function Dashboard({
  riverPath,
  optX,
  optY,
  segmentOutConcentrations,
  segmentOutNtu,
  segmentMetrics,
  optimalSegmentIndex,
  animProgress,
  waterQualityStandard,
  paretoFrontier,
  baselineConcentration,
  isOptimizing,
  onOptimize,
  onSelectParetoPoint,
  maxDosingPoints,
  onMaxDosingPointsChange,
}: DashboardProps) {
  // ── 动画浓度/NTU/河宽曲线数据 ──────────────────────────
  const { concLabels, concData, ntuData, widthData } = useMemo(() => {
    const labels: string[] = [];
    const conc: number[] = [];
    const ntu: number[] = [];
    const widths: number[] = [];

    if (riverPath && riverPath.length > 0) {
      const stride = Math.max(1, Math.floor(riverPath.length / 80));
      const totalSamples = Math.floor(riverPath.length / stride);
      const visibleSamples = Math.max(1, Math.round(totalSamples * animProgress));

      for (let i = 0; i < riverPath.length; i += stride) {
        const sampleIdx = Math.floor(i / stride);
        if (sampleIdx >= visibleSamples) break;
        const pct = Math.round((i / riverPath.length) * 100);
        labels.push(`${pct}%`);
        conc.push(riverPath[i].concentration);
        ntu.push(riverPath[i].ntu ?? 0);
        // 物理河宽（米）= 像素宽度 / 缩放系数 ≈ widthPx 来自渲染
        widths.push(riverPath[i].widthPx ?? 0);
      }
    }

    return { concLabels: labels, concData: conc, ntuData: ntu, widthData: widths };
  }, [riverPath, animProgress]);

  // ── 段出口数据 ──────────────────────────────────────────
  const segLabels = (segmentOutConcentrations || []).map((_, i) => `段落${i + 1}出口`);
  const segValues = (segmentOutConcentrations || []).map(c => Math.round(c * 1000) / 1000);
  const segNtuValues = (segmentOutNtu || []).map(n => Math.round(n * 10) / 10);

  // ── Chart.js 配置（三 Y 轴：浓度 + NTU + 河宽）──────
  const chartData = useMemo(() => ({
    labels: concLabels,
    datasets: [
      {
        label: '污染物相对浓度',
        data: concData,
        borderColor: 'rgb(239, 68, 68)',
        backgroundColor: 'rgba(239, 68, 68, 0.08)',
        tension: 0.4,
        pointRadius: 0,
        fill: true,
        yAxisID: 'y',
        order: 1,
      },
      {
        label: '水体浊度 (NTU)',
        data: ntuData,
        borderColor: 'rgb(251, 146, 60)',
        backgroundColor: 'rgba(251, 146, 60, 0.06)',
        tension: 0.4,
        pointRadius: 0,
        fill: true,
        yAxisID: 'y1',
        order: 2,
      },
      {
        label: '物理河宽 (px)',
        data: widthData,
        borderColor: 'rgb(99, 102, 241)',
        borderDash: [4, 4],
        borderWidth: 1.5,
        tension: 0.3,
        pointRadius: 0,
        fill: false,
        yAxisID: 'y2',
        order: 3,
      },
    ],
  }), [concLabels, concData, ntuData, widthData]);

  const chartOptions = useMemo(() => ({
    responsive: true,
    interaction: { mode: 'index' as const, intersect: false },
    animation: { duration: 300 },
    plugins: {
      legend: { position: 'top' as const, labels: { usePointStyle: true, padding: 16, font: { size: 11 } } },
      title: {
        display: true,
        text: '沿程污染物浓度 · NTU · 河宽 三轴联动曲线',
        font: { size: 13, weight: 'bold' as const },
        padding: { bottom: 12 },
      },
      tooltip: {
        callbacks: {
          label: (ctx: any) => {
            if (ctx.datasetIndex === 0) return `浓度: ${(ctx.raw * 100).toFixed(1)}%`;
            if (ctx.datasetIndex === 1) return `NTU: ${ctx.raw.toFixed(1)}`;
            if (ctx.datasetIndex === 2) return `河宽: ${ctx.raw.toFixed(1)} px`;
            return '';
          },
        },
      },
    },
    scales: {
      y: {
        type: 'linear' as const,
        position: 'left' as const,
        min: 0,
        max: 1.05,
        title: { display: true, text: '相对浓度 (1=污染)', color: 'rgb(239,68,68)' },
        grid: { color: 'rgba(0,0,0,0.06)' },
      },
      y1: {
        type: 'linear' as const,
        position: 'right' as const,
        min: 0,
        title: { display: true, text: 'NTU', color: 'rgb(251,146,60)' },
        grid: { drawOnChartArea: false },
      },
      y2: {
        type: 'linear' as const,
        position: 'right' as const,
        min: 0,
        title: { display: true, text: '河宽 (px)', color: 'rgb(99,102,241)' },
        grid: { drawOnChartArea: false },
        offset: true,
      },
      x: {
        title: { display: true, text: '流程进度' },
        ticks: { callback: (_v: unknown, i: number) => (i % 10 === 0 ? concLabels[i] : '') },
      },
    },
  }), [concLabels]);

  return (
    <div className="bg-white rounded-xl shadow border border-gray-200 p-4 flex flex-col gap-4">
      {/* ── 水质合规 ──────────────────────────────────── */}
      <WaterQualityBadge standard={waterQualityStandard} />

      {/* ── 自动优化控制 ──────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-blue-700">最大投药次数：</span>
          <input
            type="number"
            min={0}
            max={20}
            value={maxDosingPoints ?? 5}
            onChange={e => onMaxDosingPointsChange?.(Number(e.target.value))}
            className="w-16 px-2 py-1 border border-blue-300 rounded-lg text-center text-sm font-mono"
            disabled={isOptimizing}
          />
        </div>
        <button
          onClick={onOptimize}
          disabled={isOptimizing}
          className={`px-5 py-2 rounded-lg text-sm font-bold text-white transition-all ${
            isOptimizing
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700 active:scale-95 shadow-md'
          }`}
        >
          {isOptimizing ? '优化中...' : '自动优化投药策略'}
        </button>
      </div>

      {/* ── 帕累托曲线 ──────────────────────────────────── */}
      {paretoFrontier && paretoFrontier.length > 0 && (
        <>
          <ParetoChart
            paretoFrontier={paretoFrontier}
            baselineConcentration={baselineConcentration}
            onSelectPoint={onSelectParetoPoint}
          />
          {/* ── 投药方案明细 ───────────────────────────── */}
          <div className="overflow-x-auto">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
              各投药方案明细（投药次数、位置、剂量、活性）
            </p>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-indigo-100 text-gray-600">
                  <th className="px-2 py-1.5 text-left rounded-tl-lg">投药次数 N</th>
                  <th className="px-2 py-1.5 text-right">最终浓度</th>
                  <th className="px-2 py-1.5 text-center">达标</th>
                  <th className="px-2 py-1.5 text-left">投药明细（段 · 位置 · 剂量 · 活性）</th>
                  <th className="px-2 py-1.5 text-right rounded-tr-lg">总投药量</th>
                </tr>
              </thead>
              <tbody>
                {paretoFrontier.map((p, i) => {
                  const totalDose = p.dosingPoints.reduce((sum, dp) => sum + dp.doseRatio, 0);
                  const isOptimal = i === paretoFrontier.findIndex(pp =>
                    pp.dosingCount === (paretoFrontier.filter(x => x.classIMet)[0]?.dosingCount ?? paretoFrontier[paretoFrontier.length - 1]?.dosingCount)
                  );
                  return (
                    <tr
                      key={i}
                      onClick={() => onSelectParetoPoint?.(p)}
                      className={`border-t border-gray-100 cursor-pointer transition-colors ${
                        isOptimal ? 'bg-emerald-50 font-bold' : 'hover:bg-indigo-50'
                      }`}
                    >
                      <td className="px-2 py-1.5">
                        {isOptimal && <span className="mr-1 text-emerald-600">★</span>}
                        N={p.dosingCount}
                      </td>
                      <td className={`px-2 py-1.5 text-right font-mono ${
                        p.classIMet ? 'text-emerald-600' : 'text-red-500'
                      }`}>
                        {(p.finalConcentration * 100).toFixed(1)}%
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        {p.classIMet ? <span className="text-emerald-500">✓</span> : <span className="text-red-400">✗</span>}
                      </td>
                      <td className="px-2 py-1.5 font-mono text-gray-600">
                        {p.dosingPoints.map((dp, j) => (
                          <span key={j} className="inline-block mr-2 px-1.5 py-0.5 bg-gray-100 rounded">
                            段{dp.segmentIndex + 1}
                            @{(dp.positionRatio * 100).toFixed(0)}%
                            | dose={dp.doseRatio.toFixed(1)}
                            | act={dp.activity.toFixed(1)}
                          </span>
                        ))}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono font-bold text-indigo-600">
                        Σ={totalDose.toFixed(1)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── 三 Y 轴折线图 ─────────────────────────────── */}
      <div className="relative">
        <Line options={chartOptions} data={chartData} />
        {/* 达标线参考 */}
        <div className="absolute left-[9%] right-[5%] top-[24%] border-t border-dashed border-emerald-400/40 pointer-events-none" />
        <span className="absolute left-[7%] top-[23%] text-[9px] text-emerald-500/50 pointer-events-none">
          I类水达标线 10%
        </span>
      </div>

      {/* ── 段出口数据卡片 ────────────────────────────── */}
      <div className="flex gap-3 flex-wrap">
        <div className="px-3 py-2 bg-blue-50 rounded-lg text-sm">
          <span className="text-blue-500 font-medium">最佳投放坐标：</span>
          <span className="font-bold text-blue-800">({optX.toFixed(0)}, {optY.toFixed(0)})</span>
        </div>
        {segLabels.map((label, i) => (
          <div key={i} className="px-3 py-2 bg-gray-50 rounded-lg text-sm border border-gray-100">
            <span className="text-gray-500">{label}：</span>
            <span
              className={`font-bold ${
                segValues[i] < 0.1 ? 'text-emerald-600' : segValues[i] < 0.3 ? 'text-blue-600' : segValues[i] < 0.6 ? 'text-yellow-600' : 'text-red-600'
              }`}
            >
              {(segValues[i] * 100).toFixed(1)}%
            </span>
            <span className="text-gray-400 ml-1">| NTU {segNtuValues[i]?.toFixed(1) ?? '—'}</span>
            {segNtuValues[i] !== undefined && segNtuValues[i] <= 15 && (
              <span className="ml-1 text-emerald-500 text-xs">✓清澈</span>
            )}
          </div>
        ))}
      </div>

      {/* ── 段反应效率分析表 ──────────────────────────── */}
      {segmentMetrics && segmentMetrics.length > 0 && (
        <div>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
            ⚙️ 各段反应效率 & 几何参数（决定最佳投放点的依据）
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-gray-100 text-gray-600">
                  <th className="px-2 py-1.5 text-left rounded-tl-lg">段落</th>
                  <th className="px-2 py-1.5 text-right">流速 (m/s)</th>
                  <th className="px-2 py-1.5 text-right">停留时间</th>
                  <th className="px-2 py-1.5 text-right">物理河宽 (m)</th>
                  <th className="px-2 py-1.5 text-right">水深 (m)</th>
                  <th className="px-2 py-1.5 text-right">地形</th>
                  <th className="px-2 py-1.5 text-right">有效光强 I_eff</th>
                  <th className="px-2 py-1.5 text-right rounded-tr-lg">反应效率 ↑</th>
                </tr>
              </thead>
              <tbody>
                {segmentMetrics.map((m, i) => {
                  const isOpt = i === optimalSegmentIndex;
                  const maxScore = Math.max(...segmentMetrics.map(x => x.reactionScore), 0.001);
                  const barW = (m.reactionScore / maxScore) * 100;
                  return (
                    <tr
                      key={i}
                      className={`border-t border-gray-100 ${isOpt ? 'bg-emerald-50 font-bold' : 'hover:bg-gray-50'}`}
                    >
                      <td className="px-2 py-1.5">
                        {isOpt && <span className="mr-1 text-emerald-600">★</span>}
                        段落 {i + 1}
                        {isOpt && <span className="ml-1 text-xs text-emerald-600 font-normal">← 最佳</span>}
                      </td>
                      <td className="px-2 py-1.5 text-right">{m.velocity.toFixed(1)}</td>
                      <td className="px-2 py-1.5 text-right text-purple-700">{m.residenceTime.toFixed(1)} s</td>
                      <td className="px-2 py-1.5 text-right text-indigo-700 font-mono">{m.width?.toFixed(1) ?? '—'}</td>
                      <td className="px-2 py-1.5 text-right text-cyan-700">{m.depth?.toFixed(1) ?? '—'}</td>
                      <td className="px-2 py-1.5 text-right text-gray-500">{m.terrain === 'lake' ? '🏞 湖泊' : '🌊 河道'}</td>
                      <td className="px-2 py-1.5 text-right text-yellow-700">{m.effectiveLight.toFixed(3)}</td>
                      <td className="px-2 py-1.5">
                        <div className="flex items-center gap-1 justify-end">
                          <div className="w-16 bg-gray-200 rounded-full h-1.5">
                            <div
                              className={`h-1.5 rounded-full ${isOpt ? 'bg-emerald-500' : 'bg-blue-400'}`}
                              style={{ width: `${barW}%` }}
                            />
                          </div>
                          <span className={isOpt ? 'text-emerald-700' : 'text-gray-700'}>
                            {m.reactionScore.toFixed(2)}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-400 mt-1.5">
            综合反应效率 = k_cat × I_eff × 停留时间。物理河宽通过连续性方程 v = Q/(w×d) 影响流速与停留时间。折线图河宽曲线与 Canvas 视图严格对齐。
          </p>
        </div>
      )}
    </div>
  );
}
