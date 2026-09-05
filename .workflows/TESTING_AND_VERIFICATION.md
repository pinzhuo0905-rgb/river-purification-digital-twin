# Testing & Verification Guidelines

## 1. Unit Testing Suite

The repository maintains automated test suites across both frontend and backend architectures:

### Client-Side Engine Tests (Vitest)
```bash
npm run test
```
Verifies:
* Riemann slice step division and residence time $\Delta t = \Delta x / v$.
* First-order exponential decay kinetics under varying catalyst and light conditions.
* Nelder-Mead simplex local search convergence.
* GB 3838-2002 water quality classification boundaries (Classes I - V).

### Backend Microservice Tests (Pytest)
```bash
cd backend
pytest -v
```
Verifies:
* Vectorized NumPy simulation array calculations.
* Scenario persistence CRUD endpoints.
* REST API optimization payloads.

---

## 2. Performance Benchmarks
* **Frame Rate**: Minimum 58 FPS on standard integrated GPUs during active 200-particle stream rendering.
* **Memory Footprint**: Client memory stable under continuous 60-minute loop simulation without creep.
* **Convergence**: Nelder-Mead solver reaches terminal criterion in $< 50$ iterations for standard 5-slice configurations.
