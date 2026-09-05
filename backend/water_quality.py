"""
GB3838-2002 水质分类引擎 (Python)
支持 6 个等级 x 6 种污染物的多级评估 + 反向投药计算
"""

CLASS_THRESHOLDS = {
    "organic_macromolecule":   {"I": 0.10, "II": 0.25, "III": 0.40, "IV": 0.60, "V": 0.80},
    "sediment_algae":          {"I": 0.10, "II": 0.20, "III": 0.35, "IV": 0.50, "V": 0.70},
    "heavy_metal":             {"I": 0.05, "II": 0.10, "III": 0.25, "IV": 0.40, "V": 0.60},
    "petroleum_hydrocarbon":   {"I": 0.05, "II": 0.15, "III": 0.30, "IV": 0.50, "V": 0.70},
    "nutrient_runoff":         {"I": 0.10, "II": 0.20, "III": 0.35, "IV": 0.50, "V": 0.70},
    "microplastic":            {"I": 0.01, "II": 0.05, "III": 0.15, "IV": 0.30, "V": 0.50},
}

CLASS_ORDER = ["I", "II", "III", "IV", "V", "劣V"]


def classify_water_quality(pollutant_type: str, residual_ratio: float) -> dict:
    """正向分类：输入污染物类型 + 残余浓度 -> 返回水质等级"""
    thresholds = CLASS_THRESHOLDS.get(pollutant_type, CLASS_THRESHOLDS["organic_macromolecule"])
    cls = "I"
    for c in CLASS_ORDER:
        if c == "劣V":
            cls = c
            break
        if residual_ratio <= thresholds[c]:
            cls = c
            break

    class_threshold = thresholds.get(cls, thresholds["V"])
    return {
        "class": cls,
        "class_i_met": cls == "I",
        "residual_ratio": residual_ratio,
        "class_threshold": class_threshold,
    }


def calculate_required_dose(simulate_fn, params: dict, pollutant_type: str, target_class: str) -> dict:
    """反向投药计算：给定目标水质等级，二分搜索最小所需剂量"""
    thresholds = CLASS_THRESHOLDS.get(pollutant_type, CLASS_THRESHOLDS["organic_macromolecule"])
    target_threshold = thresholds.get(target_class, 0.10)

    base_result = simulate_fn({**params, "catalystPlacements": []})
    base_conc = base_result.get("finalConcentration", 1.0)
    if base_conc <= target_threshold:
        return {
            "required_dose_ratio": 0.0,
            "final_concentration": base_conc,
            "class_i_met": True,
            "iterations": 0,
            "found": True,
        }

    lo, hi = 0.01, 10.0
    iterations = 0
    best_dose, best_conc = hi, 1.0

    while iterations < 30 and hi - lo > 0.01:
        iterations += 1
        mid = (lo + hi) / 2
        result = simulate_fn({
            **params,
            "catalystPlacements": [{"segmentIndex": 0, "activity": 0.8, "doseRatio": mid}],
        })
        final_c = result.get("finalConcentration", 1.0)
        if final_c <= target_threshold:
            best_dose, best_conc = mid, final_c
            hi = mid
        else:
            lo = mid

    return {
        "required_dose_ratio": round(best_dose, 2),
        "final_concentration": best_conc,
        "class_i_met": best_conc <= target_threshold,
        "iterations": iterations,
        "found": best_conc <= target_threshold,
    }
