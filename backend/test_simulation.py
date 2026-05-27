"""
Simulation engine unit tests — v4 parity

Run:
  cd backend && python -m pytest test_simulation.py -v
"""
import math
from simulation import run_simulation, run_simulation_legacy


def _single_seg(velocity=2.0, depth=1.5, width=1.0, terrain="river", direction_angle=0.0):
    """Helper: single segment dict."""
    return {
        "id": 1, "velocity": velocity, "directionAngle": direction_angle,
        "length": 1.0, "depth": depth, "width": width, "terrain": terrain,
    }


def test_basic_run():
    """Sanity: simulation runs without errors, key fields present."""
    result = run_simulation(
        grid_width=400, grid_height=150,
        light_intensity=1.0, base_ntu=5.0,
        pollutant_type="organic_macromolecule",
        segments=[_single_seg()],
        pollutant_discharges=None,
        catalyst_placements=None,
        secondary_segments=None,
        secondary_discharges=None,
        confluence_config=None,
    )

    assert "pathResults" in result
    assert "segmentResults" in result
    assert "bestSegment" in result
    assert "waterQualityStandard" in result
    assert "finalConcentration" in result
    assert len(result["pathResults"]) > 10
    for pt in result["pathResults"]:
        assert 0 <= pt["concentration"] <= 1.0


def test_higher_catalyst_lower_final():
    """Higher catalyst activity -> lower final concentration."""
    def final_conc(activity):
        r = run_simulation(
            grid_width=400, grid_height=150,
            light_intensity=1.0, base_ntu=5.0,
            pollutant_type="organic_macromolecule",
            segments=[_single_seg()],
            pollutant_discharges=[{
                "segmentIndex": 0, "positionRatio": 0,
                "pollutantType": "organic_macromolecule",
                "mass": 1.0, "dischargeType": "burst",
            }],
            catalyst_placements=[{
                "segmentIndex": 0, "activity": activity, "doseRatio": 1.0,
            }],
            secondary_segments=None, secondary_discharges=None,
            confluence_config=None,
        )
        return r["finalConcentration"]

    # Use very low activities to avoid both hitting zero
    assert final_conc(0.005) < final_conc(0.0005), \
        f"Higher activity should degrade more: {final_conc(0.005)} vs {final_conc(0.0005)}"


def test_higher_turbidity_higher_final():
    """Higher turbidity -> less light penetration -> higher final conc."""
    def final_conc(ntu):
        r = run_simulation(
            grid_width=400, grid_height=150,
            light_intensity=1.0, base_ntu=ntu,
            pollutant_type="organic_macromolecule",
            segments=[_single_seg()],
            pollutant_discharges=[{
                "segmentIndex": 0, "positionRatio": 0,
                "pollutantType": "organic_macromolecule",
                "mass": 1.0, "dischargeType": "burst",
            }],
            catalyst_placements=[{
                "segmentIndex": 0, "activity": 0.005, "doseRatio": 1.0,
            }],
            secondary_segments=None, secondary_discharges=None,
            confluence_config=None,
        )
        return r["finalConcentration"]

    assert final_conc(30) > final_conc(5), \
        f"Higher turbidity should degrade less: {final_conc(30)} vs {final_conc(5)}"


def test_faster_flow_higher_final():
    """Higher velocity -> shorter residence time -> higher final conc."""
    def final_conc(v):
        r = run_simulation(
            grid_width=400, grid_height=150,
            light_intensity=1.0, base_ntu=5.0,
            pollutant_type="organic_macromolecule",
            segments=[_single_seg(velocity=v)],
            pollutant_discharges=[{
                "segmentIndex": 0, "positionRatio": 0,
                "pollutantType": "organic_macromolecule",
                "mass": 1.0, "dischargeType": "burst",
            }],
            catalyst_placements=[{
                "segmentIndex": 0, "activity": 0.005, "doseRatio": 1.0,
            }],
            secondary_segments=None, secondary_discharges=None,
            confluence_config=None,
        )
        return r["finalConcentration"]

    assert final_conc(5.0) > final_conc(0.5), \
        f"Faster flow should degrade less: {final_conc(5.0)} vs {final_conc(0.5)}"


