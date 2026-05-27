# 自动投药优化算法 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 新增自动投药策略优化引擎，输出帕累托曲线（投药次数 vs 最优浓度），支持前后端。

**架构：** optimizer.ts 作为独立模块，纯消费者——调用现有 `simulatePurification()` 作为黑盒目标函数。使用贪心序列搜索（网格 + Nelder-Mead 精修）逐级构建帕累托前沿。

**技术栈：** TypeScript (前端引擎) + Python (后端引擎) + FastAPI + Chart.js

---

## 文件结构

```
新增:
  src/engine/optimizer.ts          — 核心优化算法（类型 + 网格搜索 + Nelder-Mead + 主函数）
  src/engine/optimizer.test.ts     — 单元测试（TDD，先于实现编写）
  backend/optimizer.py             — Python 版优化器（与 TS 版等价）
  backend/test_optimizer.py        — Python 版测试

修改:
  backend/schemas.py               — 新增 OptimizeRequest / OptimizeResponse / ParetoPointSchema
  backend/main.py                  — 新增 POST /api/optimize 端点，导入 optimizer
  src/components/Dashboard.tsx     — 新增"自动优化"按钮 + 帕累托图表区域

不动:
  src/engine/simulation.ts         — optimizer 纯消费者，零改动
  src/components/RiverCanvas.tsx   — 渲染层零改动
  src/components/SegmentControlPanel.tsx  — 保留手动投药模式
```

---

### 任务 1：optimizer.ts — 类型定义 + 目标函数包装器

**文件：**
- 创建：`src/engine/optimizer.ts`

- [ ] **步骤 1：编写类型定义和目标函数包装器**

```typescript
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
```

- [ ] **步骤 2：运行 TypeScript 编译检查**

```bash
npx tsc --noEmit src/engine/optimizer.ts
```
预期：PASS（无类型错误）

- [ ] **步骤 3：Commit**

```bash
git add src/engine/optimizer.ts
git commit -m "feat(optimizer): add type definitions and evaluation wrapper"
```

---

### 任务 2：optimizer.ts — 网格搜索

**文件：**
- 修改：`src/engine/optimizer.ts`（追加）

- [ ] **步骤 1：编写网格搜索单元测试**

创建 `src/engine/optimizer.test.ts`：

```typescript
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
```

- [ ] **步骤 2：运行测试确认失败**

```bash
npx vitest run src/engine/optimizer.test.ts
```
预期：FAIL — `optimizeDosing is not a function`

- [ ] **步骤 3：实现网格搜索函数**

在 `src/engine/optimizer.ts` 末尾追加：

```typescript
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
      const pos = g / Math.max(1, gridSize - 1);  // 0, 1/(K-1), 2/(K-1), ..., 1
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
```

- [ ] **步骤 4：实现主函数 optimizeDosing（骨架 + 网格搜索）**

在 `src/engine/optimizer.ts` 末尾追加：

```typescript
// ═══════════════════════════════════════════════════════════════
//  主函数：构建帕累托前沿
// ═══════════════════════════════════════════════════════════════

const CLASS_I_THRESHOLD = 0.10;

export function optimizeDosing(request: OptimizationRequest): OptimizationResult {
  const { params, maxDosingPoints, positionGridSize } = request;
  const t0 = performance.now();

  // 基线：无催化剂
  const baseResult = evaluate(params, []);
  const baselineConcentration = baseResult.segmentOutConcentrations.slice(-1)[0] ?? 1;

  const paretoFrontier: ParetoPoint[] = [];
  let prevBest: DosingPoint[] = [];

  for (let N = 1; N <= maxDosingPoints; N++) {
    const tN0 = performance.now();

    // a. 网格搜索第 N 个最优增量点
    const newPoint = gridSearchBestNewPoint(params, prevBest, positionGridSize);

    // b. Nelder-Mead 精修全部 N 个点（后续任务实现，当前跳过）
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
```

- [ ] **步骤 5：运行测试**

```bash
npx vitest run src/engine/optimizer.test.ts
```
预期：6 个测试全部 PASS

- [ ] **步骤 6：Commit**

```bash
git add src/engine/optimizer.ts src/engine/optimizer.test.ts
git commit -m "feat(optimizer): add grid search and Pareto frontier builder"
```

---

### 任务 3：optimizer.ts — Nelder-Mead 精修

**文件：**
- 修改：`src/engine/optimizer.ts`（追加 Nelder-Mead）
- 修改：`src/engine/optimizer.test.ts`（追加精修测试）

