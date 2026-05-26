"""
仿真引擎单元测试 — v2: 每段独立 depth/width

运行：
  cd backend && python -m pytest test_simulation.py -v
"""
import math
from simulation import run_simulation


def test_basic_run():
    """基础测试：验证仿真不报错，输出关键字段齐全。"""
    result = run_simulation(
        grid_width=400,
        grid_height=150,
        segments=[
            {"id": 1, "velocity": 2.0, "directionAngle": 0, "length": 1/3, "depth": 1.5, "width": 1.0},
            {"id": 2, "velocity": 1.5, "directionAngle": 15, "length": 1/3, "depth": 2.0, "width": 1.2},
            {"id": 3, "velocity": 2.5, "directionAngle": -10, "length": 1/3, "depth": 1.0, "width": 0.8},
        ],
        light_intensity=1.0,
        catalyst_efficiency=0.8,
        turbidity=5.0,
    )

    assert "optimal_x" in result
    assert "optimal_y" in result
    assert "optimal_segment_index" in result
    assert "segment_out_concentrations" in result
    assert "segment_metrics" in result
    assert "river_path" in result
    assert "river_width_px" in result
    assert "segment_widths_px" in result

    assert len(result["river_path"]) > 10
    for pt in result["river_path"]:
        assert 0 <= pt["concentration"] <= 1.0

    assert len(result["segment_out_concentrations"]) == 3
    assert 0 <= result["optimal_segment_index"] < 3


def test_higher_catalyst_lower_final():
    """高催化剂效率应导致更低的出口浓度。"""
    def final_conc(cat):
        r = run_simulation(
            grid_width=400, grid_height=150,
            segments=[{"id": 1, "velocity": 2.0, "directionAngle": 0, "length": 1.0, "depth": 1.5, "width": 1.0}],
            light_intensity=1.0,
            catalyst_efficiency=cat,
            turbidity=5.0,
        )
        return r["segment_out_concentrations"][-1]

    assert final_conc(2.0) < final_conc(0.5), \
        f"高效催化剂应降解更多: {final_conc(2.0)} vs {final_conc(0.5)}"


def test_higher_turbidity_higher_final():
    """高浊度导致光更难穿透，出口浓度应更高。"""
    def final_conc(turb):
        r = run_simulation(
            grid_width=400, grid_height=150,
            segments=[{"id": 1, "velocity": 2.0, "directionAngle": 0, "length": 1.0, "depth": 1.5, "width": 1.0}],
            light_intensity=1.0,
            catalyst_efficiency=0.8,
            turbidity=turb,
        )
        return r["segment_out_concentrations"][-1]

    assert final_conc(30) > final_conc(5), \
        f"高浊度应降解更少: {final_conc(30)} vs {final_conc(5)}"


def test_faster_flow_higher_final():
    """高流速导致停留时间短，出口浓度应更高。"""
    def final_conc(v):
        r = run_simulation(
            grid_width=400, grid_height=150,
            segments=[{"id": 1, "velocity": v, "directionAngle": 0, "length": 1.0, "depth": 1.5, "width": 1.0}],
            light_intensity=1.0,
            catalyst_efficiency=0.8,
            turbidity=5.0,
        )
        return r["segment_out_concentrations"][-1]

    assert final_conc(5.0) > final_conc(0.5), \
        f"高流速应降解更少: {final_conc(5.0)} vs {final_conc(0.5)}"


def test_optimal_pick_is_highest_score():
    """最佳投放段应该就是 reaction_score 最高的段。"""
    result = run_simulation(
        grid_width=400, grid_height=150,
        segments=[
            {"id": 1, "velocity": 3.0, "directionAngle": 0, "length": 0.3, "depth": 1.5, "width": 1.0},
            {"id": 2, "velocity": 0.5, "directionAngle": 0, "length": 0.4, "depth": 2.0, "width": 1.2},
            {"id": 3, "velocity": 4.0, "directionAngle": 0, "length": 0.3, "depth": 1.0, "width": 0.8},
        ],
        light_intensity=1.0,
        catalyst_efficiency=0.8,
        turbidity=5.0,
    )

    scores = [(m["seg_index"], m["reaction_score"]) for m in result["segment_metrics"]]
    best_by_score = max(scores, key=lambda x: x[1])[0]
    assert result["optimal_segment_index"] == best_by_score, \
        f"最佳段应匹配最高分: {result['optimal_segment_index']} != {best_by_score}"


def test_river_path_has_correct_count():
    """river_path 应该有约 200 个点。"""
    result = run_simulation(
        grid_width=400, grid_height=150,
        segments=[{"id": 1, "velocity": 2.0, "directionAngle": 0, "length": 1.0, "depth": 1.5, "width": 1.0}],
        light_intensity=1.0,
        catalyst_efficiency=0.8,
        turbidity=5.0,
    )
    assert abs(len(result["river_path"]) - 200) <= 2, \
        f"路径点应为 ~200: got {len(result['river_path'])}"


def test_per_segment_depth_affects_result():
    """不同段水深应产生不同的有效光强和反应效率。"""
    result = run_simulation(
        grid_width=400, grid_height=150,
        segments=[
            {"id": 1, "velocity": 2.0, "directionAngle": 0, "length": 0.5, "depth": 0.5, "width": 1.0},
            {"id": 2, "velocity": 2.0, "directionAngle": 0, "length": 0.5, "depth": 4.0, "width": 1.0},
        ],
        light_intensity=1.0,
        catalyst_efficiency=0.8,
        turbidity=5.0,
    )
    assert result["segment_metrics"][0]["effective_light"] > result["segment_metrics"][1]["effective_light"], \
        "浅水段有效光强应大于深水段"


def test_segment_width_px_output():
    """验证 segment_widths_px 输出正确。"""
    result = run_simulation(
        grid_width=400, grid_height=150,
        segments=[
            {"id": 1, "velocity": 2.0, "directionAngle": 0, "length": 0.5, "depth": 1.5, "width": 0.5},
            {"id": 2, "velocity": 2.0, "directionAngle": 0, "length": 0.5, "depth": 1.5, "width": 2.0},
        ],
        light_intensity=1.0,
        catalyst_efficiency=0.8,
        turbidity=5.0,
    )
    assert result["segment_widths_px"][0] < result["segment_widths_px"][1], \
        "width系数0.5的段应比2.0的窄"
    # 验证 path 点携带 widthPx
    assert "width_px" in result["river_path"][0]
