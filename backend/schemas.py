"""
Pydantic 数据模式 — 用于请求验证和响应序列化
"""

from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, Literal


# ──────────────── 河流分段 ────────────────

class RiverSegmentSchema(BaseModel):
    id: int
    velocity: float = Field(ge=0.1, le=10.0, description="流速 (m/s)")
    directionAngle: float = Field(ge=-90, le=90, description="流向偏角 (度)")
    length: float = Field(gt=0, le=1, description="相对长度 (全部之和=1)")
    depth: float = Field(ge=0.3, le=5.0, default=1.5, description="该段水深 (m)")
    width: float = Field(ge=0.5, le=2.0, default=1.0, description="河宽系数")
    terrain: Literal["river", "lake"] = Field(default="river", description="地形类型")
    referenceDischarge: float = Field(default=10, description="参考流量 (m³/s)")


# ──────────────── 新 v3 仿真引擎 ────────────────

class PollutantDischargeSchema(BaseModel):
    """污染物排放点"""
    segmentIndex: int = Field(description="排放所在分段的索引")
    positionRatio: float = Field(ge=0, le=1, description="在该分段上的相对位置 (0~1)")
    pollutantType: Literal[
        "organic_macromolecule", "sediment_algae", "heavy_metal",
        "petroleum_hydrocarbon", "nutrient_runoff", "microplastic",
    ] = Field(description="污染物类型")
    mass: float = Field(ge=0, le=1, description="污染物质量 (0~1)")
    dischargeType: Literal["continuous", "burst"] = Field(description="排放方式: 持续/瞬时")


class CatalystPlacementSchema(BaseModel):
    """催化剂投放点"""
    segmentIndex: int = Field(description="投放所在分段的索引")
    activity: float = Field(ge=0, le=1, description="催化剂活性 (0~1)")
    doseRatio: float = Field(ge=0.01, le=10, description="投放剂量比 (0.01~10)")
    effectiveAfterRatio: float = Field(default=0, ge=0, le=1, description="段内延迟生效位置 (0~1)")


class ConfluenceConfigSchema(BaseModel):
    """两条河流汇合配置"""
    river0Segment: int = Field(description="主河流的汇合分段索引")
    river1Segment: int = Field(description="次河流的汇合分段索引")
    river0Ratio: float = Field(ge=0, le=1, description="主河流汇合处的流量占比 (0~1)")
    river1Ratio: float = Field(ge=0, le=1, description="次河流汇合处的流量占比 (0~1)")


# ──────────────── v3 结果模型 ────────────────

class WaterQualityStandardSchema(BaseModel):
    """水质标准达标评估"""
    class_i_met: bool = Field(description="是否达到 I 类水标准")
    residual_ratio: float = Field(description="残余污染物比率")
    distance_to_standard: Optional[float] = Field(default=None, description="距标准线的距离 (null 表示已达标或无法计算)")


class SecondaryResultSchema(BaseModel):
    """次河流/汇合后的仿真结果"""
    segment_out_concentrations: list[float] = Field(description="各分段出口污染物浓度")
    segment_out_ntu: list[float] = Field(description="各分段出口 NTU 浊度值")


# ──────────────── 场景预设 ────────────────

class ScenarioCreate(BaseModel):
    """保存场景时的请求体"""
    name: str = Field(min_length=1, max_length=120, description="场景名称")
    description: str = Field(default="", max_length=500)
    light_intensity: float = Field(ge=0.1, le=3.0, default=1.0)
    catalyst_efficiency: float = Field(ge=0.1, le=5.0, default=0.8)
    river_depth: float = Field(ge=0.5, le=10.0, default=1.5)
    turbidity: float = Field(ge=0, le=100, default=5.0)
    segments: list[RiverSegmentSchema] = Field(default_factory=list)
    author: str = Field(default="匿名研究者", max_length=60)
    tags: str = Field(default="", max_length=300)


class ScenarioUpdate(BaseModel):
    """更新场景时的请求体 — 所有字段均为可选，只更新提供的字段"""
    name: Optional[str] = Field(default=None, min_length=1, max_length=120, description="场景名称")
    description: Optional[str] = Field(default=None, max_length=500)
    light_intensity: Optional[float] = Field(default=None, ge=0.1, le=3.0)
    catalyst_efficiency: Optional[float] = Field(default=None, ge=0.1, le=5.0)
    river_depth: Optional[float] = Field(default=None, ge=0.5, le=10.0)
    turbidity: Optional[float] = Field(default=None, ge=0, le=100)
    segments: Optional[list[RiverSegmentSchema]] = Field(default=None)
    author: Optional[str] = Field(default=None, max_length=60)
    tags: Optional[str] = Field(default=None, max_length=300)