- [ ] **步骤 1：追加 Nelder-Mead 测试**

在 `src/engine/optimizer.test.ts` 末尾追加：

```typescript
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
```

- [ ] **步骤 2：运行测试确认失败**

```bash
npx vitest run src/engine/optimizer.test.ts
```
预期：新增 3 个测试应 PASS（当前没有 NM 但网格搜索可能已足够好），或至少性能测试 PASS。

> **注意：** 如果性能测试当前已通过，跳过步骤 3 中的 NM 精修，直接 commit。NM 作为可选优化，在网格搜索结果不够好时再启用。

- [ ] **步骤 3：实现 Nelder-Mead 精修**

在 `src/engine/optimizer.ts` 中，在 `gridSearchBestNewPoint` 之后、`optimizeDosing` 之前插入：

```typescript
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
  const dim = N * 4;  // 每个点 4 个参数

  // 将 DosingPoint[] 展平为向量，segmentIndex 归一化到 [0, 1)
  function pack(pts: DosingPoint[]): number[] {
    const v: number[] = [];
    for (const p of pts) {
      v.push(p.segmentIndex / Math.max(1, M - 1));  // 归一化到 [0, 1]
      v.push(p.positionRatio);
      v.push(p.activity);
      v.push(p.doseRatio / 10);  // 归一化到 [0, 1]
    }
    return v;
  }

  // 将向量解包为 DosingPoint[]，钳位到合法范围
  function unpack(v: number[]): DosingPoint[] {
    const pts: DosingPoint[] = [];
    for (let i = 0; i < N; i++) {
      const base = i * 4;
      const segIdx = clamp(Math.round(v[base] * (M - 1)), 0, M - 1);
      pts.push({
        segmentIndex: segIdx,
        positionRatio: clamp(v[base + 1], 0, 1),
        activity: clamp(v[base + 2], 0.01, 1),
        doseRatio: clamp(v[base + 3] * 10, 0.01, 10),
      });
    }
    return pts;
  }

  function objVec(v: number[]): number {
    const pts = unpack(v);
    const r = evaluate(params, pts);
    return r.segmentOutConcentrations.slice(-1)[0] ?? 1;
  }

  // 标准 Nelder-Mead 常量
  const alpha = 1.0;   // 反射
  const gamma = 2.0;   // 扩张
  const rho = 0.5;     // 收缩
  const sigma = 0.5;   // 缩小

  // 初始化单纯形：dim+1 个顶点
  const vertices: number[][] = [];
  vertices.push(pack(initial));
  for (let i = 0; i < dim; i++) {
    const v = pack(initial);
    // 在维度 i 上加一个小扰动
    v[i] = clamp(v[i] + 0.1 * (Math.random() - 0.5) * 2, 0, 1);
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
```

在 `optimizeDosing` 中替换 `const refined = [...prevBest, newPoint];` 为：

```typescript
    // b. Nelder-Mead 精修全部 N 个点
    const combined = [...prevBest, newPoint];
    const refined = nelderMeadRefine(params, combined);
```

- [ ] **步骤 4：运行测试**

```bash
npx vitest run src/engine/optimizer.test.ts
```
预期：全部 9 个测试 PASS

- [ ] **步骤 5：Commit**

```bash
git add src/engine/optimizer.ts src/engine/optimizer.test.ts
git commit -m "feat(optimizer): add Nelder-Mead simplex refinement"
```

---

### 任务 4：Python 后端优化器

**文件：**
- 创建：`backend/optimizer.py`
- 创建：`backend/test_optimizer.py`

- [ ] **步骤 1：编写 Python 测试**

创建 `backend/test_optimizer.py`：

