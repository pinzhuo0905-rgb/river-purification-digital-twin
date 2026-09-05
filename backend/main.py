"""
河流光催化净化数字孪生系统 — FastAPI 后端入口

目录结构：
  main.py          —— 应用入口、路由注册、CORS、生命周期
  models.py        —— SQLAlchemy ORM 模型
  schemas.py       —— Pydantic 请求/响应模式
  database.py      —— 数据库引擎与会话工厂
  simulation.py    —— NumPy 仿真计算引擎（阶段二）
  ws_manager.py    —— WebSocket 房间管理（阶段三）
"""

import json
import time
from html import escape
from contextlib import asynccontextmanager

from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, PlainTextResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from database import engine, get_db
from models import Base, Scenario, SimulationRecord
from schemas import (
    ScenarioCreate,
    ScenarioUpdate,
    ScenarioResponse,
    RiverSegmentSchema,
    SimulateRequest,
    SimulateResponse,
    SegmentMetricsSchema,
    PathPointSchema,
    SimulationRecordCreate,
    SimulationRecordResponse,
    WaterQualityStandardSchema,
    SecondaryResultSchema,
    DosingPointSchema,
    ParetoPointSchema,
    OptimizeRequest,
    OptimizeResponse,
    ClassifyRequest,
    ClassifyResponse,
    CalculateDoseRequest,
    CalculateDoseResponse,
)
from logging_config import setup_logging, get_logger, RequestLoggingMiddleware
from exceptions import register_exception_handlers

# ── 日志系统初始化 ────────────────────────────────────────────
setup_logging()
logger = get_logger(__name__)


# ── 应用生命周期 ─────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """启动时建表，关闭时释放引擎。"""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("数据库表已就绪")
    yield
    await engine.dispose()
    logger.info("数据库连接已关闭")


app = FastAPI(
    title="河流光催化净化数字孪生系统 API",
    description="基于微积分切片思想与指数衰减模型的分布式仿真微服务后端",
    version="1.0.0",
    lifespan=lifespan,
)

# ── 中间件注册 ───────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # 生产环境建议改为具体域名
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(RequestLoggingMiddleware)

# ── 全局异常处理器 ───────────────────────────────────────────
register_exception_handlers(app)


# ═══════════════════════════════════════════════════════════════
#  后台可视化首页
# ═══════════════════════════════════════════════════════════════

