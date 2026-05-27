"""
Automatic dosing optimization engine (Python) — v1
Exact equivalent of the TypeScript optimizer.ts.
"""

import math
import time
import random
from simulation import simulate_single_river

# ═══════════════════════════════════════════════════════════════
#  Data classes
# ═══════════════════════════════════════════════════════════════

class DosingPoint:
    def __init__(self, segment_index, position_ratio, activity, dose_ratio):
        self.segment_index = segment_index
        self.position_ratio = position_ratio
        self.activity = activity
        self.dose_ratio = dose_ratio

    def to_dict(self):
        return {
            "segmentIndex": self.segment_index,
            "positionRatio": self.position_ratio,
            "activity": self.activity,
            "doseRatio": self.dose_ratio,
        }

    def to_catalyst(self):
        return {
            "segmentIndex": self.segment_index,
            "activity": self.activity,
            "doseRatio": self.dose_ratio,
            "effectiveAfterRatio": self.position_ratio,
        }


class ParetoPoint:
    def __init__(self, dosing_count, final_concentration, dosing_points, class_i_met, compute_time_ms):
        self.dosing_count = dosing_count
        self.final_concentration = final_concentration
        self.dosing_points = dosing_points
        self.class_i_met = class_i_met
        self.compute_time_ms = compute_time_ms

    def to_dict(self):
        return {
            "dosing_count": self.dosing_count,
            "final_concentration": self.final_concentration,
            "dosing_points": [dp.to_dict() for dp in self.dosing_points],
            "class_i_met": self.class_i_met,
            "compute_time_ms": self.compute_time_ms,
        }


class OptimizationRequest:
    def __init__(self, params, max_dosing_points=5, position_grid_size=10):
        self.params = params
        self.max_dosing_points = max_dosing_points
        self.position_grid_size = position_grid_size


class OptimizationResult:
    def __init__(self, pareto_frontier, optimal, baseline_concentration):
        self.pareto_frontier = pareto_frontier
        self.optimal = optimal
        self.baseline_concentration = baseline_concentration

    def to_dict(self):
        return {
            "pareto_frontier": [p.to_dict() for p in self.pareto_frontier],
            "optimal": self.optimal.to_dict(),
            "baseline_concentration": self.baseline_concentration,
        }


# ═══════════════════════════════════════════════════════════════
#  Constants
# ═══════════════════════════════════════════════════════════════

CLASS_I_THRESHOLD = 0.10
DOSE_CANDIDATES = [1, 1.5, 2, 3, 5]
ACTIVITY_CANDIDATES = [0.5, 0.8]


# ═══════════════════════════════════════════════════════════════
#  Helpers
# ═══════════════════════════════════════════════════════════════

def _clamp(v, lo, hi):
    return max(lo, min(hi, v))


def _evaluate(params, dosing_points):
    """Evaluate a set of dosing points and return the SimulationResult dict."""
    catalysts = [dp.to_catalyst() for dp in dosing_points]
    return simulate_single_river(
        segments=params.get("segments", []),
        grid_width=params.get("gridWidth", 400),
        grid_height=params.get("gridHeight", 150),
        light_intensity=params.get("lightIntensity", 1.0),
        base_ntu=params.get("baseNtu", 5),
        pollutant_type=params.get("pollutantType", "organic_macromolecule"),
        discharges=params.get("pollutantDischarges"),
        catalyst_placements=catalysts,
    )


def _final_conc(params, dosing_points):
    """Return the final segment outlet concentration for a dosing plan."""
    result = _evaluate(params, dosing_points)
    return result.get("finalConcentration", 1.0)


# ═══════════════════════════════════════════════════════════════
#  Grid Search
# ═══════════════════════════════════════════════════════════════

def _grid_search_best_new_point(params, existing_points, grid_size):
    """Find the best single additional dosing point via grid search."""
    segments = params.get("segments", [])
    M = len(segments)
    if M == 0:
        return DosingPoint(0, 0, 0.5, 1.0)

    best_conc = _final_conc(params, existing_points)
    best_point = DosingPoint(0, 0, 0.5, 1.0)

    for seg in range(M):
        for g in range(grid_size):
            pos = g / max(1, grid_size - 1)
            for act in ACTIVITY_CANDIDATES:
                for dose in DOSE_CANDIDATES:
                    candidate = DosingPoint(seg, pos, act, dose)
                    conc = _final_conc(params, existing_points + [candidate])
                    if conc < best_conc:
                        best_conc = conc
                        best_point = candidate
    return best_point


# ═══════════════════════════════════════════════════════════════
#  Nelder-Mead Refinement
# ═══════════════════════════════════════════════════════════════