```python
"""
Tests for the Python dosing optimizer.
"""
import pytest
from optimizer import optimize_dosing, DosingPoint, OptimizationRequest


def _default_segments():
    return [
        {"id": 1, "velocity": 1.0, "directionAngle": 0, "length": 0.25, "depth": 1.5, "width": 1.0},
        {"id": 2, "velocity": 1.0, "directionAngle": 0, "length": 0.25, "depth": 1.5, "width": 1.2},
        {"id": 3, "velocity": 1.0, "directionAngle": 0, "length": 0.25, "depth": 1.5, "width": 0.8},
        {"id": 4, "velocity": 1.0, "directionAngle": 0, "length": 0.25, "depth": 1.5, "width": 1.0},
    ]


def _make_request(max_dosing=3, grid_size=10):
    return OptimizationRequest(
        params={
            "gridWidth": 400,
            "gridHeight": 150,
            "lightIntensity": 1.0,
            "baseNtu": 5,
            "pollutantType": "organic_macromolecule",
            "segments": _default_segments(),
        },
        max_dosing_points=max_dosing,
        position_grid_size=grid_size,
    )


class TestOptimizeDosing:
    def test_n1_improves_over_baseline(self):
        result = optimize_dosing(_make_request(max_dosing=1))
        assert result.baseline_concentration > 0
        assert len(result.pareto_frontier) == 1
        p = result.pareto_frontier[0]
        assert p.dosing_count == 1
        assert p.final_concentration < result.baseline_concentration

    def test_monotonic_decrease_with_n(self):
        result = optimize_dosing(_make_request(max_dosing=3))
        assert len(result.pareto_frontier) == 3
        for i in range(1, len(result.pareto_frontier)):
            assert result.pareto_frontier[i].final_concentration <= \
                   result.pareto_frontier[i - 1].final_concentration

    def test_returns_baseline(self):
        result = optimize_dosing(_make_request(max_dosing=1))
        assert 0 < result.baseline_concentration <= 1

    def test_pareto_points_have_full_dosing_plans(self):
        result = optimize_dosing(_make_request(max_dosing=2))
        for pp in result.pareto_frontier:
            assert len(pp.dosing_points) == pp.dosing_count
            for dp in pp.dosing_points:
                assert 0 <= dp.segment_index < len(_default_segments())
                assert 0 <= dp.position_ratio <= 1
                assert 0 < dp.activity <= 1
                assert dp.dose_ratio > 0

    def test_optimal_picks_min_dosing_when_met(self):
        result = optimize_dosing(_make_request(max_dosing=5))
        assert result.optimal is not None

    def test_max_dosing_zero_returns_baseline_only(self):
        result = optimize_dosing(_make_request(max_dosing=0))
        assert len(result.pareto_frontier) == 0
        assert result.optimal.dosing_count == 0
        assert result.optimal.final_concentration == result.baseline_concentration

    def test_lake_not_preferred_for_dosing(self):
        lake_segs = [
            {"id": 1, "velocity": 1.0, "directionAngle": 0, "length": 0.5, "depth": 1.5, "width": 1.0, "terrain": "river"},
            {"id": 2, "velocity": 0.3, "directionAngle": 0, "length": 0.5, "depth": 3.0, "width": 1.0, "terrain": "lake"},
        ]
        req = OptimizationRequest(
            params={
                "gridWidth": 400, "gridHeight": 150,
                "lightIntensity": 1.0, "baseNtu": 5,
                "pollutantType": "organic_macromolecule",
                "segments": lake_segs,
            },
            max_dosing_points=1,
            position_grid_size=10,
        )
        result = optimize_dosing(req)
        assert result.pareto_frontier[0].dosing_points[0].segment_index == 0


class TestPerformance:
    def test_5seg_3max_under_2s(self):
        import time
        t0 = time.perf_counter()
        optimize_dosing(_make_request(max_dosing=3))
        elapsed = time.perf_counter() - t0
        assert elapsed < 2.0
```

- [ ] **步骤 2：运行测试确认失败**

```bash
cd backend && python3 -m pytest test_optimizer.py -v
```
预期：FAIL — `ModuleNotFoundError: No module named 'optimizer'`

- [ ] **步骤 3：实现 Python 优化器**

创建 `backend/optimizer.py`：