@app.get("/", response_class=HTMLResponse)
async def admin_home(db: AsyncSession = Depends(get_db)):
    """后端可视化首页，方便直接查看服务状态和场景数据。"""
    result = await db.execute(select(Scenario).order_by(desc(Scenario.created_at)))
    scenarios = result.scalars().all()

    # 同时查询仿真历史记录
    sim_result = await db.execute(
        select(SimulationRecord).order_by(desc(SimulationRecord.created_at)).limit(50)
    )
    sim_records = sim_result.scalars().all()

    # ── 场景表格行 ─────────────────────────────────────────
    rows = []
    for item in scenarios:
        try:
            segments = json.loads(item.segments_json)
        except (json.JSONDecodeError, TypeError):
            segments = []

        tags = "".join(
            f"<span>{escape(tag.strip())}</span>"
            for tag in item.tags.split(",")
            if tag.strip()
        )
        rows.append(
            f"""
            <tr>
              <td>#{item.id}</td>
              <td>
                <strong>{escape(item.name)}</strong>
                <small>{escape(item.description)}</small>
              </td>
              <td>{escape(item.author)}</td>
              <td>{item.light_intensity:.1f}</td>
              <td>{item.catalyst_efficiency:.1f}</td>
              <td>{item.river_depth:.1f} m</td>
              <td>{item.turbidity:.1f} NTU</td>
              <td>{len(segments)} 段</td>
              <td><div class="tags">{tags or "<span>无标签</span>"}</div></td>
              <td><a href="/api/scenarios/{item.id}">查看</a></td>
            </tr>
            """
        )

    table_body = "\n".join(rows) or """
      <tr>
        <td colspan="10" class="empty">暂无场景数据</td>
      </tr>
    """

    # ── 仿真记录表格行 ─────────────────────────────────────
    sim_rows = []
    for rec in sim_records:
        try:
            rec_result = json.loads(rec.result_json)
        except (json.JSONDecodeError, TypeError):
            rec_result = {}
        opt_seg = rec_result.get("optimal_segment_index", "—")
        final_conc = (
            rec_result.get("segment_out_concentrations", [None])[-1]
        )
        conc_str = f"{(final_conc * 100):.1f}%" if final_conc is not None else "—"
        note_str = escape(rec.note) if rec.note else "—"
        tags_rec = "".join(
            f"<span>{escape(t.strip())}</span>"
            for t in rec.tags.split(",") if t.strip()
        ) if rec.tags else "<span>无标签</span>"

        sim_rows.append(
            f"""
            <tr>
              <td>#{rec.id}</td>
              <td>{conc_str}</td>
              <td>{opt_seg}</td>
              <td>{rec.compute_time_ms:.1f}ms</td>
              <td>{note_str}</td>
              <td><div class="tags">{tags_rec}</div></td>
              <td>{rec.created_at.strftime('%H:%M:%S')}</td>
              <td><a href="/api/simulation-records/{rec.id}">查看</a></td>
            </tr>
            """
        )

    sim_table_body = "\n".join(sim_rows) or """
      <tr>
        <td colspan="8" class="empty">暂无仿真记录</td>
      </tr>
    """

    return f"""
    <!doctype html>
    <html lang="zh-CN">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>河流光催化净化后台</title>
      <style>
        :root {{
          color-scheme: light;
          --ink: #172033;
          --muted: #667085;
          --line: #d9e2ef;
          --panel: #ffffff;
          --bg: #eef5f3;
          --blue: #1f8fc9;
          --green: #0f9f77;
        }}
        * {{ box-sizing: border-box; }}
        body {{
          margin: 0;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          color: var(--ink);
          background: linear-gradient(180deg, #e8f2f7 0%, var(--bg) 100%);
        }}
        header {{
          padding: 28px 36px;
          background: #132033;
          color: white;
        }}
        header h1 {{
          margin: 0 0 8px;
          font-size: 28px;
          letter-spacing: 0;
        }}
        header p {{ margin: 0; color: #c9d6e6; }}
        main {{ padding: 24px 36px 40px; }}
        .stats {{
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 14px;
          margin-bottom: 18px;
        }}
        .stat, .panel {{
          background: var(--panel);
          border: 1px solid var(--line);
          border-radius: 8px;
          box-shadow: 0 8px 24px rgba(31, 51, 79, 0.08);
        }}
        .stat {{ padding: 16px; }}
        .stat small {{
          display: block;
          color: var(--muted);
          margin-bottom: 8px;
        }}
        .stat strong {{
          display: block;
          font-size: 24px;
        }}
        .status {{
          color: var(--green);
          font-weight: 800;
        }}
        .links {{
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          margin: 0 0 18px;
        }}
        a {{
          color: var(--blue);
          font-weight: 700;
          text-decoration: none;
        }}
        .links a {{
          background: white;
          border: 1px solid var(--line);
          border-radius: 8px;
          padding: 10px 12px;
        }}
        .panel {{ overflow: hidden; }}
        .panel h2 {{
          margin: 0;
          padding: 16px 18px;
          font-size: 18px;
          border-bottom: 1px solid var(--line);
          background: #f8fbfd;
        }}
        table {{
          width: 100%;
          border-collapse: collapse;
          font-size: 14px;
        }}
        th, td {{
          padding: 12px 14px;
          border-bottom: 1px solid var(--line);
          text-align: left;
          vertical-align: top;
        }}
        th {{
          color: #475467;
          background: #fbfdff;
          font-size: 12px;
          white-space: nowrap;
        }}
        td small {{
          display: block;
          max-width: 420px;
          margin-top: 5px;
          color: var(--muted);
          line-height: 1.45;
        }}
        .tags {{
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          min-width: 140px;
        }}
        .tags span {{
          display: inline-flex;
          padding: 3px 7px;
          border-radius: 999px;
          color: #245a4a;
          background: #e5f6ef;
          font-size: 12px;
        }}
        .empty {{
          padding: 28px;
          text-align: center;
          color: var(--muted);
        }}
        @media (max-width: 900px) {{
          header, main {{ padding-left: 16px; padding-right: 16px; }}
          .stats {{ grid-template-columns: repeat(2, minmax(0, 1fr)); }}
          .panel {{ overflow-x: auto; }}
          table {{ min-width: 980px; }}
        }}
      </style>
    </head>
    <body>
      <header>
        <h1>河流光催化净化后台</h1>
        <p>本地后端数据面板 · FastAPI + SQLite</p>
      </header>
      <main>
        <section class="stats">
          <div class="stat"><small>服务状态</small><strong class="status">在线</strong></div>
          <div class="stat"><small>场景数量</small><strong>{len(scenarios)}</strong></div>
          <div class="stat"><small>仿真记录</small><strong>{len(sim_records)}</strong></div>
          <div class="stat"><small>API 版本</small><strong>1.1.0</strong></div>
        </section>

        <nav class="links">
          <a href="/api/health">健康检查</a>
          <a href="/api/scenarios">场景 JSON</a>
          <a href="/api/simulation-records">仿真记录 JSON</a>
          <a href="/docs">Swagger 文档</a>
          <a href="http://127.0.0.1:5173/">返回前端</a>
        </nav>

        <section class="panel">
          <h2>场景方案库</h2>
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>场景</th>
                <th>作者</th>
                <th>光照</th>
                <th>催化效率</th>
                <th>水深</th>
                <th>浊度</th>
                <th>河段</th>
                <th>标签</th>
                <th>详情</th>
              </tr>
            </thead>
            <tbody>{table_body}</tbody>
          </table>
        </section>

        <section class="panel">
          <h2>📊 仿真历史记录</h2>
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>最终浓度</th>
                <th>最佳段</th>
                <th>耗时</th>
                <th>备注</th>
                <th>标签</th>
                <th>时间</th>
                <th>详情</th>
              </tr>
            </thead>
            <tbody>{sim_table_body}</tbody>
          </table>
        </section>
      </main>
    </body>
    </html>
    """


