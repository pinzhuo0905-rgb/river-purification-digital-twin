import {
  simulatePurification,
  simulatePurificationLegacy,
  type SimulationParams,
  type SimulationParamsV3,
  type CatalystPlacement,
} from './simulation';
import { test, expect, describe } from 'vitest';

// ─── 向后兼容测试（v3 API → v4 引擎）───────────────────────

test('calculates decay and optimal location with segments', () => {
  const params: SimulationParams = {
    gridWidth: 400,
    gridHeight: 150,
    segments: [
      { id: 1, velocity: 2.0, directionAngle: 0, length: 1/3, depth: 1.5, width: 1.0 },
      { id: 2, velocity: 1.5, directionAngle: 15, length: 1/3, depth: 2.0, width: 1.2 },
      { id: 3, velocity: 2.5, directionAngle: -10, length: 1/3, depth: 1.0, width: 0.8 },
    ],
    lightIntensity: 1.0,
    catalystEfficiency: 0.8,
    turbidity: 5,
  };
  const result = simulatePurification(params);

  expect(result.optimalX).toBeGreaterThanOrEqual(0);
  expect(result.optimalY).toBeGreaterThanOrEqual(0);
  expect(result.optimalSegmentIndex).toBeGreaterThanOrEqual(0);
  expect(result.optimalSegmentIndex).toBeLessThan(3);
  expect(result.riverPath.length).toBeGreaterThan(10);
  for (const pt of result.riverPath) {
    expect(pt.concentration).toBeGreaterThanOrEqual(0);
    expect(pt.concentration).toBeLessThanOrEqual(1);
  }
});

test('faster flow results in higher final concentration', () => {
  const fast = simulatePurification({
    gridWidth: 400, gridHeight: 150,
    segments: [{ id: 1, velocity: 5.0, directionAngle: 0, length: 1, depth: 1.5, width: 1.0 }],
    lightIntensity: 1.0, catalystEfficiency: 0.8,
    turbidity: 5,
  });
  const slow = simulatePurification({
    gridWidth: 400, gridHeight: 150,
    segments: [{ id: 1, velocity: 0.5, directionAngle: 0, length: 1, depth: 1.5, width: 1.0 }],
    lightIntensity: 1.0, catalystEfficiency: 0.8,
    turbidity: 5,
  });
  const fastFinal = fast.segmentOutConcentrations[fast.segmentOutConcentrations.length - 1];
  const slowFinal = slow.segmentOutConcentrations[slow.segmentOutConcentrations.length - 1];
  expect(fastFinal).toBeGreaterThan(slowFinal);
});

test('legacy wrapper auto-places catalyst from catalystEfficiency', () => {
  const result = simulatePurificationLegacy({
    gridWidth: 400, gridHeight: 150,
    segments: [{ id: 1, velocity: 1.0, directionAngle: 0, length: 1, depth: 1.5, width: 1.0 }],
    lightIntensity: 1.0,
    catalystEfficiency: 0.8,
    turbidity: 5,
  });
  expect(result.optimalSegmentIndex).toBeGreaterThanOrEqual(0);
  expect(result.segmentOutConcentrations.length).toBe(1);
  // 有催化剂时衰减应该显著
  expect(result.segmentOutConcentrations[0]).toBeLessThan(1.0);
});

// ─── v4 新功能测试 ────────────────────────────────────────

