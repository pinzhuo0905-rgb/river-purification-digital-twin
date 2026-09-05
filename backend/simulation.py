"""
River Water Quality Simulation Engine (Python) — v4 parity
Exact equivalent of the TypeScript V4 simulation engine.

Physics: flow continuity (Q = v * A), dynamic NTU feedback,
Beer-Lambert light attenuation, per-segment catalyst lookup,
dual-river confluence with mass conservation.
"""

import math
from water_quality import classify_water_quality

# ============================================================================
# CONFIGURABLE PHYSICS CONSTANTS
# ============================================================================

K_PHOTOLYSIS = 0.0002
"""Photolysis rate constant."""

K_BIODEGRADATION = 0.0003
"""Microbial biodegradation rate constant."""

ALPHA_BASE = 0.05
"""Base light attenuation coefficient (m^-1)."""

ALPHA_PER_NTU = 0.015
"""Additional attenuation per NTU unit (m^-1/NTU)."""

STANDARD_WIDTH_M = 10
"""Standard river width (m)."""

STANDARD_DEPTH_M = 1.5
"""Standard river depth (m)."""

LAKE_WIDTH_MULTIPLIER = 4.0
"""Effective width multiplier for lake terrain."""

LAKE_DEPTH_MULTIPLIER = 1.5
"""Effective depth multiplier for lake terrain."""


NTU_COEFFICIENT = {
    "organic_macromolecule": 12,
    "sediment_algae": 35,
    "heavy_metal": 2,
    "petroleum_hydrocarbon": 18,
    "nutrient_runoff": 10,
    "microplastic": 1,
}
"""NTU contribution per unit concentration by pollutant type."""

NATURAL_DECAY_BOOST = {
    "organic_macromolecule": 1.5,
    "sediment_algae": 0.5,
    "heavy_metal": 0.03,
    "petroleum_hydrocarbon": 0.8,
    "nutrient_runoff": 2.5,
    "microplastic": 0.01,
}
"""Natural decay multiplier by pollutant type (dimensionless)."""

DEFAULT_STEPS_PER_SEGMENT = 20
"""Default number of integration steps per segment."""

TOTAL_RIVER_M = 1000.0
"""Total physical length of the river (m)."""

TOTAL_PHYSICAL_STEPS = 200
"""Total integration steps distributed proportionally across segments."""


# ============================================================================
# HELPERS
# ============================================================================

def rnd(value, decimals):
    """Round a value to N decimal places (same as TypeScript round helper)."""
    factor = 10 ** decimals
    return round(value * factor) / factor


def clamp(v, lo, hi):
    """Clamp value to [lo, hi]."""
    return max(lo, min(hi, v))


# ============================================================================
# EFFECTIVE SEGMENT COMPUTATION
# ============================================================================

def _compute_effective_segments(segments):
    """Compute effective segment parameters with continuity equation.

    Returns list of dicts with keys:
        index, physical_length_m, effective_velocity, effective_width,
        effective_depth, cross_section_area, discharge_flow, is_lake,
        direction_angle
    """
    eff_segs = []
    for idx, seg in enumerate(segments):
        terrain = seg.get("terrain", "river")
        is_lake = terrain == "lake"

        eff_width = seg["width"] * STANDARD_WIDTH_M
        eff_depth = seg["depth"]
        if is_lake:
            eff_width *= LAKE_WIDTH_MULTIPLIER
            eff_depth *= LAKE_DEPTH_MULTIPLIER

        # Flow rate: explicit referenceDischarge or derived from velocity x area
        Q = seg.get("referenceDischarge", seg["velocity"] * eff_width * eff_depth)
        eff_velocity = max(0.05, Q / (eff_width * eff_depth)) if eff_width > 0 and eff_depth > 0 else seg["velocity"]
        physical_length_m = seg["length"] * TOTAL_RIVER_M

        eff_segs.append({
            "index": idx,
            "physical_length_m": physical_length_m,
            "effective_velocity": eff_velocity,
            "effective_width": eff_width,
            "effective_depth": eff_depth,
            "cross_section_area": eff_width * eff_depth,
            "discharge_flow": Q,
            "is_lake": is_lake,
            "direction_angle": seg.get("directionAngle", 0.0),
        })
    return eff_segs


