/**
 * GB3838-2002 水质分类引擎
 * 支持 6 个等级 x 6 种污染物的多级评估 + 反向投药计算
 */

import { simulatePurification, type SimulationParamsV3, type PollutantType, type BuiltInPollutantType } from './simulation';

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

export interface SegmentWaterQualityAssessment extends WaterQualityAssessment {
  segmentIndex: number;
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

export const CLASS_THRESHOLDS: Record<BuiltInPollutantType | 'custom', Record<WaterQualityClass, number>> = {
  organic_macromolecule:   { I: 0.10, II: 0.25, III: 0.40, IV: 0.60, V: 0.80, '劣V': Infinity },
  sediment_algae:          { I: 0.10, II: 0.20, III: 0.35, IV: 0.50, V: 0.70, '劣V': Infinity },
  heavy_metal:             { I: 0.05, II: 0.10, III: 0.25, IV: 0.40, V: 0.60, '劣V': Infinity },
  petroleum_hydrocarbon:   { I: 0.05, II: 0.15, III: 0.30, IV: 0.50, V: 0.70, '劣V': Infinity },
  nutrient_runoff:         { I: 0.10, II: 0.20, III: 0.35, IV: 0.50, V: 0.70, '劣V': Infinity },
  microplastic:            { I: 0.01, II: 0.05, III: 0.15, IV: 0.30, V: 0.50, '劣V': Infinity },
  custom:                  { I: 0.10, II: 0.22, III: 0.36, IV: 0.55, V: 0.75, '劣V': Infinity },
};

const CLASS_ORDER: WaterQualityClass[] = ['I', 'II', 'III', 'IV', 'V', '劣V'];

function thresholdsFor(pollutantType: PollutantType): Record<WaterQualityClass, number> {
  return CLASS_THRESHOLDS[pollutantType as BuiltInPollutantType] ?? CLASS_THRESHOLDS.custom;
}

// ═══════════════════════════════════════════════════════════════
//  Feature A: 正向分类
// ═══════════════════════════════════════════════════════════════

export function classifyWaterQuality(
  pollutantType: PollutantType,
  residualRatio: number,
): WaterQualityAssessment {
  const thresholds = thresholdsFor(pollutantType);
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

export function assessSegmentWaterQuality(
  pollutantType: PollutantType,
  segmentOutConcentrations: number[],
): SegmentWaterQualityAssessment[] {
  return segmentOutConcentrations.map((residualRatio, segmentIndex) => ({
    segmentIndex,
    ...classifyWaterQuality(pollutantType, residualRatio),
  }));
}

export function calculateWQI(
  pollutantType: PollutantType,
  segmentOutConcentrations: number[],
  segmentOutNtu: number[] = [],
): number {
  if (segmentOutConcentrations.length === 0) return 100;
  const assessments = assessSegmentWaterQuality(pollutantType, segmentOutConcentrations);
  const classScores: Record<WaterQualityClass, number> = {
    I: 100,
    II: 84,
    III: 68,
    IV: 50,
    V: 32,
    '劣V': 12,
  };
  const weighted = assessments.reduce((sum, item, idx) => {
    const downstreamWeight = 1 + idx / Math.max(1, assessments.length - 1);
    const thresholds = thresholdsFor(pollutantType);
    const threshold = thresholds[item.class] || thresholds.V;
    const residualPenalty = Math.min(35, (item.residualRatio / Math.max(0.001, threshold)) * 8);
    const ntuPenalty = Math.min(12, Math.max(0, ((segmentOutNtu[idx] ?? 0) - 15) * 0.18));
    return sum + Math.max(0, classScores[item.class] - residualPenalty - ntuPenalty) * downstreamWeight;
  }, 0);
  const weightTotal = assessments.reduce(
    (sum, _item, idx) => sum + 1 + idx / Math.max(1, assessments.length - 1),
    0,
  );
  return Math.round(Math.max(0, Math.min(100, weighted / weightTotal)));
}

// ═══════════════════════════════════════════════════════════════
//  Feature B: 反向投药计算（二分搜索）
// ═══════════════════════════════════════════════════════════════

export function calculateRequiredDose(request: CalculateDoseRequest): CalculateDoseResult {
  const { params, targetClass } = request;
  const pollutantType = params.pollutantType ?? 'organic_macromolecule';
  const targetThreshold = thresholdsFor(pollutantType)[targetClass];

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