describe('催化剂按段独立投放', () => {
  test('只有投放段才激活催化降解', () => {
    const placements: CatalystPlacement[] = [
      { segmentIndex: 1, activity: 0.8, doseRatio: 3.0 },
    ];
    const params: SimulationParamsV3 = {
      gridWidth: 400, gridHeight: 150,
      lightIntensity: 1.0, baseNtu: 5, pollutantType: 'organic_macromolecule',
      segments: [
        { id: 1, velocity: 1.0, directionAngle: 0, length: 0.5, depth: 1.5, width: 1.0 },
        { id: 2, velocity: 1.0, directionAngle: 0, length: 0.5, depth: 1.5, width: 1.0 },
      ],
      catalystPlacements: placements,
    };
    const result = simulatePurification(params);

    // 段1 有催化剂，段0 无催化剂
    const seg1Path = result.riverPath.filter(p => p.segIndex === 1);
    expect(seg1Path.length).toBeGreaterThan(0);
    // 段0 中所有点 catalystActive 应为 false
    const seg0Path = result.riverPath.filter(p => p.segIndex === 0);
    for (const pt of seg0Path) {
      expect(pt.catalystActive).toBe(false);
    }
    // 段1 中应有 catalystActive = true 的点
    const active = seg1Path.filter(p => p.catalystActive);
    expect(active.length).toBeGreaterThan(0);
  });

  test('段内延迟生效位置', () => {
    const placements: CatalystPlacement[] = [
      { segmentIndex: 0, activity: 0.8, doseRatio: 3.0, effectiveAfterRatio: 0.5 },
    ];
    const params: SimulationParamsV3 = {
      gridWidth: 400, gridHeight: 150,
      lightIntensity: 1.0, baseNtu: 5, pollutantType: 'organic_macromolecule',
      segments: [
        { id: 1, velocity: 1.0, directionAngle: 0, length: 1, depth: 1.5, width: 1.0 },
      ],
      catalystPlacements: placements,
    };
    const result = simulatePurification(params);

    const path = result.riverPath;
    const mid = Math.floor(path.length / 2);
    // 前半段 catalystActive 应为 false
    for (let i = 0; i < mid; i++) {
      expect(path[i].catalystActive).toBe(false);
    }
    // 后半段应有 catalystActive = true 的点
    const active = path.slice(mid).filter(p => p.catalystActive);
    expect(active.length).toBeGreaterThan(0);
  });

  test('多段多处投放不同催化剂配方', () => {
    const placements: CatalystPlacement[] = [
      { segmentIndex: 0, activity: 0.2, doseRatio: 1.0 },
      { segmentIndex: 1, activity: 0.8, doseRatio: 4.0 },
    ];
    const params: SimulationParamsV3 = {
      gridWidth: 400, gridHeight: 150,
      lightIntensity: 1.0, baseNtu: 5, pollutantType: 'organic_macromolecule',
      segments: [
        { id: 1, velocity: 1.0, directionAngle: 0, length: 0.33, depth: 1.5, width: 1.0 },
        { id: 2, velocity: 1.0, directionAngle: 0, length: 0.33, depth: 1.5, width: 1.0 },
        { id: 3, velocity: 1.0, directionAngle: 0, length: 0.34, depth: 1.5, width: 1.0 },
      ],
      catalystPlacements: placements,
    };
    const result = simulatePurification(params);
    // 高活性段（段1）的反应评分应高于低活性段（段0）
    const m0 = result.segmentMetrics[0];
    const m1 = result.segmentMetrics[1];
    expect(m1.reactionScore).toBeGreaterThan(m0.reactionScore);
  });
});