# ============================================================================
# CATALYST MAP (per-segment lookup, NOT global average)
# ============================================================================

def _build_catalyst_map(placements, segment_count):
    """Build per-segment catalyst lookup table.

    Returns dict: segment_index -> list of {activity, dose_ratio, within_segment_ratio}
    """
    cat_map = {}
    for cp in placements:
        idx = cp["segmentIndex"]
        if idx < 0 or idx >= segment_count:
            continue
        if idx not in cat_map:
            cat_map[idx] = []
        cat_map[idx].append({
            "activity": cp["activity"],
            "dose_ratio": cp.get("doseRatio", cp.get("dose_ratio", 1.0)),
            "within_segment_ratio": clamp(cp.get("effectiveAfterRatio", 0.0), 0.0, 1.0),
        })
    return cat_map


# ============================================================================
# DISCHARGE LOAD COMPUTATION
# ============================================================================

def _compute_discharge_loads(discharges, segments, effective_segs):
    """Decompose discharge list into per-segment loads, normalized to [0, 1].

    Returns list of {burst_mass, continuous_total} per segment.
    """
    n = len(effective_segs)
    loads = [{"burst_mass": 0.0, "continuous_total": 0.0} for _ in range(n)]

    if not discharges:
        loads[0]["burst_mass"] = 1.0
        return loads

    for d in discharges:
        idx = d["segmentIndex"]
        if idx < 0 or idx >= n:
            continue
        if d.get("dischargeType", "continuous") == "burst":
            loads[idx]["burst_mass"] += d["mass"]
        else:
            loads[idx]["continuous_total"] += d["mass"]

    # Normalize so max across all loads = 1.0
    max_val = 0.001
    for ld in loads:
        max_val = max(max_val, ld["burst_mass"], ld["continuous_total"])
    for ld in loads:
        ld["burst_mass"] /= max_val
        ld["continuous_total"] /= max_val

    return loads


# ============================================================================
# NTU BASELINE PRE-SCAN
# ============================================================================

def _estimate_ntu_baseline(effective_segs, seg_loads, base_ntu, pollutant_type, light_intensity, total_physical_steps):
    """First-order pre-scan with natural decay only to estimate per-segment NTU and alpha."""
    ntu_coeff = NTU_COEFFICIENT.get(pollutant_type, 12)
    natural_boost = NATURAL_DECAY_BOOST.get(pollutant_type, 1.0)
    per_segment_ntu = []
    per_segment_alpha = []

    conc = clamp(seg_loads[0]["burst_mass"] if seg_loads else 1.0, 0.0, 1.0)

    for s_idx, seg in enumerate(effective_segs):
        coarse_steps = max(10, round(total_physical_steps * (seg["physical_length_m"] / TOTAL_RIVER_M)))
        step_length = seg["physical_length_m"] / coarse_steps

        # Segment-boundary mixing
        if s_idx > 0 and seg_loads[s_idx]:
            ld = seg_loads[s_idx]
            prev_flow = effective_segs[s_idx - 1]["discharge_flow"]
            this_flow = seg["discharge_flow"]
            conc = conc * (prev_flow / this_flow) + ld["burst_mass"]
            conc = clamp(conc, 0.0, 1.0)

        for _ in range(coarse_steps):
            ntu = base_ntu + conc * ntu_coeff
            alpha = ALPHA_BASE + ntu * ALPHA_PER_NTU
            I_eff = light_intensity * math.exp(-alpha * seg["effective_depth"])
            k = K_PHOTOLYSIS * I_eff + K_BIODEGRADATION * natural_boost
            dt = step_length / seg["effective_velocity"]
            conc *= math.exp(-k * dt)
            # Continuous discharge contribution
            if seg_loads[s_idx]["continuous_total"] > 0:
                conc += seg_loads[s_idx]["continuous_total"] / coarse_steps
                conc = clamp(conc, 0.0, 1.0)

        exit_ntu = base_ntu + conc * ntu_coeff
        per_segment_ntu.append(rnd(exit_ntu, 2))
        per_segment_alpha.append(rnd(ALPHA_BASE + exit_ntu * ALPHA_PER_NTU, 6))

    return {"per_segment_ntu": per_segment_ntu, "per_segment_alpha": per_segment_alpha}