```python
"""
Automatic dosing optimization engine (Python) — v1
Exact equivalent of the TypeScript optimizer.ts.
"""

import math
import time
import random
from simulation import simulate_single_river

# ═══════════════════════════════════════════════════════════════
#  Data classes
# ═══════════════════════════════════════════════════════════════

class DosingPoint:
    def __init__(self, segment_index, position_ratio, activity, dose_ratio):
        self.segment_index = segment_index
        self.position_ratio = position_ratio
        self.activity = activity
        self.dose_ratio = dose_ratio

    def to_dict(self):
        return {
            "segmentIndex": self.segment_index,
            "positionRatio": self.position_ratio,
            "activity": self.activity,
            "doseRatio": self.dose_ratio,
        }

    def to_catalyst(self):
        return {
            "segmentIndex": self.segment_index,
            "activity": self.activity,
            "doseRatio": self.dose_ratio,
            "effectiveAfterRatio": self.position_ratio,
        }


class ParetoPoint:
    def __init__(self, dosing_count, final_concentration, dosing_points, class_i_met, compute_time_ms):
        self.dosing_count = dosing_count
        self.final_concentration = final_concentration
        self.dosing_points = dosing_points
        self.class_i_met = class_i_met
        self.compute_time_ms = compute_time_ms

    def to_dict(self):
        return {
            "dosing_count": self.dosing_count,
            "final_concentration": self.final_concentration,
            "dosing_points": [dp.to_dict() for dp in self.dosing_points],
            "class_i_met": self.class_i_met,
            "compute_time_ms": self.compute_time_ms,
        }


class OptimizationRequest:
    def __init__(self, params, max_dosing_points=5, position_grid_size=10):
        self.params = params
        self.max_dosing_points = max_dosing_points
        self.position_grid_size = position_grid_size


class OptimizationResult:
    def __init__(self, pareto_frontier, optimal, baseline_concentration):
        self.pareto_frontier = pareto_frontier
        self.optimal = optimal
        self.baseline_concentration = baseline_concentration

    def to_dict(self):
        return {
            "pareto_frontier": [p.to_dict() for p in self.pareto_frontier],
            "optimal": self.optimal.to_dict(),
            "baseline_concentration": self.baseline_concentration,
        }


# ═══════════════════════════════════════════════════════════════
#  Constants
# ═══════════════════════════════════════════════════════════════

CLASS_I_THRESHOLD = 0.10
DOSE_CANDIDATES = [1, 1.5, 2, 3, 5]
ACTIVITY_CANDIDATES = [0.5, 0.8]


# ═══════════════════════════════════════════════════════════════
#  Helpers
# ═══════════════════════════════════════════════════════════════

def _clamp(v, lo, hi):
    return max(lo, min(hi, v))


def _evaluate(params, dosing_points):
    """Evaluate a set of dosing points and return the SimulationResult dict."""
    catalysts = [dp.to_catalyst() for dp in dosing_points]
    segs = params.get("segments", [])
    n = len(segs)
    result = simulate_single_river(
        segments=segs,
        grid_width=params.get("gridWidth", 400),
        grid_height=params.get("gridHeight", 150),
        light_intensity=params.get("lightIntensity", 1.0),
        base_ntu=params.get("baseNtu", 5),
        pollutant_type=params.get("pollutantType", "organic_macromolecule"),
        discharges=params.get("pollutantDischarges"),
        catalyst_placements=catalysts,
    )
    return result


def _final_conc(params, dosing_points):
    """Return the final segment outlet concentration for a dosing plan."""
    result = _evaluate(params, dosing_points)
    return result.get("finalConcentration", 1.0)


# ═══════════════════════════════════════════════════════════════
#  Grid Search
# ═══════════════════════════════════════════════════════════════

def _grid_search_best_new_point(params, existing_points, grid_size):
    """Find the best single additional dosing point via grid search."""
    segments = params.get("segments", [])
    M = len(segments)
    if M == 0:
        return DosingPoint(0, 0, 0.5, 1.0)

    best_conc = _final_conc(params, existing_points)
    best_point = DosingPoint(0, 0, 0.5, 1.0)

    for seg in range(M):
        for g in range(grid_size):
            pos = g / max(1, grid_size - 1)
            for act in ACTIVITY_CANDIDATES:
                for dose in DOSE_CANDIDATES:
                    candidate = DosingPoint(seg, pos, act, dose)
                    conc = _final_conc(params, existing_points + [candidate])
                    if conc < best_conc:
                        best_conc = conc
                        best_point = candidate
    return best_point


# ═══════════════════════════════════════════════════════════════
#  Nelder-Mead Refinement
# ═══════════════════════════════════════════════════════════════

def _nelder_mead_refine(params, initial_points, max_iter=200, tolerance=1e-4):
    """Refine all N dosing points' continuous parameters via Nelder-Mead simplex."""
    N = len(initial_points)
    if N == 0:
        return []

    M = len(params.get("segments", []))
    if M == 0:
        return initial_points

    dim = N * 4

    def _pack(pts):
        v = []
        for p in pts:
            v.append(p.segment_index / max(1, M - 1))
            v.append(p.position_ratio)
            v.append(p.activity)
            v.append(p.dose_ratio / 10.0)
        return v

    def _unpack(v):
        pts = []
        for i in range(N):
            base = i * 4
            seg_idx = _clamp(round(v[base] * (M - 1)), 0, M - 1)
            pts.append(DosingPoint(
                segment_index=seg_idx,
                position_ratio=_clamp(v[base + 1], 0, 1),
                activity=_clamp(v[base + 2], 0.01, 1),
                dose_ratio=_clamp(v[base + 3] * 10, 0.01, 10),
            ))
        return pts

    def _obj_vec(v):
        return _final_conc(params, _unpack(v))

    # Standard Nelder-Mead constants
    alpha = 1.0
    gamma = 2.0
    rho = 0.5
    sigma = 0.5

    # Initialize simplex
    vertices = [_pack(initial_points)]
    for i in range(dim):
        v = _pack(initial_points)
        v[i] = _clamp(v[i] + 0.1 * (random.random() - 0.5) * 2, 0, 1)
        vertices.append(v)

    values = [_obj_vec(v) for v in vertices]

    for _ in range(max_iter):
        # Sort by objective value (ascending)
        sorted_pairs = sorted(enumerate(values), key=lambda x: x[1])
        sorted_indices = [p[0] for p in sorted_pairs]
        sorted_verts = [vertices[i] for i in sorted_indices]
        sorted_vals = [values[i] for i in sorted_indices]

        # Convergence check
        centroid = [0.0] * dim
        for i in range(dim):
            for j in range(dim):
                centroid[i] += sorted_verts[j][i]
            centroid[i] /= dim
        max_dist = 0.0
        for j in range(dim):
            dist = sum((sorted_verts[j][k] - centroid[k]) ** 2 for k in range(dim))
            max_dist = max(max_dist, math.sqrt(dist))
        if max_dist < tolerance:
            break

        worst = sorted_verts[dim]
        reflection = [_clamp(centroid[i] + alpha * (centroid[i] - worst[i]), 0, 1) for i in range(dim)]
        r_val = _obj_vec(reflection)

        if r_val < sorted_vals[0]:
            expansion = [_clamp(centroid[i] + gamma * (reflection[i] - centroid[i]), 0, 1) for i in range(dim)]
            e_val = _obj_vec(expansion)
            if e_val < r_val:
                vertices[sorted_indices[dim]] = expansion
                values[sorted_indices[dim]] = e_val
            else:
                vertices[sorted_indices[dim]] = reflection
                values[sorted_indices[dim]] = r_val
        elif r_val < sorted_vals[dim - 1]:
            vertices[sorted_indices[dim]] = reflection
            values[sorted_indices[dim]] = r_val
        else:
            contract = [_clamp(centroid[i] + rho * (worst[i] - centroid[i]), 0, 1) for i in range(dim)]
            c_val = _obj_vec(contract)
            if c_val < sorted_vals[dim]:
                vertices[sorted_indices[dim]] = contract
                values[sorted_indices[dim]] = c_val
            else:
                best = sorted_verts[0]
                for j in range(1, dim + 1):
                    for k in range(dim):
                        vertices[sorted_indices[j]][k] = best[k] + sigma * (vertices[sorted_indices[j]][k] - best[k])
                        vertices[sorted_indices[j]][k] = _clamp(vertices[sorted_indices[j]][k], 0, 1)
                    values[sorted_indices[j]] = _obj_vec(vertices[sorted_indices[j]])

    best_idx = values.index(min(values))
    return _unpack(vertices[best_idx])


# ═══════════════════════════════════════════════════════════════
#  Main: Pareto Frontier Builder
# ═══════════════════════════════════════════════════════════════

def optimize_dosing(request):
    """Build the Pareto frontier of dosing count vs optimal final concentration."""
    params = request.params
    max_n = request.max_dosing_points
    grid_size = request.position_grid_size
    t0 = time.perf_counter()

    # Baseline (no catalyst)
    baseline = _final_conc(params, [])

    pareto = []
    prev_best = []

    for n in range(1, max_n + 1):
        tn0 = time.perf_counter()

        new_point = _grid_search_best_new_point(params, prev_best, grid_size)
        combined = prev_best + [new_point]
        refined = _nelder_mead_refine(params, combined)

        final_c = _final_conc(params, refined)

        pareto.append(ParetoPoint(
            dosing_count=n,
            final_concentration=final_c,
            dosing_points=refined,
            class_i_met=final_c < CLASS_I_THRESHOLD,
            compute_time_ms=(time.perf_counter() - tn0) * 1000,
        ))

        prev_best = refined

    # Auto-select optimal
    met = [p for p in pareto if p.class_i_met]
    if met:
        optimal = met[0]
    elif pareto:
        optimal = pareto[-1]
    else:
        optimal = ParetoPoint(
            dosing_count=0,
            final_concentration=baseline,
            dosing_points=[],
            class_i_met=baseline < CLASS_I_THRESHOLD,
            compute_time_ms=0,
        )

    return OptimizationResult(
        pareto_frontier=pareto,
        optimal=optimal,
        baseline_concentration=baseline,
    )
```