@app.get("/simple", response_class=HTMLResponse)
async def admin_simple(db: AsyncSession = Depends(get_db)):
    """极简数据页，避免浏览器扩展或外部资源影响展示。"""
    result = await db.execute(select(Scenario).order_by(desc(Scenario.created_at)))
    scenarios = result.scalars().all()
    rows = []
    for item in scenarios:
        try:
            segments = json.loads(item.segments_json)
        except (json.JSONDecodeError, TypeError):
            segments = []
        rows.append(
            "<tr>"
            f"<td>{item.id}</td>"
            f"<td>{escape(item.name)}</td>"
            f"<td>{escape(item.author)}</td>"
            f"<td>{item.light_intensity:.1f}</td>"
            f"<td>{item.catalyst_efficiency:.1f}</td>"
            f"<td>{item.river_depth:.1f}</td>"
            f"<td>{item.turbidity:.1f}</td>"
            f"<td>{len(segments)}</td>"
            f"<td>{escape(item.tags)}</td>"
            f"<td><a href='/api/scenarios/{item.id}'>JSON</a></td>"
            "</tr>"
        )

    return (
        "<html><head><meta charset='utf-8'><title>后台数据表</title></head>"
        "<body>"
        "<h1>河流光催化净化后台数据表</h1>"
        "<p>服务状态：在线 | "
        f"场景数量：{len(scenarios)} | "
        "<a href='/api/health'>健康检查</a> | "
        "<a href='/api/scenarios'>全部 JSON</a> | "
        "<a href='http://127.0.0.1:5173/'>返回前端</a></p>"
        "<table border='1' cellpadding='8' cellspacing='0'>"
        "<thead><tr>"
        "<th>ID</th><th>场景名称</th><th>作者</th><th>光照</th>"
        "<th>催化效率</th><th>水深</th><th>浊度</th><th>河段数</th>"
        "<th>标签</th><th>详情</th>"
        "</tr></thead>"
        f"<tbody>{''.join(rows)}</tbody>"
        "</table>"
        "</body></html>"
    )