def _nelder_mead_refine(params, initial_points, max_iter=200, tolerance=1e-4):
    """Refine all N dosing points' continuous parameters via Nelder-Mead simplex."""
    N = len(initial_points)
    if N == 0:
        return []

    M = len(params.get("segments", []))
    if M == 0:
        return initial_points

    dim = N * 4

    def _pack(pts):
        v = []
        for p in pts:
            v.append(p.segment_index / max(1, M - 1))
            v.append(p.position_ratio)
            v.append(p.activity)
            v.append(p.dose_ratio / 10.0)
        return v

    def _unpack(v):
        pts = []
        for i in range(N):
            base = i * 4
            seg_idx = _clamp(round(v[base] * (M - 1)), 0, M - 1)
            pts.append(DosingPoint(
                segment_index=seg_idx,
                position_ratio=_clamp(v[base + 1], 0, 1),
                activity=_clamp(v[base + 2], 0.01, 1),
                dose_ratio=_clamp(v[base + 3] * 10, 0.01, 10),
            ))
        return pts

    def _obj_vec(v):
        return _final_conc(params, _unpack(v))

    # Standard Nelder-Mead constants
    alpha = 1.0
    gamma = 2.0
    rho_val = 0.5
    sigma = 0.5

    # Initialize simplex
    vertices = [_pack(initial_points)]
    for i in range(dim):
        v = _pack(initial_points)
        v[i] = _clamp(v[i] + 0.1 * (random.random() - 0.5) * 2, 0, 1)
        vertices.append(v)

    values = [_obj_vec(v) for v in vertices]

    for _ in range(max_iter):
        # Sort by objective value (ascending)
        sorted_pairs = sorted(enumerate(values), key=lambda x: x[1])
        sorted_indices = [p[0] for p in sorted_pairs]
        sorted_verts = [vertices[i] for i in sorted_indices]
        sorted_vals = [values[i] for i in sorted_indices]

        # Convergence check
        centroid = [0.0] * dim
        for i in range(dim):
            for j in range(dim):
                centroid[i] += sorted_verts[j][i]
            centroid[i] /= dim
        max_dist = 0.0
        for j in range(dim):
            dist = sum((sorted_verts[j][k] - centroid[k]) ** 2 for k in range(dim))
            max_dist = max(max_dist, math.sqrt(dist))
        if max_dist < tolerance:
            break

        worst = sorted_verts[dim]
        reflection = [_clamp(centroid[i] + alpha * (centroid[i] - worst[i]), 0, 1) for i in range(dim)]
        r_val = _obj_vec(reflection)

        if r_val < sorted_vals[0]:
            expansion = [_clamp(centroid[i] + gamma * (reflection[i] - centroid[i]), 0, 1) for i in range(dim)]
            e_val = _obj_vec(expansion)
            if e_val < r_val:
                vertices[sorted_indices[dim]] = expansion
                values[sorted_indices[dim]] = e_val
            else:
                vertices[sorted_indices[dim]] = reflection
                values[sorted_indices[dim]] = r_val
        elif r_val < sorted_vals[dim - 1]:
            vertices[sorted_indices[dim]] = reflection
            values[sorted_indices[dim]] = r_val
        else:
            contract = [_clamp(centroid[i] + rho_val * (worst[i] - centroid[i]), 0, 1) for i in range(dim)]
            c_val = _obj_vec(contract)
            if c_val < sorted_vals[dim]:
                vertices[sorted_indices[dim]] = contract
                values[sorted_indices[dim]] = c_val
            else:
                best = sorted_verts[0]
                for j in range(1, dim + 1):
                    for k in range(dim):
                        vertices[sorted_indices[j]][k] = best[k] + sigma * (vertices[sorted_indices[j]][k] - best[k])
                        vertices[sorted_indices[j]][k] = _clamp(vertices[sorted_indices[j]][k], 0, 1)
                    values[sorted_indices[j]] = _obj_vec(vertices[sorted_indices[j]])

    best_idx = values.index(min(values))
    return _unpack(vertices[best_idx])


# ═══════════════════════════════════════════════════════════════
#  Main: Pareto Frontier Builder
# ═══════════════════════════════════════════════════════════════

def optimize_dosing(request):
    """Build the Pareto frontier of dosing count vs optimal final concentration."""
    params = request.params
    max_n = request.max_dosing_points
    grid_size = request.position_grid_size

    # Baseline (no catalyst)
    baseline = _final_conc(params, [])

    pareto = []
    prev_best = []

    for n in range(1, max_n + 1):
        tn0 = time.perf_counter()

        new_point = _grid_search_best_new_point(params, prev_best, grid_size)
        combined = prev_best + [new_point]
        refined = _nelder_mead_refine(params, combined)

        final_c = _final_conc(params, refined)

        pareto.append(ParetoPoint(
            dosing_count=n,
            final_concentration=final_c,
            dosing_points=refined,
            class_i_met=final_c < CLASS_I_THRESHOLD,
            compute_time_ms=(time.perf_counter() - tn0) * 1000,
        ))

        prev_best = refined

    # Auto-select optimal
    met = [p for p in pareto if p.class_i_met]
    if met:
        optimal = met[0]
    elif pareto:
        optimal = pareto[-1]
    else:
        optimal = ParetoPoint(
            dosing_count=0,
            final_concentration=baseline,
            dosing_points=[],
            class_i_met=baseline < CLASS_I_THRESHOLD,
            compute_time_ms=0,
        )

    return OptimizationResult(
        pareto_frontier=pareto,
        optimal=optimal,
        baseline_concentration=baseline,
    )
