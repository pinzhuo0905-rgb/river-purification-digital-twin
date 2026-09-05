# 多组分分段仿真 & 米制几何重构 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 将河流仿真引擎从单污染物/相对长度升级为多组分自定义配比 + 绝对米制几何 + 分段独立配置

**架构：** 保持 v4 物理-渲染分离架构不变。引入 `PollutantDefinition` 接口替代 string union，引入 `PollutantMixture` 管理多组分比例。用 `SegmentPollutantSource` 实现每段独立污染源。动态步长算法根据绝对长度自适应采样密度。物理空间内多污染物各自独立衰减，总 NTU 为各组分贡献之和。

**技术栈：** TypeScript, React 19, Chart.js, Canvas 2D, Vitest

---

### 任务 1：新类型声明 — 多组分污染物 & 绝对米制几何

**文件：**
- 修改：`src/engine/simulation.ts:30-230`

- [ ] **步骤 1：定义新类型，保留向后兼容别名**

在 `src/engine/simulation.ts` 中，将第 30-229 行的类型区替换为以下内容。

定位：删除第 30 行的 `export type PollutantType = ...` 到第 229 行 `REFERENCE_TEMPERATURE_K: 298.15`，替换为新定义：

```typescript
// ═══════════════════════════════════════════════════════════════
//  污染物定义系统（v5 多组分架构）
// ═══════════════════════════════════════════════════════════════

/** 单个污染物种类定义 */
export interface PollutantDefinition {
  id: string;            // 唯一标识，如 'organic_macromolecule'
  name: string;          // 中文名，如 '大分子有机物'
  k_base_alpha: number;  // 固有降解系数常数（光解 + 微生物联合）
  ntu_impact: number;    // 对水体浊度的影响系数（每单位浓度贡献 NTU）
}

/** 内置污染物库 */
export const BUILTIN_POLLUTANTS: PollutantDefinition[] = [
  { id: 'organic_macromolecule',  name: '大分子有机物', k_base_alpha: 0.0005, ntu_impact: 12 },
  { id: 'sediment_algae',         name: '泥沙水藻',     k_base_alpha: 0.00015, ntu_impact: 35 },
  { id: 'heavy_metal',            name: '重金属离子',   k_base_alpha: 0.000015,ntu_impact: 2  },
  { id: 'petroleum_hydrocarbon',  name: '石油烃类',     k_base_alpha: 0.0004, ntu_impact: 18 },
  { id: 'nutrient_runoff',        name: '氮磷富营养化', k_base_alpha: 0.00125,ntu_impact: 10 },
  { id: 'microplastic',           name: '微塑料',       k_base_alpha: 0.000005,ntu_impact: 1  },
];

/** 通过 ID 查找内置污染物定义 */
export function getBuiltinPollutant(id: string): PollutantDefinition | undefined {
  return BUILTIN_POLLUTANTS.find(p => p.id === id);
}

/** 向后兼容：旧的 string union 类型别名 */
export type PollutantType =
  | 'organic_macromolecule'
  | 'sediment_algae'
  | 'heavy_metal'
  | 'petroleum_hydrocarbon'
  | 'nutrient_runoff'
  | 'microplastic';

/** 污染物混合组分：在一个水块内多种污染物共存 */
export interface PollutantMixture {
  pollutantId: string;   // 对应 PollutantDefinition.id
  proportion: number;    // 初始占比 (0~1)，所有选中污染物的 proportion 之和 = 1
}

/** 段级污染源配置 */
export interface SegmentPollutantSource {
  /** 本段选中的污染物混合组分（空 = 继承上游） */
  mixtures?: PollutantMixture[];
  /** 段首突发排污质量 (0~1 相对值) */
  burstMass?: number;
  /** 沿段均匀连续排污质量 (0~1 相对值) */
  continuousRate?: number;
}

/** 地形类型 */
export type TerrainType = 'river' | 'lake';

/** 排污类型 */
export type DischargeType = 'continuous' | 'burst';

/** 河流分段（v5：绝对米制 + 独立污染源） */
export interface RiverSegmentV3 {
  id: number;
  velocity: number;               // 参考流速 (m/s)
  angle?: number;                 // 相对上一段的偏转角 (度)
  directionAngle?: number;        // @deprecated 等价于 angle
  length: number;                 // ★ v5: 绝对物理长度，单位：米 (m)，下限 1m
  depth: number;                  // 水深 (m)
  width: number;                  // 河宽系数 (0.5~2.0)，1 = 标准宽 10m
  terrain?: TerrainType;
  referenceDischarge?: number;    // Q (m³/s)，默认 10
  pollutantSource?: SegmentPollutantSource; // ★ v5: 本段独立污染源
}

/** 排污口定义（向后兼容，但推荐使用 SegmentPollutantSource） */
export interface PollutantDischarge {
  segmentIndex: number;
  positionRatio: number;
  pollutantType: PollutantType;
  mass: number;
  dischargeType: DischargeType;
}

/** 催化剂投放点 */
export interface CatalystPlacement {
  segmentIndex: number;
  activity: number;
  doseRatio: number;
  effectiveAfterRatio?: number;
}

/** 双河汇合配置 */
export interface ConfluenceConfig {
  river0Segment: number;
  river1Segment: number;
  river0Ratio: number;
  river1Ratio: number;
}

/** 仿真输入参数（v5） */
export interface SimulationParamsV3 {
  gridWidth: number;
  gridHeight: number;
  lightIntensity: number;
  baseNtu?: number;
  temperature?: number;
  /** ★ v5: 全局默认污染物配比（若段未指定则使用此值） */
  globalMixtures?: PollutantMixture[];
  /** @deprecated 使用 globalMixtures */
  pollutantType?: PollutantType;
  segments: RiverSegmentV3[];
  pollutantDischarges?: PollutantDischarge[];
  catalystPlacements?: CatalystPlacement[];
  secondarySegments?: RiverSegmentV3[];
  secondaryDischarges?: PollutantDischarge[];
  confluenceConfig?: ConfluenceConfig;
  catalystEfficiency?: number;
  turbidity?: number;
}

/** 各段反应效率指标 */
export interface SegmentMetricsV3 {
  segIndex: number;
  velocity: number;
  residenceTime: number;
  effectiveLight: number;
  reactionScore: number;
  depth: number;
  width: number;
  terrain: TerrainType;
}

/** 河流路径采样点（画布坐标） */
export interface PathPointV3 {
  x: number;
  y: number;
  concentration: number;     // ★ v5: 主导污染物的总浓度（用于颜色映射）
  segIndex: number;
  widthPx: number;
  ntu: number;
  catalystActive: boolean;
}

import {
  assessSegmentWaterQuality,
  calculateWQI,
  classifyWaterQuality,
  type WaterQualityClass,
} from './waterQuality';

/** 多级地表水达标评估（GB3838-2002） */
export interface WaterQualityStandard {
  classIMet: boolean;
  waterQualityClass: WaterQualityClass;
  residualRatio: number;
  distanceToStandard?: number;
  segmentAssessments?: Array<{
    segmentIndex: number;
    classIMet: boolean;
    waterQualityClass: WaterQualityClass;
    residualRatio: number;
  }>;
  wqi?: number;
}

/** ★ v5: 多组分出水口浓度 */
export interface MultiPollutantResult {
  pollutantId: string;
  pollutantName: string;
  finalConcentration: number;
  waterQualityClass: WaterQualityClass;
  classIMet: boolean;
}

/** 仿真结果（v5） */
export interface SimulationResultV3 {
  optimalX: number;
  optimalY: number;
  optimalSegmentIndex: number;
  segmentOutConcentrations: number[];
  segmentMetrics: SegmentMetricsV3[];
  riverPath: PathPointV3[];
  riverWidthPx: number;
  segmentWidthsPx: number[];
  waterQualityStandard: WaterQualityStandard;
  segmentOutNtu: number[];
  secondaryResult?: {
    segmentOutConcentrations: number[];
    segmentOutNtu: number[];
    riverPath: PathPointV3[];
  };
  /** ★ v5: 多组分逐个出水口水质评估 */
  multiPollutantResults?: MultiPollutantResult[];
  /** ★ v5: 沿程各污染物的单独浓度曲线（用于 Dashboard 多曲线） */
  pollutantCurves?: Record<string, number[]>;  // pollutantId → 沿程浓度数组
}

// ═══════════════════════════════════════════════════════════════
//  向后兼容类型别名
// ═══════════════════════════════════════════════════════════════

/** @deprecated 使用 RiverSegmentV3 */
export interface RiverSegment extends RiverSegmentV3 {}
/** @deprecated 使用 SimulationParamsV3 */
export interface SimulationParams extends Omit<SimulationParamsV3, 'baseNtu' | 'globalMixtures'> {
  baseNtu?: number;
  pollutantType?: PollutantType;
  globalMixtures?: PollutantMixture[];
}
/** @deprecated 使用 SimulationResultV3 */
export interface SimulationResult extends SimulationResultV3 {}

// ═══════════════════════════════════════════════════════════════
//  可配置物理常数
// ═══════════════════════════════════════════════════════════════

interface PhysicsConstants {
  ALPHA_BASE: number;
  ALPHA_PER_NTU: number;
  STANDARD_WIDTH_M: number;
  STANDARD_DEPTH_M: number;
  LAKE_WIDTH_MULTIPLIER: number;
  LAKE_DEPTH_MULTIPLIER: number;
  ACTIVATION_ENERGY_OVER_R: number;
  REFERENCE_TEMPERATURE_K: number;
  /** ★ v5: 最小每米采样步数（用于动态步长算法） */
  MIN_STEPS_PER_METER: number;
  /** ★ v5: 最大总采样步数（防止超长河流导致内存爆炸） */
  MAX_TOTAL_STEPS: number;
}

const DEFAULTS: PhysicsConstants = {
  ALPHA_BASE: 0.05,
  ALPHA_PER_NTU: 0.015,
  STANDARD_WIDTH_M: 10,
  STANDARD_DEPTH_M: 1.5,
  LAKE_WIDTH_MULTIPLIER: 4.0,
  LAKE_DEPTH_MULTIPLIER: 1.5,
  ACTIVATION_ENERGY_OVER_R: 4500,
  REFERENCE_TEMPERATURE_K: 298.15,
  MIN_STEPS_PER_METER: 0.5,    // 每米至少 0.5 步 → 保证最小分辨率
  MAX_TOTAL_STEPS: 5000,       // 10km × 0.5 步/米 = 5000 步，Canvas 安全上限
};
```

