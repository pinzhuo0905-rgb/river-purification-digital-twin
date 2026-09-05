# River Photocatalytic Digital Twin System - Presentation Deck Outline

**Project**: River Photocatalytic Purification Dynamic Digital Twin System  
**Format**: 22 Slides (16:9 Widescreen HD)  
**Authors**: Pinzhuo Liu (Lead Developer & Architect), Zhiyu Zhang (Co-Author)  
**Aesthetic**: Apple Liquid Glass, translucent optics, ambient hydrodynamic mist, precision HUD meters  
**Structure**: 4 Cohesive Sections:
1. Motivation & Practical Environmental Engineering Challenges (Slides 1-5)
2. Mathematical Modeling & Hydrodynamic Formulations (Slides 6-11)
3. Full-Stack Engineering Architecture & Interactive Platform (Slides 12-17)
4. Decision Support, Pareto Optimization & Research Summary (Slides 18-22)

---

## Slide 1: Cover - River Photocatalytic Purification Digital Twin System
* High-impact hero visual with floating Liquid Glass HUD overlay.
* Positioning: Transforming river ecological remediation into an observable, computable, and optimizable digital twin.
* Lead author: Pinzhuo Liu; Co-author: Zhiyu Zhang.

## Slide 2: Section 01 - Research Motivation & Practical Challenges
* Section divider introducing core practical questions: Where along the river course should catalysts be placed? What dosage is optimal?

## Slide 3: Practical Challenges in River Remediation
* Multi-pollutant pressures (complex organics, heavy metals, microplastics).
* Dynamic channel variations: velocity, width, depth, solar irradiance, and turbidity attenuation.
* Limitations of empirical dosing: over-dosing, high chemical costs, unpredictable degradation.

## Slide 4: Our Solution - Simulation, Optimization, Visualization
* A multi-physics coupled digital twin framework combining fluid continuity, chemical kinetics, and Pareto optimization.

## Slide 5: System Overview - From River Channel to Control Console
* Complete system overview displaying input controls, 2D particle simulation, real-time analytics, and optimization curves.

## Slide 6: Section 02 - Mathematical Modeling & Governing Principles
* Overview of core theoretical foundations: Riemann slice discretization and first-order decay kinetics.

## Slide 7: Riemann Slicing - Discretizing Inhomogeneous Channels
* Micro-element discretization along streamline ($Delta x$), determining local residence times $Delta t = Delta x / v$.

## Slide 8: Chemical Reaction Kinetics - First-Order Exponential Decay
* Concentration evolution formulation: $C(t) = C_0 cdot e^{-k Delta t}$. Parameterized by irradiance, catalyst activity, and dosage.

## Slide 9: Beer-Lambert Law & Dynamic Turbidity Feedback
* Light extinction across water depth and dynamic turbidity coupling, modeling self-inhibition in highly contaminated zones.

## Slide 10: Hydraulic Cross-Section Conservation
* Enforcing discharge conservation $Q = v cdot w cdot d = 	ext{const}$ across narrows, bends, and stagnation pools.

## Slide 11: Multi-Pollutant Dynamics & Regulatory Compliance
* Six pollutant classes evaluated against China GB 3838-2002 surface water quality standards.

## Slide 12: Section 03 - System Architecture & Engineering Implementation
* Section divider introducing full-stack software design and client/server dual computing engines.

## Slide 13: Dual-Engine Computing Architecture
* Zero-latency client-side TypeScript engine (60 FPS) paired with high-throughput Python FastAPI / NumPy microservices.

## Slide 14: Liquid Glass UI & Canvas 2D Particle Engine
* Translucent HUD styling, streamline vector field rendering, and real-time concentration heatmaps.

## Slide 15: Live Interactive Demonstration & Web Platform
* Public web deployment at https://floss.cc.cd/ with Cloudflare acceleration and zero-install browser accessibility.

## Slide 16: Multi-User Real-Time Collaboration
* WebSocket room architecture enabling collaborative classroom demonstration and synchronized group research.

## Slide 17: Scenario Archives & Reproducible Research
* Pre-configured real-world case studies (Lancang River monsoon storm, Suzhou River industrial effluent, sunny low-flow baseline).

## Slide 18: Section 04 - Decision Support, Optimization & Summary
* Section divider covering automated decision analytics and environmental value.

## Slide 19: Automated Pareto Optimization
* Hybrid search algorithm (greedy grid search + Nelder-Mead simplex refinement) computing optimal dosing points and minimal costs.

## Slide 20: Engineering Insights & Quantitative Findings
* Discoveries on catalyst placement efficiency in widening reaches versus fast-flow bends.

## Slide 21: Academic Deliverables & Open-Source Ecosystem
* Overview of repository assets: presentation deck, research poster, Docker packages, and interactive web platform.

## Slide 22: Conclusion & Q&A
* Summary of contributions: bridging theoretical mathematics and field environmental engineering. Open floor for defense committee Q&A.
