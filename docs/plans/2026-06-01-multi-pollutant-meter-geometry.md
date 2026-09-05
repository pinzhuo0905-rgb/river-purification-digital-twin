# Multi-Pollutant Dynamics & Channel Geometry Implementation Plan

## Overview
Implementation plan for coupling channel cross-sectional geometry changes with dynamic multi-pollutant degradation profiles.

## Key Features
1. **Hydraulic Continuity Equation**:
   $$Q = v \cdot w \cdot d = \text{const}$$
   Dynamically adjusts local velocity $v$ when channel width $w$ or water depth $d$ varies across segments.
2. **Dynamic Turbidity Feedback**:
   Turbidity coupled to pollutant concentration, modulating optical extinction $\alpha$ in the Beer-Lambert formulation.
3. **Six Target Pollutant Profiles**:
   Organic macromolecules, heavy metal complexes, hydrocarbons, dyes, suspended particles, and microplastics.