- [ ] **步骤 2：运行 TypeScript 编译检查类型定义**

```bash
cd /Users/johnzhang/基于微积分切片思想与指数衰减模型的河流光催化净化动态仿真程序
npx tsc --noEmit src/engine/simulation.ts 2>&1 | head -40
```

预期：报告中可能有现有代码的其他错误（因我们还未修改函数实现），但新类型定义本身不应有语法错误。确认错误仅来自未修改的旧函数体，而非新类型声明。

- [ ] **步骤 3：Commit**

```bash
git add src/engine/simulation.ts
git commit -m "feat: add v5 multi-pollutant types and absolute-meter geometry definitions"
```

---

### 任务 2：重构物理常数 & 工具函数区

**文件：**
- 修改：`src/engine/simulation.ts:232-309`（内部类型 + 工具函数）

- [ ] **步骤 1：更新内部类型，支持多组分**

定位第 232-283 行（`EffectiveSegment` 到 `PhysicsPoint` 的内部类型定义），替换为：

```typescript
// ═══════════════════════════════════════════════════════════════
//  内部类型（物理空间）
// ═══════════════════════════════════════════════════════════════

/** 连续性方程展开后的有效段参数 */
interface EffectiveSegment {
  index: number;
  physicalLengthM: number;     // ★ v5: 直接使用 segment.length (米)
  effectiveVelocity: number;
  effectiveWidth: number;
  effectiveDepth: number;
  crossSectionArea: number;
  dischargeFlow: number;
  isLake: boolean;
  directionAngle: number;
}

export function getSegmentAngle(seg: Pick<RiverSegmentV3, 'angle' | 'directionAngle'>): number {
  return seg.angle ?? seg.directionAngle ?? 0;
}

interface CatalystEntry {
  activity: number;
  doseRatio: number;
  withinSegmentRatio: number;
}

type CatalystMap = Map<number, CatalystEntry[]>;

/** ★ v5: 段级排污负荷分解（支持多组分） */
interface DischargeLoad {
  /** 段首突发污染源：pollutantId → 归一化质量 */
  burstMassByPollutant: Record<string, number>;
  /** 沿段连续排放：pollutantId → 归一化速率 */
  continuousRateByPollutant: Record<string, number>;
  /** 本段活跃的污染物 ID 列表 */
  activePollutantIds: string[];
}

/** ★ v5: NTU 预扫描结果 */
interface NTUBaseline {
  perSegmentNtu: number[];
  perSegmentAlpha: number[];
}

/** ★ v5: 物理空间积分点（支持多组分浓度记录） */
interface PhysicsPoint {
  distanceFromOriginM: number;
  concentration: number;          // 总浓度（所有污染物之和）
  pollutantConcentrations: Record<string, number>; // 各污染物单独浓度
  ntu: number;
  catalystActive: boolean;
  segIndex: number;
  effectiveWidth: number;
}
```

- [ ] **步骤 2：更新工具函数区**

定位第 285-309 行，保持 `round`、`clamp`、`temperatureFactor` 函数不变。移除 `supportsSettling` 函数（沉降/悬浮机制现在内联到积分循环中按污染物 ID 判断）。

删除第 306-308 行：
```typescript
function supportsSettling(type: PollutantType): boolean {
  return type === 'sediment_algae' || type === 'microplastic';
}
```

新增辅助函数：

```typescript
/** ★ v5: 解析参数中的污染物混合物（兼容旧 pollutantType 字段） */
function resolveMixtures(params: SimulationParamsV3): PollutantMixture[] {
  if (params.globalMixtures && params.globalMixtures.length > 0) {
    return params.globalMixtures;
  }
  // 向后兼容：从旧 pollutantType 创建默认单污染物混合物
  const oldType = params.pollutantType || 'organic_macromolecule';
  return [{ pollutantId: oldType, proportion: 1.0 }];
}

/** ★ v5: 计算动态采样步数 */
function computeDynamicSteps(totalRiverM: number, consts: PhysicsConstants): number {
  const steps = Math.round(totalRiverM * consts.MIN_STEPS_PER_METER);
  return clamp(steps, 20, consts.MAX_TOTAL_STEPS);
}

/** ★ v5: 污染物专属沉降参数 */
function pollutantSettlingParams(pollutantId: string): {
  enabled: boolean;
  depositionBase: number;
  resuspensionBase: number;
} {
  switch (pollutantId) {
    case 'sediment_algae':
      return { enabled: true, depositionBase: 0.0012, resuspensionBase: 0.0020 };
    case 'microplastic':
      return { enabled: true, depositionBase: 0.00035, resuspensionBase: 0.00075 };
    default:
      return { enabled: false, depositionBase: 0, resuspensionBase: 0 };
  }
}
```

- [ ] **步骤 3：Commit**

```bash
git add src/engine/simulation.ts
git commit -m "feat: add v5 internal types, multi-pollutant helpers and dynamic step algorithm"
```

---

### 任务 3：重构 computeEffectiveSegments — 绝对米制

**文件：**
- 修改：`src/engine/simulation.ts:382-411`

- [ ] **步骤 1：重写 `computeEffectiveSegments`**

定位第 382-411 行，替换为：

```typescript
/**
 * ★ v5: 从原始 RiverSegmentV3[] 计算有效段参数
 *
 * segment.length 现在是绝对物理米，无需再按比例缩放。
 */
function computeEffectiveSegments(
  segments: RiverSegmentV3[],
  consts: PhysicsConstants,
  _totalRiverM: number, // v5 保留参数签名兼容性，但不再使用
): EffectiveSegment[] {
  return segments.map((seg, idx) => {
    const isLake = seg.terrain === 'lake';
    const effWidth = seg.width * consts.STANDARD_WIDTH_M * (isLake ? consts.LAKE_WIDTH_MULTIPLIER : 1);
    const effDepth = seg.depth * (isLake ? consts.LAKE_DEPTH_MULTIPLIER : 1);
    const Q = seg.referenceDischarge ?? seg.velocity * effWidth * effDepth;
    const effVelocity = Math.max(0.05, Q / (effWidth * effDepth));
    const physicalLengthM = Math.max(1, seg.length); // ★ 下限 1m
    return {
      index: idx,
      physicalLengthM,
      effectiveVelocity: effVelocity,
      effectiveWidth: effWidth,
      effectiveDepth: effDepth,
      crossSectionArea: effWidth * effDepth,
      dischargeFlow: Q,
      isLake,
      directionAngle: getSegmentAngle(seg),
    };
  });
}
```

- [ ] **步骤 2：Commit**

```bash
git add src/engine/simulation.ts
git commit -m "feat: absolute-meter length in computeEffectiveSegments with 1m minimum"
```

---

### 任务 4：重构 computeDischargeLoads — 多组分排污

**文件：**
- 修改：`src/engine/simulation.ts:499-544`

- [ ] **步骤 1：重写 `computeDischargeLoads`**

定位第 499-544 行，替换为：