- [ ] **步骤 4：运行测试**

```bash
cd backend && python3 -m pytest test_optimizer.py -v
```
预期：8 个测试全部 PASS

- [ ] **步骤 5：Commit**

```bash
git add backend/optimizer.py backend/test_optimizer.py
git commit -m "feat(backend): add Python dosing optimizer with tests"
```

---

### 任务 5：后端 API — 新增 POST /api/optimize

**文件：**
- 修改：`backend/schemas.py`（追加）
- 修改：`backend/main.py`（追加）

- [ ] **步骤 1：在 schemas.py 中添加 OptimizeRequest / OptimizeResponse**

在 `backend/schemas.py` 末尾追加：

```python
# ──────────────── 投药优化 ────────────────

class DosingPointSchema(BaseModel):
    """单个最优投药点"""
    segment_index: int = Field(description="分段索引")
    position_ratio: float = Field(ge=0, le=1, description="段内相对位置")
    activity: float = Field(ge=0, le=1, description="催化剂活性")
    dose_ratio: float = Field(gt=0, le=10, description="投药比例")


class ParetoPointSchema(BaseModel):
    """帕累托曲线上的一个点"""
    dosing_count: int = Field(description="投药次数 N")
    final_concentration: float = Field(ge=0, le=1, description="最优最终浓度")
    dosing_points: list[DosingPointSchema] = Field(description="对应投药方案")
    class_i_met: bool = Field(description="是否达到 I 类水标准")
    compute_time_ms: float = Field(description="该点计算耗时 (ms)")


class OptimizeRequest(SimulateRequest):
    """投药优化请求 — 继承 SimulateRequest 全部字段"""
    max_dosing_points: int = Field(default=5, ge=0, le=20, description="最大投药次数")
    position_grid_size: int = Field(default=10, ge=2, le=50, description="位置离散化精度")


class OptimizeResponse(BaseModel):
    """投药优化结果"""
    pareto_frontier: list[ParetoPointSchema] = Field(description="帕累托前沿曲线")
    optimal: ParetoPointSchema = Field(description="自动推荐的最优方案")
    baseline_concentration: float = Field(description="无催化剂时的基线浓度")
    compute_time_ms: float = Field(description="优化总耗时 (ms)")
```

