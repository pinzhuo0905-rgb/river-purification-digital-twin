# Automated Catalyst Dosing & Pareto Optimization Engine - Technical Specification

## 1. Objective
Establish an automated optimization module that computes the minimum catalyst dosage and optimal spatial coordinates to meet environmental standards (GB 3838-2002 Class I water, $C \le 10\%$) with minimal reagent expenditure.

## 2. Algorithmic Architecture
* **Mathematical Optimization Formulation**:
  $$\min \quad \{ N_{\text{dosing}}, \sum r_{\text{dose}} \} \quad \text{subject to} \quad C(L) \le C_{\text{target}}$$
* **Hybrid Search Strategy**:
  1. **Global Greedy Grid Search**: Evaluates prospective river slices sequentially to locate maximal residence and irradiance windows.
  2. **Nelder-Mead Simplex Refinement**: Performs local continuous optimization on catalyst dosages and placement ratios.
* **Pareto Frontier Output**: Constructs the trade-off curve between dosing frequency, total chemical cost, and outlet concentration.

## 3. Verification Protocol
* Optimization convergence validated within 50 iterations.
* Physical non-negativity guarantees: $r_{\text{dose}} \ge 0$.
