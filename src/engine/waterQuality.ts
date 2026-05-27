/**
 * GB3838-2002 水质分类引擎
 * 支持 6 个等级 x 6 种污染物的多级评估 + 反向投药计算
 */

import { simulatePurification, type SimulationParamsV3, type PollutantType } from './simulation';

// ═══════════════════════════════════════════════════════════════
//  类型
// ═══════════════════════════════════════════════════════════════

export type WaterQualityClass = 'I' | 'II' | 'III' | 'IV' | 'V' | '劣V';

export interface WaterQualityAssessment {
  class: WaterQualityClass;
  classIMet: boolean;
  residualRatio: number;
  classThreshold: number;
}

export interface CalculateDoseRequest {
  params: SimulationParamsV3;
  targetClass: WaterQualityClass;
}

export interface CalculateDoseResult {
  requiredDoseRatio: number;
  finalConcentration: number;
  classIMet: boolean;
  iterations: number;
  found: boolean;
}

// ═══════════════════════════════════════════════════════════════
//  阈值矩阵（GB3838-2002 归一化残余比率）
// ═══════════════════════════════════════════════════════════════

export const CLASS_THRESHOLDS: Record<PollutantType, Record<WaterQualityClass, number>> = {
  organic_macromolecule:   { I: 0.10, II: 0.25, III: 0.40, IV: 0.60, V: 0.80, '劣V': Infinity },
  sediment_algae:          { I: 0.10, II: 0.20, III: 0.35, IV: 0.50, V: 0.70, '劣V': Infinity },
  heavy_metal:             { I: 0.05, II: 0.10, III: 0.25, IV: 0.40, V: 0.60, '劣V': Infinity },
  petroleum_hydrocarbon:   { I: 0.05, II: 0.15, III: 0.30, IV: 0.50, V: 0.70, '劣V': Infinity },
  nutrient_runoff:         { I: 0.10, II: 0.20, III: 0.35, IV: 0.50, V: 0.70, '劣V': Infinity },
  microplastic:            { I: 0.01, II: 0.05, III: 0.15, IV: 0.30, V: 0.50, '劣V': Infinity },
};

const CLASS_ORDER: WaterQualityClass[] = ['I', 'II', 'III', 'IV', 'V', '劣V'];

// ═══════════════════════════════════════════════════════════════
//  Feature A: 正向分类
// ═══════════════════════════════════════════════════════════════

export function classifyWaterQuality(
  pollutantType: PollutantType,
  residualRatio: number,
): WaterQualityAssessment {
  const thresholds = CLASS_THRESHOLDS[pollutantType];
  let cls: WaterQualityClass = 'I';
  for (const c of CLASS_ORDER) {
    if (residualRatio <= thresholds[c]) {
      cls = c;
      break;
    }
  }
  const classThreshold = cls === '劣V' ? thresholds.V : thresholds[cls];
  return {
    class: cls,
    classIMet: cls === 'I',
    residualRatio,
    classThreshold,
  };
}

// ═══════════════════════════════════════════════════════════════
//  Feature B: 反向投药计算（二分搜索）
// ═══════════════════════════════════════════════════════════════

export function calculateRequiredDose(request: CalculateDoseRequest): CalculateDoseResult {
  const { params, targetClass } = request;
  const targetThreshold = CLASS_THRESHOLDS[params.pollutantType][targetClass];

  const baseResult = simulatePurification({ ...params, catalystPlacements: [] });
  const baseConc = baseResult.segmentOutConcentrations.slice(-1)[0] ?? 1;
  if (baseConc <= targetThreshold) {
    return {
      requiredDoseRatio: 0,
      finalConcentration: baseConc,
      classIMet: true,
      iterations: 0,
      found: true,
    };
  }

  let lo = 0.01;
  let hi = 10.0;
  let iterations = 0;
  let bestDose = hi;
  let bestConc = 1;

  while (iterations < 30 && hi - lo > 0.01) {
    iterations++;
    const mid = (lo + hi) / 2;
    const result = simulatePurification({
      ...params,
      catalystPlacements: [{ segmentIndex: 0, activity: 0.8, doseRatio: mid }],
    });
    const finalConc = result.segmentOutConcentrations.slice(-1)[0] ?? 1;
    if (finalConc <= targetThreshold) {
      bestDose = mid;
      bestConc = finalConc;
      hi = mid;
    } else {
      lo = mid;
    }
  }

  const found = bestConc <= targetThreshold;
  return {
    requiredDoseRatio: Math.round(bestDose * 100) / 100,
    finalConcentration: bestConc,
    classIMet: found,
    iterations,
    found,
  };
}