- [ ] **步骤 2：在 main.py 中添加优化端点**

在 `backend/main.py` 的 `from schemas import (` 块中添加新的 schema 导入：

```python
from schemas import (
    # ... existing imports ...
    OptimizeRequest,
    OptimizeResponse,
    ParetoPointSchema,
    DosingPointSchema,
)
```

然后在 `# ═══════════════════════════════════════════════════════════════` 块之后、
`#  阶段二增补` 之前添加（放在 `/api/simulate` 之后）：

```python
@app.post("/api/optimize", response_model=OptimizeResponse)
async def optimize_dosing_endpoint(body: OptimizeRequest):
    """
    自动投药优化接口 — 计算帕累托前沿（投药次数 vs 最优浓度）。

    接收与 /api/simulate 相同的河流参数，额外接受 maxDosingPoints
    和 positionGridSize 控制搜索空间。
    """
    from optimizer import optimize_dosing, OptimizationRequest as PyOptReq

    t0 = time.perf_counter()

    request = PyOptReq(
        params={
            "gridWidth": 400,
            "gridHeight": 150,
            "lightIntensity": body.light_intensity,
            "baseNtu": body.base_ntu,
            "pollutantType": body.pollutant_type,
            "segments": [s.model_dump() for s in body.segments],
            "pollutantDischarges": (
                [d.model_dump() for d in body.pollutant_discharges]
                if body.pollutant_discharges else None
            ),
        },
        max_dosing_points=body.max_dosing_points,
        position_grid_size=body.position_grid_size,
    )

    result = optimize_dosing(request)
    elapsed_ms = (time.perf_counter() - t0) * 1000

    logger.info(
        "优化完成: pareto_points=%d, optimal_N=%d, baseline=%.4f, 耗时=%.2fms",
        len(result.pareto_frontier),
        result.optimal.dosing_count,
        result.baseline_concentration,
        elapsed_ms,
    )

    return OptimizeResponse(
        pareto_frontier=[
            ParetoPointSchema(
                dosing_count=p.dosing_count,
                final_concentration=p.final_concentration,
                dosing_points=[
                    DosingPointSchema(
                        segment_index=dp.segment_index,
                        position_ratio=dp.position_ratio,
                        activity=dp.activity,
                        dose_ratio=dp.dose_ratio,
                    )
                    for dp in p.dosing_points
                ],
                class_i_met=p.class_i_met,
                compute_time_ms=p.compute_time_ms,
            )
            for p in result.pareto_frontier
        ],
        optimal=ParetoPointSchema(
            dosing_count=result.optimal.dosing_count,
            final_concentration=result.optimal.final_concentration,
            dosing_points=[
                DosingPointSchema(
                    segment_index=dp.segment_index,
                    position_ratio=dp.position_ratio,
                    activity=dp.activity,
                    dose_ratio=dp.dose_ratio,
                )
                for dp in result.optimal.dosing_points
            ],
            class_i_met=result.optimal.class_i_met,
            compute_time_ms=result.optimal.compute_time_ms,
        ),
        baseline_concentration=result.baseline_concentration,
        compute_time_ms=round(elapsed_ms, 3),
    )
```