```typescript
/**
 * ★ v5: 将段级污染源配置分解为多组分排污负荷
 *
 * 优先使用 segment.pollutantSource，否则回退到全局 globalMixtures。
 */
function computeDischargeLoads(
  discharges: PollutantDischarge[] | undefined,
  segments: RiverSegmentV3[],
  effectiveSegs: EffectiveSegment[],
  globalMixtures: PollutantMixture[],
): DischargeLoad[] {
  return effectiveSegs.map((_effSeg, idx) => {
    const seg = segments[idx];
    const source = seg?.pollutantSource;
    const mixtures = (source?.mixtures && source.mixtures.length > 0)
      ? source.mixtures
      : globalMixtures;

    const activeIds = mixtures.map(m => m.pollutantId);
    const burstMassByPollutant: Record<string, number> = {};
    const continuousRateByPollutant: Record<string, number> = {};

    for (const mix of mixtures) {
      // burstMass 和 continuousRate 按比例分配
      const burstTotal = source?.burstMass ?? (idx === 0 ? 1.0 : 0);
      const continuousTotal = source?.continuousRate ?? 0;
      burstMassByPollutant[mix.pollutantId] = burstTotal * mix.proportion;
      continuousRateByPollutant[mix.pollutantId] = continuousTotal * mix.proportion;
    }

    return { burstMassByPollutant, continuousRateByPollutant, activePollutantIds: activeIds };
  });
}
```

- [ ] **步骤 2：Commit**

```bash
git add src/engine/simulation.ts
git commit -m "feat: multi-pollutant discharge loads with per-segment config"
```

---

### 任务 5：重构 NTU 预扫描 & 积分循环 — 多组分衰减

**文件：**
- 修改：`src/engine/simulation.ts:438-497`（estimateNTUBaseline）
- 修改：`src/engine/simulation.ts:615-782`（integrate 函数）

- [ ] **步骤 1：重写 `estimateNTUBaseline` — 多组分 NTU 扫描**

定位第 438-497 行，替换为：

```typescript
/**
 * ★ v5: NTU 基线预扫描 — 多组分版
 *
 * 每种污染物独立衰减，总 NTU = baseNtu + Σ(conc_i × ntuImpact_i)
 */
function estimateNTUBaseline(
  effectiveSegs: EffectiveSegment[],
  segLoads: DischargeLoad[],
  baseNtu: number,
  mixtures: PollutantMixture[],
  lightIntensity: number,
  consts: PhysicsConstants,
  totalPhysicalSteps: number,
): NTUBaseline {
  const perSegmentNtu: number[] = [];
  const perSegmentAlpha: number[] = [];

  // 初始化各污染物浓度
  const concMap: Record<string, number> = {};
  for (const m of mixtures) {
    concMap[m.pollutantId] = segLoads[0]?.burstMassByPollutant[m.pollutantId] ?? m.proportion;
  }

  for (let sIdx = 0; sIdx < effectiveSegs.length; sIdx++) {
    const seg = effectiveSegs[sIdx];
    const coarseSteps = Math.max(10, Math.round(totalPhysicalSteps * (seg.physicalLengthM / 1000)));
    const stepLength = seg.physicalLengthM / coarseSteps;
    const stepTime = stepLength / seg.effectiveVelocity;

    // 段间混合
    if (sIdx > 0 && segLoads[sIdx]) {
      const prevFlow = effectiveSegs[sIdx - 1].dischargeFlow;
      const thisFlow = seg.dischargeFlow;
      for (const id of segLoads[sIdx].activePollutantIds) {
        const prevMass = (concMap[id] ?? 0) * prevFlow;
        const newMass = segLoads[sIdx].burstMassByPollutant[id] ?? 0;
        concMap[id] = clamp((prevMass + newMass) / thisFlow, 0, 1);
      }
    }

    for (let step = 0; step < coarseSteps; step++) {
      // 计算总 NTU
      let totalNtu = baseNtu;
      for (const m of mixtures) {
        const def = getBuiltinPollutant(m.pollutantId);
        if (def) totalNtu += (concMap[m.pollutantId] ?? 0) * def.ntu_impact;
      }
      const alpha = consts.ALPHA_BASE + totalNtu * consts.ALPHA_PER_NTU;
      const I_eff = lightIntensity * Math.exp(-alpha * seg.effectiveDepth);

      // 各污染物独立衰减
      for (const m of mixtures) {
        const def = getBuiltinPollutant(m.pollutantId);
        if (!def) continue;
        const k = def.k_base_alpha * I_eff;
        concMap[m.pollutantId] = (concMap[m.pollutantId] ?? 0) * Math.exp(-k * stepTime);

        // 连续排污
        if (segLoads[sIdx]?.continuousRateByPollutant[m.pollutantId]) {
          concMap[m.pollutantId] += segLoads[sIdx].continuousRateByPollutant[m.pollutantId] / coarseSteps;
          concMap[m.pollutantId] = clamp(concMap[m.pollutantId], 0, 1);
        }
      }
    }

    // 计算出口总 NTU
    let exitNtu = baseNtu;
    for (const m of mixtures) {
      const def = getBuiltinPollutant(m.pollutantId);
      if (def) exitNtu += (concMap[m.pollutantId] ?? 0) * def.ntu_impact;
    }
    perSegmentNtu.push(round(exitNtu, 2));
    perSegmentAlpha.push(round(consts.ALPHA_BASE + exitNtu * consts.ALPHA_PER_NTU, 6));
  }

  return { perSegmentNtu, perSegmentAlpha };
}
```

- [ ] **步骤 2：重写 `integrate` 函数 — 多组分全物理积分**

定位第 615-782 行，替换整个 `integrate` 函数及其 `IntegrationInput`/`IntegrationOutput` 接口：