# ============================================================================
# SEGMENT METRICS
# ============================================================================

def _compute_segment_metrics(effective_segs, ntu_baseline, catalyst_map, light_intensity):
    """Compute per-segment reaction efficiency metrics using NTU baseline results."""
    metrics = []
    for idx, seg in enumerate(effective_segs):
        alpha = ntu_baseline["per_segment_alpha"][idx] if idx < len(ntu_baseline["per_segment_alpha"]) else ntu_baseline["per_segment_alpha"][0]
        I_eff = light_intensity * math.exp(-alpha * seg["effective_depth"])
        residence_time = seg["physical_length_m"] / seg["effective_velocity"]

        entries = catalyst_map.get(idx, [])
        k_local = entries[0]["activity"] * entries[0]["dose_ratio"] * I_eff if entries else 0.0
        reaction_score = k_local * residence_time

        metrics.append({
            "segmentIndex": idx,
            "velocity": rnd(seg["effective_velocity"], 4),
            "residenceTime": rnd(residence_time, 4),
            "effectiveLight": rnd(I_eff, 6),
            "reactionScore": rnd(reaction_score, 6),
            "effDepth": rnd(seg["effective_depth"], 2),
            "effWidth": rnd(seg["effective_width"], 2),
            "effVelocity": rnd(seg["effective_velocity"], 4),
            "initialConcentration": rnd(0.0, 6),
            "catalystActive": idx in catalyst_map,
        })
    return metrics


def _search_optimal_segment(metrics):
    """Find the segment with the highest reactionScore (or longest residenceTime if all zero)."""
    best_idx = 0
    best_score = -float("inf")

    for m in metrics:
        if m["reactionScore"] > 0 and m["reactionScore"] > best_score:
            best_score = m["reactionScore"]
            best_idx = m["segmentIndex"]

    if best_score <= 0:
        for m in metrics:
            if m["residenceTime"] > best_score:
                best_score = m["residenceTime"]
                best_idx = m["segmentIndex"]

    return best_idx


# ============================================================================
# SINGLE-RIVER SIMULATION
# ============================================================================