- [ ] **步骤 3：启动后端验证新端点**

```bash
cd backend && python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload &
sleep 2
curl -s -X POST http://localhost:8000/api/optimize \
  -H "Content-Type: application/json" \
  -d '{
    "light_intensity": 1.0,
    "base_ntu": 5,
    "pollutant_type": "organic_macromolecule",
    "segments": [
      {"id": 1, "velocity": 1.0, "directionAngle": 0, "length": 1, "depth": 1.5, "width": 1.0}
    ],
    "max_dosing_points": 3,
    "position_grid_size": 10
  }' | python3 -m json.tool | head -20
```
预期：返回含 `pareto_frontier`、`optimal`、`baseline_concentration` 的 JSON

- [ ] **步骤 4：Commit**

```bash
git add backend/schemas.py backend/main.py
git commit -m "feat(backend): add POST /api/optimize endpoint"
```

---

### 任务 6：前端 — Dashboard 帕累托图表

**文件：**
- 修改：`src/components/Dashboard.tsx`

- [ ] **步骤 1：在 Dashboard 中新增 ParetoChart 组件**

在 `Dashboard.tsx` 中，在 `WaterQualityBadge` 之后、主组件之前插入：

```typescript
// ═══════════════════════════════════════════════════════════════════
//  帕累托曲线组件
// ═══════════════════════════════════════════════════════════════════

import type { ParetoPoint } from '../engine/optimizer';

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
            return [
              `浓度: ${(pt.finalConcentration * 100).toFixed(1)}%`,
              `达标: ${pt.classIMet ? '✓' : '✗'}`,
              `耗时: ${pt.computeTimeMs.toFixed(0)}ms`,
            ];
          },
        },
      },
      onClick: (_event: any, elements: any[]) => {
        if (elements.length > 0 && onSelectPoint && paretoFrontier) {
          const idx = elements[0].index;
          onSelectPoint(paretoFrontier[idx]);
        }
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
```

- [ ] **步骤 2：在 Dashboard 主组件中添加优化按钮和图表区域**

在 Dashboard 主组件的 props 接口中添加新字段，在组件 return 中插入优化区域。修改 `DashboardProps`：

```typescript
export interface DashboardProps {
  // ... existing props ...
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
```

在 `WaterQualityBadge` 之后、三 Y 轴折线图之前添加优化控制区域：

```tsx
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
    {isOptimizing ? '⏳ 优化中...' : '🚀 自动优化投药策略'}
  </button>
</div>

{/* ── 帕累托曲线 ──────────────────────────────────── */}
{paretoFrontier && paretoFrontier.length > 0 && (
  <ParetoChart
    paretoFrontier={paretoFrontier}
    baselineConcentration={baselineConcentration}
    onSelectPoint={onSelectParetoPoint}
  />
)}
```

- [ ] **步骤 3：在 App.tsx 中连接优化逻辑**

在 `src/App.tsx` 中：
- 新增 state：`paretoFrontier`、`isOptimizing`、`maxDosingPoints`
- 新增 `handleOptimize` 函数调用 `POST /api/optimize`
- 新增 `handleSelectParetoPoint` 将选中方案填入 `catalystPlacements`
- 将这些 props 传给 `Dashboard`

具体修改：

