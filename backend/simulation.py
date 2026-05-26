"""
River Water Quality Simulation Engine (Python)
Exact equivalent of the TypeScript V3 simulation engine.

Physics: flow continuity (Q = v * A), dynamic NTU feedback,
Beer-Lambert light attenuation, dynamic catalyst rate,
dual-river confluence with mass conservation.
"""

import math

# ============================================================================
# CONSTANTS
# ============================================================================

K_NATURAL = 0.0005
"""Natural decay rate constant for non-catalyst conditions."""

STANDARD_CROSS_SECTION = 15
"""Standard cross-sectional area reference (m^2)."""

ALPHA_BASE = 0.05
"""Base light attenuation coefficient."""

ALPHA_PER_NTU = 0.015
"""Additional attenuation per NTU unit."""

NTU_COEFFICIENT = {
    "organic_macromolecule": 12,
    "sediment_algae": 35,
}
"""NTU contribution per unit concentration by pollutant type."""

NATURAL_DECAY_BOOST = {
    "organic_macromolecule": 1.5,
    "sediment_algae": 0.5,
}
"""Natural decay multiplier by pollutant type."""

CLASS_I_THRESHOLD = 0.10
"""Class I water quality standard threshold (concentration)."""

LAKE_WIDTH_MULTIPLIER = 4.0
"""Effective width multiplier for lake terrain."""

LAKE_DEPTH_MULTIPLIER = 1.5
"""Effective depth multiplier for lake terrain."""

DEFAULT_STEPS_PER_SEGMENT = 20
"""Default number of integration steps per segment."""


# ============================================================================
# HELPERS
# ============================================================================

def rnd(value, decimals):
    """Round a value to N decimal places (same as TypeScript round helper)."""
    factor = 10 ** decimals
    return round(value * factor) / factor