```typescript
interface IntegrationInput {
  effectiveSegs: EffectiveSegment[];
  segLoads: DischargeLoad[];
  catalystMap: CatalystMap;
  baseNtu: number;
  mixtures: PollutantMixture[];       // ★ v5
  lightIntensity: number;
  temperature: number;
  consts: PhysicsConstants;
  totalPhysicalSteps: number;
  optimalSegmentIndex: number;
  confluenceConfig?: ConfluenceConfig;
  secondaryResult?: RawSimulationResult;
  secondarySegs?: EffectiveSegment[];
}

interface IntegrationOutput {
  physicsPoints: PhysicsPoint[];
  segmentOutConcentrations: number[];
  segmentOutNtu: number[];
  optimalSegmentIndex: number;
  pollutantCurves: Record<string, number[]>; // ★ v5
}

/**
 * ★ v5: 沿程积分 — 多组分独立衰减
 */
function integrate(input: IntegrationInput): IntegrationOutput {
  const {
    effectiveSegs, segLoads, catalystMap, baseNtu,
    mixtures, lightIntensity, temperature, consts,
    totalPhysicalSteps, optimalSegmentIndex,
    confluenceConfig, secondaryResult, secondarySegs,
  } = input;

  const tempFactor = temperatureFactor(temperature, consts);

  const physicsPoints: PhysicsPoint[] = [];
  const segmentOutConcentrations: number[] = [];
  const segmentOutNtu: number[] = [];
  const pollutantCurves: Record<string, number[]> = {};
  for (const m of mixtures) {
    pollutantCurves[m.pollutantId] = [];
  }

  // 初始化各污染物浓度
  const concMap: Record<string, number> = {};
  for (const m of mixtures) {
    concMap[m.pollutantId] = segLoads[0]?.burstMassByPollutant[m.pollutantId] ?? m.proportion;
    concMap[m.pollutantId] = clamp(concMap[m.pollutantId], 0, 1);
  }

  // 沉降床存量（仅泥沙和微塑料）
  const bedStoreMap: Record<string, number> = {};
  for (const m of mixtures) {
    const params = pollutantSettlingParams(m.pollutantId);
    if (params.enabled) bedStoreMap[m.pollutantId] = 0;
  }

  let distanceM = 0;

  for (let sIdx = 0; sIdx < effectiveSegs.length; sIdx++) {
    const seg = effectiveSegs[sIdx];
    const stepsThisSeg = Math.max(1, Math.round(totalPhysicalSteps * (seg.physicalLengthM / Math.max(1, effectiveSegs.reduce((sum, s) => sum + s.physicalLengthM, 0)))));
    const physicalStep = seg.physicalLengthM / stepsThisSeg;
    const stepTime = physicalStep / seg.effectiveVelocity;

    // 段间混合：流量加权稀释 + 新段排污
    if (sIdx > 0) {
      const prevFlow = effectiveSegs[sIdx - 1].dischargeFlow;
      const thisFlow = seg.dischargeFlow;
      for (const id of segLoads[sIdx].activePollutantIds) {
        concMap[id] = (concMap[id] ?? 0) * (prevFlow / thisFlow);
        if (segLoads[sIdx].burstMassByPollutant[id]) {
          concMap[id] += segLoads[sIdx].burstMassByPollutant[id];
        }
        concMap[id] = clamp(concMap[id], 0, 1);
      }
    }

    const catalystsInSeg = catalystMap.get(sIdx) ?? [];

    for (let step = 0; step < stepsThisSeg; step++) {
      const progressRatio = step / stepsThisSeg;
      const stepRatio = 1 / stepsThisSeg;

      // 计算当前总 NTU
      let totalNtu = baseNtu;
      for (const id of mixtures.map(m => m.pollutantId)) {
        const def = getBuiltinPollutant(id);
        if (def) totalNtu += (concMap[id] ?? 0) * def.ntu_impact;
      }
      const alpha = consts.ALPHA_BASE + totalNtu * consts.ALPHA_PER_NTU;
      const I_eff = lightIntensity * Math.exp(-alpha * seg.effectiveDepth);

      // 催化剂降解加成（共享因子，对每种污染物起作用）
      let catalystBoost = 0;
      for (const entry of catalystsInSeg) {
        if (progressRatio < entry.withinSegmentRatio) continue;
        const distanceFromDose = Math.max(0, (progressRatio - entry.withinSegmentRatio) * seg.physicalLengthM);
        const elapsedSinceDose = distanceFromDose / seg.effectiveVelocity;
        const uStar = Math.max(0.005, 0.05 * seg.effectiveVelocity);
        const lateralDiffusion = 0.6 * seg.effectiveDepth * uStar;
        const sigmaY = Math.sqrt(Math.max(0, 2 * lateralDiffusion * elapsedSinceDose));
        const coverage = clamp(sigmaY / Math.max(0.001, seg.effectiveWidth * 0.5), 0.12, 1);
        catalystBoost += entry.activity * entry.doseRatio * I_eff * coverage * tempFactor;
      }

      // 各污染物独立衰减（二阶中点法）
      const catalystActive = catalystBoost > 0;
      const midConcMap: Record<string, number> = {};
      for (const m of mixtures) {
        const def = getBuiltinPollutant(m.pollutantId);
        if (!def) continue;
        const kTotal = def.k_base_alpha * I_eff + catalystBoost;
        midConcMap[m.pollutantId] = clamp((concMap[m.pollutantId] ?? 0) * Math.exp(-kTotal * stepTime * 0.5), 0, 1);
      }

      // 用中点浓度重算 NTU 和 k2
      let midNtu = baseNtu;
      for (const id of mixtures.map(m => m.pollutantId)) {
        const def = getBuiltinPollutant(id);
        if (def) midNtu += (midConcMap[id] ?? 0) * def.ntu_impact;
      }
      const midAlpha = consts.ALPHA_BASE + midNtu * consts.ALPHA_PER_NTU;
      const midIeff = lightIntensity * Math.exp(-midAlpha * seg.effectiveDepth);
      let midCatalystBoost = 0;
      for (const entry of catalystsInSeg) {
        if (Math.min(1, progressRatio + stepRatio / 2) < entry.withinSegmentRatio) continue;
        const d2 = Math.max(0, (Math.min(1, progressRatio + stepRatio / 2) - entry.withinSegmentRatio) * seg.physicalLengthM);
        const elapsed2 = d2 / seg.effectiveVelocity;
        const uStar2 = Math.max(0.005, 0.05 * seg.effectiveVelocity);
        const latDiff2 = 0.6 * seg.effectiveDepth * uStar2;
        const sigmaY2 = Math.sqrt(Math.max(0, 2 * latDiff2 * elapsed2));
        const cov2 = clamp(sigmaY2 / Math.max(0.001, seg.effectiveWidth * 0.5), 0.12, 1);
        midCatalystBoost += entry.activity * entry.doseRatio * midIeff * cov2 * tempFactor;
      }

      for (const m of mixtures) {
        const def = getBuiltinPollutant(m.pollutantId);
        if (!def) continue;
        const kTotal2 = def.k_base_alpha * midIeff + midCatalystBoost;
        concMap[m.pollutantId] = clamp((concMap[m.pollutantId] ?? 0) * Math.exp(-kTotal2 * stepTime), 0, 1);

        // 沉降/悬浮
        const settling = pollutantSettlingParams(m.pollutantId);
        if (settling.enabled && seg.effectiveVelocity < 0.3) {
          const depRate = settling.depositionBase * (0.3 - seg.effectiveVelocity) / 0.3;
          const deposited = Math.min(concMap[m.pollutantId], concMap[m.pollutantId] * depRate * stepTime);
          concMap[m.pollutantId] -= deposited;
          bedStoreMap[m.pollutantId] = clamp((bedStoreMap[m.pollutantId] ?? 0) + deposited, 0, 1);
        } else if (settling.enabled && seg.effectiveVelocity > 1.5 && (bedStoreMap[m.pollutantId] ?? 0) > 0) {
          const resusRate = settling.resuspensionBase * Math.min(2, (seg.effectiveVelocity - 1.5) / 1.5);
          const resuspended = Math.min(bedStoreMap[m.pollutantId], bedStoreMap[m.pollutantId] * resusRate * stepTime);
          bedStoreMap[m.pollutantId] -= resuspended;
          concMap[m.pollutantId] = clamp(concMap[m.pollutantId] + resuspended, 0, 1);
        }

        // 连续排污
        if (segLoads[sIdx]?.continuousRateByPollutant[m.pollutantId]) {
          concMap[m.pollutantId] += segLoads[sIdx].continuousRateByPollutant[m.pollutantId] / stepsThisSeg;
          concMap[m.pollutantId] = clamp(concMap[m.pollutantId], 0, 1);
        }
      }

      // 汇合点处理（双河模式）— 保持原有逻辑，扩展到多组分
      if (confluenceConfig && secondaryResult && sIdx === confluenceConfig.river0Segment) {
        const confluenceStep = Math.round(stepsThisSeg * confluenceConfig.river0Ratio);
        if (step === confluenceStep) {
          const mainFlow = seg.effectiveVelocity * seg.crossSectionArea;
          let secFlow: number;
          if (secondarySegs && secondarySegs[confluenceConfig.river1Segment]) {
            const ss = secondarySegs[confluenceConfig.river1Segment];
            secFlow = ss.effectiveVelocity * ss.crossSectionArea;
          } else {
            secFlow = mainFlow * 0.5;
          }
          const totalFlow = mainFlow + secFlow;
          for (const m of mixtures) {
            const secConc = secondaryResult.segmentOutConcentrations[confluenceConfig.river1Segment]
              ?? secondaryResult.segmentOutConcentrations.slice(-1)[0] ?? 1;
            const secWeight = secConc * (m.proportion); // 近似：支流各组分按同一浓度衰减
            concMap[m.pollutantId] = (concMap[m.pollutantId] * mainFlow + secWeight * secFlow) / totalFlow;
            concMap[m.pollutantId] = clamp(concMap[m.pollutantId], 0, 1);
          }
        }
      }

      distanceM += physicalStep;

      // 记录各污染物沿程浓度
      for (const id of mixtures.map(m => m.pollutantId)) {
        pollutantCurves[id].push(round(concMap[id] ?? 0, 6));
      }

      // 总浓度（所有污染物之和）
      const totalConc = clamp(
        mixtures.reduce((sum, m) => sum + (concMap[m.pollutantId] ?? 0), 0),
        0, 1,
      );

      physicsPoints.push({
        distanceFromOriginM: round(distanceM, 2),
        concentration: round(totalConc, 6),
        pollutantConcentrations: { ...concMap },
        ntu: round(baseNtu + mixtures.reduce((sum, m) => {
          const def = getBuiltinPollutant(m.pollutantId);
          return sum + (def ? (concMap[m.pollutantId] ?? 0) * def.ntu_impact : 0);
        }, 0), 2),
        catalystActive,
        segIndex: sIdx,
        effectiveWidth: seg.effectiveWidth,
      });
    }

    // 段出口总浓度
    const segTotalConc = clamp(
      mixtures.reduce((sum, m) => sum + (concMap[m.pollutantId] ?? 0), 0),
      0, 1,
    );
    segmentOutConcentrations.push(round(segTotalConc, 6));
    segmentOutNtu.push(round(baseNtu + mixtures.reduce((sum, m) => {
      const def = getBuiltinPollutant(m.pollutantId);
      return sum + (def ? (concMap[m.pollutantId] ?? 0) * def.ntu_impact : 0);
    }, 0), 2));
  }

  return { physicsPoints, segmentOutConcentrations, segmentOutNtu, optimalSegmentIndex, pollutantCurves };
}
```

- [ ] **步骤 3：Commit**

```bash
git add src/engine/simulation.ts
git commit -m "feat: multi-pollutant NTU baseline scan and full integration loop"
```

---

### 任务 6：重构 simulatePurification & runSingleRiver 入口

