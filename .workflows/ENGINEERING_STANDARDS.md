# Software Engineering Standards & Development Workflows

This document establishes the development methodology, numerical verification standards, and quality assurance workflows for the **River Photocatalytic Purification Digital Twin System**.

---

## 1. Core Engineering Principles

1. **Architecture Before Code**: Every numerical or visual feature must begin with clear mathematical specification and interface definitions.
2. **Test-Driven Verification (TDD)**: All numerical integration models, hydrodynamic continuity equations, and optimization solvers must have corresponding unit tests prior to production implementation.
3. **Evidence-Based Acceptance**: No feature is declared complete without automated test validation, boundary condition checks, and benchmark verification.
4. **Hydraulic & Physical Conservation**: Core simulation mechanics must strictly satisfy conservation laws:
   $$\sum Q_{\text{in}} = \sum Q_{\text{out}}$$
   $$C(t) \ge 0 \quad \forall t \ge 0$$

---

## 2. Numerical Computing Standards

* **Discretization Invariance**: Riemann slice integration step $\Delta x$ must guarantee numerical stability and independence from step-size artifacts.
* **Vectorized Acceleration**: Matrix computations in Python microservices must leverage NumPy vectorization to maintain sub-10ms response times for large river reaches ($N > 100$ slices).
* **Browser Real-Time Performance**: Client-side TypeScript physics engine must execute within 16.6ms per frame to maintain steady 60 FPS Canvas rendering.

---

## 3. Git Workflow & Semantic Commits

All changes follow structured semantic commit guidelines:

* `feat`: Introduction of new simulation capabilities, UI modules, or solvers.
* `fix`: Correction of calculation discrepancies, boundary bugs, or rendering glitches.
* `refactor`: Code restructuring without modifying simulation physics or external APIs.
* `docs`: Documentation, mathematical derivations, or academic asset updates.
* `test`: Addition or expansion of unit tests, integration suites, or benchmarks.
* `perf`: Performance optimization affecting execution throughput or FPS stability.

---

## 4. Code Review Protocol

Every contribution undergoes review against the following criteria:
* **Mathematical Soundness**: Correct implementation of first-order decay, Lambert-Beer light extinction, and Nelder-Mead simplex operations.
* **Typing Rigor**: Full TypeScript strict typing (no `any` types permitted in engine code).
* **Asynchronous Safety**: Proper cleanup of animation frames, WebSocket channels, and async requests.
