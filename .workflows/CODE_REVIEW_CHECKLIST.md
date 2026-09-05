# Code Review & Quality Assurance Checklist

This checklist is used for auditing pull requests, solver updates, and UI component additions.

---

## 1. Simulation & Kinetics Engine
- [ ] Are reaction rate parameters dynamically bound to effective irradiance and catalyst concentration?
- [ ] Does turbidity feedback accurately attenuate light penetration according to the Beer-Lambert formulation?
- [ ] Is water velocity correctly adapted when channel width or depth changes ($Q = v \cdot w \cdot d = \text{const}$)?
- [ ] Are extreme boundary conditions handled gracefully (e.g., zero flow velocity, zero irradiance, instant burst discharge)?

## 2. Optimization Solver
- [ ] Does the Nelder-Mead simplex implementation converge within designated tolerance thresholds?
- [ ] Are catalyst dosage constraints properly bounded to non-negative physical values?
- [ ] Is the computed Pareto frontier strictly monotonic with respect to dosing frequency versus residual concentration?

## 3. Frontend UI & Particle Engine
- [ ] Does HTML5 Canvas 2D render smoothly without memory leaks or accumulating event listeners?
- [ ] Are Apple Liquid Glass visual tokens adhered to across all dashboard controls?
- [ ] Is responsive layout preserved across tablet, desktop, and multi-monitor setups?

## 4. Microservice API & WebSocket
- [ ] Are Pydantic schemas validating all incoming boundary and scenario payloads?
- [ ] Do WebSocket rooms isolate client broadcasts without leaking state across active rooms?
- [ ] Are database transactions managed asynchronously with proper session rollback?