@app.get("/table", response_class=PlainTextResponse)
async def admin_table(db: AsyncSession = Depends(get_db)):
    """纯文本后台数据表，兼容任何浏览器显示。"""
    result = await db.execute(select(Scenario).order_by(desc(Scenario.created_at)))
    scenarios = result.scalars().all()
    lines = [
        "河流光催化净化后台数据表",
        f"服务状态：在线    场景数量：{len(scenarios)}",
        "健康检查：http://127.0.0.1:8002/api/health",
        "全部 JSON：http://127.0.0.1:8002/api/scenarios",
        "",
        "ID | 场景名称 | 作者 | 光照 | 催化效率 | 水深 | 浊度 | 河段数 | 标签",
        "-" * 120,
    ]

    for item in scenarios:
        try:
            segments = json.loads(item.segments_json)
        except (json.JSONDecodeError, TypeError):
            segments = []
        lines.append(
            " | ".join(
                [
                    str(item.id),
                    item.name,
                    item.author,
                    f"{item.light_intensity:.1f}",
                    f"{item.catalyst_efficiency:.1f}",
                    f"{item.river_depth:.1f} m",
                    f"{item.turbidity:.1f} NTU",
                    f"{len(segments)} 段",
                    item.tags or "无标签",
                ]
            )
        )

    return "\n".join(lines)


@app.get("/overview")
async def admin_overview(db: AsyncSession = Depends(get_db)):
    """后台数据概览，便于浏览器直接查看核心数据。"""
    result = await db.execute(select(Scenario).order_by(desc(Scenario.created_at)).limit(20))
    scenarios = result.scalars().all()
    items = []
    for item in scenarios:
        try:
            segments = json.loads(item.segments_json)
        except (json.JSONDecodeError, TypeError):
            segments = []
        items.append(
            {
                "id": item.id,
                "name": item.name,
                "author": item.author,
                "light": item.light_intensity,
                "catalyst": item.catalyst_efficiency,
                "depth_m": item.river_depth,
                "turbidity_ntu": item.turbidity,
                "segment_count": len(segments),
                "tags": item.tags,
            }
        )

    return {
        "status": "ok",
        "backend": "online",
        "scenario_count": len(items),
        "scenarios": items,
    }


# ═══════════════════════════════════════════════════════════════
#  阶段一：场景预设方案库 CRUD
# ═══════════════════════════════════════════════════════════════

@app.get("/api/scenarios", response_model=list[ScenarioResponse])
async def list_scenarios(
    db: AsyncSession = Depends(get_db),
    tag: str = Query(default="", description="按标签筛选"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0, description="分页偏移量"),
):
    """获取场景列表，支持按标签筛选和分页，按创建时间倒序。"""
    stmt = select(Scenario).order_by(desc(Scenario.created_at))
    if tag:
        stmt = stmt.where(Scenario.tags.contains(tag))
    stmt = stmt.offset(offset).limit(limit)
    result = await db.execute(stmt)
    rows = result.scalars().all()
    logger.info("场景列表查询: tag=%s, offset=%d, limit=%d → %d 条", tag, offset, limit, len(rows))
    return [_scenario_to_response(r) for r in rows]


@app.get("/api/scenarios/{scenario_id}", response_model=ScenarioResponse)
async def get_scenario(scenario_id: int, db: AsyncSession = Depends(get_db)):
    """按 ID 获取单个场景详情，用于前端一键加载。"""
    scenario = await _get_or_404(db, scenario_id)
    return _scenario_to_response(scenario)