class ScenarioResponse(BaseModel):
    """场景列表/详情响应"""
    id: int
    name: str
    description: str
    light_intensity: float
    catalyst_efficiency: float
    river_depth: float
    turbidity: float
    segments: list[RiverSegmentSchema]
    author: str
    tags: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ──────────────── 仿真计算 ────────────────

class SimulateRequest(BaseModel):
    """前端 POST /simulate 的请求体"""
    light_intensity: float = Field(ge=0.1, le=3.0, default=1.0)
    base_ntu: float = Field(ge=0, le=100, default=5, description="基准浊度 (NTU)")
    pollutant_type: Literal[
        "organic_macromolecule", "sediment_algae", "heavy_metal",
        "petroleum_hydrocarbon", "nutrient_runoff", "microplastic",
    ] = Field(
        default="organic_macromolecule", description="污染物类型"
    )
    segments: list[RiverSegmentSchema] = Field(min_length=1, max_length=10)
    pollutant_discharges: Optional[list[PollutantDischargeSchema]] = Field(
        default=None, description="污染物排放点列表"
    )
    catalyst_placements: Optional[list[CatalystPlacementSchema]] = Field(
        default=None, description="催化剂投放点列表"
    )
    secondary_segments: Optional[list[RiverSegmentSchema]] = Field(
        default=None, description="次河流分段 (汇合实验)"
    )
    secondary_discharges: Optional[list[PollutantDischargeSchema]] = Field(
        default=None, description="次河流污染物排放点"
    )
    confluence_config: Optional[ConfluenceConfigSchema] = Field(
        default=None, description="汇合配置"
    )


class SegmentMetricsSchema(BaseModel):
    """各段反应效率指标"""
    seg_index: int
    velocity: float
    residence_time: float
    effective_light: float
    reaction_score: float
    depth: float = 1.5
    width: float = 1.0
    terrain: Literal["river", "lake"] = Field(default="river", description="该段地形类型")


class PathPointSchema(BaseModel):
    """河流路径上的一个采样点"""
    x: float
    y: float
    concentration: float
    seg_index: int
    width_px: float = 0.0


class SimulateResponse(BaseModel):
    """后端返回的仿真结果"""
    optimal_x: float
    optimal_y: float
    optimal_segment_index: int
    segment_out_concentrations: list[float]
    segment_out_ntu: list[float] = Field(default_factory=list, description="各分段出口 NTU 浊度值")
    segment_metrics: list[SegmentMetricsSchema]
    river_path: list[PathPointSchema]
    river_width_px: float
    segment_widths_px: list[float] = []
    compute_time_ms: float = 0.0
    water_quality_standard: WaterQualityStandardSchema = Field(description="水质标准达标评估结果")
    secondary_result: Optional[SecondaryResultSchema] = Field(
        default=None, description="次河流/汇合仿真结果"
    )


# ──────────────── WebSocket 消息 ────────────────

class WSMessage(BaseModel):
    """WebSocket 通信消息"""
    type: str  # "param_update" | "catalyst_place" | "state_sync" | "join" | "leave"
    room_id: str
    player_id: str = "anonymous"
    payload: dict = Field(default_factory=dict)


# ──────────────── 仿真历史记录 ────────────────

class SimulationRecordCreate(BaseModel):
    """保存仿真记录的请求体"""
    scenario_id: Optional[int] = Field(default=None, description="关联的场景预设 ID（可选）")
    light_intensity: float = Field(ge=0.1, le=3.0, default=1.0)
    catalyst_efficiency: float = Field(ge=0.1, le=5.0, default=0.8)
    turbidity: float = Field(ge=0, le=100, default=5.0)
    segments: list[RiverSegmentSchema] = Field(min_length=1, max_length=10)
    result_json: str = Field(default="{}", description="仿真结果 JSON 字符串")
    compute_time_ms: float = Field(default=0.0)
    tags: str = Field(default="", max_length=300)
    note: str = Field(default="", max_length=500)


class SimulationRecordResponse(BaseModel):
    """仿真记录列表/详情响应"""
    id: int
    scenario_id: Optional[int] = None
    light_intensity: float
    catalyst_efficiency: float
    turbidity: float
    segments: list[RiverSegmentSchema]
    result: dict = Field(default_factory=dict)
    compute_time_ms: float
    tags: str
    note: str
    created_at: datetime

    model_config = {"from_attributes": True}


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
