"""
API 集成测试 — 覆盖所有 HTTP 端点和异常路径

使用 httpx + pytest-asyncio，直接测试 FastAPI 应用（无需启动服务器）。

运行：
  cd backend && python -m pytest test_api.py -v

前提：已安装 httpx
  pip install httpx --break-system-packages
"""

import json
import pytest
from httpx import ASGITransport, AsyncClient

# 直接导入 app，不启动服务器
from main import app
from database import engine, async_session
from models import Base

# 整个模块的测试都是 asyncio 测试
pytestmark = pytest.mark.asyncio


@pytest.fixture(scope="session", autouse=True)
async def setup_database():
    """测试前初始化数据库表结构（session 级别，只执行一次）。"""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest.fixture(autouse=True)
async def clean_database():
    """每个测试前清空所有表数据，保证测试隔离。"""
    async with engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            await conn.execute(table.delete())
    yield


@pytest.fixture
async def client():
    """创建异步 HTTP 测试客户端。"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


# ═══════════════════════════════════════════════════════════════
#  健康检查
# ═══════════════════════════════════════════════════════════════

class TestHealth:
    async def test_health_returns_ok(self, client: AsyncClient):
        res = await client.get("/api/health")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "ok"
        assert data["version"] == "1.1.0"
        assert "CRUD 场景库" in data["stages"]
        assert "仿真历史记录" in data["stages"]


# ═══════════════════════════════════════════════════════════════
#  场景预设方案库 CRUD
# ═══════════════════════════════════════════════════════════════

class TestScenarioCRUD:
    async def test_list_empty(self, client: AsyncClient):
        """空场景列表返回空数组。"""
        res = await client.get("/api/scenarios")
        assert res.status_code == 200
        assert isinstance(res.json(), list)

    async def test_create_scenario(self, client: AsyncClient):
        """创建场景并验证返回字段。"""
        payload = {
            "name": "测试场景",
            "description": "集成测试用",
            "light_intensity": 1.5,
            "catalyst_efficiency": 0.9,
            "river_depth": 2.0,
            "turbidity": 10.0,
            "segments": [
                {
                    "id": 1, "velocity": 2.0, "directionAngle": 0,
                    "length": 0.5, "depth": 1.5, "width": 1.0,
                },
                {
                    "id": 2, "velocity": 1.0, "directionAngle": 10,
                    "length": 0.5, "depth": 2.0, "width": 1.2,
                },
            ],
            "author": "测试员",
            "tags": "测试,集成",
        }
        res = await client.post("/api/scenarios", json=payload)
        assert res.status_code == 201
        data = res.json()
        assert data["name"] == "测试场景"
        assert data["light_intensity"] == 1.5
        assert len(data["segments"]) == 2
        assert data["author"] == "测试员"
        assert "id" in data
        assert "created_at" in data

    async def test_get_scenario(self, client: AsyncClient):
        """获取刚创建的场景。"""
        # 先创建
        create_res = await client.post("/api/scenarios", json={
            "name": "查询测试", "description": "",
            "segments": [{"id": 1, "velocity": 2.0, "directionAngle": 0, "length": 1.0}],
        })
        sid = create_res.json()["id"]

        # 获取
        res = await client.get(f"/api/scenarios/{sid}")
        assert res.status_code == 200
        assert res.json()["name"] == "查询测试"

    async def test_get_nonexistent(self, client: AsyncClient):
        """请求不存在的场景返回 404。"""
        res = await client.get("/api/scenarios/99999")
        assert res.status_code == 404
        err = res.json()["error"]
        assert err["code"] == "NOT_FOUND"

    async def test_list_with_tag_filter(self, client: AsyncClient):
        """标签筛选返回匹配结果。"""
        # 创建带特定标签的场景
        await client.post("/api/scenarios", json={
            "name": "暴雨场景", "tags": "暴雨,夏季",
            "segments": [{"id": 1, "velocity": 3.0, "directionAngle": 0, "length": 1.0}],
        })
        await client.post("/api/scenarios", json={
            "name": "晴天场景", "tags": "晴天,理想",
            "segments": [{"id": 1, "velocity": 1.0, "directionAngle": 0, "length": 1.0}],
        })

        res = await client.get("/api/scenarios?tag=暴雨")
        assert res.status_code == 200
        items = res.json()
        assert all("暴雨" in item["tags"] for item in items)

    async def test_list_pagination(self, client: AsyncClient):
        """分页正确工作。"""
        # 创建多个场景
        for i in range(5):
            await client.post("/api/scenarios", json={
                "name": f"分页测试{i}", "description": "",
                "segments": [{"id": 1, "velocity": 2.0, "directionAngle": 0, "length": 1.0}],
            })

        res1 = await client.get("/api/scenarios?limit=2&offset=0")
        assert res1.status_code == 200
        assert len(res1.json()) == 2

        res2 = await client.get("/api/scenarios?limit=2&offset=2")
        assert res2.status_code == 200
        assert len(res2.json()) == 2

    async def test_update_scenario(self, client: AsyncClient):
        """更新场景部分字段。"""
        # 创建
        create_res = await client.post("/api/scenarios", json={
            "name": "原名称", "description": "原描述",
            "segments": [{"id": 1, "velocity": 2.0, "directionAngle": 0, "length": 1.0}],
        })
        sid = create_res.json()["id"]

        # 更新名称和光照
        res = await client.put(f"/api/scenarios/{sid}", json={
            "name": "新名称",
            "light_intensity": 2.5,
        })
        assert res.status_code == 200
        data = res.json()
        assert data["name"] == "新名称"
        assert data["light_intensity"] == 2.5
        # description 应该保持原值
        assert data["description"] == "原描述"

    async def test_update_nonexistent(self, client: AsyncClient):
        """更新不存在的场景返回 404。"""
        res = await client.put("/api/scenarios/99999", json={"name": "不存在"})
        assert res.status_code == 404

    async def test_update_empty_body(self, client: AsyncClient):
        """空 body 更新返回 400。"""
        create_res = await client.post("/api/scenarios", json={
            "name": "空更新测试", "description": "",
            "segments": [{"id": 1, "velocity": 2.0, "directionAngle": 0, "length": 1.0}],
        })
        sid = create_res.json()["id"]

        res = await client.put(f"/api/scenarios/{sid}", json={})
        assert res.status_code == 400

    async def test_delete_scenario(self, client: AsyncClient):
        """删除场景。"""
        create_res = await client.post("/api/scenarios", json={
            "name": "待删除", "description": "",
            "segments": [{"id": 1, "velocity": 2.0, "directionAngle": 0, "length": 1.0}],
        })
        sid = create_res.json()["id"]

        res = await client.delete(f"/api/scenarios/{sid}")
        assert res.status_code == 204

        # 确认已删除
        res2 = await client.get(f"/api/scenarios/{sid}")
        assert res2.status_code == 404


# ═══════════════════════════════════════════════════════════════
#  仿真计算
# ═══════════════════════════════════════════════════════════════

class TestSimulation:
    async def test_simulate_basic(self, client: AsyncClient):
        """基础仿真请求返回正确结构。"""
        payload = {
            "light_intensity": 1.0,
            "catalyst_efficiency": 0.8,
            "turbidity": 5.0,
            "segments": [
                {"id": 1, "velocity": 2.0, "directionAngle": 0, "length": 1/3, "depth": 1.5, "width": 1.0},
                {"id": 2, "velocity": 1.5, "directionAngle": 15, "length": 1/3, "depth": 2.0, "width": 1.2},
                {"id": 3, "velocity": 2.5, "directionAngle": -10, "length": 1/3, "depth": 1.0, "width": 0.8},
            ],
        }
        res = await client.post("/api/simulate", json=payload)
        assert res.status_code == 200
        data = res.json()
        assert "optimal_x" in data
        assert "optimal_y" in data
        assert "optimal_segment_index" in data
        assert "segment_out_concentrations" in data
        assert "segment_metrics" in data
        assert "river_path" in data
        assert "compute_time_ms" in data

        assert len(data["segment_out_concentrations"]) == 3
        assert 0 <= data["optimal_segment_index"] < 3
        assert data["compute_time_ms"] > 0
        # 浓度应在 [0, 1] 之间
        for c in data["segment_out_concentrations"]:
            assert 0 <= c <= 1.0

    async def test_simulate_high_catalyst_better(self, client: AsyncClient):
        """高催化剂效率导致更低出口浓度。"""
        segments = [
            {"id": 1, "velocity": 2.0, "directionAngle": 0, "length": 1.0, "depth": 1.5, "width": 1.0},
        ]

        res_low = await client.post("/api/simulate", json={
            "light_intensity": 1.0, "catalyst_efficiency": 0.5,
            "turbidity": 5.0, "segments": segments,
        })
        res_high = await client.post("/api/simulate", json={
            "light_intensity": 1.0, "catalyst_efficiency": 2.0,
            "turbidity": 5.0, "segments": segments,
        })

        conc_low = res_low.json()["segment_out_concentrations"][-1]
        conc_high = res_high.json()["segment_out_concentrations"][-1]
        assert conc_high < conc_low, \
            f"高效催化剂应降解更多: {conc_high} vs {conc_low}"

    async def test_simulate_validation_error(self, client: AsyncClient):
        """无效参数返回 422。"""
        payload = {
            "light_intensity": 999,  # 超出范围
            "catalyst_efficiency": 0.8,
            "turbidity": 5.0,
            "segments": [
                {"id": 1, "velocity": 2.0, "directionAngle": 0, "length": 1.0},
            ],
        }
        res = await client.post("/api/simulate", json=payload)
        assert res.status_code == 422
        assert res.json()["error"]["code"] == "VALIDATION_ERROR"

    async def test_simulate_empty_segments(self, client: AsyncClient):
        """空 segments 返回 422。"""
        res = await client.post("/api/simulate", json={
            "light_intensity": 1.0, "catalyst_efficiency": 0.8,
            "turbidity": 5.0, "segments": [],
        })
        assert res.status_code == 422


# ═══════════════════════════════════════════════════════════════
#  仿真历史记录
# ═══════════════════════════════════════════════════════════════

class TestSimulationRecords:
    async def test_create_record(self, client: AsyncClient):
        """保存仿真记录。"""
        payload = {
            "light_intensity": 1.0,
            "catalyst_efficiency": 0.8,
            "turbidity": 5.0,
            "segments": [
                {"id": 1, "velocity": 2.0, "directionAngle": 0, "length": 0.5, "depth": 1.5, "width": 1.0},
                {"id": 2, "velocity": 1.0, "directionAngle": 10, "length": 0.5, "depth": 2.0, "width": 1.2},
            ],
            "result_json": json.dumps({"optimal_segment_index": 0, "final_conc": 0.85}),
            "compute_time_ms": 1.23,
            "tags": "对比实验",
            "note": "第一次尝试",
        }
        res = await client.post("/api/simulation-records", json=payload)
        assert res.status_code == 201
        data = res.json()
        assert data["light_intensity"] == 1.0
        assert data["turbidity"] == 5.0
        assert len(data["segments"]) == 2
        assert data["result"]["optimal_segment_index"] == 0
        assert data["tags"] == "对比实验"
        assert "id" in data
        assert "created_at" in data

    async def test_list_records(self, client: AsyncClient):
        """获取记录列表并验证分页。"""
        # 先创建多条记录
        for i in range(3):
            await client.post("/api/simulation-records", json={
                "light_intensity": 1.0, "catalyst_efficiency": 0.8,
                "turbidity": 5.0,
                "segments": [{"id": 1, "velocity": 2.0, "directionAngle": 0, "length": 1.0}],
                "result_json": "{}",
                "tags": f"测试{i}",
            })

        res = await client.get("/api/simulation-records?limit=2")
        assert res.status_code == 200
        data = res.json()
        assert len(data) == 2

        # 测试分页偏移
        res2 = await client.get("/api/simulation-records?limit=2&offset=1")
        assert res2.status_code == 200

    async def test_get_record(self, client: AsyncClient):
        """获取单条记录。"""
        create_res = await client.post("/api/simulation-records", json={
            "light_intensity": 1.0, "catalyst_efficiency": 0.8,
            "turbidity": 5.0,
            "segments": [{"id": 1, "velocity": 2.0, "directionAngle": 0, "length": 1.0}],
            "result_json": json.dumps({"note": "唯一记录"}),
        })
        rid = create_res.json()["id"]

        res = await client.get(f"/api/simulation-records/{rid}")
        assert res.status_code == 200
        assert res.json()["result"]["note"] == "唯一记录"

    async def test_get_nonexistent_record(self, client: AsyncClient):
        """请求不存在的记录返回 404。"""
        res = await client.get("/api/simulation-records/99999")
        assert res.status_code == 404

    async def test_delete_record(self, client: AsyncClient):
        """删除记录。"""
        create_res = await client.post("/api/simulation-records", json={
            "light_intensity": 1.0, "catalyst_efficiency": 0.8,
            "turbidity": 5.0,
            "segments": [{"id": 1, "velocity": 2.0, "directionAngle": 0, "length": 1.0}],
            "result_json": "{}",
        })
        rid = create_res.json()["id"]

        res = await client.delete(f"/api/simulation-records/{rid}")
        assert res.status_code == 204

        res2 = await client.get(f"/api/simulation-records/{rid}")
        assert res2.status_code == 404

    async def test_record_with_scenario(self, client: AsyncClient):
        """关联场景的仿真记录。"""
        # 创建场景
        scenario_res = await client.post("/api/scenarios", json={
            "name": "关联测试场景", "description": "",
            "segments": [{"id": 1, "velocity": 2.0, "directionAngle": 0, "length": 1.0}],
        })
        sid = scenario_res.json()["id"]

        # 创建关联记录
        res = await client.post("/api/simulation-records", json={
            "scenario_id": sid,
            "light_intensity": 1.0, "catalyst_efficiency": 0.8,
            "turbidity": 5.0,
            "segments": [{"id": 1, "velocity": 2.0, "directionAngle": 0, "length": 1.0}],
            "result_json": "{}",
        })
        assert res.status_code == 201
        assert res.json()["scenario_id"] == sid

        # 按场景筛选
        list_res = await client.get(f"/api/simulation-records?scenario_id={sid}")
        assert list_res.status_code == 200
        items = list_res.json()
        assert all(item["scenario_id"] == sid for item in items)


# ═══════════════════════════════════════════════════════════════
#  错误处理
# ═══════════════════════════════════════════════════════════════

class TestErrorHandling:
    async def test_404_format(self, client: AsyncClient):
        """404 返回统一错误格式。"""
        res = await client.get("/api/scenarios/99999")
        assert res.status_code == 404
        err = res.json()["error"]
        assert "code" in err
        assert "message" in err

    async def test_422_format(self, client: AsyncClient):
        """422 返回统一错误格式。"""
        res = await client.post("/api/scenarios", json={"name": ""})
        assert res.status_code == 422
        err = res.json()["error"]
        assert err["code"] == "VALIDATION_ERROR"

    async def test_invalid_json(self, client: AsyncClient):
        """无效 JSON 返回验证错误。"""
        res = await client.post(
            "/api/scenarios",
            content="这不是 JSON",
            headers={"Content-Type": "application/json"},
        )
        assert res.status_code == 422
        assert res.json()["error"]["code"] == "VALIDATION_ERROR"


# ═══════════════════════════════════════════════════════════════
#  后台管理页面
# ═══════════════════════════════════════════════════════════════

class TestAdminPages:
    async def test_admin_home(self, client: AsyncClient):
        """后台首页返回 HTML。"""
        res = await client.get("/")
        assert res.status_code == 200
        assert "text/html" in res.headers["content-type"]
        assert "河流光催化净化后台" in res.text

    async def test_admin_simple(self, client: AsyncClient):
        """极简数据页返回 HTML。"""
        res = await client.get("/simple")
        assert res.status_code == 200
        assert "text/html" in res.headers["content-type"]

    async def test_admin_table(self, client: AsyncClient):
        """纯文本数据页返回 text/plain。"""
        res = await client.get("/table")
        assert res.status_code == 200
        assert "text/plain" in res.headers["content-type"]

    async def test_overview_json(self, client: AsyncClient):
        """概览页返回 JSON。"""
        res = await client.get("/overview")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "ok"
        assert "scenario_count" in data