def simulate_single_river(
    segments,
    grid_width,
    grid_height,
    light_intensity,
    base_ntu,
    pollutant_type,
    discharges,
    catalyst_placements,
    start_x=0.0,
    start_y=0.0,
    total_physical_steps=TOTAL_PHYSICAL_STEPS,
    confluence_index=None,
    confluence_ratio=None,
    confluence_sec_conc=None,
    confluence_sec_flow=None,
):
    """Simulate a single river with per-segment catalyst lookup and dynamic NTU.

    Returns dict compatible with main.py's expected format.
    """
    n = len(segments)
    if n == 0:
        return {
            "segmentResults": [],
            "pathResults": [],
            "waterQualityStandard": {
                "classIMet": True,
                "finalConcentration": 0.0,
                "threshold": CLASS_I_THRESHOLD,
                "distanceToStandard": -1.0,
                "standardMetDistance": -1.0,
            },
            "bestSegment": {"segmentIndex": -1, "reactionScore": 0.0},
            "finalConcentration": 0.0,
            "flowRate": 0.0,
            "totalPathLength": 0.0,
        }

    ntu_coeff = NTU_COEFFICIENT.get(pollutant_type, 12)
    natural_boost = NATURAL_DECAY_BOOST.get(pollutant_type, 1.0)

    # ---- A1. Effective segments ----
    effective_segs = _compute_effective_segments(segments)

    # ---- A2. Discharge loads ----
    seg_loads = _compute_discharge_loads(discharges, segments, effective_segs)

    # ---- A3. Catalyst map (per-segment, not global average) ----
    catalyst_map = _build_catalyst_map(catalyst_placements, n)

    # ---- A4. NTU baseline pre-scan ----
    ntu_baseline = _estimate_ntu_baseline(
        effective_segs, seg_loads, base_ntu, pollutant_type,
        light_intensity, total_physical_steps,
    )

    # ---- A5. Segment metrics ----
    seg_metrics = _compute_segment_metrics(effective_segs, ntu_baseline, catalyst_map, light_intensity)
    optimal_seg_index = _search_optimal_segment(seg_metrics)

    best_segment = {
        "segmentIndex": optimal_seg_index,
        "reactionScore": rnd(
            seg_metrics[optimal_seg_index]["reactionScore"] if optimal_seg_index < len(seg_metrics) else 0.0,
            4,
        ),
    }

    # ---- B. Path integration (steps distributed proportionally by segment length) ----
    path_points = []
    concentration = clamp(seg_loads[0]["burst_mass"] if seg_loads else 1.0, 0.0, 1.0)
    x, y = start_x, start_y
    cumulative_dist = 0.0

    confluence_applied = False
    pre_confluence_conc = None
    post_confluence_conc = None

    for s_idx, seg in enumerate(effective_segs):
        angle = seg["direction_angle"]
        # Distribute total steps proportionally by physical length (matching TS engine)
        steps_this_seg = max(1, round(total_physical_steps * (seg["physical_length_m"] / TOTAL_RIVER_M)))
        physical_step = seg["physical_length_m"] / steps_this_seg
        eff_v = seg["effective_velocity"]
        eff_d = seg["effective_depth"]
        catalysts_in_seg = catalyst_map.get(s_idx, [])

        # Confluence: determine step within this segment
        if confluence_index is not None and s_idx == confluence_index and confluence_ratio is not None:
            confluence_step_in_seg = int(confluence_ratio * steps_this_seg)
        else:
            confluence_step_in_seg = -1

        for step in range(steps_this_seg):
            # --- Confluence check ---
            if (
                not confluence_applied
                and confluence_index is not None
                and s_idx == confluence_index
                and step >= confluence_step_in_seg
                and confluence_sec_conc is not None
                and confluence_sec_flow is not None
            ):
                Q_main = seg["discharge_flow"]
                pre_confluence_conc = concentration
                # Mass conservation: weighted by flow rates
                concentration = (
                    Q_main * concentration + confluence_sec_flow * confluence_sec_conc
                ) / (Q_main + confluence_sec_flow)
                post_confluence_conc = concentration
                confluence_applied = True

            # --- Advance position ---
            x += physical_step * math.cos(angle)
            y += physical_step * math.sin(angle)
            cumulative_dist += physical_step

            # --- Dynamic NTU feedback ---
            current_ntu = base_ntu + concentration * ntu_coeff
            alpha = ALPHA_BASE + current_ntu * ALPHA_PER_NTU

            # --- Beer-Lambert light attenuation ---
            I_eff = light_intensity * math.exp(-alpha * eff_d)

            # --- Catalyst activation (per-segment, with within_segment_ratio) ---
            progress_ratio = step / steps_this_seg
            catalyst_active = False
            active_catalyst = None
            for entry in catalysts_in_seg:
                if progress_ratio >= entry["within_segment_ratio"]:
                    catalyst_active = True
                    active_catalyst = entry
                    break

            # --- Decay rate ---
            if catalyst_active and active_catalyst:
                k_step = active_catalyst["activity"] * active_catalyst["dose_ratio"] * I_eff
            else:
                k_step = K_PHOTOLYSIS * I_eff + K_BIODEGRADATION * natural_boost

            # --- Exponential decay over step time ---
            step_time = physical_step / eff_v if eff_v > 0 else 0.0
            concentration *= math.exp(-k_step * step_time)

            # --- Continuous discharge contribution (added each step) ---
            if seg_loads[s_idx]["continuous_total"] > 0:
                concentration += seg_loads[s_idx]["continuous_total"] / steps_this_seg
                concentration = clamp(concentration, 0.0, 1.0)

            path_points.append({
                "stepIndex": len(path_points),
                "segmentIndex": s_idx,
                "position": {"x": rnd(x, 2), "y": rnd(y, 2)},
                "concentration": rnd(concentration, 6),
                "distance": rnd(cumulative_dist, 2),
                "kStep": rnd(k_step, 6),
                "stepTime": rnd(step_time, 4),
                "iEff": rnd(I_eff, 4),
                "alpha": rnd(alpha, 4),
                "ntu": rnd(current_ntu, 4),
            })

    # ---- C. Water quality standard evaluation (GB3838-2002 六级分类) ----
    total_path_len = sum(seg["physical_length_m"] for seg in effective_segs)
    assessment = classify_water_quality(pollutant_type, concentration)

    CLASS_I_THRESHOLD = 0.10
    standard_met_distance = -1.0
    for pp in path_points:
        if pp["concentration"] < CLASS_I_THRESHOLD:
            standard_met_distance = pp["distance"]
            break

    if standard_met_distance >= 0 and total_path_len > 0:
        distance_to_standard = standard_met_distance / total_path_len
    else:
        distance_to_standard = -1.0

    water_quality = {
        "classIMet": assessment["class_i_met"],
        "waterQualityClass": assessment["class"],
        "finalConcentration": rnd(concentration, 6),
        "threshold": assessment["class_threshold"],
        "distanceToStandard": rnd(distance_to_standard, 4),
        "standardMetDistance": rnd(standard_met_distance, 2),
    }

    final_flow_rate = effective_segs[-1]["discharge_flow"] if n > 0 else 0.0

    result = {
        "segmentResults": seg_metrics,
        "pathResults": path_points,
        "waterQualityStandard": water_quality,
        "bestSegment": best_segment,
        "finalConcentration": rnd(concentration, 6),
        "flowRate": rnd(final_flow_rate, 4),
        "totalPathLength": rnd(total_path_len, 2),
    }

    if pre_confluence_conc is not None:
        result["preConfluenceConcentration"] = rnd(pre_confluence_conc, 6)
    if post_confluence_conc is not None:
        result["postConfluenceConcentration"] = rnd(post_confluence_conc, 6)

    return result