def test_optimal_pick_is_highest_score():
    """Best segment should be the one with the highest reactionScore."""
    result = run_simulation(
        grid_width=400, grid_height=150,
        light_intensity=1.0, base_ntu=5.0,
        pollutant_type="organic_macromolecule",
        segments=[
            {"id": 1, "velocity": 3.0, "directionAngle": 0, "length": 0.3, "depth": 1.5, "width": 1.0},
            {"id": 2, "velocity": 0.5, "directionAngle": 0, "length": 0.4, "depth": 2.0, "width": 1.2},
            {"id": 3, "velocity": 4.0, "directionAngle": 0, "length": 0.3, "depth": 1.0, "width": 0.8},
        ],
        pollutant_discharges=None,
        catalyst_placements=[{
            "segmentIndex": 0, "activity": 0.8, "doseRatio": 3.0,
        }],
        secondary_segments=None, secondary_discharges=None,
        confluence_config=None,
    )

    scores = [(m["segmentIndex"], m["reactionScore"]) for m in result["segmentResults"]]
    best_by_score = max(scores, key=lambda x: x[1])[0]
    assert result["bestSegment"]["segmentIndex"] == best_by_score, \
        f"Best segment should match highest score: {result['bestSegment']['segmentIndex']} != {best_by_score}"


def test_river_path_has_correct_count():
    """pathResults should have TOTAL_PHYSICAL_STEPS (200) points for a full-length single segment."""
    result = run_simulation(
        grid_width=400, grid_height=150,
        light_intensity=1.0, base_ntu=5.0,
        pollutant_type="organic_macromolecule",
        segments=[_single_seg()],
        pollutant_discharges=None,
        catalyst_placements=[{
            "segmentIndex": 0, "activity": 0.8, "doseRatio": 3.0,
        }],
        secondary_segments=None, secondary_discharges=None,
        confluence_config=None,
    )
    assert 190 <= len(result["pathResults"]) <= 210, \
        f"Path points should be ~200: got {len(result['pathResults'])}"


def test_per_segment_depth_affects_result():
    """Deeper segments should have less effective light."""
    result = run_simulation(
        grid_width=400, grid_height=150,
        light_intensity=1.0, base_ntu=5.0,
        pollutant_type="organic_macromolecule",
        segments=[
            {"id": 1, "velocity": 2.0, "directionAngle": 0, "length": 0.5, "depth": 0.5, "width": 1.0},
            {"id": 2, "velocity": 2.0, "directionAngle": 0, "length": 0.5, "depth": 4.0, "width": 1.0},
        ],
        pollutant_discharges=None,
        catalyst_placements=[{
            "segmentIndex": 0, "activity": 0.8, "doseRatio": 3.0,
        }],
        secondary_segments=None, secondary_discharges=None,
        confluence_config=None,
    )
    assert result["segmentResults"][0]["effectiveLight"] > result["segmentResults"][1]["effectiveLight"], \
        "Shallow segment should have more effective light than deep segment"


def test_segment_width_px_output():
    """Wider segments should have larger effective width."""
    result = run_simulation(
        grid_width=400, grid_height=150,
        light_intensity=1.0, base_ntu=5.0,
        pollutant_type="organic_macromolecule",
        segments=[
            {"id": 1, "velocity": 2.0, "directionAngle": 0, "length": 0.5, "depth": 1.5, "width": 0.5},
            {"id": 2, "velocity": 2.0, "directionAngle": 0, "length": 0.5, "depth": 1.5, "width": 2.0},
        ],
        pollutant_discharges=None,
        catalyst_placements=[{
            "segmentIndex": 0, "activity": 0.8, "doseRatio": 3.0,
        }],
        secondary_segments=None, secondary_discharges=None,
        confluence_config=None,
    )
    assert result["segmentResults"][0]["effWidth"] < result["segmentResults"][1]["effWidth"], \
        "Width 0.5 segment should be narrower than 2.0"


