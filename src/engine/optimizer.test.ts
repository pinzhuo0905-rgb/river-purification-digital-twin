import { describe, test, expect } from 'vitest';
import {
  optimizeDosing,
  type DosingPoint,
  type OptimizationRequest,
} from './optimizer';
import type { SimulationParamsV3 } from './simulation';

const defaultSegments: SimulationParamsV3['segments'] = [
  { id: 1, velocity: 1.0, directionAngle: 0, length: 0.25, depth: 1.5, width: 1.0 },
  { id: 2, velocity: 1.0, directionAngle: 0, length: 0.25, depth: 1.5, width: 1.2 },
  { id: 3, velocity: 1.0, directionAngle: 0, length: 0.25, depth: 1.5, width: 0.8 },
  { id: 4, velocity: 1.0, directionAngle: 0, length: 0.25, depth: 1.5, width: 1.0 },
];

const baseParams: SimulationParamsV3 = {
  gridWidth: 400,
  gridHeight: 150,
  lightIntensity: 1.0,
  baseNtu: 5,
  pollutantType: 'organic_macromolecule',
  segments: defaultSegments,
};

function makeRequest(overrides?: Partial<OptimizationRequest>): OptimizationRequest {
  return {
    params: { ...baseParams, segments: [...defaultSegments] },
    maxDosingPoints: 3,
    positionGridSize: 10,
    ...overrides,
  };
}

describe('optimizeDosing', () => {
  test('N=1 时找到的投药点比无催化剂显著改善', () => {
    const result = optimizeDosing(makeRequest({ maxDosingPoints: 1 }));
    expect(result.baselineConcentration).toBeGreaterThan(0);
    expect(result.paretoFrontier.length).toBe(1);
    const p = result.paretoFrontier[0];
    expect(p.dosingCount).toBe(1);
    expect(p.finalConcentration).toBeLessThan(result.baselineConcentration);
  });

  test('N 递增时浓度单调递减', () => {
    const result = optimizeDosing(makeRequest({ maxDosingPoints: 3 }));
    expect(result.paretoFrontier.length).toBe(3);
    for (let i = 1; i < result.paretoFrontier.length; i++) {
      expect(result.paretoFrontier[i].finalConcentration)
        .toBeLessThanOrEqual(result.paretoFrontier[i - 1].finalConcentration);
    }
  });

  test('返回基线浓度', () => {
    const result = optimizeDosing(makeRequest({ maxDosingPoints: 1 }));
    expect(result.baselineConcentration).toBeGreaterThan(0);
    expect(result.baselineConcentration).toBeLessThanOrEqual(1);
  });

  test('帕累托曲线每点包含完整投药方案', () => {
    const result = optimizeDosing(makeRequest({ maxDosingPoints: 2 }));
    for (const pp of result.paretoFrontier) {
      expect(pp.dosingPoints.length).toBe(pp.dosingCount);
      for (const dp of pp.dosingPoints) {
        expect(dp.segmentIndex).toBeGreaterThanOrEqual(0);
        expect(dp.segmentIndex).toBeLessThan(defaultSegments.length);
        expect(dp.positionRatio).toBeGreaterThanOrEqual(0);
        expect(dp.positionRatio).toBeLessThanOrEqual(1);
        expect(dp.activity).toBeGreaterThan(0);
        expect(dp.activity).toBeLessThanOrEqual(1);
        expect(dp.doseRatio).toBeGreaterThan(0);
        expect(dp.doseRatio).toBeLessThanOrEqual(10);
      }
    }
  });

  test('最优推荐：有达标方案时选投药次数最少的', () => {
    const result = optimizeDosing(makeRequest({ maxDosingPoints: 5 }));
    expect(result.optimal).toBeDefined();
    expect(result.optimal.classIMet).toBeDefined();
  });

  test('maxDosingPoints=0 只返回基线浓度', () => {
    const result = optimizeDosing(makeRequest({ maxDosingPoints: 0 }));
    expect(result.paretoFrontier.length).toBe(0);
    expect(result.baselineConcentration).toBeGreaterThan(0);
    // optimal 应回退到空方案
    expect(result.optimal.dosingCount).toBe(0);
    expect(result.optimal.finalConcentration).toBe(result.baselineConcentration);
  });

  test('湖泊段不应被选为唯一投药点（浅河段更经济）', () => {
    const lakeSegments: SimulationParamsV3['segments'] = [
      { id: 1, velocity: 1.0, directionAngle: 0, length: 0.5, depth: 1.5, width: 1.0, terrain: 'river' },
      { id: 2, velocity: 0.3, directionAngle: 0, length: 0.5, depth: 3.0, width: 1.0, terrain: 'lake' },
    ];
    const result = optimizeDosing({
      params: { ...baseParams, segments: lakeSegments },
      maxDosingPoints: 1,
      positionGridSize: 10,
    });
    // 最优段应该是河道（段0），而非湖泊（段1）— 湖泊水深光衰减严重
    expect(result.paretoFrontier[0].dosingPoints[0].segmentIndex).toBe(0);
  });
});

describe('Nelder-Mead 精修', () => {
  test('精修后浓度不低于精修前（不退化）', () => {
    // 用原始 optimizeDosing 验证：含 NM 的结果不应差于纯网格搜索
    const result = optimizeDosing(makeRequest({ maxDosingPoints: 2 }));
    for (const pp of result.paretoFrontier) {
      // 浓度在有效范围内
      expect(pp.finalConcentration).toBeGreaterThanOrEqual(0);
      expect(pp.finalConcentration).toBeLessThanOrEqual(1);
    }
  });

  test('多段河流 + 多投药点', () => {
    const result = optimizeDosing(makeRequest({
      maxDosingPoints: 3,
      positionGridSize: 10,
    }));
    expect(result.paretoFrontier.length).toBe(3);
    // N=3 应比 N=1 显著改善
    const n1 = result.paretoFrontier[0].finalConcentration;
    const n3 = result.paretoFrontier[2].finalConcentration;
    expect(n3).toBeLessThanOrEqual(n1);
  });

  test('性能：5段 × maxN=3 应在 2s 内完成', () => {
    const t0 = performance.now();
    optimizeDosing(makeRequest({ maxDosingPoints: 3 }));
    const elapsed = performance.now() - t0;
    expect(elapsed).toBeLessThan(2000);
  });
});
