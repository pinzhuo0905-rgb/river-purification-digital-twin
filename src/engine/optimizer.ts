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

import { classifyWaterQuality, type WaterQualityClass } from './waterQuality';

export interface ParetoPoint {
  dosingCount: number;
  finalConcentration: number;
  dosingPoints: DosingPoint[];
  classIMet: boolean;
  waterQualityClass: WaterQualityClass;
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

function dosingKey(point: Pick<DosingPoint, 'segmentIndex' | 'positionRatio'>): string {
  return `${point.segmentIndex}:${Math.round(point.positionRatio * 1000)}`;
}

function hasDuplicatePosition(points: DosingPoint[]): boolean {
  const seen = new Set<string>();
  for (const point of points) {
    const key = dosingKey(point);
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
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
          if (existingPoints.some(p => dosingKey(p) === dosingKey(candidate))) continue;
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
//  Nelder-Mead 单纯形精修
// ═══════════════════════════════════════════════════════════════

/**
 * 对 N 个投药点的连续参数做 Nelder-Mead 优化。
 *
 * 每个投药点有 4 个参数: [segmentIndex, positionRatio, activity, doseRatio]。
 * segmentIndex 在评估时四舍五入到最近整数并钳位到 [0, M-1]。
 *
 * @returns 精修后的投药点数组
 */
function nelderMeadRefine(
  params: SimulationParamsV3,
  initial: DosingPoint[],
  maxIter: number = 200,
  tolerance: number = 1e-4,
): DosingPoint[] {
  if (initial.length === 0) return [];

  const M = params.segments.length;
  const N = initial.length;
  const dim = N * 4; // 每个点 4 个参数

  // 将 DosingPoint[] 展平为向量，segmentIndex 归一化到 [0, 1)
  function pack(pts: DosingPoint[]): number[] {
    const v: number[] = [];
    for (const p of pts) {
      v.push(p.segmentIndex / Math.max(1, M - 1)); // 归一化到 [0, 1]
      v.push(p.positionRatio);
      v.push(p.activity);
      v.push(p.doseRatio / 10); // 归一化到 [0, 1]
    }
    return v;
  }

  // 将向量解包为 DosingPoint[]，钳位到合法范围
  function unpack(v: number[]): DosingPoint[] {
    const pts: DosingPoint[] = [];
    const used = new Set<string>();
    for (let i = 0; i < N; i++) {
      const base = i * 4;
      const segIdx = clamp(Math.round(v[base] * (M - 1)), 0, M - 1);
      let positionRatio = clamp(v[base + 1], 0, 1);
      let key = dosingKey({ segmentIndex: segIdx, positionRatio });
      let guard = 0;
      while (used.has(key) && guard < 8) {
        positionRatio = clamp(positionRatio + 0.037 * (guard + 1), 0, 1);
        key = dosingKey({ segmentIndex: segIdx, positionRatio });
        guard++;
      }
      used.add(key);
      pts.push({
        segmentIndex: segIdx,
        positionRatio,
        activity: clamp(v[base + 2], 0.01, 1),
        doseRatio: clamp(v[base + 3] * 10, 0.01, 10),
      });
    }
    return pts;
  }

  function objVec(v: number[]): number {
    const pts = unpack(v);
    if (hasDuplicatePosition(pts)) return 1e3;
    const r = evaluate(params, pts);
    return r.segmentOutConcentrations.slice(-1)[0] ?? 1;
  }

  // 自适应 Nelder-Mead 常量（Gao-Han 风格），高维多投药点时收缩更稳。
  const alpha = 1.0; // 反射
  const gamma = 1 + 2 / dim; // 扩张
  const rho = 0.75 - 0.5 / dim; // 收缩
  const sigma = 1 - 1 / dim; // 缩小

  // 初始化单纯形：dim+1 个顶点
  const vertices: number[][] = [];
  vertices.push(pack(initial));
  for (let i = 0; i < dim; i++) {
    const v = pack(initial);
    // 在维度 i 上加一个小扰动
    v[i] = clamp(v[i] + 0.08 * (i % 2 === 0 ? 1 : -1), 0, 1);
    vertices.push(v);
  }

  // 评估所有顶点
  const values: number[] = vertices.map(v => objVec(v));

  for (let iter = 0; iter < maxIter; iter++) {
    // 排序：按目标函数值升序（越小越好）
    const indices = vertices.map((_, i) => i).sort((a, b) => values[a] - values[b]);
    const sorted = indices.map(i => vertices[i]);
    const sortedVals = indices.map(i => values[i]);

    // 检查收敛：单纯形尺寸
    const centroid = new Array(dim).fill(0);
    for (let i = 0; i < dim; i++) {
      for (let j = 0; j < dim; j++) centroid[i] += sorted[j][i];
      centroid[i] /= dim;
    }
    let maxDist = 0;
    for (let j = 0; j < dim; j++) {
      let dist = 0;
      for (let k = 0; k < dim; k++) dist += (sorted[j][k] - centroid[k]) ** 2;
      maxDist = Math.max(maxDist, Math.sqrt(dist));
    }
    if (maxDist < tolerance) break;

    // 反射
    const worst = sorted[dim];
    const reflection = new Array(dim).fill(0);
    for (let i = 0; i < dim; i++) {
      reflection[i] = centroid[i] + alpha * (centroid[i] - worst[i]);
      reflection[i] = clamp(reflection[i], 0, 1);
    }
    const rVal = objVec(reflection);

    if (rVal < sortedVals[0]) {
      // 扩张
      const expansion = new Array(dim).fill(0);
      for (let i = 0; i < dim; i++) {
        expansion[i] = centroid[i] + gamma * (reflection[i] - centroid[i]);
        expansion[i] = clamp(expansion[i], 0, 1);
      }
      const eVal = objVec(expansion);
      if (eVal < rVal) {
        vertices[indices[dim]] = expansion;
        values[indices[dim]] = eVal;
      } else {
        vertices[indices[dim]] = reflection;
        values[indices[dim]] = rVal;
      }
    } else if (rVal < sortedVals[dim - 1]) {
      vertices[indices[dim]] = reflection;
      values[indices[dim]] = rVal;
    } else {
      // 收缩
      const contract = new Array(dim).fill(0);
      for (let i = 0; i < dim; i++) {
        contract[i] = centroid[i] + rho * (worst[i] - centroid[i]);
        contract[i] = clamp(contract[i], 0, 1);
      }
      const cVal = objVec(contract);
      if (cVal < sortedVals[dim]) {
        vertices[indices[dim]] = contract;
        values[indices[dim]] = cVal;
      } else {
        // 缩小整个单纯形
        const best = sorted[0];
        for (let j = 1; j <= dim; j++) {
          for (let k = 0; k < dim; k++) {
            vertices[indices[j]][k] = best[k] + sigma * (vertices[indices[j]][k] - best[k]);
            vertices[indices[j]][k] = clamp(vertices[indices[j]][k], 0, 1);
          }
          values[indices[j]] = objVec(vertices[indices[j]]);
        }
      }
    }
  }

  // 返回最佳顶点
  const bestIdx = values.indexOf(Math.min(...values));
  return unpack(vertices[bestIdx]);
}

// ═══════════════════════════════════════════════════════════════
//  主函数：构建帕累托前沿
// ═══════════════════════════════════════════════════════════════


export function optimizeDosing(request: OptimizationRequest): OptimizationResult {
  const { params, maxDosingPoints, positionGridSize } = request;
  const pollutantType = params.pollutantType ?? 'organic_macromolecule';

  // 基线：无催化剂
  const baseResult = evaluate(params, []);
  const baselineConcentration = baseResult.segmentOutConcentrations.slice(-1)[0] ?? 1;
  const baseAssessment = classifyWaterQuality(pollutantType, baselineConcentration);

  const paretoFrontier: ParetoPoint[] = [];
  let prevBest: DosingPoint[] = [];

  for (let N = 1; N <= maxDosingPoints; N++) {
    const tN0 = performance.now();

    // a. 网格搜索第 N 个最优增量点
    const newPoint = gridSearchBestNewPoint(params, prevBest, positionGridSize);

    // b. Nelder-Mead 精修全部 N 个点
    const combined = [...prevBest, newPoint];
    const refined = nelderMeadRefine(params, combined);

    // c. 评估
    const result = evaluate(params, refined);
    const finalConc = result.segmentOutConcentrations.slice(-1)[0] ?? 1;
    const assessment = classifyWaterQuality(pollutantType, finalConc);

    paretoFrontier.push({
      dosingCount: N,
      finalConcentration: finalConc,
      dosingPoints: refined.map(p => ({ ...p })),
      classIMet: assessment.classIMet,
      waterQualityClass: assessment.class,
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
      classIMet: baseAssessment.classIMet,
      waterQualityClass: baseAssessment.class,
      computeTimeMs: 0,
    };
  }

  return {
    paretoFrontier,
    optimal,
    baselineConcentration,
  };
}