def test_catalyst_per_segment_lookup():
    """Catalyst only activates in explicitly placed segments (not propagated downstream)."""
    result = run_simulation(
        grid_width=400, grid_height=150,
        light_intensity=1.0, base_ntu=5.0,
        pollutant_type="organic_macromolecule",
        segments=[
            {"id": 1, "velocity": 1.0, "directionAngle": 0, "length": 0.5, "depth": 1.5, "width": 1.0},
            {"id": 2, "velocity": 1.0, "directionAngle": 0, "length": 0.5, "depth": 1.5, "width": 1.0},
        ],
        pollutant_discharges=None,
        catalyst_placements=[{
            "segmentIndex": 1, "activity": 0.8, "doseRatio": 3.0,
        }],
        secondary_segments=None, secondary_discharges=None,
        confluence_config=None,
    )
    # Segment 0 should NOT be catalyst-active, segment 1 should be
    assert result["segmentResults"][0]["catalystActive"] is False
    assert result["segmentResults"][1]["catalystActive"] is True


def test_effective_after_ratio():
    """Catalyst activation delayed within segment."""
    result = run_simulation(
        grid_width=400, grid_height=150,
        light_intensity=1.0, base_ntu=5.0,
        pollutant_type="organic_macromolecule",
        segments=[_single_seg()],
        pollutant_discharges=None,
        catalyst_placements=[{
            "segmentIndex": 0, "activity": 0.8, "doseRatio": 3.0,
            "effectiveAfterRatio": 0.5,
        }],
        secondary_segments=None, secondary_discharges=None,
        confluence_config=None,
    )
    # kStep changes after catalyst activates mid-segment
    path = result["pathResults"]
    mid = len(path) // 2
    # First half should have lower kStep (natural decay), second half higher (catalyst)
    k_first = path[0]["kStep"]
    k_second = path[mid]["kStep"]
    assert k_second > k_first, \
        f"Catalyst should increase decay rate after activation: {k_second} > {k_first}"


def test_new_pollutant_types():
    """All 6 pollutant types are supported."""
    for ptype in [
        "organic_macromolecule", "sediment_algae", "heavy_metal",
        "petroleum_hydrocarbon", "nutrient_runoff", "microplastic",
    ]:
        result = run_simulation(
            grid_width=400, grid_height=150,
            light_intensity=1.0, base_ntu=5.0,
            pollutant_type=ptype,
            segments=[_single_seg()],
            pollutant_discharges=None,
            catalyst_placements=None,
            secondary_segments=None, secondary_discharges=None,
            confluence_config=None,
        )
        assert result["finalConcentration"] >= 0


def test_heavy_metal_barely_decays_naturally():
    """Heavy metals have near-zero natural decay."""
    result = run_simulation(
        grid_width=400, grid_height=150,
        light_intensity=1.0, base_ntu=5.0,
        pollutant_type="heavy_metal",
        segments=[{"id": 1, "velocity": 3.0, "directionAngle": 0, "length": 1.0, "depth": 1.5, "width": 1.0}],
        pollutant_discharges=None,
        catalyst_placements=None,
        secondary_segments=None, secondary_discharges=None,
        confluence_config=None,
    )
    assert result["finalConcentration"] > 0.90, \
        f"Heavy metal should barely decay naturally: {result['finalConcentration']}"