**文件：**
- 修改：`src/engine/simulation.ts:310-370`（simulatePurification）
- 修改：`src/engine/simulation.ts:923-998`（runSingleRiver）
- 修改：`src/engine/simulation.ts:788-921`（projectToCanvas）
- 修改：`src/engine/simulation.ts:551-613`（computeSegmentMetrics, searchOptimalSegment）

- [ ] **步骤 1：更新 `computeSegmentMetrics` 和 `searchOptimalSegment`**

这两个函数需要更新签名，将 `pollutantType` 改为 `mixtures`，使用各污染物的平均 k_base_alpha：

定位第 551-613 行，将 `computeSegmentMetrics` 的 `pollutantType` 参数改为 `mixtures: PollutantMixture[]`：

```typescript
function computeSegmentMetrics(
  effectiveSegs: EffectiveSegment[],
  ntuBaseline: NTUBaseline,
  catalystMap: CatalystMap,
  lightIntensity: number,
  tempFactor: number,
  mixtures: PollutantMixture[],
): SegmentMetricsV3[] {
  // 计算平均降解系数（用于反应得分估算）
  const avgK = mixtures.reduce((sum, m) => {
    const def = getBuiltinPollutant(m.pollutantId);
    return sum + (def ? def.k_base_alpha * m.proportion : 0);
  }, 0);
  
  return effectiveSegs.map((seg, idx) => {
    const alpha = ntuBaseline.perSegmentAlpha[idx] ?? ntuBaseline.perSegmentAlpha[0];
    const I_eff = lightIntensity * Math.exp(-alpha * seg.effectiveDepth);
    const residenceTime = seg.physicalLengthM / seg.effectiveVelocity;

    const entries = catalystMap.get(idx) ?? [];
    const kLocal = entries.reduce(
      (sum, entry) => sum + entry.activity * entry.doseRatio * I_eff * tempFactor,
      0,
    );
    const reactionScore = (avgK + kLocal) * residenceTime;

    return {
      segIndex: idx,
      velocity: round(seg.effectiveVelocity, 4),
      residenceTime: round(residenceTime, 4),
      effectiveLight: round(I_eff, 6),
      reactionScore: round(reactionScore, 6),
      depth: seg.effectiveDepth,
      width: seg.effectiveWidth,
      terrain: seg.isLake ? 'lake' : 'river',
    };
  });
}
```

`searchOptimalSegment` 保持不变。

- [ ] **步骤 2：更新 `projectToCanvas` — 支持多组分输出**

定位第 788-921 行。在函数体末尾（第 897-920 行 return 语句中）添加 `multiPollutantResults` 和 `pollutantCurves`：

```typescript
function projectToCanvas(
  raw: RawSimulationResult,
  gridWidth: number,
  gridHeight: number,
  mixtures: PollutantMixture[],
): SimulationResultV3 {
  // ... 前面部分保持不变 ...
  
  // ★ v5: 构建多组分出水口评估
  const multiPollutantResults: MultiPollutantResult[] = [];
  const firstPollutantId = mixtures[0]?.pollutantId ?? 'organic_macromolecule';
  
  for (const m of mixtures) {
    const def = getBuiltinPollutant(m.pollutantId);
    if (!def) continue;
    const finalConc = raw.segmentOutConcentrations.length > 0
      ? (raw.segmentOutConcentrations[raw.segmentOutConcentrations.length - 1] * m.proportion)
      : 1;
    const assessment = classifyWaterQuality(m.pollutantId as PollutantType, finalConc);
    multiPollutantResults.push({
      pollutantId: m.pollutantId,
      pollutantName: def.name,
      finalConcentration: finalConc,
      waterQualityClass: assessment.class,
      classIMet: assessment.classIMet,
    });
  }
  
  // 水质评估使用第一个主要污染物
  const finalConc = raw.segmentOutConcentrations[raw.segmentOutConcentrations.length - 1] ?? 1;
  const assessment = classifyWaterQuality(firstPollutantId as PollutantType, finalConc);
  const segmentAssessments = assessSegmentWaterQuality(firstPollutantId as PollutantType, raw.segmentOutConcentrations);
  const wqi = calculateWQI(firstPollutantId as PollutantType, raw.segmentOutConcentrations, raw.segmentOutNtu);
  
  const CLASS_I_THRESHOLD = 0.10;
  let distToStd: number | undefined;
  if (!assessment.classIMet) {
    for (let i = 0; i < riverPath.length; i++) {
      if (riverPath[i].concentration < CLASS_I_THRESHOLD) {
        distToStd = i / riverPath.length;
        break;
      }
    }
  }

  return {
    optimalX: round(optimalX, 2),
    optimalY: round(optimalY, 2),
    optimalSegmentIndex: raw.optimalSegmentIndex,
    segmentOutConcentrations: raw.segmentOutConcentrations,
    segmentMetrics: raw.segmentMetrics,
    riverPath,
    riverWidthPx: baseRiverWidthPx,
    segmentWidthsPx,
    waterQualityStandard: {
      classIMet: assessment.classIMet,
      waterQualityClass: assessment.class,
      residualRatio: finalConc,
      distanceToStandard: distToStd,
      segmentAssessments: segmentAssessments.map(item => ({
        segmentIndex: item.segmentIndex,
        classIMet: item.classIMet,
        waterQualityClass: item.class,
        residualRatio: item.residualRatio,
      })),
      wqi,
    },
    segmentOutNtu: raw.segmentOutNtu,
    multiPollutantResults,
    pollutantCurves: raw.pollutantCurves,
  };
}
```

注意：需要在 `RawSimulationResult` 接口中添加 `pollutantCurves` 字段（第 789-801 行）：

```typescript
interface RawSimulationResult {
  segmentOutConcentrations: number[];
  segmentOutNtu: number[];
  segmentMetrics: SegmentMetricsV3[];
  physicsPoints: PhysicsPoint[];
  optimalSegmentIndex: number;
  segmentDirectionAngles: number[];
  pollutantCurves?: Record<string, number[]>; // ★ v5
  secondaryResult?: { ... };
}
```

- [ ] **步骤 3：重写 `runSingleRiver` — 传递新参数**

定位第 927-998 行，将 `pollutantType: PollutantType` 参数改为 `mixtures: PollutantMixture[]`。更新所有内部调用。

```typescript
function runSingleRiver(
  segments: RiverSegmentV3[],
  pollutantDischarges: PollutantDischarge[] | undefined,
  catalystPlacements: CatalystPlacement[],
  baseNtu: number,
  mixtures: PollutantMixture[],
  lightIntensity: number,
  temperature: number,
  totalPhysicalSteps: number,
  consts: PhysicsConstants,
  confluenceConfig?: ConfluenceConfig,
  secondaryData?: RawSimulationResult,
  secondarySegments?: RiverSegmentV3[],
): RawSimulationResult {
  const effectiveSegs = computeEffectiveSegments(segments, consts, 0);
  const segLoads = computeDischargeLoads(pollutantDischarges, segments, effectiveSegs, mixtures);
  const catalystMap = buildCatalystMap(catalystPlacements, segments.length);
  
  const ntuBaseline = estimateNTUBaseline(
    effectiveSegs, segLoads, baseNtu, mixtures,
    lightIntensity, consts, totalPhysicalSteps,
  );
  
  const metrics = computeSegmentMetrics(
    effectiveSegs, ntuBaseline, catalystMap,
    lightIntensity, temperatureFactor(temperature, consts), mixtures,
  );
  const optimalSegmentIndex = searchOptimalSegment(metrics);
  
  let secondaryEffSegs: EffectiveSegment[] | undefined;
  if (secondarySegments && secondarySegments.length > 0) {
    secondaryEffSegs = computeEffectiveSegments(secondarySegments, consts, 0);
  }
  
  const integrated = integrate({
    effectiveSegs, segLoads, catalystMap,
    baseNtu, mixtures,
    lightIntensity, temperature, consts,
    totalPhysicalSteps, optimalSegmentIndex,
    confluenceConfig,
    secondaryResult: secondaryData,
    secondarySegs: secondaryEffSegs,
  });
  
  return {
    segmentOutConcentrations: integrated.segmentOutConcentrations,
    segmentOutNtu: integrated.segmentOutNtu,
    segmentMetrics: metrics,
    physicsPoints: integrated.physicsPoints,
    optimalSegmentIndex,
    segmentDirectionAngles: effectiveSegs.map(s => s.directionAngle),
    pollutantCurves: integrated.pollutantCurves,
  };
}
```

- [ ] **步骤 4：重构 `simulatePurification` 主入口**

定位第 310-370 行，替换为：

