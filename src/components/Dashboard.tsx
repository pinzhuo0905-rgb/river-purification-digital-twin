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
}

// ═══════════════════════════════════════════════════════════════════
//  水质合规状态卡片
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
      className={`px-4 py-3 rounded-xl border-2 backdrop-blur transition-all duration-500 ${
        isMet
          ? 'bg-emerald-50 border-emerald-400'
          : 'bg-red-50 border-red-400'
      }`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center text-xl ${
            isMet ? 'bg-emerald-200' : 'bg-red-200'
          }`}
        >
          {isMet ? '✓' : '✗'}
        </div>
        <div>
          <p className="text-sm font-bold text-gray-800">
            {isMet ? 'I 类地表水达标' : '未达 I 类地表水标准'}
          </p>
          <p className="text-xs text-gray-600">
            出水口残留污染物{' '}
            <span className={isMet ? 'font-bold text-emerald-700' : 'font-bold text-red-700'}>
              {residualPct}%
            </span>
            {' '}/ 标准限值 10%（GB3838-2002）
          </p>
          {standard.distanceToStandard !== undefined && (
            <p className="text-xs text-gray-500 mt-0.5">
              预估达标距离：约 {(standard.distanceToStandard * 100).toFixed(0)}% 流程处
            </p>
          )}
        </div>
      </div>
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
}: DashboardProps) {
  // ── 动画浓度曲线数据 ────────────────────────────────────
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
        widths.push(riverPath[i].widthPx ?? 0);
      }
    }

    return { concLabels: labels, concData: conc, ntuData: ntu, widthData: widths };
  }, [riverPath, animProgress]);

  // ── 段出口数据 ──────────────────────────────────────────
  const segLabels = (segmentOutConcentrations || []).map((_, i) => `段落${i + 1}出口`);
  const segValues = (segmentOutConcentrations || []).map(c => Math.round(c * 1000) / 1000);
  const segNtuValues = (segmentOutNtu || []).map(n => Math.round(n * 10) / 10);

  // ── Chart.js 配置 ───────────────────────────────────────
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
      },
    ],
  }), [concLabels, concData, ntuData]);

  const chartOptions = useMemo(() => ({
    responsive: true,
    interaction: { mode: 'index' as const, intersect: false },
    animation: { duration: 300 },
    plugins: {
      legend: { position: 'top' as const, labels: { usePointStyle: true, padding: 16 } },
      title: {
        display: true,
        text: '沿程污染物浓度 & 浊度衰减曲线',
        font: { size: 14, weight: 'bold' as const },
        padding: { bottom: 12 },
      },
    },
    scales: {
      y: {
        type: 'linear' as const,
        position: 'left' as const,
        min: 0,
        max: 1.05,
        title: { display: true, text: '相对浓度 (1=满污染, 0=清洁)' },
        grid: { color: 'rgba(0,0,0,0.06)' },
      },
      y1: {
        type: 'linear' as const,
        position: 'right' as const,
        min: 0,
        title: { display: true, text: '浊度 NTU' },
        grid: { drawOnChartArea: false },
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

      {/* ── 双 Y 轴折线图 ─────────────────────────────── */}
      <Line options={chartOptions} data={chartData} />

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
            综合反应效率 = k_cat × I_eff × 停留时间。物理河宽通过连续性方程 v = Q/(w×d) 影响流速与停留时间。
          </p>
        </div>
      )}
    </div>
  );
}