@app.post("/api/scenarios", response_model=ScenarioResponse, status_code=201)
async def create_scenario(body: ScenarioCreate, db: AsyncSession = Depends(get_db)):
    """保存当前配置为一个场景预设。"""
    scenario = Scenario(
        name=body.name,
        description=body.description,
        light_intensity=body.light_intensity,
        catalyst_efficiency=body.catalyst_efficiency,
        river_depth=body.river_depth,
        turbidity=body.turbidity,
        segments_json=json.dumps(
            [s.model_dump() for s in body.segments], ensure_ascii=False
        ),
        author=body.author,
        tags=body.tags,
    )
    db.add(scenario)
    await db.commit()
    await db.refresh(scenario)
    logger.info("场景已创建: id=%d, name=%s", scenario.id, scenario.name)
    return _scenario_to_response(scenario)


@app.put("/api/scenarios/{scenario_id}", response_model=ScenarioResponse)
async def update_scenario(
    scenario_id: int,
    body: ScenarioUpdate,
    db: AsyncSession = Depends(get_db),
):
    """更新场景预设 — 只更新提供的字段，未提供的保持不变。"""
    scenario = await _get_or_404(db, scenario_id)

    update_data = body.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="至少需要提供一个要更新的字段")

    # 特殊处理 segments：需要 JSON 序列化
    if "segments" in update_data:
        update_data["segments_json"] = json.dumps(
            [s.model_dump() for s in update_data.pop("segments")],
            ensure_ascii=False,
        )

    for key, value in update_data.items():
        setattr(scenario, key, value)

    await db.commit()
    await db.refresh(scenario)
    logger.info("场景已更新: id=%d, name=%s, 更新字段=%s", scenario.id, scenario.name, list(update_data.keys()))
    return _scenario_to_response(scenario)


@app.delete("/api/scenarios/{scenario_id}", status_code=204)
async def delete_scenario(scenario_id: int, db: AsyncSession = Depends(get_db)):
    """删除一个场景预设。"""
    scenario = await _get_or_404(db, scenario_id)
    await db.delete(scenario)
    await db.commit()


# ── 辅助函数 ─────────────────────────────────────────────────

async def _get_or_404(db: AsyncSession, scenario_id: int) -> Scenario:
    """查询场景，找不到则抛 404。"""
    result = await db.execute(
        select(Scenario).where(Scenario.id == scenario_id)
    )
    scenario = result.scalar_one_or_none()
    if scenario is None:
        raise HTTPException(status_code=404, detail=f"场景 #{scenario_id} 不存在")
    return scenario


def _scenario_to_response(s: Scenario) -> ScenarioResponse:
    """ORM → Pydantic Response 转换。"""
    try:
        segments = [
            RiverSegmentSchema(**item)
            for item in json.loads(s.segments_json)
        ]
    except (json.JSONDecodeError, TypeError):
        segments = []
    return ScenarioResponse(
        id=s.id,
        name=s.name,
        description=s.description,
        light_intensity=s.light_intensity,
        catalyst_efficiency=s.catalyst_efficiency,
        river_depth=s.river_depth,
        turbidity=s.turbidity,
        segments=segments,
        author=s.author,
        tags=s.tags,
        created_at=s.created_at,
    )


def _record_to_response(r: SimulationRecord) -> SimulationRecordResponse:
    """SimulationRecord ORM → Pydantic Response 转换 — 解构 JSON 字段。"""
    try:
        input_params = json.loads(r.input_params_json)
    except (json.JSONDecodeError, TypeError):
        input_params = {}
    try:
        segments = [
            RiverSegmentSchema(**item)
            for item in json.loads(r.segments_json)
        ]
    except (json.JSONDecodeError, TypeError):
        segments = []
    try:
        result = json.loads(r.result_json)
    except (json.JSONDecodeError, TypeError):
        result = {}

    return SimulationRecordResponse(
        id=r.id,
        scenario_id=r.scenario_id,
        light_intensity=input_params.get("light_intensity", 1.0),
        catalyst_efficiency=input_params.get("catalyst_efficiency", 0.8),
        turbidity=input_params.get("turbidity", 5.0),
        segments=segments,
        result=result,
        compute_time_ms=r.compute_time_ms,
        tags=r.tags,
        note=r.note,
        created_at=r.created_at,
    )


# ═══════════════════════════════════════════════════════════════
#  阶段二：云端仿真计算服务
# ═══════════════════════════════════════════════════════════════

