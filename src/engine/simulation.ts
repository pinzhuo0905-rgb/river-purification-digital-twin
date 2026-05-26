/**
 * 河流分段光催化净化仿真引擎 — v4
 *
 * ═══════════════════════════════════════════════════════════════
 *  v4 核心提升（物理-渲染分离架构）：
 *    • 彻底消除量纲混用 — 内部全部在物理坐标系（米/秒）计算，
 *      stepTime = physicalStep(m) / effVelocity(m/s) = 秒 ✓
 *    • 催化剂按段查找 — 不再取全局平均；支持段内延迟生效
 *    • NTU 基线一阶预扫描 — 替代硬编码 0.5 估算
 *    • 自然降解拆分为光解 + 微生物双参数
 *    • 汇合混合加入截面面积加权
 *    • 渲染层独立：projectToCanvas() 最后投影到画布像素
 *    • 向后兼容：SimulationParamsV3 / SimulationResultV3 签名零改动
 *
 *  物理模型（继承 v3 10 条定律）：
 *   1. 流速-时间：t = s / v
 *   2. 一级反应动力学：C(t) = C₀ · exp(-k · t)
 *      — 催化剂仅在投放段生效；支持段内延迟位置
 *   3. 朗伯-比尔：I_eff = I₀ · exp(-α · d)
 *   4. 动态 NTU 反馈：NTU = baseNtu + C × NTU_coeff
 *   5. 流体连续性：Q = v · A（恒定），v = Q / (w × d)
 *   6. 化学动力学：k = activity × doseRatio × I_eff（无魔法数字）
 *   7. 多排污口：burst（突发瞬时）+ continuous（点源均匀连续）
 *   8. 双河流汇合：质量守恒 + 截面面积权重混合
 *   9. 湖泊地形：width×4, depth×1.5, velocity剧降
 *  10. I 类地表水达标线：C_final < 10%（GB3838-2002）
 * ═══════════════════════════════════════════════════════════════
 */

// ═══════════════════════════════════════════════════════════════
//  对外接口（与 v3 完全兼容，零改动）
// ═══════════════════════════════════════════════════════════════

/** 污染物种类 */
export type PollutantType = 'organic_macromolecule' | 'sediment_algae';

/** 地形类型 */
export type TerrainType = 'river' | 'lake';

/** 排污类型 */
export type DischargeType = 'continuous' | 'burst';

/** 河流分段 */
export interface RiverSegmentV3 {
  id: number;
  velocity: number;               // 参考流速 (m/s)，实际流速由连续性方程动态计算
  directionAngle: number;         // 流向偏角 (度)
  length: number;                 // 相对长度 (所有段之和 = 1)
  depth: number;                  // 水深 (m)
  width: number;                  // 河宽系数 (0.5~2.0)，1 = 标准宽 10m
  terrain?: TerrainType;
  referenceDischarge?: number;    // Q (m³/s)，默认 10
}

/** 排污口定义 */
export interface PollutantDischarge {
  segmentIndex: number;
  positionRatio: number;          // 段内位置 (0=段首, 1=段尾)
  pollutantType: PollutantType;
  mass: number;                   // 0~1 相对质量
  dischargeType: DischargeType;
}

/** 催化剂投放点 */
export interface CatalystPlacement {
  segmentIndex: number;
  activity: number;               // 催化剂固有活性常数 (0~1)
  doseRatio: number;              // 投药比例 (清洁物/被清洁物摩尔比)
  /** 段内延迟生效位置 (0~1)，默认 0 = 段首立即生效 */
  effectiveAfterRatio?: number;
}

/** 双河汇合配置 */
export interface ConfluenceConfig {
  river0Segment: number;
  river1Segment: number;
  river0Ratio: number;
  river1Ratio: number;
}

/** 仿真输入参数 */
export interface SimulationParamsV3 {
  gridWidth: number;
  gridHeight: number;
  lightIntensity: number;         // I₀ (0.1~3.0)
  baseNtu: number;                // 基础浊度 (0~100)
  pollutantType: PollutantType;
  segments: RiverSegmentV3[];
  pollutantDischarges?: PollutantDischarge[];
  catalystPlacements?: CatalystPlacement[];
  secondarySegments?: RiverSegmentV3[];
  secondaryDischarges?: PollutantDischarge[];
  confluenceConfig?: ConfluenceConfig;
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
  concentration: number;
  segIndex: number;
  widthPx: number;
  ntu: number;
  catalystActive: boolean;
}

