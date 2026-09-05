"""
预设场景种子数据 — 一键填充示例场景

运行方式：
  cd backend && python seed_data.py
"""
import asyncio
import json
from database import engine, async_session
from models import Base, Scenario


PRESETS = [
    {
        "name": "澜沧江夏季暴雨模拟",
        "description": "夏季暴雨过后，上游来水浑浊度高、流速快，光催化效率受限。适合演示高浊度场景下的光穿透衰减效应。",
        "light_intensity": 1.2,
        "catalyst_efficiency": 1.2,
        "river_depth": 3.0,
        "turbidity": 35.0,
        "segments_json": json.dumps([
            {"id": 1, "velocity": 3.5, "directionAngle": 0, "length": 0.25},
            {"id": 2, "velocity": 3.0, "directionAngle": 10, "length": 0.35},
            {"id": 3, "velocity": 2.0, "directionAngle": -15, "length": 0.25},
            {"id": 4, "velocity": 1.5, "directionAngle": -5, "length": 0.15},
        ], ensure_ascii=False),
        "author": "澜沧江课题组成员",
        "tags": "暴雨,高浊度,澜沧江,夏季",
    },
    {
        "name": "苏州河工业废水超标模拟",
        "description": "模拟苏州河市区段受工业废水排入后的自净过程。河道弯曲多、流速慢，但浊度高导致光难以穿透。",
        "light_intensity": 0.8,
        "catalyst_efficiency": 0.5,
        "river_depth": 2.0,
        "turbidity": 25.0,
        "segments_json": json.dumps([
            {"id": 1, "velocity": 1.5, "directionAngle": 20, "length": 0.20},
            {"id": 2, "velocity": 1.0, "directionAngle": -25, "length": 0.25},
            {"id": 3, "velocity": 0.8, "directionAngle": 15, "length": 0.20},
            {"id": 4, "velocity": 1.2, "directionAngle": -10, "length": 0.20},
            {"id": 5, "velocity": 1.5, "directionAngle": 5, "length": 0.15},
        ], ensure_ascii=False),
        "author": "城市水环境课题组",
        "tags": "工业废水,苏州河,城市河流,低流速",
    },
    {
        "name": "晴天缓流最佳净化方案",
        "description": "理想条件：晴天高光照 + 低浊度清流 + 高效催化剂。这是演示光催化净化能力上限的黄金标准场景。",
        "light_intensity": 2.5,
        "catalyst_efficiency": 2.0,
        "river_depth": 1.0,
        "turbidity": 3.0,
        "segments_json": json.dumps([
            {"id": 1, "velocity": 1.0, "directionAngle": 0, "length": 0.33},
            {"id": 2, "velocity": 0.5, "directionAngle": 5, "length": 0.33},
            {"id": 3, "velocity": 0.8, "directionAngle": -5, "length": 0.34},
        ], ensure_ascii=False),
        "author": "教学演示组",
        "tags": "晴天,最佳条件,低流速,高效",
    },
    {
        "name": "高流速山地河流应急处理",
        "description": "模拟山区急流被污染后的应急光催化处理。高流速意味着停留时间极短，需要极高催化剂效率才能见效。",
        "light_intensity": 1.5,
        "catalyst_efficiency": 2.0,
        "river_depth": 1.5,
        "turbidity": 10.0,
        "segments_json": json.dumps([
            {"id": 1, "velocity": 4.5, "directionAngle": 10, "length": 0.40},
            {"id": 2, "velocity": 3.5, "directionAngle": -20, "length": 0.35},
            {"id": 3, "velocity": 2.5, "directionAngle": 15, "length": 0.25},
        ], ensure_ascii=False),
        "author": "山地水环境课题组",
        "tags": "山地,急流,应急处理,高流速",
    },
    {
        "name": "冬季低光多弯曲河口模拟",
        "description": "冬季日照短、光照弱，且河口多弯曲。展示在极端不利条件下的净化下限，强调催化剂选型的重要性。",
        "light_intensity": 0.4,
        "catalyst_efficiency": 1.2,
        "river_depth": 2.5,
        "turbidity": 15.0,
        "segments_json": json.dumps([
            {"id": 1, "velocity": 2.0, "directionAngle": -15, "length": 0.15},
            {"id": 2, "velocity": 1.8, "directionAngle": 30, "length": 0.15},
            {"id": 3, "velocity": 1.5, "directionAngle": -35, "length": 0.20},
            {"id": 4, "velocity": 1.2, "directionAngle": 25, "length": 0.20},
            {"id": 5, "velocity": 1.0, "directionAngle": -20, "length": 0.15},
            {"id": 6, "velocity": 0.8, "directionAngle": 10, "length": 0.15},
        ], ensure_ascii=False),
        "author": "北方河流课题组",
        "tags": "冬季,低光照,河口,多弯曲",
    },
]


async def seed():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_session() as session:
        for preset in PRESETS:
            scenario = Scenario(**preset)
            session.add(scenario)
        await session.commit()
        print(f"✅ 已插入 {len(PRESETS)} 个预设场景")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(seed())
