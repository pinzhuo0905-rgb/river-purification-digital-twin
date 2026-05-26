"""
SQLAlchemy ORM 模型 — 场景预设方案库 & 仿真历史记录

场景预设 (Scenario):
  记录用户在网页上配置的一组参数快照，支持 CRUD。

仿真历史 (SimulationRecord):
  每次仿真计算的完整记录，包含输入参数和计算结果，
  支持按时间/标签查询历史，便于对比分析。
"""

from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy import String, Float, DateTime, func, ForeignKey, Integer
from datetime import datetime
from typing import Optional


class Base(DeclarativeBase):
    pass


class Scenario(Base):
    __tablename__ = "scenarios"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(String(500), default="")

    # 全局环境参数
    light_intensity: Mapped[float] = mapped_column(default=1.0)
    catalyst_efficiency: Mapped[float] = mapped_column(default=0.8)
    river_depth: Mapped[float] = mapped_column(default=1.5)
    turbidity: Mapped[float] = mapped_column(default=5.0)

    # 河流分段定义（JSON 数组）
    # 结构: [{"id":1,"velocity":2.0,"directionAngle":0,"length":0.33}, ...]
    segments_json: Mapped[str] = mapped_column(String(4000), default="[]")

    # 元数据
    author: Mapped[str] = mapped_column(String(60), default="匿名研究者")
    tags: Mapped[str] = mapped_column(String(300), default="")   # 逗号分隔的标签
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now()
    )


class SimulationRecord(Base):
    """仿真历史记录 — 每次仿真计算的完整快照。"""

    __tablename__ = "simulation_records"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    # 可关联到某个场景预设（可选）
    scenario_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("scenarios.id", ondelete="SET NULL"), nullable=True
    )

    # 输入参数（JSON 编码）
    # {"light_intensity": 1.0, "catalyst_efficiency": 0.8, "turbidity": 5.0}
    input_params_json: Mapped[str] = mapped_column(String(2000), default="{}")

    # 河流分段定义（JSON 数组）
    segments_json: Mapped[str] = mapped_column(String(4000), default="[]")

    # 仿真结果（JSON 编码，包含 optimal_x/y/index, concentrations, metrics 等）
    result_json: Mapped[str] = mapped_column(String(20000), default="{}")

    # 计算耗时（毫秒）
    compute_time_ms: Mapped[float] = mapped_column(default=0.0)

    # 标签（逗号分隔，如 "对比实验,高浊度"）
    tags: Mapped[str] = mapped_column(String(300), default="")

    # 备注
    note: Mapped[str] = mapped_column(String(500), default="")

    # 时间戳
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now()
    )