@app.post("/api/simulate", response_model=SimulateResponse)
async def run_simulation(body: SimulateRequest):
    """
    核心仿真接口 (v3 引擎) — 接收前端参数，返回浓度分布。

    注意：
      gridWidth / gridHeight 固定使用前端预设值 400×150，
      因为计算结果中的 x/y 坐标是 Canvas 映射使用的像素值。
      如果未来需要支持动态画布尺寸，可作为参数传入。
    """
    # 延迟导入：只在首次调用时加载 NumPy 引擎
    from simulation import run_simulation as _run

    seg_count = len(body.segments)
    logger.info(
        "仿真请求: segments=%d, light=%.2f, base_ntu=%.1f, pollutant=%s",
        seg_count,
        body.light_intensity,
        body.base_ntu,
        body.pollutant_type,
    )

    t0 = time.perf_counter()
    result = _run(
        grid_width=400,
        grid_height=150,
        light_intensity=body.light_intensity,
        base_ntu=body.base_ntu,
        pollutant_type=body.pollutant_type,
        segments=[s.model_dump() for s in body.segments],
        pollutant_discharges=[d.model_dump() for d in body.pollutant_discharges] if body.pollutant_discharges else None,
        catalyst_placements=[c.model_dump() for c in body.catalyst_placements] if body.catalyst_placements else None,
        secondary_segments=[s.model_dump() for s in body.secondary_segments] if body.secondary_segments else None,
        secondary_discharges=[d.model_dump() for d in body.secondary_discharges] if body.secondary_discharges else None,
        confluence_config=body.confluence_config.model_dump() if body.confluence_config else None,
    )
    elapsed_ms = (time.perf_counter() - t0) * 1000

    # ── 从 pathResults 提取逐段出口浓度和 NTU ──────────────────
    path_results = result["pathResults"]
    n_segments = len(result["segmentResults"])
    seg_out_conc = [0.0] * n_segments
    seg_out_ntu = [0.0] * n_segments
    for pp in path_results:
        si = pp["segmentIndex"]
        if 0 <= si < n_segments:
            seg_out_conc[si] = pp["concentration"]
            seg_out_ntu[si] = pp.get("ntu", 0.0)

    # ── 最佳段位置 ─────────────────────────────────────────────
    best_seg_idx = result["bestSegment"]["segmentIndex"]
    optimal_x = 0.0
    optimal_y = 0.0
    for pp in path_results:
        if pp["segmentIndex"] == best_seg_idx:
            optimal_x = pp["position"]["x"]
            optimal_y = pp["position"]["y"]
            break

    # ── 分段反应效率指标 ─────────────────────────────────────────
    segment_metrics = []
    for sr in result["segmentResults"]:
        seg_i = sr["segmentIndex"]
        terrain = body.segments[seg_i].terrain if seg_i < len(body.segments) else "river"
        segment_metrics.append(SegmentMetricsSchema(
            seg_index=sr["segmentIndex"],
            velocity=sr["effVelocity"],
            residence_time=sr["residenceTime"],
            effective_light=sr["effectiveLight"],
            reaction_score=sr["reactionScore"],
            depth=sr["effDepth"],
            width=sr["effWidth"],
            terrain=terrain,
        ))

    # ── 河流路径采样点 ─────────────────────────────────────────
    river_path = [
        PathPointSchema(
            x=pp["position"]["x"],
            y=pp["position"]["y"],
            concentration=pp["concentration"],
            seg_index=pp["segmentIndex"],
            width_px=0.0,
        )
        for pp in path_results
    ]

    # ── 水质标准达标评估 ────────────────────────────────────────
    wqs = result["waterQualityStandard"]
    water_quality_standard = WaterQualityStandardSchema(
        class_i_met=wqs["classIMet"],
        water_quality_class=wqs.get("waterQualityClass", "劣V"),
        residual_ratio=wqs["finalConcentration"],
        distance_to_standard=wqs["distanceToStandard"] if wqs["distanceToStandard"] >= 0 else None,
    )

    # ── 次河流/汇合仿真结果 ──────────────────────────────────────
    secondary_result = None
    if result.get("secondaryResults"):
        sec = result["secondaryResults"]
        sec_path = sec.get("pathResults", [])
        sec_n = len(sec.get("segmentResults", []))
        sec_conc = [0.0] * sec_n if sec_n > 0 else []
        sec_ntu = [0.0] * sec_n if sec_n > 0 else []
        for pp in sec_path:
            si = pp["segmentIndex"]
            if 0 <= si < sec_n:
                sec_conc[si] = pp["concentration"]
                sec_ntu[si] = pp.get("ntu", 0.0)
        secondary_result = SecondaryResultSchema(
            segment_out_concentrations=sec_conc,
            segment_out_ntu=sec_ntu,
        )

    logger.info(
        "仿真完成: 最佳段=%d, 出口浓度=%.4f, 耗时=%.2fms",
        best_seg_idx,
        seg_out_conc[-1] if seg_out_conc else 0.0,
        elapsed_ms,
    )

    return SimulateResponse(
        optimal_x=optimal_x,
        optimal_y=optimal_y,
        optimal_segment_index=best_seg_idx,
        segment_out_concentrations=seg_out_conc,
        segment_out_ntu=seg_out_ntu,
        segment_metrics=segment_metrics,
        river_path=river_path,
        river_width_px=0.0,
        segment_widths_px=[],
        compute_time_ms=round(elapsed_ms, 3),
        water_quality_standard=water_quality_standard,
        secondary_result=secondary_result,
    )


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
                water_quality_class=p.water_quality_class,
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
            water_quality_class=result.optimal.water_quality_class,
            compute_time_ms=result.optimal.compute_time_ms,
        ),
        baseline_concentration=result.baseline_concentration,
        compute_time_ms=round(elapsed_ms, 3),
    )