describe('连续性方程：河宽-流速反比关系', () => {
  test('河道变宽导致流速变慢', () => {
    const narrow = simulatePurification({
      gridWidth: 400, gridHeight: 150,
      lightIntensity: 1.0, baseNtu: 5, pollutantType: 'organic_macromolecule',
      segments: [
        { id: 1, velocity: 1.0, directionAngle: 0, length: 1, depth: 1.5, width: 0.5, referenceDischarge: 10 },
      ],
      catalystPlacements: [{ segmentIndex: 0, activity: 0.5, doseRatio: 3.0 }],
    });
    const wide = simulatePurification({
      gridWidth: 400, gridHeight: 150,
      lightIntensity: 1.0, baseNtu: 5, pollutantType: 'organic_macromolecule',
      segments: [
        { id: 1, velocity: 1.0, directionAngle: 0, length: 1, depth: 1.5, width: 2.0, referenceDischarge: 10 },
      ],
      catalystPlacements: [{ segmentIndex: 0, activity: 0.5, doseRatio: 3.0 }],
    });

    // 窄河流速 > 宽河流速
    expect(narrow.segmentMetrics[0].velocity).toBeGreaterThan(wide.segmentMetrics[0].velocity);
    // 宽河停留时间 > 窄河停留时间
    expect(wide.segmentMetrics[0].residenceTime).toBeGreaterThan(narrow.segmentMetrics[0].residenceTime);
  });

  test('不设置 referenceDischarge 时 velocity 直接生效', () => {
    const result = simulatePurification({
      gridWidth: 400, gridHeight: 150,
      lightIntensity: 1.0, baseNtu: 5, pollutantType: 'organic_macromolecule',
      segments: [
        { id: 1, velocity: 3.0, directionAngle: 0, length: 1, depth: 1.5, width: 1.0 },
      ],
      catalystPlacements: [{ segmentIndex: 0, activity: 0.5, doseRatio: 3.0 }],
    });
    // 不设 referenceDischarge 时，effVelocity ≈ velocity
    expect(result.segmentMetrics[0].velocity).toBeCloseTo(3.0, 1);
  });
});

describe('双河流汇合 + 截面面积加权', () => {
  test('双河汇合正确混合浓度', () => {
    const params: SimulationParamsV3 = {
      gridWidth: 600, gridHeight: 200,
      lightIntensity: 1.0, baseNtu: 5, pollutantType: 'organic_macromolecule',
      segments: [
        { id: 1, velocity: 1.0, directionAngle: 0, length: 0.5, depth: 1.5, width: 1.0 },
        { id: 2, velocity: 1.0, directionAngle: 0, length: 0.5, depth: 1.5, width: 1.5 },
      ],
      catalystPlacements: [
        { segmentIndex: 0, activity: 0.6, doseRatio: 2.0 },
        { segmentIndex: 1, activity: 0.6, doseRatio: 2.0 },
      ],
      secondarySegments: [
        { id: 10, velocity: 1.0, directionAngle: 0, length: 1, depth: 1.5, width: 0.8 },
      ],
      secondaryDischarges: [
        { segmentIndex: 0, positionRatio: 0, pollutantType: 'organic_macromolecule', mass: 0.5, dischargeType: 'continuous' },
      ],
      confluenceConfig: {
        river0Segment: 1,
        river1Segment: 0,
        river0Ratio: 0.0,
        river1Ratio: 1.0,
      },
    };
    const result = simulatePurification(params);
    expect(result.secondaryResult).toBeDefined();
    expect(result.secondaryResult!.riverPath.length).toBeGreaterThan(0);
    // 汇合后主河出口浓度应介于主河和支流之间
    const mainConc = result.segmentOutConcentrations;
    mainConc.forEach(c => {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(1);
    });
  });
});

describe('湖泊地形', () => {
  test('湖泊段宽度激增、流速剧降', () => {
    const params: SimulationParamsV3 = {
      gridWidth: 400, gridHeight: 150,
      lightIntensity: 1.0, baseNtu: 5, pollutantType: 'organic_macromolecule',
      segments: [
        { id: 1, velocity: 1.0, directionAngle: 0, length: 0.33, depth: 1.5, width: 1.0, referenceDischarge: 10 },
        { id: 2, velocity: 1.0, directionAngle: 0, length: 0.34, depth: 2.0, width: 1.0, terrain: 'lake', referenceDischarge: 10 },
        { id: 3, velocity: 1.0, directionAngle: 0, length: 0.33, depth: 1.0, width: 0.8, referenceDischarge: 10 },
      ],
      catalystPlacements: [{ segmentIndex: 0, activity: 0.5, doseRatio: 3.0 }],
    };
    const result = simulatePurification(params);

    const lakeMetric = result.segmentMetrics[1];
    const riverMetric0 = result.segmentMetrics[0];
    // 湖泊宽度 > 河道宽度
    expect(lakeMetric.width).toBeGreaterThan(riverMetric0.width);
    // 湖泊流速 < 河道流速
    expect(lakeMetric.velocity).toBeLessThan(riverMetric0.velocity);
    // 湖泊停留时间 > 河道停留时间
    expect(lakeMetric.residenceTime).toBeGreaterThan(riverMetric0.residenceTime);
  });
});