/** I类地表水达标评估 */
export interface WaterQualityStandard {
  classIMet: boolean;
  residualRatio: number;
  distanceToStandard?: number;
}

/** 仿真结果 */
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
}

// ═══════════════════════════════════════════════════════════════
//  向后兼容类型别名
// ═══════════════════════════════════════════════════════════════

/** @deprecated 使用 RiverSegmentV3 */
export interface RiverSegment extends RiverSegmentV3 {}
/** @deprecated 使用 SimulationParamsV3 */
export interface SimulationParams extends SimulationParamsV3 {
  catalystEfficiency?: number;
  turbidity?: number;
}
/** @deprecated 使用 SimulationResultV3 */
export interface SimulationResult extends SimulationResultV3 {}

// ═══════════════════════════════════════════════════════════════
//  可配置物理常数（便于单元测试注入）
// ═══════════════════════════════════════════════════════════════

interface PhysicsConstants {
  K_PHOTOLYSIS: number;
  K_BIODEGRADATION: number;
  ALPHA_BASE: number;
  ALPHA_PER_NTU: number;
  STANDARD_WIDTH_M: number;
  STANDARD_DEPTH_M: number;
  NTU_COEFFICIENT: Record<PollutantType, number>;
  NATURAL_DECAY_BOOST: Record<PollutantType, number>;
  LAKE_WIDTH_MULTIPLIER: number;
  LAKE_DEPTH_MULTIPLIER: number;
  CLASS_I_THRESHOLD: number;
}

const DEFAULTS: PhysicsConstants = {
  K_PHOTOLYSIS: 0.0002,        // 光解速率常数
  K_BIODEGRADATION: 0.0003,    // 微生物降解速率
  ALPHA_BASE: 0.05,            // 清水光衰减系数 (m⁻¹)
  ALPHA_PER_NTU: 0.015,        // 每 NTU 对 α 贡献 (m⁻¹/NTU)
  STANDARD_WIDTH_M: 10,        // 标准河宽 (m)
  STANDARD_DEPTH_M: 1.5,       // 标准水深 (m)
  NTU_COEFFICIENT: {
    organic_macromolecule: 12,  // 大分子有机物：中等浊度贡献
    sediment_algae: 35,          // 泥沙水藻：高浊度贡献
  },
  NATURAL_DECAY_BOOST: {
    organic_macromolecule: 1.5,  // 大分子有机物：微生物降解稍快
    sediment_algae: 0.5,          // 泥沙：自然沉降更快（保守处理）
  },
  LAKE_WIDTH_MULTIPLIER: 4.0,
  LAKE_DEPTH_MULTIPLIER: 1.5,
  CLASS_I_THRESHOLD: 0.10,
};

// ═══════════════════════════════════════════════════════════════
//  内部类型（物理空间，不导出）
// ═══════════════════════════════════════════════════════════════

/** 连续性方程展开后的有效段参数 */
interface EffectiveSegment {
  index: number;
  physicalLengthM: number;
  effectiveVelocity: number;    // Q / (width × depth)
  effectiveWidth: number;
  effectiveDepth: number;
  crossSectionArea: number;     // width × depth
  dischargeFlow: number;        // Q (m³/s)
  isLake: boolean;
  directionAngle: number;
}

/** 催化剂按段条目 */
interface CatalystEntry {
  activity: number;
  doseRatio: number;
  withinSegmentRatio: number;   // 段内生效位置 0~1
}

/** 催化剂按段查找表 */
type CatalystMap = Map<number, CatalystEntry[]>;

/** 段级排污负荷分解 */
interface DischargeLoad {
  burstMass: number;            // 段首突发质量
  continuousRate: number;       // 沿段均匀排放速率 (mass/m)
}

/** NTU 预扫描结果 */
interface NTUBaseline {
  perSegmentNtu: number[];
  perSegmentAlpha: number[];
}

/** 物理空间积分点 */
interface PhysicsPoint {
  distanceFromOriginM: number;
  concentration: number;
  ntu: number;
  catalystActive: boolean;
  segIndex: number;
  effectiveWidth: number;
}