def test_heavy_metal_decays_with_catalyst():
    """Heavy metals degrade significantly with catalyst."""
    no_cat = run_simulation(
        grid_width=400, grid_height=150,
        light_intensity=1.0, base_ntu=5.0,
        pollutant_type="heavy_metal",
        segments=[_single_seg(velocity=1.0)],
        pollutant_discharges=None,
        catalyst_placements=None,
        secondary_segments=None, secondary_discharges=None,
        confluence_config=None,
    )
    with_cat = run_simulation(
        grid_width=400, grid_height=150,
        light_intensity=1.0, base_ntu=5.0,
        pollutant_type="heavy_metal",
        segments=[_single_seg(velocity=1.0)],
        pollutant_discharges=None,
        catalyst_placements=[{
            "segmentIndex": 0, "activity": 0.8, "doseRatio": 3.0,
        }],
        secondary_segments=None, secondary_discharges=None,
        confluence_config=None,
    )
    assert no_cat["finalConcentration"] - with_cat["finalConcentration"] > 0.1, \
        "Catalyst should significantly improve heavy metal degradation"


def test_lake_terrain():
    """Lake segments have wider effective width and slower velocity."""
    result = run_simulation(
        grid_width=400, grid_height=150,
        light_intensity=1.0, base_ntu=5.0,
        pollutant_type="organic_macromolecule",
        segments=[
            {"id": 1, "velocity": 1.0, "directionAngle": 0, "length": 0.33, "depth": 1.5, "width": 1.0, "referenceDischarge": 10},
            {"id": 2, "velocity": 1.0, "directionAngle": 0, "length": 0.34, "depth": 2.0, "width": 1.0, "terrain": "lake", "referenceDischarge": 10},
            {"id": 3, "velocity": 1.0, "directionAngle": 0, "length": 0.33, "depth": 1.0, "width": 0.8, "referenceDischarge": 10},
        ],
        pollutant_discharges=None,
        catalyst_placements=[{
            "segmentIndex": 0, "activity": 0.5, "doseRatio": 3.0,
        }],
        secondary_segments=None, secondary_discharges=None,
        confluence_config=None,
    )

    lake = result["segmentResults"][1]
    river0 = result["segmentResults"][0]
    assert lake["effWidth"] > river0["effWidth"], "Lake should be wider than river"
    assert lake["effVelocity"] < river0["effVelocity"], "Lake flow should be slower than river"
    assert lake["residenceTime"] > river0["residenceTime"], "Lake residence time should be longer"


def test_legacy_wrapper():
    """Legacy wrapper should accept old parameter names."""
    result = run_simulation_legacy(
        grid_width=400, grid_height=150,
        light_intensity=1.0,
        turbidity=5.0,
        pollutant_type="organic_macromolecule",
        segments=[_single_seg()],
        pollutant_discharges=None,
        catalyst_efficiency=0.8,
    )
    assert result["finalConcentration"] < 1.0
    assert result["bestSegment"]["segmentIndex"] >= 0


def test_confluence_mixing():
    """Dual-river confluence should produce intermediate concentration."""
    result = run_simulation(
        grid_width=600, grid_height=200,
        light_intensity=1.0, base_ntu=5.0,
        pollutant_type="organic_macromolecule",
        segments=[
            {"id": 1, "velocity": 1.0, "directionAngle": 0, "length": 0.5, "depth": 1.5, "width": 1.0},
            {"id": 2, "velocity": 1.0, "directionAngle": 0, "length": 0.5, "depth": 1.5, "width": 1.5},
        ],
        pollutant_discharges=None,
        catalyst_placements=[
            {"segmentIndex": 0, "activity": 0.6, "doseRatio": 2.0},
            {"segmentIndex": 1, "activity": 0.6, "doseRatio": 2.0},
        ],
        secondary_segments=[
            {"id": 10, "velocity": 1.0, "directionAngle": 0, "length": 1.0, "depth": 1.5, "width": 0.8},
        ],
        secondary_discharges=[
            {"segmentIndex": 0, "positionRatio": 0, "pollutantType": "organic_macromolecule", "mass": 0.5, "dischargeType": "continuous"},
        ],
        confluence_config={
            "river0Segment": 1,
            "river1Segment": 0,
            "river0Ratio": 0.0,
            "river1Ratio": 1.0,
        },
    )
    assert result["secondaryResults"] is not None
    assert result["confluenceResult"] is not None
    assert 0 <= result["finalConcentration"] <= 1.0
