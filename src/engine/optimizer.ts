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