```typescript
export function simulatePurification(
  params: SimulationParamsV3,
  constants: PhysicsConstants = DEFAULTS,
): SimulationResultV3 {
  const {
    gridWidth, gridHeight, lightIntensity,
    segments, pollutantDischarges, catalystPlacements,
    secondarySegments, secondaryDischarges, confluenceConfig,
  } = params;

  const baseNtu = params.baseNtu ?? (params as SimulationParams).turbidity ?? 5;
  const temperature = params.temperature ?? 25;
  const mixtures = resolveMixtures(params);

  // ★ v5: 动态步长算法 — 根据总物理长度自适应采样密度
  const totalRiverM = segments.reduce((sum, seg) => sum + Math.max(1, seg.length), 0);
  const totalPhysicalSteps = computeDynamicSteps(totalRiverM, constants);

  // ① 支流独立仿真
  let secondaryRaw: RawSimulationResult | undefined;
  if (secondarySegments && secondarySegments.length > 0) {
    const secDischarges = (secondaryDischarges && secondaryDischarges.length > 0)
      ? secondaryDischarges
      : undefined;
    secondaryRaw = runSingleRiver(
      secondarySegments, secDischarges, catalystPlacements ?? [],
      baseNtu, mixtures, lightIntensity, temperature, totalPhysicalSteps,
      constants, undefined, undefined, undefined,
    );
  }

  // ② 主河仿真
  const result = runSingleRiver(
    segments, pollutantDischarges, catalystPlacements ?? [],
    baseNtu, mixtures, lightIntensity, temperature, totalPhysicalSteps,
    constants, confluenceConfig, secondaryRaw, secondarySegments,
  );

  // ③ 渲染投影
  const projected = projectToCanvas(result, gridWidth, gridHeight, mixtures);

  // ④ 支流投影
  if (secondaryRaw) {
    const secProjected = projectToCanvas(secondaryRaw, gridWidth, gridHeight, mixtures);
    projected.secondaryResult = {
      segmentOutConcentrations: secProjected.segmentOutConcentrations,
      segmentOutNtu: secProjected.segmentOutNtu,
      riverPath: secProjected.riverPath,
    };
  }

  return projected;
}
```

- [ ] **步骤 5：更新 `simulatePurificationLegacy` 兼容包装**

定位第 1003-1047 行，更新以使用新 API：

```typescript
export function simulatePurificationLegacy(
  params: SimulationParams & {
    catalystEfficiency?: number;
    turbidity?: number;
  },
): SimulationResultV3 {
  const placements: CatalystPlacement[] = params.catalystPlacements ?? [];

  if (placements.length === 0 && params.catalystEfficiency !== undefined) {
    const tempResult = simulatePurification({
      gridWidth: params.gridWidth,
      gridHeight: params.gridHeight,
      lightIntensity: params.lightIntensity,
      baseNtu: params.turbidity ?? params.baseNtu ?? 5,
      globalMixtures: [{ pollutantId: 'organic_macromolecule', proportion: 1.0 }],
      segments: params.segments as RiverSegmentV3[],
      catalystPlacements: [{
        segmentIndex: 0,
        activity: 0.5,
        doseRatio: (params.catalystEfficiency ?? 0.8) * 5,
      }],
    });
    placements.push({
      segmentIndex: tempResult.optimalSegmentIndex,
      activity: 0.5,
      doseRatio: (params.catalystEfficiency ?? 0.8) * 5,
    });
  }

  return simulatePurification({
    gridWidth: params.gridWidth,
    gridHeight: params.gridHeight,
    lightIntensity: params.lightIntensity,
    baseNtu: params.turbidity ?? params.baseNtu ?? 5,
    globalMixtures: [{ pollutantId: params.pollutantType ?? 'organic_macromolecule', proportion: 1.0 }],
    segments: params.segments as RiverSegmentV3[],
    catalystPlacements: placements.length > 0 ? placements : undefined,
  });
}
```

- [ ] **步骤 6：运行 TypeScript 编译检查**

```bash
npx tsc --noEmit 2>&1 | head -60
```

预期：编译通过，或仅有少量需要修复的类型不匹配。如果有错误，修复后再次检查。

- [ ] **步骤 7：Commit**

```bash
git add src/engine/simulation.ts
git commit -m "feat: multi-pollutant simulatePurification with dynamic step algorithm"
```

---

### 任务 7：更新 waterQuality.ts — 适配新 PollutantType 用法

**文件：**
- 修改：`src/engine/waterQuality.ts:1-170`

- [ ] **步骤 1：确保向后兼容性**

`waterQuality.ts` 中的 `CLASS_THRESHOLDS` 和 `classifyWaterQuality` 使用的是旧的 `PollutantType` string union，但现在 `PollutantType` 仍然是该 union 的别名（我们在任务 1 中保留了）。确认代码无需修改即可通过编译。

验证：
```bash
npx tsc --noEmit src/engine/waterQuality.ts 2>&1 | head -20
```

如果编译通过，无需修改此文件。

- [ ] **步骤 2：Commit（仅在需要时）**

如果无需修改，跳过此 commit。

---

### 任务 8：更新 optimizer.ts — 适配新 SimulationParamsV3

**文件：**
- 修改：`src/engine/optimizer.ts:1-361`

- [ ] **步骤 1：更新 `optimizeDosing` 中对 pollutantType 的引用**

定位第 301 行和第 306 行，从 `params.pollutantType` 改为使用 `params.globalMixtures` 的主要污染物：

```typescript
export function optimizeDosing(request: OptimizationRequest): OptimizationResult {
  const { params, maxDosingPoints, positionGridSize } = request;
  const mixtures = params.globalMixtures ?? 
    [{ pollutantId: params.pollutantType ?? 'organic_macromolecule', proportion: 1.0 }];
  const primaryPollutantType = (mixtures[0]?.pollutantId ?? 'organic_macromolecule') as PollutantType;

  // 基线：无催化剂
  const baseResult = evaluate(params, []);
  const baselineConcentration = baseResult.segmentOutConcentrations.slice(-1)[0] ?? 1;
  const baseAssessment = classifyWaterQuality(primaryPollutantType, baselineConcentration);
  // ... 其余保持不变，classifyWaterQuality 的参数从 pollutantType 改为 primaryPollutantType
  
  // 第 324 行的 assessment 也改为使用 primaryPollutantType
  const assessment = classifyWaterQuality(primaryPollutantType, finalConc);
```

- [ ] **步骤 2：更新 `evaluate` 函数**

定位第 67-74 行，`evaluate` 函数保持不变（它接受 `SimulationParamsV3`，现在 `params` 中应包含 `globalMixtures`）。

- [ ] **步骤 3：更新测试文件 `optimizer.test.ts`**

定位 `src/engine/optimizer.test.ts:14-22`，将 `baseParams` 中的 `pollutantType` 替换为 `globalMixtures`：

```typescript
const baseParams: SimulationParamsV3 = {
  gridWidth: 400,
  gridHeight: 150,
  lightIntensity: 1.0,
  baseNtu: 5,
  globalMixtures: [{ pollutantId: 'organic_macromolecule', proportion: 1.0 }],
  segments: defaultSegments,
};
```

同时将测试中所有 `pollutantType:` 替换为 `globalMixtures:`（第 19-20 行没有直接出现，但需要检查 `makeRequest` 的 overrides）。

第 91-99 行的湖泊段测试中，segments 的 length 现在是绝对米制。将 `length: 0.5` 改为 `length: 100`（100 米）：

```typescript
const lakeSegments: SimulationParamsV3['segments'] = [
  { id: 1, velocity: 1.0, directionAngle: 0, length: 100, depth: 1.5, width: 1.0, terrain: 'river' },
  { id: 2, velocity: 0.3, directionAngle: 0, length: 100, depth: 3.0, width: 1.0, terrain: 'lake' },
];
```

同理，第 8-13 行的 `defaultSegments` 需要改为米制：

```typescript
const defaultSegments: SimulationParamsV3['segments'] = [
  { id: 1, velocity: 1.0, directionAngle: 0, length: 250, depth: 1.5, width: 1.0 },
  { id: 2, velocity: 1.0, directionAngle: 0, length: 250, depth: 1.5, width: 1.2 },
  { id: 3, velocity: 1.0, directionAngle: 0, length: 250, depth: 1.5, width: 0.8 },
  { id: 4, velocity: 1.0, directionAngle: 0, length: 250, depth: 1.5, width: 1.0 },
];
```

- [ ] **步骤 4：运行测试验证修改**

```bash
npx vitest run src/engine/optimizer.test.ts 2>&1
```

预期：所有现有测试通过。如果超时或失败，调整参数（降低 totalRiverM 或增加超时时间）。

- [ ] **步骤 5：Commit**

```bash
git add src/engine/optimizer.ts src/engine/optimizer.test.ts
git commit -m "feat: update optimizer and tests for v5 multi-pollutant params"
```

---

### 任务 9：更新 App.tsx — 多组分状态管理 & 米制默认值