def _ensure_list(value):
    """Return value as-is if it is a list, else wrap in a list, else [].

    Handles None, single dicts, and lists of dicts.
    """
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]


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
    steps_per_segment=DEFAULT_STEPS_PER_SEGMENT,
    confluence_index=None,
    confluence_ratio=None,
    confluence_sec_conc=None,
    confluence_sec_flow=None,
):
    """Simulate a single river and return detailed step-by-step results.

    Parameters
    ----------
    segments : list of dict
        Each dict must have keys: length, velocity, width, depth.
        Optional keys: directionAngle (default 0), terrain (default 'river'),
        referenceDischarge.
    grid_width : float
        Total grid width (used for positional context).
    grid_height : float
        Total grid height (used for deviation-ratio depth correction).
    light_intensity : float
        Incident light intensity at the water surface.
    base_ntu : float
        Background NTU (nephelometric turbidity units).
    pollutant_type : str
        One of 'organic_macromolecule' or 'sediment_algae'.
    discharges : list of dict
        Keys: segmentIndex, positionRatio, pollutantType, mass, dischargeType.
    catalyst_placements : list of dict
        Keys: segmentIndex, activity, doseRatio.
    start_x : float
        Starting x-coordinate of the river.
    start_y : float
        Starting y-coordinate of the river.
    steps_per_segment : int
        Number of integration sub-steps per segment.
    confluence_index : int or None
        Index of the segment where a secondary river joins.
    confluence_ratio : float or None
        Ratio (0-1) along the confluence segment where mixing occurs.
    confluence_sec_conc : float or None
        Concentration of the secondary river at the confluence point.
    confluence_sec_flow : float or None
        Flow rate (Q) of the secondary river at the confluence point.

    Returns
    -------
    dict with keys:
        segmentResults, pathResults, waterQualityStandard, bestSegment,
        finalConcentration, flowRate, totalPathLength,
        preConfluenceConcentration, postConfluenceConcentration.
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

    # ----- effective segment properties (lake multipliers) -----
    eff_widths = [0.0] * n
    eff_depths = [0.0] * n
    eff_velocities = [0.0] * n
    seg_lengths = [0.0] * n
    seg_flow_rates = [0.0] * n  # Q for each segment

    for i, seg in enumerate(segments):
        terrain = seg.get("terrain", "river")
        width = seg["width"]
        depth = seg["depth"]

        eff_w = width * (LAKE_WIDTH_MULTIPLIER if terrain == "lake" else 1.0)
        eff_d = depth * (LAKE_DEPTH_MULTIPLIER if terrain == "lake" else 1.0)

        Q = seg.get(
            "referenceDischarge",
            seg["velocity"] * width * depth,
        )
        eff_v = Q / (eff_w * eff_d) if eff_w > 0 and eff_d > 0 else seg["velocity"]

        eff_widths[i] = eff_w
        eff_depths[i] = eff_d
        eff_velocities[i] = eff_v
        seg_lengths[i] = seg["length"]
        seg_flow_rates[i] = Q

    # ----- catalyst activation across segments -----
    catalyst_seg_indices = set()
    for cp in catalyst_placements:
        catalyst_seg_indices.add(cp["segmentIndex"])

    catalyst_active_in_segment = [False] * n
    found = False
    for i in range(n):
        if i in catalyst_seg_indices:
            found = True
        catalyst_active_in_segment[i] = found

    # ----- catalyst global parameters (averages) -----
    if catalyst_placements:
        total_activity = sum(cp["activity"] for cp in catalyst_placements) / len(catalyst_placements)
        total_dose = sum(cp["doseRatio"] for cp in catalyst_placements) / len(catalyst_placements)
    else:
        total_activity = 0.0
        total_dose = 1.0

    # ----- initial concentrations from discharges -----
    seg_initial_conc = [0.0] * n
    for d in discharges:
        idx = d["segmentIndex"]
        if idx < 0 or idx >= n:
            continue
        if d.get("dischargeType", "continuous") == "burst":
            seg_initial_conc[idx] += d["mass"]
        else:  # continuous
            seg_initial_conc[idx] += d["mass"] * seg_lengths[idx]

    max_conc = max(seg_initial_conc) if seg_initial_conc else 0.0
    if max_conc > 0:
        seg_initial_conc = [c / max_conc for c in seg_initial_conc]

    # ----- per-segment metrics -----
    seg_results = []
    best_reaction_score = -1.0
    best_seg_idx = 0

    for i in range(n):
        residence_time = (
            seg_lengths[i] / eff_velocities[i] if eff_velocities[i] > 0 else 0.0
        )
        alpha = ALPHA_BASE + base_ntu * ALPHA_PER_NTU
        effective_light = light_intensity * math.exp(-alpha * eff_depths[i])

        # reactionScore: only non-zero when catalyst is active
        if catalyst_active_in_segment[i]:
            reaction_score = total_activity * total_dose * effective_light
        else:
            reaction_score = 0.0

        # k_local: the actual decay rate constant for this segment
        if catalyst_active_in_segment[i]:
            k_local = total_activity * total_dose * effective_light
        else:
            k_local = K_NATURAL * effective_light * natural_boost

        score = k_local * residence_time

        sr = {
            "segmentIndex": i,
            "residenceTime": rnd(residence_time, 4),
            "effectiveLight": rnd(effective_light, 4),
            "reactionScore": rnd(reaction_score, 4),
            "score": rnd(score, 4),
            "effWidth": rnd(eff_widths[i], 2),
            "effDepth": rnd(eff_depths[i], 2),
            "effVelocity": rnd(eff_velocities[i], 4),
            "initialConcentration": rnd(seg_initial_conc[i], 6),
            "catalystActive": catalyst_active_in_segment[i],
        }
        seg_results.append(sr)

        if sr["reactionScore"] > best_reaction_score:
            best_reaction_score = sr["reactionScore"]
            best_seg_idx = i

    best_segment = {
        "segmentIndex": best_seg_idx,
        "reactionScore": rnd(best_reaction_score, 4),
    }

    # ----- path integration -----
    path_points = []
    concentration = seg_initial_conc[0] if n > 0 else 0.0
    start_y_ref = start_y
    cumulative_dist = 0.0
    x, y = start_x, start_y

    confluence_applied = False
    pre_confluence_conc = None
    post_confluence_conc = None

    # Determine the exact step index for confluence
    if confluence_index is not None and confluence_ratio is not None:
        confluence_step_in_seg = int(confluence_ratio * steps_per_segment)
    else:
        confluence_step_in_seg = -1

    for i in range(n):
        angle = segments[i].get("directionAngle", 0.0)
        step_dist = seg_lengths[i] / steps_per_segment
        eff_v = eff_velocities[i]
        eff_d = eff_depths[i]
        catalyst_on = catalyst_active_in_segment[i]

        for s in range(steps_per_segment):
            # --- check confluence at start of this step ---
            if (
                not confluence_applied
                and confluence_index is not None
                and i == confluence_index
                and s >= confluence_step_in_seg
                and confluence_sec_conc is not None
                and confluence_sec_flow is not None
            ):
                Q_main = seg_flow_rates[i]
                pre_confluence_conc = concentration
                concentration = (
                    Q_main * concentration + confluence_sec_flow * confluence_sec_conc
                ) / (Q_main + confluence_sec_flow)
                post_confluence_conc = concentration
                # Update the flow rate for subsequent mixing calculations
                seg_flow_rates[i] = Q_main + confluence_sec_flow
                confluence_applied = True

            # --- advance position ---
            x += step_dist * math.cos(angle)
            y += step_dist * math.sin(angle)
            cumulative_dist += step_dist

            # --- dynamic NTU feedback ---
            current_ntu = base_ntu + concentration * ntu_coeff
            alpha = ALPHA_BASE + current_ntu * ALPHA_PER_NTU

            # --- deviation-based depth correction ---
            deviation_ratio = (
                abs(y - start_y_ref) / (grid_height * 0.5) if grid_height > 0 else 0.0
            )
            effective_depth = eff_d * (1.0 - deviation_ratio * 0.5)

            # --- Beer-Lambert light attenuation ---
            i_eff = light_intensity * math.exp(-alpha * effective_depth)

            # --- dynamic decay rate ---
            if catalyst_on:
                k_step = total_activity * total_dose * i_eff
            else:
                k_step = K_NATURAL * i_eff * natural_boost

            # --- exponential decay over step time ---
            step_time = step_dist / eff_v if eff_v > 0 else 0.0
            concentration = concentration * math.exp(-k_step * step_time)

            path_points.append({
                "stepIndex": len(path_points),
                "segmentIndex": i,
                "position": {"x": rnd(x, 2), "y": rnd(y, 2)},
                "concentration": rnd(concentration, 6),
                "distance": rnd(cumulative_dist, 2),
                "kStep": rnd(k_step, 6),
                "stepTime": rnd(step_time, 4),
                "iEff": rnd(i_eff, 4),
                "alpha": rnd(alpha, 4),
                "ntu": rnd(current_ntu, 4),
            })

    # ----- water quality standard evaluation -----
    total_path_len = sum(seg_lengths)
    class_i_met = concentration < CLASS_I_THRESHOLD

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
        "classIMet": class_i_met,
        "finalConcentration": rnd(concentration, 6),
        "threshold": CLASS_I_THRESHOLD,
        "distanceToStandard": rnd(distance_to_standard, 4),
        "standardMetDistance": rnd(standard_met_distance, 2),
    }

    # ----- final flow rate = last segment's Q -----
    final_flow_rate = (
        seg_flow_rates[-1] if n > 0 else 0.0
    )

    result = {
        "segmentResults": seg_results,
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

    Parameters
    ----------
    grid_width : float
    grid_height : float
    light_intensity : float
    base_ntu : float
        Background NTU (nephelometric turbidity units).
    pollutant_type : str
        One of 'organic_macromolecule' or 'sediment_algae'.
    segments : list of dict
        Main river segments (each with length, velocity, width, depth).
    pollutant_discharges : list of dict or None
        Discharge events for the main river.
    catalyst_placements : list of dict or None
        Catalyst placement configurations for the main river.
    secondary_segments : list of dict or None
        Secondary river segments (optional).
    secondary_discharges : list of dict or None
        Discharge events for the secondary river.
    confluence_config : dict or None
        Confluence configuration with keys:
        river0Segment, river1Segment, river0Ratio, river1Ratio.

    Returns
    -------
    dict
        Full simulation result including segmentResults, pathResults,
        waterQualityStandard, bestSegment, secondaryResults,
        and confluenceResult (if applicable).
    """
    # ---- 1. default discharges for main river ----
    if pollutant_discharges is None or len(pollutant_discharges) == 0:
        pollutant_discharges = [{
            "segmentIndex": 0,
            "positionRatio": 0,
            "pollutantType": pollutant_type,
            "mass": 1.0,
            "dischargeType": "continuous",
        }]

    if catalyst_placements is None:
        catalyst_placements = []

    # ---- 2. process secondary river if present ----
    secondary_results = None
    sec_final_conc = None
    sec_flow_rate = None

    has_secondary = (
        secondary_segments is not None
        and isinstance(secondary_segments, list)
        and len(secondary_segments) > 0
    )

    if has_secondary:
        if secondary_discharges is None or len(secondary_discharges) == 0:
            secondary_discharges = [{
                "segmentIndex": 0,
                "positionRatio": 0,
                "pollutantType": pollutant_type,
                "mass": 1.0,
                "dischargeType": "continuous",
            }]

        # Secondary river starts higher on the grid for visual separation
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

    # ---- 3. determine confluence parameters ----
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

    # ---- 4. simulate main river ----
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

    # ---- 5. attach secondary and confluence info ----
    result["secondaryResults"] = secondary_results

    if has_confluence and secondary_results is not None:
        result["confluenceResult"] = {
            "mainConcentration": result.get(
                "preConfluenceConcentration",
                result["finalConcentration"],
            ),
            "secondaryConcentration": rnd(sec_final_conc, 6),
            "mixedConcentration": result.get(
                "postConfluenceConcentration",
                result["finalConcentration"],
            ),
            "mainFlowRate": result["flowRate"],
            "secondaryFlowRate": rnd(sec_flow_rate, 4),
            "confluenceSegment": conf_idx,
            "confluenceRatio": rnd(conf_ratio, 4),
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
    """Legacy wrapper that converts old parameter names to new ones.

    Converts ``turbidity`` to ``base_ntu`` and ``catalyst_efficiency`` to a
    default catalyst placement with ``activity=catalyst_efficiency`` and
    ``doseRatio=1.0`` (only when no explicit ``catalyst_placements`` are
    provided).

    Parameters
    ----------
    grid_width : float
    grid_height : float
    light_intensity : float
    turbidity : float
        Legacy parameter -- mapped directly to ``base_ntu``.
    pollutant_type : str
    segments : list of dict
    pollutant_discharges : list of dict or None
    catalyst_efficiency : float
        Legacy single-value catalyst efficiency. Used to create a default
        catalyst placement when ``catalyst_placements`` is not provided.
    catalyst_placements : list of dict or None
        Modern catalyst placements. If provided, takes precedence over
        ``catalyst_efficiency``.
    secondary_segments : list of dict or None
    secondary_discharges : list of dict or None
    confluence_config : dict or None

    Returns
    -------
    dict
        Same result as ``run_simulation``.
    """
    # Map legacy turbidity -> base_ntu
    base_ntu = turbidity

    # Map legacy catalyst_efficiency -> catalyst_placements when none provided
    if catalyst_placements is None or len(catalyst_placements) == 0:
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