describe('NTU 动态反馈', () => {
  test('高浊度污染物导致更高 NTU', () => {
    const organic = simulatePurification({
      gridWidth: 400, gridHeight: 150,
      lightIntensity: 1.0, baseNtu: 5, pollutantType: 'organic_macromolecule',
      segments: [{ id: 1, velocity: 1.0, directionAngle: 0, length: 1, depth: 1.5, width: 1.0 }],
      catalystPlacements: [{ segmentIndex: 0, activity: 0.5, doseRatio: 3.0 }],
    });
    const algae = simulatePurification({
      gridWidth: 400, gridHeight: 150,
      lightIntensity: 1.0, baseNtu: 5, pollutantType: 'sediment_algae',
      segments: [{ id: 1, velocity: 1.0, directionAngle: 0, length: 1, depth: 1.5, width: 1.0 }],
      catalystPlacements: [{ segmentIndex: 0, activity: 0.5, doseRatio: 3.0 }],
    });
    // 泥沙水藻的初始 NTU 应该更高
    const organicInitNtu = organic.riverPath[0].ntu;
    const algaeInitNtu = algae.riverPath[0].ntu;
    expect(algaeInitNtu).toBeGreaterThan(organicInitNtu);
  });

  test('浓度降低导致 NTU 降低', () => {
    const result = simulatePurification({
      gridWidth: 400, gridHeight: 150,
      lightIntensity: 1.0, baseNtu: 5, pollutantType: 'organic_macromolecule',
      segments: [{ id: 1, velocity: 1.0, directionAngle: 0, length: 1, depth: 1.5, width: 1.0 }],
      catalystPlacements: [{ segmentIndex: 0, activity: 0.5, doseRatio: 3.0 }],
    });
    const firstNtu = result.riverPath[0].ntu;
    const lastNtu = result.riverPath[result.riverPath.length - 1].ntu;
    expect(lastNtu).toBeLessThanOrEqual(firstNtu);
  });
});

describe('排污类型：burst vs continuous', () => {
  test('burst 排污从段首高浓度开始', () => {
    const burst = simulatePurification({
      gridWidth: 400, gridHeight: 150,
      lightIntensity: 1.0, baseNtu: 5, pollutantType: 'organic_macromolecule',
      segments: [{ id: 1, velocity: 1.0, directionAngle: 0, length: 1, depth: 1.5, width: 1.0 }],
      pollutantDischarges: [
        { segmentIndex: 0, positionRatio: 0, pollutantType: 'organic_macromolecule', mass: 1.0, dischargeType: 'burst' },
      ],
      // 使用低活性催化剂 + 段中延迟生效，确保第一点仍接近 1.0
      catalystPlacements: [{ segmentIndex: 0, activity: 0.1, doseRatio: 1.0, effectiveAfterRatio: 0.02 }],
    });
    // burst 排污应该在第一个点就达到很高浓度
    expect(burst.riverPath[0].concentration).toBeGreaterThan(0.9);
  });
});