**文件：**
- 修改：`src/App.tsx:38-48`（DEFAULT_SEGMENTS）
- 修改：`src/App.tsx:96-118`（状态定义）
- 修改：`src/App.tsx:119-130`（effectivePlacements）
- 修改：`src/App.tsx:260-288`（本地仿真 useEffect）
- 修改：`src/App.tsx:319-380`（优化/剂量计算）
- 修改：`src/App.tsx:883-901`（SegmentControlPanel props 传递）

- [ ] **步骤 1：更新默认分段为米制**

```typescript
const DEFAULT_SEGMENTS: RiverSegment[] = [
  { id: 1, velocity: 2.0, angle: 0, directionAngle: 0, length: 333, depth: 1.5, width: 1.0 },
  { id: 2, velocity: 1.5, angle: 15, directionAngle: 15, length: 333, depth: 2.0, width: 1.2 },
  { id: 3, velocity: 2.5, angle: -10, directionAngle: -10, length: 334, depth: 1.0, width: 0.8 },
];
```

- [ ] **步骤 2：新增多组分状态**

在 `App.tsx` 第 96-118 行状态定义区，替换 `pollutantType` 状态：

```typescript
// ── v5: 多组分污染物状态 ────────────────────────────────────
const [pollutantSelections, setPollutantSelections] = useState<string[]>([
  'organic_macromolecule',
]);
const [pollutantProportions, setPollutantProportions] = useState<Record<string, number>>({
  organic_macromolecule: 1.0,
});
// 向后兼容：从选中列表中取第一个作为"主要污染物"
const pollutantType: PollutantType = (pollutantSelections[0] ?? 'organic_macromolecule') as PollutantType;
```

同时移除旧的 `const [pollutantType, setPollutantType] = useState<PollutantType>('organic_macromolecule');`（第 105 行）。

- [ ] **步骤 3：新增段级污染源状态**

```typescript
const [segmentPollutantSources, setSegmentPollutantSources] = useState<
  Record<number, SegmentPollutantSource>
>({});
```

- [ ] **步骤 4：更新本地仿真 useEffect（第 266-288 行）**

```typescript
const mixtures: PollutantMixture[] = pollutantSelections.map(id => ({
  pollutantId: id,
  proportion: pollutantProportions[id] ?? (1 / pollutantSelections.length),
}));

const v4Params: SimulationParamsV3 = {
  gridWidth: GRID_W,
  gridHeight: GRID_H,
  segments: segments.map(s => ({
    ...s,
    pollutantSource: segmentPollutantSources[s.id],
  })) as any,
  lightIntensity: light,
  baseNtu: turbidity,
  temperature,
  globalMixtures: mixtures,
  catalystPlacements: effectivePlacements.length > 0 ? effectivePlacements : undefined,
};
```

注意：需要导入 `SegmentPollutantSource` 和 `PollutantMixture` 类型（第 3-14 行 import 添加）。

- [ ] **步骤 5：更新远程仿真、优化、剂量计算的 payload**

将所有 `pollutant_type: pollutantType` → 使用 mixtures 中的第一个：
```typescript
pollutant_type: pollutantSelections[0] ?? 'organic_macromolecule',
```

优化 payload 额外添加 `pollutant_mixtures`:
```typescript
pollutant_mixtures: pollutantSelections.map(id => ({
  pollutant_id: id,
  proportion: pollutantProportions[id] ?? 0,
})),
```

- [ ] **步骤 6：更新 SegmentControlPanel props 传递（第 889-901 行）**

将 `pollutantType`/`setPollutantType` prop 替换为新的多组分 props:

```typescript
<SegmentControlPanel
  segments={segments}
  onSegmentsChange={setSegments}
  light={light} setLight={setLight}
  catalyst={catalyst} setCatalyst={setCatalyst}
  depth={depth} setDepth={setDepth}
  turbidity={turbidity} setTurbidity={setTurbidity}
  temperature={temperature} setTemperature={setTemperature}
  pollutantSelections={pollutantSelections}
  setPollutantSelections={setPollutantSelections}
  pollutantProportions={pollutantProportions}
  setPollutantProportions={setPollutantProportions}
  doseRatio={doseRatio} setDoseRatio={setDoseRatio}
  catalystPlacements={catalystPlacements}
  setCatalystPlacements={setCatalystPlacements}
  segmentPollutantSources={segmentPollutantSources}
  setSegmentPollutantSources={setSegmentPollutantSources}
/>
```

- [ ] **步骤 7：添加比例归一化逻辑**

在 App.tsx 中添加一个 `useEffect` 或 `useCallback`，确保当 pollutantSelections 变化时，proportions 自动归一化：

```typescript
// 当污染物选择变化时，自动归一化比例
useEffect(() => {
  if (pollutantSelections.length === 0) return;
  const total = pollutantSelections.reduce(
    (sum, id) => sum + (pollutantProportions[id] ?? (1 / pollutantSelections.length)),
    0,
  );
  if (Math.abs(total - 1.0) > 0.001) {
    const normalized: Record<string, number> = {};
    for (const id of pollutantSelections) {
      normalized[id] = (pollutantProportions[id] ?? (1 / pollutantSelections.length)) / total;
    }
    setPollutantProportions(normalized);
  }
}, [pollutantSelections]);
```

- [ ] **步骤 8：Commit**

```bash
git add src/App.tsx
git commit -m "feat: multi-pollutant state management and meter-based defaults in App"
```

---

### 任务 10：重构 SegmentControlPanel.tsx — 多选污染物 + 米制长度 + 段级污染源

**文件：**
- 修改：`src/components/SegmentControlPanel.tsx`

- [ ] **步骤 1：更新 Props 接口**

```typescript
import { getSegmentAngle, BUILTIN_POLLUTANTS, type RiverSegmentV3, type PollutantType, type CatalystPlacement, type PollutantMixture, type PollutantDefinition, type SegmentPollutantSource } from '../engine/simulation';

interface SegmentControlPanelProps {
  segments: RiverSegmentV3[];
  onSegmentsChange: (segs: RiverSegmentV3[]) => void;
  light: number; setLight: (l: number) => void;
  catalyst: number; setCatalyst: (c: number) => void;
  depth: number; setDepth: (d: number) => void;
  turbidity: number; setTurbidity: (t: number) => void;
  temperature: number; setTemperature: (t: number) => void;
  // ★ v5: 多组分
  pollutantSelections: string[];
  setPollutantSelections: (ids: string[]) => void;
  pollutantProportions: Record<string, number>;
  setPollutantProportions: (p: Record<string, number>) => void;
  doseRatio: number; setDoseRatio: (r: number) => void;
  catalystPlacements: CatalystPlacement[];
  setCatalystPlacements: (p: CatalystPlacement[]) => void;
  // ★ v5: 段级污染源
  segmentPollutantSources: Record<number, SegmentPollutantSource>;
  setSegmentPollutantSources: (s: Record<number, SegmentPollutantSource>) => void;
}
```

- [ ] **步骤 2：替换污染物选择 UI（单选 → 多选+比例滑块）**

将第 106-154 行的污染物单选按钮组替换为多选复选框 + 比例滑块：

```tsx
{/* ── 污染物种类（v5 多选）────────────────── */}
<div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">
    污染物种类（多选，比例自动归一化）
  </p>
  <div className="flex flex-col gap-2">
    {BUILTIN_POLLUTANTS.map(def => {
      const isSelected = pollutantSelections.includes(def.id);
      const proportion = pollutantProportions[def.id] ?? 0;
      return (
        <div key={def.id} className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => {
              if (isSelected) {
                const newIds = pollutantSelections.filter(id => id !== def.id);
                if (newIds.length === 0) return; // 至少保留一种
                const newProps = { ...pollutantProportions };
                delete newProps[def.id];
                // 归一化
                const total = Object.values(newProps).reduce((a, b) => a + b, 0);
                for (const k in newProps) newProps[k] /= total;
                setPollutantSelections(newIds);
                setPollutantProportions(newProps);
              } else {
                const newIds = [...pollutantSelections, def.id];
                const newProps = { ...pollutantProportions };
                // 均匀分配
                const share = 1 / newIds.length;
                for (const id of newIds) newProps[id] = share;
                setPollutantSelections(newIds);
                setPollutantProportions(newProps);
              }
            }}
            className="accent-blue-500"
          />
          <span className="text-xs font-medium text-gray-700 w-24">{def.name}</span>
          {isSelected && (
            <input
              type="range"
              min="0"
              max="100"
              value={Math.round(proportion * 100)}
              onChange={e => {
                const val = parseInt(e.target.value) / 100;
                const newProps = { ...pollutantProportions };
                newProps[def.id] = val;
                // 调整其他污染物比例使总和 = 1
                const others = pollutantSelections.filter(id => id !== def.id);
                const otherTotal = others.reduce((sum, id) => sum + (newProps[id] ?? 0), 0) || 0.001;
                const remaining = 1 - val;
                for (const id of others) {
                  newProps[id] = Math.max(0, remaining * (newProps[id] ?? 0) / otherTotal);
                }
                setPollutantProportions(newProps);
              }}
              className="flex-1 accent-blue-400"
            />
          )}
          {isSelected && (
            <span className="text-xs text-blue-600 font-mono w-10 text-right">
              {(proportion * 100).toFixed(0)}%
            </span>
          )}
        </div>
      );
    })}
  </div>
  <p className="text-xs text-gray-400 mt-2">
    总比例: {(pollutantSelections.reduce((sum, id) => sum + (pollutantProportions[id] ?? 0), 0) * 100).toFixed(0)}% （自动归一化至 100%）
  </p>
</div>
```