# ═══════════════════════════════════════════════════════════════
#  水质分类与反算投药
# ═══════════════════════════════════════════════════════════════

@app.post("/api/classify", response_model=ClassifyResponse)
async def classify_water_endpoint(body: ClassifyRequest):
    """Feature A: 输入污染物类型 + 残余浓度 -> 返回水质等级"""
    from water_quality import classify_water_quality

    result = classify_water_quality(body.pollutant_type, body.residual_ratio)
    return ClassifyResponse(
        class_=result["class"],
        class_i_met=result["class_i_met"],
        residual_ratio=result["residual_ratio"],
        class_threshold=result["class_threshold"],
    )


@app.post("/api/calculate-dose", response_model=CalculateDoseResponse)
async def calculate_dose_endpoint(body: CalculateDoseRequest):
    """Feature B: 输入目标水质等级 -> 返回所需催化剂剂量"""
    from water_quality import calculate_required_dose
    from simulation import run_simulation

    # Adapter: 将 camelCase params dict 转为 run_simulation 所需的 snake_case kwargs
    def simulate_adapter(p: dict) -> dict:
        return run_simulation(
            grid_width=p.get("gridWidth", 400),
            grid_height=p.get("gridHeight", 150),
            light_intensity=p.get("lightIntensity", 1.0),
            base_ntu=p.get("baseNtu", 5),
            pollutant_type=p.get("pollutantType", "organic_macromolecule"),
            segments=p.get("segments", []),
            pollutant_discharges=p.get("pollutantDischarges"),
            catalyst_placements=p.get("catalystPlacements", []),
            secondary_segments=p.get("secondarySegments"),
            secondary_discharges=p.get("secondaryDischarges"),
            confluence_config=p.get("confluenceConfig"),
        )

    params = {
        "gridWidth": 400,
        "gridHeight": 150,
        "lightIntensity": body.light_intensity,
        "baseNtu": body.base_ntu,
        "pollutantType": body.pollutant_type,
        "segments": [s.model_dump() for s in body.segments],
        "pollutantDischarges": None,
    }

    result = calculate_required_dose(simulate_adapter, params, body.pollutant_type, body.target_class)
    return CalculateDoseResponse(
        required_dose_ratio=result["required_dose_ratio"],
        final_concentration=result["final_concentration"],
        class_i_met=result["class_i_met"],
        found=result["found"],
        iterations=result["iterations"],
    )


