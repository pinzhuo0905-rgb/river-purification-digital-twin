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
export type BuiltInPollutantType =
  | 'organic_macromolecule'   // 大分子有机物
  | 'sediment_algae'          // 泥沙水藻
  | 'heavy_metal'             // 重金属离子
  | 'petroleum_hydrocarbon'   // 石油烃类
  | 'nutrient_runoff'         // 氮磷富营养化
  | 'microplastic';           // 微塑料

export type PollutantType = BuiltInPollutantType | (string & {});

/** 污染物配比：值为 0~1 的相对占比，内部会自动归一化 */
export type PollutantMix = Partial<Record<string, number>>;

/** 自定义污染物参数 */
export interface CustomPollutantProfile {
  id: string;
  label: string;
  ntuCoefficient: number;
  naturalDecayBoost: number;
  supportsSettling?: boolean;
}

/** 地形类型 */
export type TerrainType = 'river' | 'lake';

/** 排污类型 */
export type DischargeType = 'continuous' | 'burst';

/** 河流分段 */
export interface RiverSegmentV3 {
  id: number;
  velocity: number;               // 参考流速 (m/s)，实际流速由连续性方程动态计算
  angle?: number;                 // 相对上一段的偏转角 (度)，0 = 沿当前方向延伸
  directionAngle?: number;        // @deprecated 兼容旧场景/API，等价于 angle
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
  baseNtu?: number;               // 基础浊度 (0~100)
  totalRiverLengthM?: number;     // 河流总物理长度 (m)，默认 1000
  temperature?: number;           // 水温 (°C)，默认 25°C
  pollutantType?: PollutantType;
  pollutantMix?: PollutantMix;    // 多污染物配比；未传时使用 pollutantType 100%
  customPollutants?: Record<string, CustomPollutantProfile>;
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
  concentration: number;
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

/** 学术级预设场景 */
export interface ScenarioPreset {
  id: string;
  name: string;
  domain: string;
  painPoint: string;
  researchValue: string;
  totalRiverLengthM: number;
  lightIntensity: number;
  baseNtu: number;
  temperature: number;
  pollutantType: PollutantType;
  pollutantMix: PollutantMix;
  segments: RiverSegmentV3[];
  pollutantDischarges: PollutantDischarge[];
  catalystPlacements: CatalystPlacement[];
}

export const POLLUTANT_LABELS: Record<BuiltInPollutantType, string> = {
  organic_macromolecule: '大分子有机物',
  sediment_algae: '泥沙水藻',
  heavy_metal: '重金属离子',
  petroleum_hydrocarbon: '石油烃类',
  nutrient_runoff: '氮磷富营养化',
  microplastic: '微塑料',
};

export function getPollutantLabel(
  pollutantType: PollutantType,
  customPollutants?: Record<string, CustomPollutantProfile>,
): string {
  return customPollutants?.[pollutantType]?.label
    ?? POLLUTANT_LABELS[pollutantType as BuiltInPollutantType]
    ?? pollutantType;
}

/** 覆盖环境工程、流体力学与灾害应急的内置科研预设库 */
export const ACADEMIC_SCENARIO_PRESETS: ScenarioPreset[] = [
  {
    id: 'industrial-night-illegal-discharge',
    name: '工业废水突发超标排放源追踪',
    domain: '工业环境学',
    painPoint: '上游化工厂在深夜无光照条件下突发偷排大分子有机污染物。',
    researchValue: '展示缺乏光照且流速极快时污染物向下游扩散的最恶劣工况。',
    totalRiverLengthM: 1800,
    lightIntensity: 0.0,
    baseNtu: 45,
    temperature: 18,
    pollutantType: 'organic_macromolecule',
    pollutantMix: { organic_macromolecule: 1.0 },
    segments: [
      { id: 1, velocity: 4.8, angle: 0, directionAngle: 0, length: 0.28, depth: 0.9, width: 0.5 },
      { id: 2, velocity: 5.6, angle: 12, directionAngle: 12, length: 0.24, depth: 0.8, width: 0.5 },
      { id: 3, velocity: 4.9, angle: -16, directionAngle: -16, length: 0.24, depth: 1.0, width: 0.6 },
      { id: 4, velocity: 4.2, angle: 8, directionAngle: 8, length: 0.24, depth: 1.1, width: 0.7 },
    ],
    pollutantDischarges: [
      { segmentIndex: 0, positionRatio: 0.05, pollutantType: 'organic_macromolecule', mass: 1.0, dischargeType: 'burst' },
    ],
    catalystPlacements: [
      { segmentIndex: 2, activity: 0.7, doseRatio: 1.2, effectiveAfterRatio: 0.45 },
    ],
  },
  {
    id: 'temperate-eutrophic-algal-bloom',
    name: '温带高富营养化水体赤潮爆发模拟',
    domain: '水生生态学',
    painPoint: '夏季正午强光下水体泥沙水藻暴增，极高浊度造成底层光盲区。',
    researchValue: '量化高 NTU 对朗伯-比尔光衰减与光催化净化效率的严重制约。',
    totalRiverLengthM: 2600,
    lightIntensity: 10.0,
    baseNtu: 150,
    temperature: 31,
    pollutantType: 'sediment_algae',
    pollutantMix: { sediment_algae: 0.8, organic_macromolecule: 0.2 },
    segments: [
      { id: 1, velocity: 0.22, angle: 0, directionAngle: 0, length: 0.25, depth: 2.6, width: 1.8 },
      { id: 2, velocity: 0.16, angle: 5, directionAngle: 5, length: 0.30, depth: 3.1, width: 2.0 },
      { id: 3, velocity: 0.11, angle: -4, directionAngle: -4, length: 0.25, depth: 3.4, width: 2.0, terrain: 'lake' },
      { id: 4, velocity: 0.18, angle: 3, directionAngle: 3, length: 0.20, depth: 2.8, width: 1.7 },
    ],
    pollutantDischarges: [
      { segmentIndex: 0, positionRatio: 0.0, pollutantType: 'sediment_algae', mass: 0.8, dischargeType: 'continuous' },
      { segmentIndex: 1, positionRatio: 0.35, pollutantType: 'organic_macromolecule', mass: 0.2, dischargeType: 'continuous' },
    ],
    catalystPlacements: [
      { segmentIndex: 1, activity: 0.9, doseRatio: 2.8, effectiveAfterRatio: 0.1 },
      { segmentIndex: 2, activity: 1.1, doseRatio: 3.6, effectiveAfterRatio: 0.25 },
    ],
  },
  {
    id: 'urban-flood-compound-runoff',
    name: '城市内涝与多源复合污染协同治理',
    domain: '市政工程学',
    painPoint: '暴雨径流将多种污染物冲刷入河，多个雨污混接口同时形成负荷脉冲。',
    researchValue: '评估低光照、高流量、多点源复合污染下的协同投药策略。',
    totalRiverLengthM: 3200,
    lightIntensity: 1.0,
    baseNtu: 85,
    temperature: 22,
    pollutantType: 'organic_macromolecule',
    pollutantMix: { organic_macromolecule: 0.5, sediment_algae: 0.5 },
    segments: [
      { id: 1, velocity: 2.4, angle: 0, directionAngle: 0, length: 0.18, depth: 1.2, width: 1.0 },
      { id: 2, velocity: 2.9, angle: -10, directionAngle: -10, length: 0.22, depth: 1.1, width: 1.1 },
      { id: 3, velocity: 1.8, angle: 14, directionAngle: 14, length: 0.22, depth: 1.6, width: 1.4 },
      { id: 4, velocity: 1.3, angle: -6, directionAngle: -6, length: 0.20, depth: 1.9, width: 1.6 },
      { id: 5, velocity: 1.7, angle: 8, directionAngle: 8, length: 0.18, depth: 1.5, width: 1.3 },
    ],
    pollutantDischarges: [
      { segmentIndex: 0, positionRatio: 0.1, pollutantType: 'organic_macromolecule', mass: 0.55, dischargeType: 'burst' },
      { segmentIndex: 1, positionRatio: 0.4, pollutantType: 'sediment_algae', mass: 0.45, dischargeType: 'continuous' },
      { segmentIndex: 3, positionRatio: 0.2, pollutantType: 'organic_macromolecule', mass: 0.35, dischargeType: 'continuous' },
    ],
    catalystPlacements: [
      { segmentIndex: 1, activity: 0.8, doseRatio: 2.2, effectiveAfterRatio: 0.25 },
      { segmentIndex: 3, activity: 1.0, doseRatio: 2.8, effectiveAfterRatio: 0.1 },
    ],
  },
  {
    id: 'estuary-oil-spill-emergency',
    name: '河湖交汇区石油烃泄漏应急拦截',
    domain: '灾害应急与流体力学',
    painPoint: '交通事故导致石油烃进入入湖口，油膜在宽浅缓流区滞留并持续遮光。',
    researchValue: '研究缓流扩散、湖泊段滞留时间与多级催化围控投放的耦合效果。',
    totalRiverLengthM: 2400,
    lightIntensity: 6.5,
    baseNtu: 32,
    temperature: 27,
    pollutantType: 'petroleum_hydrocarbon',
    pollutantMix: { petroleum_hydrocarbon: 0.7, organic_macromolecule: 0.3 },
    segments: [
      { id: 1, velocity: 1.4, angle: 0, directionAngle: 0, length: 0.22, depth: 1.3, width: 1.1 },
      { id: 2, velocity: 0.65, angle: 6, directionAngle: 6, length: 0.24, depth: 1.8, width: 1.6 },
      { id: 3, velocity: 0.18, angle: 0, directionAngle: 0, length: 0.34, depth: 2.4, width: 1.8, terrain: 'lake' },
      { id: 4, velocity: 0.42, angle: -5, directionAngle: -5, length: 0.20, depth: 1.7, width: 1.5 },
    ],
    pollutantDischarges: [
      { segmentIndex: 0, positionRatio: 0.15, pollutantType: 'petroleum_hydrocarbon', mass: 0.7, dischargeType: 'burst' },
      { segmentIndex: 1, positionRatio: 0.45, pollutantType: 'organic_macromolecule', mass: 0.3, dischargeType: 'continuous' },
    ],
    catalystPlacements: [
      { segmentIndex: 1, activity: 0.9, doseRatio: 2.4, effectiveAfterRatio: 0.2 },
      { segmentIndex: 2, activity: 1.4, doseRatio: 4.0, effectiveAfterRatio: 0.05 },
      { segmentIndex: 3, activity: 1.0, doseRatio: 2.6, effectiveAfterRatio: 0.15 },
    ],
  },
  {
    id: 'mining-flash-flood-metal-microplastic',
    name: '矿区洪峰重金属-微塑料迁移风险评估',
    domain: '地球化学与灾害应急',
    painPoint: '山洪冲刷尾矿与固废堆场，低浊度隐性污染在长河段中高速迁移。',
    researchValue: '对比高持久性重金属/微塑料在快速水动力条件下的低自净风险。',
    totalRiverLengthM: 5200,
    lightIntensity: 3.0,
    baseNtu: 38,
    temperature: 12,
    pollutantType: 'heavy_metal',
    pollutantMix: { heavy_metal: 0.7, microplastic: 0.3 },
    segments: [
      { id: 1, velocity: 3.8, angle: 0, directionAngle: 0, length: 0.16, depth: 0.8, width: 0.6 },
      { id: 2, velocity: 4.5, angle: 18, directionAngle: 18, length: 0.18, depth: 0.7, width: 0.5 },
      { id: 3, velocity: 3.2, angle: -22, directionAngle: -22, length: 0.20, depth: 1.0, width: 0.7 },
      { id: 4, velocity: 2.1, angle: 9, directionAngle: 9, length: 0.24, depth: 1.5, width: 1.0 },
      { id: 5, velocity: 1.4, angle: -5, directionAngle: -5, length: 0.22, depth: 1.8, width: 1.3 },
    ],
    pollutantDischarges: [
      { segmentIndex: 0, positionRatio: 0.0, pollutantType: 'heavy_metal', mass: 0.7, dischargeType: 'burst' },
      { segmentIndex: 1, positionRatio: 0.25, pollutantType: 'microplastic', mass: 0.3, dischargeType: 'burst' },
    ],
    catalystPlacements: [
      { segmentIndex: 3, activity: 1.5, doseRatio: 3.5, effectiveAfterRatio: 0.35 },
      { segmentIndex: 4, activity: 1.8, doseRatio: 4.5, effectiveAfterRatio: 0.1 },
    ],
  },
  {
    id: 'china-yangtze-three-gorges-canyon',
    name: '长江三峡库区深槽峡谷型河段',
    domain: '大型河流调度与水动力学',
    painPoint: '库区深水、宽窄交替与回水效应使有机污染物停留时间明显拉长。',
    researchValue: '对比峡谷窄深段与库湾宽深段在光衰减、停留时间和催化布点上的差异。',
    totalRiverLengthM: 9000,
    lightIntensity: 5.5,
    baseNtu: 42,
    temperature: 24,
    pollutantType: 'organic_macromolecule',
    pollutantMix: { organic_macromolecule: 0.45, nutrient_runoff: 0.35, sediment_algae: 0.2 },
    segments: [
      { id: 1, velocity: 1.9, angle: 0, directionAngle: 0, length: 0.16, depth: 7.5, width: 1.2 },
      { id: 2, velocity: 1.3, angle: 18, directionAngle: 18, length: 0.17, depth: 12.0, width: 0.9 },
      { id: 3, velocity: 0.55, angle: -12, directionAngle: -12, length: 0.22, depth: 18.0, width: 1.7, terrain: 'lake' },
      { id: 4, velocity: 0.85, angle: 10, directionAngle: 10, length: 0.18, depth: 14.0, width: 1.5 },
      { id: 5, velocity: 1.6, angle: -7, directionAngle: -7, length: 0.14, depth: 8.5, width: 1.1 },
      { id: 6, velocity: 1.2, angle: 5, directionAngle: 5, length: 0.13, depth: 10.0, width: 1.4 },
    ],
    pollutantDischarges: [
      { segmentIndex: 0, positionRatio: 0.2, pollutantType: 'organic_macromolecule', mass: 0.45, dischargeType: 'continuous' },
      { segmentIndex: 2, positionRatio: 0.3, pollutantType: 'nutrient_runoff', mass: 0.35, dischargeType: 'continuous' },
      { segmentIndex: 3, positionRatio: 0.55, pollutantType: 'sediment_algae', mass: 0.2, dischargeType: 'continuous' },
    ],
    catalystPlacements: [
      { segmentIndex: 1, activity: 1.0, doseRatio: 2.4, effectiveAfterRatio: 0.25 },
      { segmentIndex: 3, activity: 1.3, doseRatio: 3.2, effectiveAfterRatio: 0.15 },
      { segmentIndex: 5, activity: 0.9, doseRatio: 2.0, effectiveAfterRatio: 0.2 },
    ],
  },
  {
    id: 'china-yellow-river-loess-turbid',
    name: '黄河中游高含沙游荡型河段',
    domain: '泥沙动力学与流域水环境',
    painPoint: '黄土高原来沙造成极高 NTU，宽浅摆动河道让光催化反应受浊度强烈抑制。',
    researchValue: '用于研究高泥沙负荷、浅水强再悬浮和宽浅河槽对净化效率的影响。',
    totalRiverLengthM: 11000,
    lightIntensity: 7.2,
    baseNtu: 180,
    temperature: 26,
    pollutantType: 'sediment_algae',
    pollutantMix: { sediment_algae: 0.75, nutrient_runoff: 0.15, organic_macromolecule: 0.1 },
    segments: [
      { id: 1, velocity: 2.6, angle: 0, directionAngle: 0, length: 0.13, depth: 1.1, width: 1.8 },
      { id: 2, velocity: 3.1, angle: -25, directionAngle: -25, length: 0.16, depth: 0.9, width: 2.0 },
      { id: 3, velocity: 2.4, angle: 30, directionAngle: 30, length: 0.16, depth: 1.2, width: 1.7 },
      { id: 4, velocity: 1.7, angle: -18, directionAngle: -18, length: 0.20, depth: 1.6, width: 2.0 },
      { id: 5, velocity: 2.2, angle: 22, directionAngle: 22, length: 0.18, depth: 1.3, width: 1.9 },
      { id: 6, velocity: 1.5, angle: -10, directionAngle: -10, length: 0.17, depth: 1.8, width: 1.6 },
    ],
    pollutantDischarges: [
      { segmentIndex: 0, positionRatio: 0.0, pollutantType: 'sediment_algae', mass: 0.75, dischargeType: 'continuous' },
      { segmentIndex: 2, positionRatio: 0.4, pollutantType: 'nutrient_runoff', mass: 0.15, dischargeType: 'continuous' },
      { segmentIndex: 4, positionRatio: 0.35, pollutantType: 'organic_macromolecule', mass: 0.1, dischargeType: 'burst' },
    ],
    catalystPlacements: [
      { segmentIndex: 3, activity: 1.4, doseRatio: 4.0, effectiveAfterRatio: 0.1 },
      { segmentIndex: 5, activity: 1.2, doseRatio: 3.6, effectiveAfterRatio: 0.25 },
    ],
  },
  {
    id: 'china-pearl-river-delta-tidal-network',
    name: '珠江三角洲潮汐网河复合污染',
    domain: '河口海岸与城市群水环境',
    painPoint: '网河区宽窄分汊、缓流回荡与城市面源污染叠加，污染物易在低流速段滞留。',
    researchValue: '模拟潮汐缓流、宽窄河汊和多组分城市污染的协同治理。',
    totalRiverLengthM: 6800,
    lightIntensity: 4.5,
    baseNtu: 68,
    temperature: 29,
    pollutantType: 'organic_macromolecule',
    pollutantMix: { organic_macromolecule: 0.35, petroleum_hydrocarbon: 0.2, nutrient_runoff: 0.25, microplastic: 0.2 },
    segments: [
      { id: 1, velocity: 0.75, angle: 0, directionAngle: 0, length: 0.15, depth: 3.2, width: 1.5 },
      { id: 2, velocity: 0.38, angle: 28, directionAngle: 28, length: 0.14, depth: 4.0, width: 2.0 },
      { id: 3, velocity: 0.22, angle: -32, directionAngle: -32, length: 0.18, depth: 3.5, width: 1.7 },
      { id: 4, velocity: 0.55, angle: 16, directionAngle: 16, length: 0.16, depth: 2.6, width: 1.2 },
      { id: 5, velocity: 0.18, angle: -24, directionAngle: -24, length: 0.20, depth: 4.5, width: 2.0, terrain: 'lake' },
      { id: 6, velocity: 0.42, angle: 12, directionAngle: 12, length: 0.17, depth: 3.1, width: 1.6 },
    ],
    pollutantDischarges: [
      { segmentIndex: 0, positionRatio: 0.15, pollutantType: 'organic_macromolecule', mass: 0.35, dischargeType: 'continuous' },
      { segmentIndex: 1, positionRatio: 0.45, pollutantType: 'petroleum_hydrocarbon', mass: 0.2, dischargeType: 'burst' },
      { segmentIndex: 3, positionRatio: 0.2, pollutantType: 'nutrient_runoff', mass: 0.25, dischargeType: 'continuous' },
      { segmentIndex: 4, positionRatio: 0.5, pollutantType: 'microplastic', mass: 0.2, dischargeType: 'continuous' },
    ],
    catalystPlacements: [
      { segmentIndex: 2, activity: 1.0, doseRatio: 2.8, effectiveAfterRatio: 0.2 },
      { segmentIndex: 4, activity: 1.6, doseRatio: 4.2, effectiveAfterRatio: 0.1 },
      { segmentIndex: 5, activity: 1.1, doseRatio: 2.6, effectiveAfterRatio: 0.3 },
    ],
  },
  {
    id: 'china-tarim-inland-oasis-river',
    name: '塔里木河内陆干旱区绿洲河段',
    domain: '干旱区水资源与生态修复',
    painPoint: '长距离输水、强蒸发和低流速使营养盐与微塑料在尾闾河段累积。',
    researchValue: '用于研究干旱区长河道、窄浅断面和低温差日照条件下的生态净化。',
    totalRiverLengthM: 15000,
    lightIntensity: 8.5,
    baseNtu: 30,
    temperature: 34,
    pollutantType: 'nutrient_runoff',
    pollutantMix: { nutrient_runoff: 0.5, microplastic: 0.3, sediment_algae: 0.2 },
    segments: [
      { id: 1, velocity: 0.85, angle: 0, directionAngle: 0, length: 0.18, depth: 1.0, width: 0.9 },
      { id: 2, velocity: 0.55, angle: -14, directionAngle: -14, length: 0.18, depth: 0.8, width: 0.7 },
      { id: 3, velocity: 0.34, angle: 20, directionAngle: 20, length: 0.20, depth: 0.7, width: 0.6 },
      { id: 4, velocity: 0.28, angle: -16, directionAngle: -16, length: 0.17, depth: 0.6, width: 0.5 },
      { id: 5, velocity: 0.18, angle: 8, directionAngle: 8, length: 0.15, depth: 0.9, width: 1.1, terrain: 'lake' },
      { id: 6, velocity: 0.24, angle: -6, directionAngle: -6, length: 0.12, depth: 0.7, width: 0.8 },
    ],
    pollutantDischarges: [
      { segmentIndex: 1, positionRatio: 0.25, pollutantType: 'nutrient_runoff', mass: 0.5, dischargeType: 'continuous' },
      { segmentIndex: 2, positionRatio: 0.5, pollutantType: 'microplastic', mass: 0.3, dischargeType: 'continuous' },
      { segmentIndex: 4, positionRatio: 0.1, pollutantType: 'sediment_algae', mass: 0.2, dischargeType: 'continuous' },
    ],
    catalystPlacements: [
      { segmentIndex: 2, activity: 0.9, doseRatio: 2.0, effectiveAfterRatio: 0.4 },
      { segmentIndex: 4, activity: 1.4, doseRatio: 3.8, effectiveAfterRatio: 0.15 },
    ],
  },
  {
    id: 'china-songhua-freeze-thaw-industrial',
    name: '松花江春季解冻期工业城镇河段',
    domain: '寒区水环境与工业风险',
    painPoint: '解冻期低温降低反应速率，工业城镇段有机物与石油烃复合负荷上升。',
    researchValue: '评估低温 Arrhenius 抑制、宽缓河道和复合工业污染对催化投放的影响。',
    totalRiverLengthM: 7200,
    lightIntensity: 2.8,
    baseNtu: 55,
    temperature: 5,
    pollutantType: 'organic_macromolecule',
    pollutantMix: { organic_macromolecule: 0.45, petroleum_hydrocarbon: 0.35, heavy_metal: 0.2 },
    segments: [
      { id: 1, velocity: 1.1, angle: 0, directionAngle: 0, length: 0.18, depth: 2.2, width: 1.3 },
      { id: 2, velocity: 0.9, angle: 10, directionAngle: 10, length: 0.17, depth: 2.8, width: 1.5 },
      { id: 3, velocity: 0.72, angle: -18, directionAngle: -18, length: 0.20, depth: 3.1, width: 1.7 },
      { id: 4, velocity: 0.58, angle: 14, directionAngle: 14, length: 0.18, depth: 3.6, width: 1.9 },
      { id: 5, velocity: 0.82, angle: -8, directionAngle: -8, length: 0.15, depth: 2.7, width: 1.4 },
      { id: 6, velocity: 1.0, angle: 6, directionAngle: 6, length: 0.12, depth: 2.4, width: 1.2 },
    ],
    pollutantDischarges: [
      { segmentIndex: 1, positionRatio: 0.3, pollutantType: 'organic_macromolecule', mass: 0.45, dischargeType: 'continuous' },
      { segmentIndex: 2, positionRatio: 0.45, pollutantType: 'petroleum_hydrocarbon', mass: 0.35, dischargeType: 'burst' },
      { segmentIndex: 3, positionRatio: 0.2, pollutantType: 'heavy_metal', mass: 0.2, dischargeType: 'continuous' },
    ],
    catalystPlacements: [
      { segmentIndex: 2, activity: 1.2, doseRatio: 3.0, effectiveAfterRatio: 0.2 },
      { segmentIndex: 4, activity: 1.5, doseRatio: 4.0, effectiveAfterRatio: 0.2 },
    ],
  },
  {
    id: 'china-lancang-mountain-hydropower',
    name: '澜沧江高山峡谷梯级水电河段',
    domain: '高山河流与梯级水库水环境',
    painPoint: '高山峡谷急流与水库缓流交替，污染物在库尾回水段出现停留和再混合。',
    researchValue: '用于研究急流-库区转换、水深突变和流向大偏折下的催化响应。',
    totalRiverLengthM: 10500,
    lightIntensity: 6.0,
    baseNtu: 24,
    temperature: 16,
    pollutantType: 'microplastic',
    pollutantMix: { microplastic: 0.45, organic_macromolecule: 0.35, sediment_algae: 0.2 },
    segments: [
      { id: 1, velocity: 3.6, angle: 0, directionAngle: 0, length: 0.13, depth: 1.4, width: 0.6 },
      { id: 2, velocity: 4.2, angle: 26, directionAngle: 26, length: 0.15, depth: 1.2, width: 0.5 },
      { id: 3, velocity: 1.0, angle: -20, directionAngle: -20, length: 0.18, depth: 8.0, width: 1.1 },
      { id: 4, velocity: 0.24, angle: 8, directionAngle: 8, length: 0.24, depth: 16.0, width: 1.8, terrain: 'lake' },
      { id: 5, velocity: 2.2, angle: -28, directionAngle: -28, length: 0.15, depth: 2.0, width: 0.7 },
      { id: 6, velocity: 3.0, angle: 18, directionAngle: 18, length: 0.15, depth: 1.6, width: 0.6 },
    ],
    pollutantDischarges: [
      { segmentIndex: 0, positionRatio: 0.25, pollutantType: 'microplastic', mass: 0.45, dischargeType: 'burst' },
      { segmentIndex: 2, positionRatio: 0.35, pollutantType: 'organic_macromolecule', mass: 0.35, dischargeType: 'continuous' },
      { segmentIndex: 3, positionRatio: 0.4, pollutantType: 'sediment_algae', mass: 0.2, dischargeType: 'continuous' },
    ],
    catalystPlacements: [
      { segmentIndex: 3, activity: 1.7, doseRatio: 4.6, effectiveAfterRatio: 0.12 },
      { segmentIndex: 5, activity: 1.2, doseRatio: 2.8, effectiveAfterRatio: 0.25 },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════
//  向后兼容类型别名
// ═══════════════════════════════════════════════════════════════

/** @deprecated 使用 RiverSegmentV3 */
export interface RiverSegment extends RiverSegmentV3 {}
/** @deprecated 使用 SimulationParamsV3 */
export interface SimulationParams extends Omit<SimulationParamsV3, 'baseNtu' | 'pollutantType'> {
  baseNtu?: number;
  pollutantType?: PollutantType;
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
  NTU_COEFFICIENT: Record<BuiltInPollutantType, number>;
  NATURAL_DECAY_BOOST: Record<BuiltInPollutantType, number>;
  LAKE_WIDTH_MULTIPLIER: number;
  LAKE_DEPTH_MULTIPLIER: number;
  ACTIVATION_ENERGY_OVER_R: number;
  REFERENCE_TEMPERATURE_K: number;
}

const DEFAULTS: PhysicsConstants = {
  K_PHOTOLYSIS: 0.0002,        // 光解速率常数
  K_BIODEGRADATION: 0.0003,    // 微生物降解速率
  ALPHA_BASE: 0.05,            // 清水光衰减系数 (m⁻¹)
  ALPHA_PER_NTU: 0.015,        // 每 NTU 对 α 贡献 (m⁻¹/NTU)
  STANDARD_WIDTH_M: 10,        // 标准河宽 (m)
  STANDARD_DEPTH_M: 1.5,       // 标准水深 (m)
  NTU_COEFFICIENT: {
    organic_macromolecule: 12,   // 大分子有机物：中等浊度贡献
    sediment_algae: 35,          // 泥沙水藻：高浊度贡献
    heavy_metal: 2,              // 重金属离子：溶解态几乎透明
    petroleum_hydrocarbon: 18,   // 石油烃类：水面油膜反光，中高浊度
    nutrient_runoff: 10,         // 氮磷富营养化：中等浊度，藻华放大
    microplastic: 1,             // 微塑料：肉眼不可见，近乎零浊度
  },
  NATURAL_DECAY_BOOST: {
    organic_macromolecule: 1.5,  // 大分子有机物：微生物降解稍快
    sediment_algae: 0.5,         // 泥沙：自然沉降更快（保守处理）
    heavy_metal: 0.03,           // 重金属离子：几乎不自然降解，极其持久
    petroleum_hydrocarbon: 0.8,  // 石油烃类：光解主导，中等降解
    nutrient_runoff: 2.5,        // 氮磷富营养化：微生物快速吸收降解
    microplastic: 0.01,          // 微塑料：近乎永恒，需强力催化
  },
  LAKE_WIDTH_MULTIPLIER: 4.0,
  LAKE_DEPTH_MULTIPLIER: 1.5,
  ACTIVATION_ENERGY_OVER_R: 4500,
  REFERENCE_TEMPERATURE_K: 298.15,
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

export function getSegmentAngle(seg: Pick<RiverSegmentV3, 'angle' | 'directionAngle'>): number {
  return seg.angle ?? seg.directionAngle ?? 0;
}

/** 催化剂按段条目 */
interface CatalystEntry {
  activity: number;
  doseRatio: number;
  withinSegmentRatio: number;   // 段内生效位置 0~1
}

/** 催化剂按段查找表 */
type CatalystMap = Map<number, CatalystEntry[]>;

interface DischargeEvent {
  mass: number;
  positionRatio: number;
}

/** 段级排污负荷分解 */
interface DischargeLoad {
  burstMass: number;            // 兼容字段：该段瞬时排放总质量
  continuousRate: number;       // 兼容字段：该段连续排放总质量
  burstEvents: DischargeEvent[];
  continuousEvents: DischargeEvent[];
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

function temperatureFactor(celsius: number, consts: PhysicsConstants): number {
  const tempK = clamp(celsius + 273.15, 273.15, 323.15);
  return Math.exp(
    -consts.ACTIVATION_ENERGY_OVER_R *
    ((1 / tempK) - (1 / consts.REFERENCE_TEMPERATURE_K)),
  );
}

function supportsSettling(
  type: PollutantType,
  customPollutants?: Record<string, CustomPollutantProfile>,
): boolean {
  return customPollutants?.[type]?.supportsSettling === true
    || type === 'sediment_algae'
    || type === 'microplastic';
}

function normalizePollutantMix(mix: PollutantMix | undefined, fallback: PollutantType): Record<string, number> {
  const normalized: Record<string, number> = {};
  let total = 0;
  if (mix) {
    for (const key of Object.keys(mix)) {
      const value = Math.max(0, mix[key] ?? 0);
      normalized[key] = value;
      total += value;
    }
  }

  if (total <= 0) {
    normalized[fallback] = 1;
    return normalized;
  }

  for (const key of Object.keys(normalized)) {
    normalized[key] = normalized[key] / total;
  }
  return normalized;
}

function dominantPollutantType(mix: Record<string, number>, fallback: PollutantType): PollutantType {
  let dominant = fallback;
  let maxShare = -1;
  for (const [type, share] of Object.entries(mix)) {
    if (share > maxShare) {
      dominant = type;
      maxShare = share;
    }
  }
  return dominant;
}

function weightedConstant(
  mix: Record<string, number>,
  resolver: (type: PollutantType) => number,
): number {
  return Object.entries(mix).reduce(
    (sum, [type, share]) => sum + share * resolver(type),
    0,
  );
}

function mixtureSupportsSettling(
  mix: Record<string, number>,
  customPollutants?: Record<string, CustomPollutantProfile>,
): boolean {
  return Object.entries(mix).some(([type, share]) => share > 0.05 && supportsSettling(type, customPollutants));
}

function mixtureDepositionBase(
  mix: Record<string, number>,
  customPollutants?: Record<string, CustomPollutantProfile>,
): number {
  const customSettlingShare = Object.entries(mix).reduce(
    (sum, [type, share]) => sum + (customPollutants?.[type]?.supportsSettling ? share : 0),
    0,
  );
  return 0.00035 + (mix.sediment_algae ?? 0) * 0.00085 + customSettlingShare * 0.0005;
}

function mixtureResuspensionBase(
  mix: Record<string, number>,
  customPollutants?: Record<string, CustomPollutantProfile>,
): number {
  const customSettlingShare = Object.entries(mix).reduce(
    (sum, [type, share]) => sum + (customPollutants?.[type]?.supportsSettling ? share : 0),
    0,
  );
  return 0.00075 + (mix.sediment_algae ?? 0) * 0.00125 + customSettlingShare * 0.0007;
}

function getNtuCoefficient(
  type: PollutantType,
  consts: PhysicsConstants,
  customPollutants?: Record<string, CustomPollutantProfile>,
): number {
  return customPollutants?.[type]?.ntuCoefficient
    ?? consts.NTU_COEFFICIENT[type as BuiltInPollutantType]
    ?? consts.NTU_COEFFICIENT.organic_macromolecule;
}

function getNaturalDecayBoost(
  type: PollutantType,
  consts: PhysicsConstants,
  customPollutants?: Record<string, CustomPollutantProfile>,
): number {
  return customPollutants?.[type]?.naturalDecayBoost
    ?? consts.NATURAL_DECAY_BOOST[type as BuiltInPollutantType]
    ?? consts.NATURAL_DECAY_BOOST.organic_macromolecule;
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
  const pollutantMix = normalizePollutantMix(params.pollutantMix, pollutantType);
  const assessmentPollutantType = dominantPollutantType(pollutantMix, pollutantType);
  const temperature = params.temperature ?? 25;
  const customPollutants = params.customPollutants;

  const TOTAL_RIVER_M = params.totalRiverLengthM ?? 1000;
  const totalPhysicalSteps = 200;

  // ① 支流独立仿真（原始物理结果，尚未投影）
  let secondaryRaw: RawSimulationResult | undefined;
  if (secondarySegments && secondarySegments.length > 0) {
    const secDischarges = (secondaryDischarges && secondaryDischarges.length > 0)
      ? secondaryDischarges
      : [{ segmentIndex: 0, positionRatio: 0, pollutantType, mass: 1.0, dischargeType: 'continuous' as const }];
    secondaryRaw = runSingleRiver(
      secondarySegments, secDischarges, catalystPlacements ?? [],
      baseNtu, pollutantType, pollutantMix, lightIntensity, temperature, TOTAL_RIVER_M, totalPhysicalSteps,
      constants, customPollutants, undefined, undefined, undefined,
    );
  }

  // ② 主河仿真（传入支流原始结果用于汇合混合）
  const result = runSingleRiver(
    segments, pollutantDischarges, catalystPlacements ?? [],
    baseNtu, pollutantType, pollutantMix, lightIntensity, temperature, TOTAL_RIVER_M, totalPhysicalSteps,
    constants, customPollutants, confluenceConfig, secondaryRaw, secondarySegments,
  );

  // ③ 渲染投影
  const projected = projectToCanvas(result, gridWidth, gridHeight, assessmentPollutantType);

  // ④ 支流投影 + 组装完整结果
  if (secondaryRaw) {
    const secProjected = projectToCanvas(secondaryRaw, gridWidth, gridHeight, assessmentPollutantType);
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
  const totalRelativeLength = Math.max(0.0001, segments.reduce((acc, seg) => acc + Math.max(seg.length, 0), 0));
  return segments.map((seg, idx) => {
    const isLake = seg.terrain === 'lake';
    // width: 系数 × 标准宽(10m)；depth: 直接使用物理米
    const effWidth = seg.width * consts.STANDARD_WIDTH_M * (isLake ? consts.LAKE_WIDTH_MULTIPLIER : 1);
    const effDepth = seg.depth * (isLake ? consts.LAKE_DEPTH_MULTIPLIER : 1);

    // 如果显式指定了 referenceDischarge，严格使用连续性方程 v = Q / (w×d)
    // 否则从 segment.velocity 反推流量 Q = v × w × d，再代入连续性方程
    const Q = seg.referenceDischarge ?? seg.velocity * effWidth * effDepth;
    const effVelocity = Math.max(0.05, Q / (effWidth * effDepth));
    const physicalLengthM = (Math.max(seg.length, 0.0001) / totalRelativeLength) * totalRiverM;
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
  pollutantMix: Record<string, number>,
  lightIntensity: number,
  consts: PhysicsConstants,
  totalPhysicalSteps: number,
  customPollutants?: Record<string, CustomPollutantProfile>,
): NTUBaseline {
  const ntuCoeff = weightedConstant(
    pollutantMix,
    type => getNtuCoefficient(type, consts, customPollutants),
  );
  const naturalBoost = weightedConstant(
    pollutantMix,
    type => getNaturalDecayBoost(type, consts, customPollutants),
  );
  const perSegmentNtu: number[] = [];
  const perSegmentAlpha: number[] = [];

  // 初始浓度：仅注入第一段 0 位置的瞬时排放
  let conc = (segLoads[0]?.burstEvents ?? [])
    .filter(event => event.positionRatio <= 0)
    .reduce((sum, event) => sum + event.mass, 0);
  conc = clamp(conc, 0, 1);

  // 粗扫描：每段用 max(totalPhysicalSteps * length, 10) 步
  for (let sIdx = 0; sIdx < effectiveSegs.length; sIdx++) {
    const seg = effectiveSegs[sIdx];
    const coarseSteps = Math.max(10, Math.round(totalPhysicalSteps * (seg.physicalLengthM / 1000)));
    const stepLength = seg.physicalLengthM / coarseSteps;

    const load = segLoads[sIdx];
    const appliedBurst = new Set<number>(
      sIdx === 0
        ? load.burstEvents.flatMap((event, idx) => event.positionRatio <= 0 ? [idx] : [])
        : [],
    );

    for (let step = 0; step < coarseSteps; step++) {
      const endRatio = (step + 1) / coarseSteps;

      for (let eventIdx = 0; eventIdx < load.burstEvents.length; eventIdx++) {
        const event = load.burstEvents[eventIdx];
        if (appliedBurst.has(eventIdx) || event.positionRatio > endRatio) continue;
        conc = clamp(conc + event.mass, 0, 1);
        appliedBurst.add(eventIdx);
      }

      const ntu = baseNtu + conc * ntuCoeff;
      const alpha = consts.ALPHA_BASE + ntu * consts.ALPHA_PER_NTU;
      const I_eff = lightIntensity * Math.exp(-alpha * seg.effectiveDepth);
      const k = consts.K_PHOTOLYSIS * I_eff + consts.K_BIODEGRADATION * naturalBoost;
      const dt = stepLength / seg.effectiveVelocity;
      conc *= Math.exp(-k * dt);
      // 连续排污贡献：从指定段内位置开始均匀分配到剩余流程
      for (const event of load.continuousEvents) {
        if (endRatio < event.positionRatio) continue;
        const remainingSteps = Math.max(1, coarseSteps - Math.round(coarseSteps * event.positionRatio));
        conc += event.mass / remainingSteps;
      }
      conc = clamp(conc, 0, 1);
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
  _segments: RiverSegmentV3[],
  effectiveSegs: EffectiveSegment[],
  _totalRiverM: number,
): DischargeLoad[] {
  const loads: DischargeLoad[] = effectiveSegs.map(() => ({
    burstMass: 0,
    continuousRate: 0,
    burstEvents: [],
    continuousEvents: [],
  }));

  // 无排污配置 → 默认段首 100% 污染 (burst)
  if (!discharges || discharges.length === 0) {
    loads[0] = {
      burstMass: 1.0,
      continuousRate: 0,
      burstEvents: [{ mass: 1.0, positionRatio: 0 }],
      continuousEvents: [],
    };
    return loads;
  }

  // 累加原始质量
  for (const d of discharges) {
    if (d.segmentIndex < 0 || d.segmentIndex >= loads.length) continue;
    const event = {
      mass: Math.max(0, d.mass),
      positionRatio: clamp(d.positionRatio ?? 0, 0, 1),
    };
    if (d.dischargeType === 'burst') {
      loads[d.segmentIndex].burstMass += event.mass;
      loads[d.segmentIndex].burstEvents.push(event);
    } else {
      // continuousRate 存储该段总连续质量，单位无量纲
      loads[d.segmentIndex].continuousRate += event.mass;
      loads[d.segmentIndex].continuousEvents.push(event);
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
    l.burstEvents = l.burstEvents.map(event => ({ ...event, mass: event.mass / maxVal }));
    l.continuousEvents = l.continuousEvents.map(event => ({ ...event, mass: event.mass / maxVal }));
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
  tempFactor: number,
): SegmentMetricsV3[] {
  return effectiveSegs.map((seg, idx) => {
    const alpha = ntuBaseline.perSegmentAlpha[idx] ?? ntuBaseline.perSegmentAlpha[0];
    const I_eff = lightIntensity * Math.exp(-alpha * seg.effectiveDepth);
    const residenceTime = seg.physicalLengthM / seg.effectiveVelocity;

    const entries = catalystMap.get(idx) ?? [];
    const kLocal = entries.reduce(
      (sum, entry) => sum + entry.activity * entry.doseRatio * I_eff * tempFactor,
      0,
    );
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
  pollutantMix: Record<string, number>;
  customPollutants?: Record<string, CustomPollutantProfile>;
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
}

/**
 * 沿程积分：在物理坐标系中逐步积分浓度衰减。
 *
 * 量纲正确：physicalStep (m) / effectiveVelocity (m/s) = 秒
 */
function integrate(input: IntegrationInput): IntegrationOutput {
  const {
    effectiveSegs, segLoads, catalystMap, baseNtu,
    pollutantType, pollutantMix, customPollutants, lightIntensity, temperature, consts,
    totalPhysicalSteps, optimalSegmentIndex,
    confluenceConfig, secondaryResult, secondarySegs,
  } = input;

  const ntuCoeff = weightedConstant(
    pollutantMix,
    type => getNtuCoefficient(type, consts, customPollutants),
  );
  const naturalBoost = weightedConstant(
    pollutantMix,
    type => getNaturalDecayBoost(type, consts, customPollutants),
  );
  const tempFactor = temperatureFactor(temperature, consts);
  const settlingEnabled = supportsSettling(pollutantType, customPollutants) || mixtureSupportsSettling(pollutantMix, customPollutants);
  const depositionBase = mixtureDepositionBase(pollutantMix, customPollutants);
  const resuspensionBase = mixtureResuspensionBase(pollutantMix, customPollutants);

  const physicsPoints: PhysicsPoint[] = [];
  const segmentOutConcentrations: number[] = [];
  const segmentOutNtu: number[] = [];

  // 初始浓度：仅注入第一段 0 位置的瞬时排放
  let concentration = (segLoads[0]?.burstEvents ?? [])
    .filter(event => event.positionRatio <= 0)
    .reduce((sum, event) => sum + event.mass, 0);
  concentration = clamp(concentration, 0, 1);
  let bedStore = 0;
  let distanceM = 0;

  for (let sIdx = 0; sIdx < effectiveSegs.length; sIdx++) {
    const seg = effectiveSegs[sIdx];
    const stepsThisSeg = Math.max(1, Math.round(totalPhysicalSteps * (seg.physicalLengthM / 1000)));
    const physicalStep = seg.physicalLengthM / stepsThisSeg;

    // 段间混合：按上下游流量变化稀释已有污染物
    if (sIdx > 0) {
      const prevFlow = effectiveSegs[sIdx - 1].dischargeFlow;
      const thisFlow = seg.dischargeFlow;
      concentration = clamp(concentration * (prevFlow / thisFlow), 0, 1);
    }

    // 该段的催化剂条目
    const catalystsInSeg = catalystMap.get(sIdx) ?? [];
    const load = segLoads[sIdx];
    const appliedBurst = new Set<number>(
      sIdx === 0
        ? load.burstEvents.flatMap((event, idx) => event.positionRatio <= 0 ? [idx] : [])
        : [],
    );

    for (let step = 0; step < stepsThisSeg; step++) {
      const progressRatio = step / stepsThisSeg;
      const endRatio = (step + 1) / stepsThisSeg;
      const stepTime = physicalStep / seg.effectiveVelocity;
      const stepRatio = 1 / stepsThisSeg;

      for (let eventIdx = 0; eventIdx < load.burstEvents.length; eventIdx++) {
        const event = load.burstEvents[eventIdx];
        if (appliedBurst.has(eventIdx) || event.positionRatio > endRatio) continue;
        concentration = clamp(concentration + event.mass, 0, 1);
        appliedBurst.add(eventIdx);
      }

      const computeK = (conc: number, ratio: number) => {
        const ntu = baseNtu + conc * ntuCoeff;
        const alpha = consts.ALPHA_BASE + ntu * consts.ALPHA_PER_NTU;
        const I_eff = lightIntensity * Math.exp(-alpha * seg.effectiveDepth);
        const naturalK = (consts.K_PHOTOLYSIS * I_eff + consts.K_BIODEGRADATION * naturalBoost) * tempFactor;
        let catalystK = 0;

        for (const entry of catalystsInSeg) {
          if (ratio < entry.withinSegmentRatio) continue;
          const distanceFromDose = Math.max(0, (ratio - entry.withinSegmentRatio) * seg.physicalLengthM);
          const elapsedSinceDose = distanceFromDose / seg.effectiveVelocity;
          const uStar = Math.max(0.005, 0.05 * seg.effectiveVelocity);
          const lateralDiffusion = 0.6 * seg.effectiveDepth * uStar;
          const sigmaY = Math.sqrt(Math.max(0, 2 * lateralDiffusion * elapsedSinceDose));
          const coverage = clamp(sigmaY / Math.max(0.001, seg.effectiveWidth * 0.5), 0.12, 1);
          catalystK += entry.activity * entry.doseRatio * I_eff * coverage * tempFactor;
        }

        return { k: naturalK + catalystK, catalystActive: catalystK > 0 };
      };

      // 二阶指数中点法：用中点浓度重估 NTU、光强和总反应常数，避免强反应下线性 RK2 过冲。
      const k1Info = computeK(concentration, progressRatio);
      const midConc = clamp(concentration * Math.exp(-k1Info.k * stepTime * 0.5), 0, 1);
      const k2Info = computeK(midConc, Math.min(1, progressRatio + stepRatio / 2));
      concentration = clamp(concentration * Math.exp(-k2Info.k * stepTime), 0, 1);

      if (settlingEnabled && seg.effectiveVelocity < 0.3) {
        const depositionRate = depositionBase * (0.3 - seg.effectiveVelocity) / 0.3;
        const deposited = Math.min(concentration, concentration * depositionRate * stepTime);
        concentration -= deposited;
        bedStore = clamp(bedStore + deposited, 0, 1);
      } else if (settlingEnabled && seg.effectiveVelocity > 1.5 && bedStore > 0) {
        const resuspensionRate = resuspensionBase * Math.min(2, (seg.effectiveVelocity - 1.5) / 1.5);
        const resuspended = Math.min(bedStore, bedStore * resuspensionRate * stepTime);
        bedStore -= resuspended;
        concentration = clamp(concentration + resuspended, 0, 1);
      }

      // 连续排污贡献：从指定段内位置开始均匀分配到剩余流程
      for (const event of load.continuousEvents) {
        if (endRatio < event.positionRatio) continue;
        const remainingSteps = Math.max(1, stepsThisSeg - Math.round(stepsThisSeg * event.positionRatio));
        concentration += event.mass / remainingSteps;
      }
      concentration = clamp(concentration, 0, 1);

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
      const currentNtu = baseNtu + concentration * ntuCoeff;

      physicsPoints.push({
        distanceFromOriginM: round(distanceM, 2),
        concentration: round(concentration, 6),
        ntu: round(currentNtu, 2),
        catalystActive: k1Info.catalystActive || k2Info.catalystActive,
        segIndex: sIdx,
        effectiveWidth: seg.effectiveWidth,
      });
    }

    segmentOutConcentrations.push(round(concentration, 6));
    segmentOutNtu.push(round(baseNtu + concentration * ntuCoeff, 2));
  }

  return { physicsPoints, segmentOutConcentrations, segmentOutNtu, optimalSegmentIndex };
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
  segmentDirectionAngles: number[];
  secondaryResult?: {
    segmentOutConcentrations: number[];
    segmentOutNtu: number[];
    physicsPoints: PhysicsPoint[];
    segmentDirectionAngles: number[];
  };
}

function projectToCanvas(
  raw: RawSimulationResult,
  gridWidth: number,
  gridHeight: number,
  pollutantType: PollutantType,
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

  const directions = raw.segmentDirectionAngles;

  let cumY = startY;
  let lastSegIndex = -1;

  const riverPath: PathPointV3[] = [];
  const segmentWidthsPx: number[] = [];

  let optimalX = startX;
  let optimalY = startY;
  let foundOptimal = false;

  for (const pp of raw.physicsPoints) {
    // 段变更时累加方向角偏移
    if (pp.segIndex !== lastSegIndex) {
      if (lastSegIndex !== -1) {
        const angle = directions[pp.segIndex] ?? 0;
        cumY += Math.sin((angle * Math.PI) / 180) * (gridHeight * 0.08);
      }
      lastSegIndex = pp.segIndex;
    }

    const px = startX + pp.distanceFromOriginM * scaleX;
    const py = cumY;

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

  // 水质标准评估（GB3838-2002 六级分类）
  const finalConc = raw.segmentOutConcentrations[raw.segmentOutConcentrations.length - 1] ?? 1;
  const assessment = classifyWaterQuality(pollutantType, finalConc);
  const segmentAssessments = assessSegmentWaterQuality(pollutantType, raw.segmentOutConcentrations);
  const wqi = calculateWQI(pollutantType, raw.segmentOutConcentrations, raw.segmentOutNtu);

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
  pollutantMix: Record<string, number>,
  lightIntensity: number,
  temperature: number,
  totalRiverM: number,
  totalPhysicalSteps: number,
  consts: PhysicsConstants,
  customPollutants?: Record<string, CustomPollutantProfile>,
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
    effectiveSegs, segLoads, baseNtu, pollutantMix,
    lightIntensity, consts, totalPhysicalSteps, customPollutants,
  );

  // A5. 段指标（使用 NTU 预扫描结果）
  const metrics = computeSegmentMetrics(
    effectiveSegs,
    ntuBaseline,
    catalystMap,
    lightIntensity,
    temperatureFactor(temperature, consts),
  );
  const optimalSegmentIndex = searchOptimalSegment(metrics);

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
    pollutantMix,
    customPollutants,
    lightIntensity,
    temperature,
    consts,
    totalPhysicalSteps,
    optimalSegmentIndex,
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