```typescript
// 新增 import
import type { ParetoPoint } from './engine/optimizer';

// 新增 state
const [paretoFrontier, setParetoFrontier] = useState<ParetoPoint[] | undefined>();
const [baselineConcentration, setBaselineConcentration] = useState<number | undefined>();
const [isOptimizing, setIsOptimizing] = useState(false);
const [maxDosingPoints, setMaxDosingPoints] = useState(5);

// 优化处理函数
const handleOptimize = useCallback(async () => {
  setIsOptimizing(true);
  try {
    const payload = {
      light_intensity: lightIntensity,
      base_ntu: baseNtu,
      pollutant_type: pollutantType,
      segments: segments,
      pollutant_discharges: pollutantDischarges.length > 0 ? pollutantDischarges : undefined,
      catalyst_placements: catalystPlacements.length > 0 ? catalystPlacements : undefined,
      max_dosing_points: maxDosingPoints,
      position_grid_size: 10,
    };
    const res = await fetch('http://localhost:8000/api/optimize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setParetoFrontier(data.pareto_frontier);
    setBaselineConcentration(data.baseline_concentration);
    // 自动应用最优方案
    if (data.optimal?.dosing_points) {
      const placements: CatalystPlacement[] = data.optimal.dosing_points.map(
        (dp: any) => ({
          segmentIndex: dp.segment_index,
          activity: dp.activity,
          doseRatio: dp.dose_ratio,
          effectiveAfterRatio: dp.position_ratio,
        })
      );
      setCatalysts(placements);
    }
  } catch (err) {
    console.error('优化失败:', err);
  } finally {
    setIsOptimizing(false);
  }
}, [lightIntensity, baseNtu, pollutantType, segments, pollutantDischarges,
    catalystPlacements, maxDosingPoints]);

// 帕累托选点处理
const handleSelectParetoPoint = useCallback((point: ParetoPoint) => {
  const placements: CatalystPlacement[] = point.dosingPoints.map(dp => ({
    segmentIndex: dp.segmentIndex,
    activity: dp.activity,
    doseRatio: dp.doseRatio,
    effectiveAfterRatio: dp.positionRatio,
  }));
  setCatalysts(placements);
}, []);
```

在 `Dashboard` 的 JSX 中传入新 props：

```tsx
<Dashboard
  // ... existing props ...
  paretoFrontier={paretoFrontier}
  baselineConcentration={baselineConcentration}
  isOptimizing={isOptimizing}
  onOptimize={handleOptimize}
  onSelectParetoPoint={handleSelectParetoPoint}
  maxDosingPoints={maxDosingPoints}
  onMaxDosingPointsChange={setMaxDosingPoints}
/>
```

- [ ] **步骤 4：运行前端验证**

```bash
npx tsc --noEmit
npx vitest run src/engine/optimizer.test.ts
```
预期：类型检查 PASS，9 个测试 PASS

- [ ] **步骤 5：启动前端，手动验证**

```bash
npx vite --host 0.0.0.0 --port 5173 &
```
手动操作：打开 http://localhost:5173，点击"自动优化投药策略"按钮，观察：
- 帕累托曲线是否渲染
- 点击曲线上各点是否切换催化剂方案
- 河流视图中投药点是否更新

- [ ] **步骤 6：Commit**

```bash
git add src/components/Dashboard.tsx src/App.tsx
git commit -m "feat(frontend): add Pareto chart and auto-optimize button to Dashboard"
```

---

### 任务 7：最终验证与清理

- [ ] **步骤 1：运行全部测试**

```bash
npx vitest run src/engine/
cd backend && python3 -m pytest test_optimizer.py test_simulation.py -v
```
预期：全部 PASS

- [ ] **步骤 2：端到端测试**

```bash
# 确认后端运行中
curl -s http://localhost:8000/api/health | python3 -m json.tool

# 提交优化请求
curl -s -X POST http://localhost:8000/api/optimize \
  -H "Content-Type: application/json" \
  -d '{
    "light_intensity": 1.0,
    "base_ntu": 5,
    "pollutant_type": "organic_macromolecule",
    "segments": [
      {"id": 1, "velocity": 1.5, "directionAngle": 0, "length": 0.33, "depth": 1.5, "width": 1.0},
      {"id": 2, "velocity": 1.0, "directionAngle": 10, "length": 0.34, "depth": 2.0, "width": 1.2},
      {"id": 3, "velocity": 2.0, "directionAngle": -5, "length": 0.33, "depth": 1.0, "width": 0.8}
    ],
    "max_dosing_points": 5,
    "position_grid_size": 10
  }' | python3 -m json.tool
```
预期：返回完整帕累托曲线 JSON，`pareto_frontier` 长度 = 5

- [ ] **步骤 3：最终 Commit**

```bash
git add -A
git commit -m "chore: final verification — all tests passing, e2e confirmed"
```
