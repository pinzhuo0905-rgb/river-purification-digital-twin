/**
 * 自动投药优化引擎 — v1
 *
 * 作为独立模块，纯消费者：调用现有 simulatePurification() 作为黑盒目标函数。
 * 使用贪心序列搜索 + Nelder-Mead 精修构建帕累托前沿。
 */

import {
  simulatePurification,
  type SimulationParamsV3,
  type CatalystPlacement,
  type SimulationResultV3,
} from './simulation';

// ═══════════════════════════════════════════════════════════════
//  对外类型
// ═══════════════════════════════════════════════════════════════

export interface DosingPoint {
  segmentIndex: number;
  positionRatio: number;
  activity: number;
  doseRatio: number;
}

export interface ParetoPoint {
  dosingCount: number;
  finalConcentration: number;
  dosingPoints: DosingPoint[];
  classIMet: boolean;
  computeTimeMs: number;
}

export interface OptimizationRequest {
  params: SimulationParamsV3;
  maxDosingPoints: number;
  positionGridSize: number;
}

export interface OptimizationResult {
  paretoFrontier: ParetoPoint[];
  optimal: ParetoPoint;
  baselineConcentration: number;
}

// ═══════════════════════════════════════════════════════════════
//  内部工具
// ═══════════════════════════════════════════════════════════════

function dosingToCatalyst(dp: DosingPoint): CatalystPlacement {
  return {
    segmentIndex: dp.segmentIndex,
    activity: dp.activity,
    doseRatio: dp.doseRatio,
    effectiveAfterRatio: dp.positionRatio,
  };
}

function dosingArrayToCatalysts(dps: DosingPoint[]): CatalystPlacement[] {
  return dps.map(dosingToCatalyst);
}

/** 评估一组投药点的最终浓度 */
function evaluate(
  params: SimulationParamsV3,
  dosingPoints: DosingPoint[],
): SimulationResultV3 {
  const placements = dosingArrayToCatalysts(dosingPoints);
  return simulatePurification({ ...params, catalystPlacements: placements });
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// ═══════════════════════════════════════════════════════════════
//  网格搜索：在已有 N-1 个点基础上，搜索第 N 个最优投药点
// ═══════════════════════════════════════════════════════════════

const DOSE_CANDIDATES = [1, 1.5, 2, 3, 5];
const ACTIVITY_CANDIDATES = [0.5, 0.8];

function gridSearchBestNewPoint(
  params: SimulationParamsV3,
  existingPoints: DosingPoint[],
  gridSize: number,
): DosingPoint {
  const segments = params.segments;
  let bestConc = evaluate(params, existingPoints).segmentOutConcentrations.slice(-1)[0] ?? 1;
  let bestPoint: DosingPoint = { segmentIndex: 0, positionRatio: 0, activity: 0.5, doseRatio: 1 };

  for (let seg = 0; seg < segments.length; seg++) {
    for (let g = 0; g < gridSize; g++) {
      const pos = g / Math.max(1, gridSize - 1); // 0, 1/(K-1), 2/(K-1), ..., 1
      for (const act of ACTIVITY_CANDIDATES) {
        for (const dose of DOSE_CANDIDATES) {
          const candidate: DosingPoint = { segmentIndex: seg, positionRatio: pos, activity: act, doseRatio: dose };
          const conc = evaluate(params, [...existingPoints, candidate])
            .segmentOutConcentrations.slice(-1)[0] ?? 1;
          if (conc < bestConc) {
            bestConc = conc;
            bestPoint = candidate;
          }
        }
      }
    }
  }
  return bestPoint;
}

// ═══════════════════════════════════════════════════════════════
//  主函数：构建帕累托前沿
// ═══════════════════════════════════════════════════════════════

const CLASS_I_THRESHOLD = 0.10;

export function optimizeDosing(request: OptimizationRequest): OptimizationResult {
  const { params, maxDosingPoints, positionGridSize } = request;

  // 基线：无催化剂
  const baseResult = evaluate(params, []);
  const baselineConcentration = baseResult.segmentOutConcentrations.slice(-1)[0] ?? 1;

  const paretoFrontier: ParetoPoint[] = [];
  let prevBest: DosingPoint[] = [];

  for (let N = 1; N <= maxDosingPoints; N++) {
    const tN0 = performance.now();

    // a. 网格搜索第 N 个最优增量点
    const newPoint = gridSearchBestNewPoint(params, prevBest, positionGridSize);

    // b. 组合（Nelder-Mead 精修将在 Task 3 中添加，当前仅追加新点）
    const refined = [...prevBest, newPoint];

    // c. 评估
    const result = evaluate(params, refined);
    const finalConc = result.segmentOutConcentrations.slice(-1)[0] ?? 1;

    paretoFrontier.push({
      dosingCount: N,
      finalConcentration: finalConc,
      dosingPoints: refined.map(p => ({ ...p })),
      classIMet: finalConc < CLASS_I_THRESHOLD,
      computeTimeMs: performance.now() - tN0,
    });

    prevBest = refined;
  }

  // 自动推荐最优方案
  let optimal: ParetoPoint;
  const metPoints = paretoFrontier.filter(p => p.classIMet);
  if (metPoints.length > 0) {
    optimal = metPoints[0]; // 达标中最少投药次数
  } else if (paretoFrontier.length > 0) {
    optimal = paretoFrontier[paretoFrontier.length - 1]; // 浓度最低的
  } else {
    optimal = {
      dosingCount: 0,
      finalConcentration: baselineConcentration,
      dosingPoints: [],
      classIMet: baselineConcentration < CLASS_I_THRESHOLD,
      computeTimeMs: 0,
    };
  }

  return {
    paretoFrontier,
    optimal,
    baselineConcentration,
  };
}