# ═══════════════════════════════════════════════════════════════
#  阶段二增补：仿真历史记录 CRUD
# ═══════════════════════════════════════════════════════════════

@app.get("/api/simulation-records", response_model=list[SimulationRecordResponse])
async def list_simulation_records(
    db: AsyncSession = Depends(get_db),
    scenario_id: int = Query(default=None, description="按场景 ID 筛选"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    """获取仿真历史记录列表，支持按场景筛选和分页。"""
    stmt = select(SimulationRecord).order_by(desc(SimulationRecord.created_at))
    if scenario_id is not None:
        stmt = stmt.where(SimulationRecord.scenario_id == scenario_id)
    stmt = stmt.offset(offset).limit(limit)
    result = await db.execute(stmt)
    records = result.scalars().all()
    return [_record_to_response(r) for r in records]


@app.get("/api/simulation-records/{record_id}", response_model=SimulationRecordResponse)
async def get_simulation_record(record_id: int, db: AsyncSession = Depends(get_db)):
    """按 ID 获取单条仿真历史记录。"""
    result = await db.execute(
        select(SimulationRecord).where(SimulationRecord.id == record_id)
    )
    record = result.scalar_one_or_none()
    if record is None:
        raise HTTPException(status_code=404, detail=f"仿真记录 #{record_id} 不存在")
    return _record_to_response(record)


@app.post("/api/simulation-records", response_model=SimulationRecordResponse, status_code=201)
async def create_simulation_record(body: SimulationRecordCreate, db: AsyncSession = Depends(get_db)):
    """保存一次仿真结果为历史记录。"""
    # 将输入参数合并为 JSON
    input_params = {
        "light_intensity": body.light_intensity,
        "catalyst_efficiency": body.catalyst_efficiency,
        "turbidity": body.turbidity,
    }

    record = SimulationRecord(
        scenario_id=body.scenario_id,
        input_params_json=json.dumps(input_params),
        segments_json=json.dumps([s.model_dump() for s in body.segments], ensure_ascii=False),
        result_json=body.result_json,
        compute_time_ms=body.compute_time_ms,
        tags=body.tags,
        note=body.note,
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    logger.info("仿真记录已保存: id=%d, scenario_id=%s", record.id, record.scenario_id)
    return _record_to_response(record)


@app.delete("/api/simulation-records/{record_id}", status_code=204)
async def delete_simulation_record(record_id: int, db: AsyncSession = Depends(get_db)):
    """删除一条仿真历史记录。"""
    result = await db.execute(
        select(SimulationRecord).where(SimulationRecord.id == record_id)
    )
    record = result.scalar_one_or_none()
    if record is None:
        raise HTTPException(status_code=404, detail=f"仿真记录 #{record_id} 不存在")
    await db.delete(record)
    await db.commit()


# ═══════════════════════════════════════════════════════════════
#  阶段三：WebSocket 多人协同
# ═══════════════════════════════════════════════════════════════

from fastapi import WebSocket

from ws_manager import handle_ws, list_rooms


@app.websocket("/ws/{room_id}")
async def ws_endpoint(websocket: WebSocket, room_id: str):
    """WebSocket 端点 — 进入河流协同治理房间。"""
    player_name = f"研究者_{hex(hash(websocket))[-4:]}"
    await handle_ws(websocket, room_id, player_name)


@app.get("/api/rooms")
async def get_rooms():
    """获取当前活跃的 WebSocket 房间列表。"""
    return {"rooms": list_rooms()}


# ═══════════════════════════════════════════════════════════════
#  健康检查 & 根路由
# ═══════════════════════════════════════════════════════════════

@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "service": "河流光催化净化数字孪生系统",
        "version": "1.1.0",
        "stages": [
            "CRUD 场景库",
            "场景更新接口",
            "云端仿真服务",
            "仿真历史记录",
            "WebSocket 多人协同",
        ],
    }


# ── 启动入口 ─────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