- [ ] **步骤 3：将段落长度控制改为米**

定位第 336-344 行（段落长度滑块），将 `min="0.1" max="1.0"` 改为 `min="1" max="10000"`：

```tsx
<div className="mb-2">
  <label className="flex justify-between text-xs text-gray-600 mb-0.5">
    <span>段落长度</span>
    <span className="font-bold text-violet-600">{seg.length.toFixed(0)} m</span>
  </label>
  <input type="range" min="1" max="10000" step="1" value={seg.length}
    onChange={e => updateSegment(seg.id, 'length', parseFloat(e.target.value))}
    className="w-full accent-violet-500" />
</div>
```

同时添加精确米数输入：

```tsx
<input
  type="number"
  min="1"
  max="100000"
  value={seg.length}
  onChange={e => updateSegment(seg.id, 'length', clampNumber(parseFloat(e.target.value), 1, 100000))}
  className="w-20 p-1 border border-gray-300 rounded text-xs text-right"
/>
```

- [ ] **步骤 4：每段添加独立污染源配置**

在每段面板中（第 335 行附近，河宽控制之后）添加：

```tsx
{/* 段级污染源 */}
<div className="mt-2 pt-2 border-t border-gray-200">
  <label className="text-xs font-medium text-gray-500 mb-1 block">
    本段污染源（空 = 继承全局）
  </label>
  <div className="flex flex-wrap gap-1">
    {BUILTIN_POLLUTANTS.map(def => {
      const source = segmentPollutantSources[seg.id];
      const isActive = source?.mixtures?.some(m => m.pollutantId === def.id);
      return (
        <button
          key={def.id}
          onClick={() => {
            const newSources = { ...segmentPollutantSources };
            const current = newSources[seg.id]?.mixtures ?? [];
            if (isActive) {
              newSources[seg.id] = {
                ...newSources[seg.id],
                mixtures: current.filter(m => m.pollutantId !== def.id),
              };
            } else {
              newSources[seg.id] = {
                ...newSources[seg.id],
                mixtures: [...current, { pollutantId: def.id, proportion: 1 / (current.length + 1) }],
              };
            }
            setSegmentPollutantSources(newSources);
          }}
          className={`text-xs px-1.5 py-0.5 rounded border transition ${
            isActive
              ? 'bg-amber-100 border-amber-300 text-amber-700'
              : 'bg-white border-gray-200 text-gray-400'
          }`}
        >
          {def.name}
        </button>
      );
    })}
  </div>
</div>
```

- [ ] **步骤 5：更新 `addSegment` 默认长度**

```typescript
function addSegment() {
  const newSegs = [
    ...segments.map(s => ({ ...s, depth: s.depth ?? 1.5, width: s.width ?? 1.0 })),
    {
      id: nextId++,
      velocity: 2.0,
      angle: 0,
      directionAngle: 0,
      length: 100, // ★ v5: 默认 100m
      depth: 1.5,
      width: 1.0,
    },
  ];
  onSegmentsChange(newSegs);
}
```

- [ ] **步骤 6：Commit**

```bash
git add src/components/SegmentControlPanel.tsx
git commit -m "feat: multi-select pollutants, meter-length sliders, per-segment sources UI"
```

---

### 任务 11：更新 Dashboard.tsx — 多组分曲线展示

**文件：**
- 修改：`src/components/Dashboard.tsx`

- [ ] **步骤 1：添加多组分浓度曲线**

在 Dashboard 的 chartData 中添加每种污染物的独立曲线：

```typescript
// 在 useMemo 的 datasets 数组中，原有 3 条曲线后追加：
...(result?.pollutantCurves ? Object.entries(result.pollutantCurves).map(([id, data]) => {
  const def = getBuiltinPollutant(id);
  const colors: Record<string, string> = {
    organic_macromolecule: 'rgb(168, 85, 247)',    // purple
    sediment_algae: 'rgb(245, 158, 11)',            // amber
    heavy_metal: 'rgb(239, 68, 68)',                // red
    petroleum_hydrocarbon: 'rgb(249, 115, 22)',     // orange
    nutrient_runoff: 'rgb(34, 197, 94)',            // green
    microplastic: 'rgb(148, 163, 184)',             // gray
  };
  return {
    label: def?.name ?? id,
    data: data.filter((_, i) => i % stride === 0).slice(0, visibleSamples),
    borderColor: colors[id] ?? 'rgb(148,163,184)',
    borderDash: [2, 2],
    borderWidth: 1.2,
    tension: 0.4,
    pointRadius: 0,
    fill: false,
    yAxisID: 'y',
    order: 10,
  };
}) : []),
```

注意：Dashboard 组件需要接收 `pollutantCurves` prop。更新 `DashboardProps` 接口。

- [ ] **步骤 2：添加多组分出水口水质卡片**

在水质评估卡片下方添加多组分出水口表格：

```tsx
{waterQualityStandard && (waterQualityStandard as any).multiPollutantResults && (
  <div className="px-4 py-2 glass-panel">
    <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">
      多组分出水口水质评估
    </p>
    <div className="flex gap-2 flex-wrap">
      {((waterQualityStandard as any).multiPollutantResults as MultiPollutantResult[]).map(mpr => (
        <div key={mpr.pollutantId} className="px-3 py-1.5 bg-white/5 rounded-lg text-xs border border-white/10">
          <span className="text-slate-300">{mpr.pollutantName}: </span>
          <span className={`font-bold ${mpr.classIMet ? 'text-emerald-300' : 'text-red-300'}`}>
            {(mpr.finalConcentration * 100).toFixed(1)}%
          </span>
          <span className="text-slate-500 ml-1">{mpr.waterQualityClass}</span>
        </div>
      ))}
    </div>
  </div>
)}
```

- [ ] **步骤 3：Commit**

```bash
git add src/components/Dashboard.tsx
git commit -m "feat: multi-pollutant concentration curves and water quality cards in Dashboard"
```

---

### 任务 12：端到端集成测试 & 验证

**文件：**
- 无新建文件

- [ ] **步骤 1：运行完整 TypeScript 编译**

```bash
npx tsc --noEmit 2>&1
```

预期：零错误。如有错误，逐行修复。

- [ ] **步骤 2：运行现有测试**

```bash
npx vitest run 2>&1
```

预期：`optimizer.test.ts` 全部通过。如有失败，检查 absolute length 转换是否正确。

- [ ] **步骤 3：启动开发服务器，手动验证**

```bash
npm run dev 2>&1 &
```

打开浏览器，检查：
1. 污染物多选复选框是否正常 → 勾选/取消后比例自动归一化
2. 比例滑块拖动 → 其他滑块联动调整
3. 段落长度从相对值变为米 → 显示 "333 m" 而非 "0.33×"
4. 添加新段 → 默认 100m
5. 段级污染源 → 可在某段选择独立污染物
6. Canvas 渲染正常 → 河流曲线无断裂
7. 折线图显示多组分曲线
8. 动画正常播放

- [ ] **步骤 4：边界测试**

手动设置极端参数：
- 河流总长 10m（3段，每段约 3m）
- 河流总长 10,000m（3段，每段约 3333m）
- 单一污染物 100%
- 6 种污染物均匀配比（各 16.7%）

验证每种情况下 Canvas 无明显卡顿，折线图不崩溃。

- [ ] **步骤 5：Commit（如有修复）**

```bash
git add -A
git commit -m "fix: integration fixes for v5 multi-pollutant engine"
```

---

> **⚠️ 实现注意事项：**
> 1. 所有 `classifyWaterQuality` 调用仍使用旧 `PollutantType` union 作为第一个参数——我们在任务 1 中保留了这个类型别名，因此向后兼容
> 2. 动态步长算法确保 `totalPhysicalSteps` 在 20~5000 范围内，避免 Canvas 性能问题
> 3. 段级污染源为空时，自动使用全局 mixtures——保证了逐段兼容
> 4. 比例归一化在前端 `useEffect` 中执行，总比例始终等于 100%
> 5. `pollutantCurves` 记录每个采样点的多组分浓度，供 Dashboard 绘制独立曲线
