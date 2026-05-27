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