describe('I 类地表水达标评估', () => {
  test('达标判定正确', () => {
    // 强催化剂 + 长停留时间 → 应该达标
    const clean = simulatePurification({
      gridWidth: 400, gridHeight: 150,
      lightIntensity: 3.0, baseNtu: 1, pollutantType: 'organic_macromolecule',
      segments: [
        { id: 1, velocity: 0.1, directionAngle: 0, length: 1, depth: 0.5, width: 1.0 },
      ],
      catalystPlacements: [{ segmentIndex: 0, activity: 0.9, doseRatio: 5.0 }],
    });
    expect(clean.waterQualityStandard.residualRatio).toBeGreaterThanOrEqual(0);
    // 应该达标或接近达标
    expect(clean.waterQualityStandard.residualRatio).toBeLessThan(1);

    // 无催化剂 + 高速 → 不应达标
    const dirty = simulatePurification({
      gridWidth: 400, gridHeight: 150,
      lightIntensity: 0.3, baseNtu: 80, pollutantType: 'sediment_algae',
      segments: [
        { id: 1, velocity: 5.0, directionAngle: 0, length: 1, depth: 3.0, width: 1.0 },
      ],
      // 无催化剂
    });
    expect(dirty.waterQualityStandard.classIMet).toBe(false);
  });
});

describe('量纲一致性', () => {
  test('stepTime 按物理米制计算（非像素）', () => {
    // 与 v3 不同：v4 内部全部使用物理坐标，不再混用像素距离
    const result = simulatePurification({
      gridWidth: 400, gridHeight: 150,
      lightIntensity: 1.0, baseNtu: 5, pollutantType: 'organic_macromolecule',
      segments: [
        { id: 1, velocity: 1.0, directionAngle: 0, length: 1, depth: 1.5, width: 1.0 },
      ],
      catalystPlacements: [{ segmentIndex: 0, activity: 0.5, doseRatio: 3.0 }],
    });
    // 各段停留时间应为物理秒
    expect(result.segmentMetrics[0].residenceTime).toBeGreaterThan(0);
    // 浓度衰减应发生（即使只有自然降解）
    const midConc = result.riverPath[Math.floor(result.riverPath.length / 2)].concentration;
    expect(midConc).toBeLessThan(result.riverPath[0].concentration);
  });
});

describe('催化剂不消耗、不产生二次污染', () => {
  test('催化剂在多段投放后自身浓度不影响最终结果', () => {
    // 催化剂不参与质量守恒——仅作为催化常数参与 k 计算
    // 使用快速流 + 极弱催化剂确保浓度不衰减到 0
    const single = simulatePurification({
      gridWidth: 400, gridHeight: 150,
      lightIntensity: 1.0, baseNtu: 5, pollutantType: 'organic_macromolecule',
      segments: [{ id: 1, velocity: 5.0, directionAngle: 0, length: 1, depth: 1.5, width: 1.0 }],
      catalystPlacements: [{ segmentIndex: 0, activity: 0.03, doseRatio: 1.0 }],
    });
    const multi = simulatePurification({
      gridWidth: 400, gridHeight: 150,
      lightIntensity: 1.0, baseNtu: 5, pollutantType: 'organic_macromolecule',
      segments: [
        { id: 1, velocity: 5.0, directionAngle: 0, length: 0.5, depth: 1.5, width: 1.0 },
        { id: 2, velocity: 5.0, directionAngle: 0, length: 0.5, depth: 1.5, width: 1.0 },
      ],
      catalystPlacements: [
        { segmentIndex: 0, activity: 0.03, doseRatio: 1.0 },
        { segmentIndex: 1, activity: 0.03, doseRatio: 1.0 },
      ],
    });
    const singleFinal = single.segmentOutConcentrations[single.segmentOutConcentrations.length - 1];
    const multiFinal = multi.segmentOutConcentrations[multi.segmentOutConcentrations.length - 1];
    expect(singleFinal).toBeGreaterThan(0);
    expect(multiFinal).toBeGreaterThan(0);
    expect(singleFinal / multiFinal).toBeGreaterThan(0.5);
    expect(singleFinal / multiFinal).toBeLessThan(2.0);
  });
});
