# River Photocatalytic Purification Simulation System - System Specification

## 1. Objectives & Scope
Construct an interactive dynamic simulation system based on **Riemann Slicing** and **First-Order Exponential Decay Kinetics** to determine optimal catalyst placement coordinates for river remediation. The system provides zero-latency client-side numerical derivation and visual feedback for academic evaluation and engineering analysis.

## 2. System Architecture
* **Frontend Framework**: React 19 + TypeScript + Vite 6
* **Visual Rendering**:
  * HTML5 Canvas 2D: Renders dynamic river streamlines, velocity vectors, and concentration heatmaps.
  * Chart.js: Visualizes longitudinal decay profiles and cross-sectional water quality indices.
* **Mathematical Core**: Pure TypeScript numerical computing engine executing slice integration and local search algorithms at 60 FPS.

## 3. Mathematical Model Formulation
* **Riemann Slice Discretization**: River channels are segmented along the streamline into micro-elements of length $\Delta x$. Residence time across each slice is:
  $$\Delta t = \frac{\Delta x}{v}$$
* **Degradation Kinetics**: Pollutant concentration decay across slices follows:
  $$C_{\text{out}} = C_{\text{in}} \cdot e^{-k \cdot \Delta t}$$
* **Dynamic Kinetic Rate ($k$)**:
  $$k = \alpha \cdot I_{\text{eff}} \cdot \eta_{\text{catalyst}} + k_{\text{natural}}$$
  * $I_{\text{eff}}$: Effective light intensity attenuated via the Beer-Lambert law.
  * $\eta_{\text{catalyst}}$: Intrinsic photocatalytic efficiency of the deployed semiconductor (e.g., modified $\text{TiO}_2$).
  * $v$: Cross-sectional water velocity governed by volumetric discharge conservation ($Q = v \cdot w \cdot d$).

## 4. UI/UX Architecture
* **HUD Control Panel**: Real-time slider controls for velocity, channel width, depth, irradiance, turbidity, and catalyst selection.
* **Canvas Simulation Viewport**: 2D top-down fluid mechanics view with dynamic particle streams and continuous color gradients from high contamination to purified status.