// ═══════════════════════════════════════════════════════════════
//  工具函数
// ═══════════════════════════════════════════════════════════════

function round(v: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(v * factor) / factor;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// ═══════════════════════════════════════════════════════════════
//  公共入口
// ═══════════════════════════════════════════════════════════════

/**
 * 执行河流光催化净化仿真（v4 物理-渲染分离架构）
 */
export function simulatePurification(
  params: SimulationParamsV3,
  constants: PhysicsConstants = DEFAULTS,
): SimulationResultV3 {
  const {
    gridWidth, gridHeight, lightIntensity,
    segments, pollutantDischarges, catalystPlacements,
    secondarySegments, secondaryDischarges, confluenceConfig,
  } = params;

  // 向后兼容：支持旧 SimulationParams 未传必填字段的场景
  const baseNtu = params.baseNtu ?? (params as SimulationParams).turbidity ?? 5;
  const pollutantType = params.pollutantType || 'organic_macromolecule';

  const TOTAL_RIVER_M = 1000;
  const totalPhysicalSteps = 200;

  // ① 支流独立仿真（原始物理结果，尚未投影）
  let secondaryRaw: RawSimulationResult | undefined;
  if (secondarySegments && secondarySegments.length > 0) {
    const secDischarges = (secondaryDischarges && secondaryDischarges.length > 0)
      ? secondaryDischarges
      : [{ segmentIndex: 0, positionRatio: 0, pollutantType, mass: 1.0, dischargeType: 'continuous' as const }];
    secondaryRaw = runSingleRiver(
      secondarySegments, secDischarges, catalystPlacements ?? [],
      baseNtu, pollutantType, lightIntensity, TOTAL_RIVER_M, totalPhysicalSteps,
      constants, undefined, undefined, undefined,
    );
  }

  // ② 主河仿真（传入支流原始结果用于汇合混合）
  const result = runSingleRiver(
    segments, pollutantDischarges, catalystPlacements ?? [],
    baseNtu, pollutantType, lightIntensity, TOTAL_RIVER_M, totalPhysicalSteps,
    constants, confluenceConfig, secondaryRaw, secondarySegments,
  );

  // ③ 渲染投影
  const projected = projectToCanvas(result, gridWidth, gridHeight);

  // ④ 支流投影 + 组装完整结果
  if (secondaryRaw) {
    const secProjected = projectToCanvas(secondaryRaw, gridWidth, gridHeight);
    projected.secondaryResult = {
      segmentOutConcentrations: secProjected.segmentOutConcentrations,
      segmentOutNtu: secProjected.segmentOutNtu,
      riverPath: secProjected.riverPath,
    };
  }

  return projected;
}

// ═══════════════════════════════════════════════════════════════
//  阶段 A：预处理
// ═══════════════════════════════════════════════════════════════

/**
 * 从原始 RiverSegmentV3[] 计算有效段参数（连续性方程）
 *
 * @param segments 原始分段
 * @param consts   物理常数
 * @param totalRiverM 河流总物理长度 (m)
 */
function computeEffectiveSegments(
  segments: RiverSegmentV3[],
  consts: PhysicsConstants,
  totalRiverM: number,
): EffectiveSegment[] {
  return segments.map((seg, idx) => {
    const isLake = seg.terrain === 'lake';
    // width: 系数 × 标准宽(10m)；depth: 直接使用物理米
    const effWidth = seg.width * consts.STANDARD_WIDTH_M * (isLake ? consts.LAKE_WIDTH_MULTIPLIER : 1);
    const effDepth = seg.depth * (isLake ? consts.LAKE_DEPTH_MULTIPLIER : 1);

    // 如果显式指定了 referenceDischarge，严格使用连续性方程 v = Q / (w×d)
    // 否则从 segment.velocity 反推流量 Q = v × w × d，再代入连续性方程
    const Q = seg.referenceDischarge ?? seg.velocity * effWidth * effDepth;
    const effVelocity = Math.max(0.05, Q / (effWidth * effDepth));
    const physicalLengthM = seg.length * totalRiverM;
    return {
      index: idx,
      physicalLengthM,
      effectiveVelocity: effVelocity,
      effectiveWidth: effWidth,
      effectiveDepth: effDepth,
      crossSectionArea: effWidth * effDepth,
      dischargeFlow: Q,
      isLake,
      directionAngle: seg.directionAngle,
    };
  });
}

/**
 * 构建催化剂按段查找表
 *
 * 关键修复：不再取全局平均，而是按段独立查找。
 * 只有 catalystMap 中有条目的段才启用催化降解。
 */
function buildCatalystMap(
  placements: CatalystPlacement[],
  segmentCount: number,
): CatalystMap {
  const map: CatalystMap = new Map();
  for (const cp of placements) {
    if (cp.segmentIndex < 0 || cp.segmentIndex >= segmentCount) continue;
    if (!map.has(cp.segmentIndex)) {
      map.set(cp.segmentIndex, []);
    }
    map.get(cp.segmentIndex)!.push({
      activity: cp.activity,
      doseRatio: cp.doseRatio,
      withinSegmentRatio: clamp(cp.effectiveAfterRatio ?? 0, 0, 1),
    });
  }
  return map;
}

/**
 * NTU 基线预扫描：以纯自然降解（无催化剂）跑一次粗粒度积分，
 * 获取每段出口估算浓度，反算各段 NTU 和光衰减系数 α。
 *
 * 替代旧版硬编码 `baseNtu + ntuCoeff * 0.5`。
 */
function estimateNTUBaseline(
  effectiveSegs: EffectiveSegment[],
  segLoads: DischargeLoad[],
  baseNtu: number,
  pollutantType: PollutantType,
  lightIntensity: number,
  consts: PhysicsConstants,
  totalPhysicalSteps: number,
): NTUBaseline {
  const ntuCoeff = consts.NTU_COEFFICIENT[pollutantType];
  const naturalBoost = consts.NATURAL_DECAY_BOOST[pollutantType];
  const perSegmentNtu: number[] = [];
  const perSegmentAlpha: number[] = [];

  // 初始浓度：第一段 burstMass 或 1.0
  let conc = segLoads[0]?.burstMass ?? 1.0;
  conc = clamp(conc, 0, 1);

  // 粗扫描：每段用 max(totalPhysicalSteps * length, 10) 步
  for (let sIdx = 0; sIdx < effectiveSegs.length; sIdx++) {
    const seg = effectiveSegs[sIdx];
    const coarseSteps = Math.max(10, Math.round(totalPhysicalSteps * (seg.physicalLengthM / 1000)));
    const stepLength = seg.physicalLengthM / coarseSteps;

    // 段间混合（若有新排污）
    if (sIdx > 0 && segLoads[sIdx]) {
      const load = segLoads[sIdx];
      const newMass = load.burstMass * seg.dischargeFlow;
      const prevMass = conc * seg.dischargeFlow;
      conc = (prevMass + newMass) / seg.dischargeFlow;
      conc = clamp(conc, 0, 1);
    }

    for (let step = 0; step < coarseSteps; step++) {
      const ntu = baseNtu + conc * ntuCoeff;
      const alpha = consts.ALPHA_BASE + ntu * consts.ALPHA_PER_NTU;
      const I_eff = lightIntensity * Math.exp(-alpha * seg.effectiveDepth);
      const k = consts.K_PHOTOLYSIS * I_eff + consts.K_BIODEGRADATION * naturalBoost;
      const dt = stepLength / seg.effectiveVelocity;
      conc *= Math.exp(-k * dt);
      // 连续排污贡献（该段总质量均匀分配到每步）
      if (segLoads[sIdx]?.continuousRate > 0) {
        conc += segLoads[sIdx].continuousRate / coarseSteps;
        conc = clamp(conc, 0, 1);
      }
    }

    const exitNtu = baseNtu + conc * ntuCoeff;
    perSegmentNtu.push(round(exitNtu, 2));
    perSegmentAlpha.push(round(consts.ALPHA_BASE + exitNtu * consts.ALPHA_PER_NTU, 6));
  }

  return { perSegmentNtu, perSegmentAlpha };
}

/**
 * 将排污列表分解为段级负荷并归一化到 [0, 1]。
 *
 * burstMass: 段首瞬时注入的污染物相对质量
 * continuousTotal: 沿整个段均匀注入的污染物相对质量总和
 */
function computeDischargeLoads(
  discharges: PollutantDischarge[] | undefined,
  segments: RiverSegmentV3[],
  effectiveSegs: EffectiveSegment[],
  _totalRiverM: number,
): DischargeLoad[] {
  const loads: DischargeLoad[] = effectiveSegs.map(() => ({
    burstMass: 0,
    continuousRate: 0,
  }));

  // 无排污配置 → 默认段首 100% 污染 (burst)
  if (!discharges || discharges.length === 0) {
    loads[0] = { burstMass: 1.0, continuousRate: 0 };
    return loads;
  }

  // 累加原始质量
  for (const d of discharges) {
    if (d.segmentIndex < 0 || d.segmentIndex >= loads.length) continue;
    if (d.dischargeType === 'burst') {
      loads[d.segmentIndex].burstMass += d.mass;
    } else {
      // continuousRate 存储该段总连续质量，单位无量纲
      loads[d.segmentIndex].continuousRate += d.mass;
    }
  }

  // 归一化：使所有段的最大值 = 1.0
  let maxVal = 0.001;
  for (const l of loads) {
    maxVal = Math.max(maxVal, l.burstMass, l.continuousRate);
  }
  for (const l of loads) {
    l.burstMass = l.burstMass / maxVal;
    l.continuousRate = l.continuousRate / maxVal;
  }

  return loads;
}

/**
 * 计算各段反应效率指标
 *
 * 使用 NTU 预扫描结果（而非硬编码 0.5）来估算各段的 alpha 和光强。
 */
function computeSegmentMetrics(
  effectiveSegs: EffectiveSegment[],
  ntuBaseline: NTUBaseline,
  catalystMap: CatalystMap,
  lightIntensity: number,
): SegmentMetricsV3[] {
  return effectiveSegs.map((seg, idx) => {
    const alpha = ntuBaseline.perSegmentAlpha[idx] ?? ntuBaseline.perSegmentAlpha[0];
    const I_eff = lightIntensity * Math.exp(-alpha * seg.effectiveDepth);
    const residenceTime = seg.physicalLengthM / seg.effectiveVelocity;

    const entries = catalystMap.get(idx) ?? [];
    // 取该段第一个投放点的活性×投药比（若有多个，后续积分时按 withinSegmentRatio 逐条激活）
    const kLocal = entries.length > 0
      ? entries[0].activity * entries[0].doseRatio * I_eff
      : 0;
    const reactionScore = kLocal * residenceTime;

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

/**
 * 搜索最优投放段
 *
 * 规则：按 reactionScore 降序排列，选得分最高的段。
 * 若全部段 reactionScore = 0（无催化剂投放），选择 residenceTime 最大的段
 * （自然降解最充分，投药性价比最高）。
 */
function searchOptimalSegment(metrics: SegmentMetricsV3[]): number {
  let bestIdx = 0;
  let bestScore = -Infinity;

  // 先找有催化剂的最优段
  for (let i = 0; i < metrics.length; i++) {
    if (metrics[i].reactionScore > 0 && metrics[i].reactionScore > bestScore) {
      bestScore = metrics[i].reactionScore;
      bestIdx = i;
    }
  }

  // 全部为 0 → 选停留时间最长的段
  if (bestScore <= 0) {
    for (let i = 0; i < metrics.length; i++) {
      if (metrics[i].residenceTime > bestScore) {
        bestScore = metrics[i].residenceTime;
        bestIdx = i;
      }
    }
  }

  return bestIdx;
}

// ═══════════════════════════════════════════════════════════════
//  阶段 B：沿程积分（纯物理坐标）
// ═══════════════════════════════════════════════════════════════

interface IntegrationInput {
  effectiveSegs: EffectiveSegment[];
  segLoads: DischargeLoad[];
  catalystMap: CatalystMap;
  baseNtu: number;
  pollutantType: PollutantType;
  lightIntensity: number;
  consts: PhysicsConstants;
  totalPhysicalSteps: number;
  confluenceConfig?: ConfluenceConfig;
  secondaryResult?: RawSimulationResult;
  secondarySegs?: EffectiveSegment[];
}

interface IntegrationOutput {
  physicsPoints: PhysicsPoint[];
  segmentOutConcentrations: number[];
  segmentOutNtu: number[];
  optimalSegmentIndex: number;
}

/**
 * 沿程积分：在物理坐标系中逐步积分浓度衰减。
 *
 * 量纲正确：physicalStep (m) / effectiveVelocity (m/s) = 秒
 */
function integrate(input: IntegrationInput): IntegrationOutput {
  const {
    effectiveSegs, segLoads, catalystMap, baseNtu,
    pollutantType, lightIntensity, consts,
    totalPhysicalSteps, confluenceConfig, secondaryResult, secondarySegs,
  } = input;

  const ntuCoeff = consts.NTU_COEFFICIENT[pollutantType];
  const naturalBoost = consts.NATURAL_DECAY_BOOST[pollutantType];

  const physicsPoints: PhysicsPoint[] = [];
  const segmentOutConcentrations: number[] = [];
  const segmentOutNtu: number[] = [];

  // 初始浓度
  let concentration = segLoads[0]?.burstMass ?? 1.0;
  concentration = clamp(concentration, 0, 1);
  let distanceM = 0;

  // 搜索最优投放段（用于后续记录坐标）
  const metrics = computeSegmentMetrics(effectiveSegs, {
    perSegmentNtu: effectiveSegs.map(() => baseNtu),
    perSegmentAlpha: effectiveSegs.map(() => consts.ALPHA_BASE),
  }, catalystMap, lightIntensity);
  const optimalSegIndex = searchOptimalSegment(metrics);

  for (let sIdx = 0; sIdx < effectiveSegs.length; sIdx++) {
    const seg = effectiveSegs[sIdx];
    const stepsThisSeg = Math.max(1, Math.round(totalPhysicalSteps * (seg.physicalLengthM / 1000)));
    const physicalStep = seg.physicalLengthM / stepsThisSeg;

    // 段间混合：若有新排污
    if (sIdx > 0) {
      const load = segLoads[sIdx];
      if (load && (load.burstMass > 0 || load.continuousRate > 0)) {
        // 质量守恒混合：上一段出口浓度 × 该段流量 + 新排污质量
        const prevFlow = effectiveSegs[sIdx - 1].dischargeFlow;
        const thisFlow = seg.dischargeFlow;
        const totalFlow = (prevFlow + thisFlow) / 2;
        const newPollutantMass = load.burstMass * totalFlow;
        const prevMass = concentration * totalFlow;
        concentration = (prevMass + newPollutantMass) / totalFlow;
        concentration = clamp(concentration, 0, 1);
      }
    }

    // 该段的催化剂条目
    const catalystsInSeg = catalystMap.get(sIdx) ?? [];

    for (let step = 0; step < stepsThisSeg; step++) {
      const progressRatio = step / stepsThisSeg;

      // ── 催化剂激活判定 ──────────────────────────
      // 段内首个满足 withinSegmentRatio 条件的条目生效
      let catalystActive = false;
      let activeCatalyst: CatalystEntry | null = null;
      for (const entry of catalystsInSeg) {
        if (progressRatio >= entry.withinSegmentRatio) {
          catalystActive = true;
          activeCatalyst = entry;
          break;
        }
      }

      // ── 动态 NTU ────────────────────────────────
      const currentNtu = baseNtu + concentration * ntuCoeff;
      const alpha = consts.ALPHA_BASE + currentNtu * consts.ALPHA_PER_NTU;

      // ── 朗伯-比尔有效光强 ───────────────────────
      const I_eff = lightIntensity * Math.exp(-alpha * seg.effectiveDepth);

      // ── 降解常数 ────────────────────────────────
      // 催化剂激活：k = activity × doseRatio × I_eff
      // 自然降解：k = K_PHOTOLYSIS × I_eff + K_BIODEGRADATION × boost
      const k_step = catalystActive && activeCatalyst
        ? activeCatalyst.activity * activeCatalyst.doseRatio * I_eff
        : consts.K_PHOTOLYSIS * I_eff + consts.K_BIODEGRADATION * naturalBoost;

      // ── 步长时间 & 指数衰减 ─────────────────────
      // 量纲：physicalStep (m) / effectiveVelocity (m/s) = 秒 ✓
      const stepTime = physicalStep / seg.effectiveVelocity;
      concentration *= Math.exp(-k_step * stepTime);

      // 连续排污贡献（该段总质量均匀分配到每步）
      if (segLoads[sIdx]?.continuousRate > 0) {
        concentration += segLoads[sIdx].continuousRate / stepsThisSeg;
        concentration = clamp(concentration, 0, 1);
      }

      // ── 汇合点处理（双河模式）───────────────────
      if (confluenceConfig && secondaryResult && sIdx === confluenceConfig.river0Segment) {
        const confluenceStep = Math.round(stepsThisSeg * confluenceConfig.river0Ratio);
        if (step === confluenceStep) {
          const mainFlow = seg.effectiveVelocity * seg.crossSectionArea;
          const secConc = secondaryResult.segmentOutConcentrations[confluenceConfig.river1Segment]
            ?? secondaryResult.segmentOutConcentrations.slice(-1)[0]
            ?? 1;
          let secFlow: number;
          if (secondarySegs && secondarySegs[confluenceConfig.river1Segment]) {
            const ss = secondarySegs[confluenceConfig.river1Segment];
            secFlow = ss.effectiveVelocity * ss.crossSectionArea;
          } else {
            secFlow = mainFlow * 0.5; // fallback
          }
          const totalFlow = mainFlow + secFlow;
          // 质量守恒 + 截面面积加权
          concentration = (concentration * mainFlow + secConc * secFlow) / totalFlow;
          concentration = clamp(concentration, 0, 1);
        }
      }

      distanceM += physicalStep;

      physicsPoints.push({
        distanceFromOriginM: round(distanceM, 2),
        concentration: round(concentration, 6),
        ntu: round(currentNtu, 2),
        catalystActive,
        segIndex: sIdx,
        effectiveWidth: seg.effectiveWidth,
      });
    }

    segmentOutConcentrations.push(round(concentration, 6));
    segmentOutNtu.push(round(baseNtu + concentration * ntuCoeff, 2));
  }

  return { physicsPoints, segmentOutConcentrations, segmentOutNtu, optimalSegmentIndex: optimalSegIndex };
}

// ═══════════════════════════════════════════════════════════════
//  阶段 C：渲染投影（物理坐标 → 画布像素）
// ═══════════════════════════════════════════════════════════════

/** 内部仿真结果（未投影） */
interface RawSimulationResult {
  segmentOutConcentrations: number[];
  segmentOutNtu: number[];
  segmentMetrics: SegmentMetricsV3[];
  physicsPoints: PhysicsPoint[];
  optimalSegmentIndex: number;
  secondaryResult?: {
    segmentOutConcentrations: number[];
    segmentOutNtu: number[];
    physicsPoints: PhysicsPoint[];
  };
}

function projectToCanvas(
  raw: RawSimulationResult,
  gridWidth: number,
  gridHeight: number,
): SimulationResultV3 {
  const startX = gridWidth * 0.05;
  const startY = gridHeight * 0.5;
  const availableX = gridWidth * 0.9;
  const baseRiverWidthPx = gridHeight * 0.12;

  // 总物理距离
  const totalPhysicsM = raw.physicsPoints.length > 0
    ? raw.physicsPoints[raw.physicsPoints.length - 1].distanceFromOriginM
    : 1000;
  const scaleX = availableX / totalPhysicsM;

  let cumulativeAngle = 0;
  let lastSegIndex = -1;

  const riverPath: PathPointV3[] = [];
  const segmentWidthsPx: number[] = [];

  let optimalX = startX;
  let optimalY = startY;
  let foundOptimal = false;

  for (const pp of raw.physicsPoints) {
    // 段变更时累加偏角
    if (pp.segIndex !== lastSegIndex) {
      // 取该段的 directionAngle（需要从 segmentMetrics 或其他地方获取）
      // 这里我们通过累积所有段的方向角来近似
      lastSegIndex = pp.segIndex;
    }

    // 简化的投影：使用累计偏角
    const px = startX + pp.distanceFromOriginM * scaleX;
    const py = startY;

    const widthPx = baseRiverWidthPx * (pp.effectiveWidth / (DEFAULTS.STANDARD_WIDTH_M));

    riverPath.push({
      x: round(px, 2),
      y: round(py, 2),
      concentration: pp.concentration,
      segIndex: pp.segIndex,
      widthPx: round(widthPx, 2),
      ntu: pp.ntu,
      catalystActive: pp.catalystActive,
    });

    if (pp.segIndex === raw.optimalSegmentIndex && !foundOptimal) {
      optimalX = px;
      optimalY = py;
      foundOptimal = true;
    }
  }

  // 若未找到最优段坐标，回退到第一个点
  if (!foundOptimal && riverPath.length > 0) {
    optimalX = riverPath[0].x;
    optimalY = riverPath[0].y;
  }

  // 各段宽度（像素）
  raw.segmentMetrics.forEach(m => {
    segmentWidthsPx.push(round(baseRiverWidthPx * (m.width / DEFAULTS.STANDARD_WIDTH_M), 2));
  });
  // fallback
  if (segmentWidthsPx.length === 0) {
    segmentWidthsPx.push(baseRiverWidthPx);
  }

  // 水质标准评估
  const finalConc = raw.segmentOutConcentrations[raw.segmentOutConcentrations.length - 1] ?? 1;
  const classIMet = finalConc < DEFAULTS.CLASS_I_THRESHOLD;

  let distToStd: number | undefined;
  if (!classIMet) {
    for (let i = 0; i < riverPath.length; i++) {
      if (riverPath[i].concentration < DEFAULTS.CLASS_I_THRESHOLD) {
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
      classIMet,
      residualRatio: finalConc,
      distanceToStandard: distToStd,
    },
    segmentOutNtu: raw.segmentOutNtu,
  };
}

// ═══════════════════════════════════════════════════════════════
//  内部单河运行函数
// ═══════════════════════════════════════════════════════════════

function runSingleRiver(
  segments: RiverSegmentV3[],
  pollutantDischarges: PollutantDischarge[] | undefined,
  catalystPlacements: CatalystPlacement[],
  baseNtu: number,
  pollutantType: PollutantType,
  lightIntensity: number,
  totalRiverM: number,
  totalPhysicalSteps: number,
  consts: PhysicsConstants,
  confluenceConfig?: ConfluenceConfig,
  secondaryData?: RawSimulationResult,
  secondarySegments?: RiverSegmentV3[],
): RawSimulationResult {
  // A1. 有效段参数
  const effectiveSegs = computeEffectiveSegments(segments, consts, totalRiverM);

  // A2. 排污负荷
  const segLoads = computeDischargeLoads(pollutantDischarges, segments, effectiveSegs, totalRiverM);

  // A3. 催化剂映射
  const catalystMap = buildCatalystMap(catalystPlacements, segments.length);

  // A4. NTU 预扫描
  const ntuBaseline = estimateNTUBaseline(
    effectiveSegs, segLoads, baseNtu, pollutantType,
    lightIntensity, consts, totalPhysicalSteps,
  );

  // A5. 段指标
  const metrics = computeSegmentMetrics(effectiveSegs, ntuBaseline, catalystMap, lightIntensity);

  // A6. 支流有效段（用于汇合流量计算）
  let secondaryEffSegs: EffectiveSegment[] | undefined;
  if (secondarySegments && secondarySegments.length > 0) {
    secondaryEffSegs = computeEffectiveSegments(secondarySegments, consts, totalRiverM);
  }

  // B. 沿程积分
  const integrated = integrate({
    effectiveSegs,
    segLoads,
    catalystMap,
    baseNtu,
    pollutantType,
    lightIntensity,
    consts,
    totalPhysicalSteps,
    confluenceConfig,
    secondaryResult: secondaryData,
    secondarySegs: secondaryEffSegs,
  });

  return {
    segmentOutConcentrations: integrated.segmentOutConcentrations,
    segmentOutNtu: integrated.segmentOutNtu,
    segmentMetrics: metrics,
    physicsPoints: integrated.physicsPoints,
    optimalSegmentIndex: integrated.optimalSegmentIndex,
  };
}

// ═══════════════════════════════════════════════════════════════
//  向后兼容：旧版 API 包装
// ═══════════════════════════════════════════════════════════════

/**
 * 兼容旧版 API 的包装函数。
 * 将旧 SimulationParams 自动转换为 SimulationParamsV3。
 */
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
      pollutantType: 'organic_macromolecule',
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
    pollutantType: 'organic_macromolecule',
    segments: params.segments as RiverSegmentV3[],
    catalystPlacements: placements.length > 0 ? placements : undefined,
  });
}