# ============================================================================
# MAIN SIMULATION ORCHESTRATOR
# ============================================================================

def run_simulation(
    grid_width,
    grid_height,
    light_intensity,
    base_ntu,
    pollutant_type,
    segments,
    pollutant_discharges,
    catalyst_placements,
    secondary_segments,
    secondary_discharges,
    confluence_config,
):
    """Run the full dual-river simulation with optional confluence.

    Returns dict compatible with main.py's expected format.
    """
    # Default discharges for main river
    if not pollutant_discharges:
        pollutant_discharges = [{
            "segmentIndex": 0,
            "positionRatio": 0,
            "pollutantType": pollutant_type,
            "mass": 1.0,
            "dischargeType": "continuous",
        }]

    if not catalyst_placements:
        catalyst_placements = []

    # ---- Secondary river ----
    secondary_results = None
    sec_final_conc = None
    sec_flow_rate = None

    has_secondary = (
        secondary_segments is not None
        and isinstance(secondary_segments, list)
        and len(secondary_segments) > 0
    )

    if has_secondary:
        if not secondary_discharges:
            secondary_discharges = [{
                "segmentIndex": 0,
                "positionRatio": 0,
                "pollutantType": pollutant_type,
                "mass": 1.0,
                "dischargeType": "continuous",
            }]

        sec_start_x = 0.0
        sec_start_y = grid_height * 0.75

        secondary_results = simulate_single_river(
            segments=secondary_segments,
            grid_width=grid_width,
            grid_height=grid_height,
            light_intensity=light_intensity,
            base_ntu=base_ntu,
            pollutant_type=pollutant_type,
            discharges=secondary_discharges,
            catalyst_placements=[],
            start_x=sec_start_x,
            start_y=sec_start_y,
        )
        sec_final_conc = secondary_results["finalConcentration"]
        sec_flow_rate = secondary_results["flowRate"]

    # ---- Confluence parameters ----
    has_confluence = (
        confluence_config is not None
        and secondary_results is not None
    )

    if has_confluence:
        conf_idx = confluence_config.get("river0Segment", 0)
        conf_ratio = confluence_config.get("river0Ratio", 0.5)
    else:
        conf_idx = None
        conf_ratio = None

    # ---- Main river ----
    main_start_x = 0.0
    main_start_y = grid_height * 0.5

    result = simulate_single_river(
        segments=segments,
        grid_width=grid_width,
        grid_height=grid_height,
        light_intensity=light_intensity,
        base_ntu=base_ntu,
        pollutant_type=pollutant_type,
        discharges=pollutant_discharges,
        catalyst_placements=catalyst_placements,
        start_x=main_start_x,
        start_y=main_start_y,
        confluence_index=conf_idx,
        confluence_ratio=conf_ratio,
        confluence_sec_conc=sec_final_conc,
        confluence_sec_flow=sec_flow_rate,
    )

    # ---- Attach secondary and confluence info ----
    result["secondaryResults"] = secondary_results

    if has_confluence and secondary_results is not None:
        result["confluenceResult"] = {
            "mainConcentration": result.get(
                "preConfluenceConcentration",
                result["finalConcentration"],
            ),
            "secondaryConcentration": rnd(sec_final_conc, 6) if sec_final_conc is not None else 0.0,
            "mixedConcentration": result.get(
                "postConfluenceConcentration",
                result["finalConcentration"],
            ),
            "mainFlowRate": result["flowRate"],
            "secondaryFlowRate": rnd(sec_flow_rate, 4) if sec_flow_rate is not None else 0.0,
            "confluenceSegment": conf_idx,
            "confluenceRatio": rnd(conf_ratio, 4) if conf_ratio is not None else 0.0,
        }
    else:
        result["confluenceResult"] = None

    return result


# ============================================================================
# LEGACY WRAPPER
# ============================================================================

def run_simulation_legacy(
    grid_width,
    grid_height,
    light_intensity,
    turbidity,
    pollutant_type,
    segments,
    pollutant_discharges,
    catalyst_efficiency,
    catalyst_placements=None,
    secondary_segments=None,
    secondary_discharges=None,
    confluence_config=None,
):
    """Legacy wrapper that converts old parameter names to new ones."""
    base_ntu = turbidity

    if not catalyst_placements:
        catalyst_placements = [{
            "segmentIndex": 0,
            "activity": catalyst_efficiency,
            "doseRatio": 1.0,
        }]

    return run_simulation(
        grid_width=grid_width,
        grid_height=grid_height,
        light_intensity=light_intensity,
        base_ntu=base_ntu,
        pollutant_type=pollutant_type,
        segments=segments,
        pollutant_discharges=pollutant_discharges,
        catalyst_placements=catalyst_placements,
        secondary_segments=secondary_segments,
        secondary_discharges=secondary_discharges,
        confluence_config=confluence_config,
    )
