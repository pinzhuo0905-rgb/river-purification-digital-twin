# 🌊 River Photocatalytic Purification Digital Twin System
### Dynamic Simulation & Decision Support Platform Based on Riemann Slicing & Exponential Kinetics

<p align="left">
  <a href="https://floss.cc.cd/"><img src="https://img.shields.io/badge/Live_Demo-floss.cc.cd-2ea44f.svg?style=flat&logo=cloudflare&logoColor=white" alt="Live Demo" /></a>
  <img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License" />
  <img src="https://img.shields.io/badge/React-19.x-61dafb.svg" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-5.x-blue.svg" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Vite-6.x-646cff.svg" alt="Vite" />
  <img src="https://img.shields.io/badge/FastAPI-0.110+-009688.svg" alt="FastAPI" />
  <img src="https://img.shields.io/badge/Python-3.10%2B-3776ab.svg" alt="Python" />
  <img src="https://img.shields.io/badge/Docker-Ready-2496ed.svg?logo=docker&logoColor=white" alt="Docker Ready" />
  <img src="https://img.shields.io/badge/GHCR-Packages-blue.svg?logo=github" alt="GitHub Packages" />
  <img src="https://img.shields.io/badge/Standard-GB%203838--2002-blueviolet.svg" alt="GB 3838-2002" />
</p>

<p align="center">
  <a href="https://floss.cc.cd/">
    <img src="liquid_glass_river_ppt/origin_image/slide_01.png" alt="River Digital Twin Preview" width="100%" />
  </a>
</p>

---

## 🌐 Live Interactive Platform & System Correlation

The project maintains a production web application deployed at: **[https://floss.cc.cd/](https://floss.cc.cd/)**

### Correlation Between the Live Platform and This Repository

**Interactive Digital Twin Observatory**  
The live platform is the official web deployment of the mathematical models and simulation algorithms developed in this repository.

**Zero-Installation Access**  
Evaluators, researchers, and students can explore 60 FPS real-time river flow simulations, dynamic contaminant decay gradients, and parameter adjustments directly in modern web browsers without configuring local Python or Node.js environments.

**Dual-Engine Solver Integration**  
The frontend executes a client-side TypeScript physics solver for instant slider reactivity, while asynchronously querying the backend FastAPI microservice (leveraging NumPy vectorization and Nelder-Mead simplex algorithms) for complex multi-variable optimization.

**Pre-Configured Environmental Benchmarks**  
The web platform hosts verified case studies—including the Lancang River monsoon storm, Suzhou River industrial effluent, and sunny low-flow baseline scenarios—enabling rapid empirical validation.

---

## 📖 Overview

In aquatic restoration engineering, deploying semiconductor photocatalytic materials (e.g., modified $\text{TiO}_2$) poses significant operational challenges: **Where along the river course should catalysts be placed? What dosage is required? How do fluctuating velocities, channel depths, and water turbidities affect compliance? How can chemical expenditure be minimized while guaranteeing environmental thresholds?**

This project establishes an interdisciplinary **Digital Twin Simulation System for River Photocatalytic Remediation**. By coupling **fluid continuity, chemical reaction kinetics, environmental optical attenuation (Beer-Lambert Law with dynamic NTU feedback), and Riemann slice numerical discretization**, the system provides a high-fidelity testbed capable of instant 60 FPS real-time simulation.

Beyond forward modeling, the platform incorporates an automated **Pareto Frontier Optimization solver** (greedy grid search paired with Nelder-Mead simplex refinement). It computes quantitative dosing strategies (minimal dosing frequency, precise spatial coordinates, and customized dosages) to satisfy regulatory standards (such as China's **GB 3838-2002 Class I surface water criteria**) with maximal cost-effectiveness.

---

## ✨ Key Features

### 1. Multi-Physics Coupled Simulation Engine

**Riemann Slice Discretization**  
Inhomogeneous river reaches are discretized into longitudinal micro-slices $\Delta x$ along the streamline, calculating residence times strictly as $\Delta t = \Delta x / v$.

**First-Order Degradation Kinetics**  
Concentration decay follows $C(t) = C_0 \cdot e^{-k \cdot \Delta t}$, where the reaction rate $k$ dynamically adapts to effective solar irradiance, catalyst activity, and dosage ratios.

**Lambert-Beer Optical Extinction & Turbidity Feedback**  
Solar irradiance decays exponentially through water depth, with optical attenuation coupled non-linearly to instantaneous pollutant concentrations—capturing photopenetration inhibition in heavily contaminated zones.

**Hydraulic Discharge Conservation**  
Enforces continuity $Q = v \cdot w \cdot d = \text{const}$, adapting local velocities across channel contractions, widenings, and stagnation pools.

**Multi-Pollutant Profiling**  
Accommodates continuous point-source and sudden burst discharges across six contaminant classes (organic macromolecules, heavy metal complexes, hydrocarbons, dyes, suspended solids, and microplastics).

### 2. Automated Pareto Optimal Dosing Solver

**Hybrid Optimization Algorithm**  
Combines global sequential grid search with local Nelder-Mead simplex refinement for multi-variable non-linear optimization.

**Regulatory Compliance**  
Determines the minimal dosing station count, spatial coordinates, and reagent quantities needed to achieve GB 3838-2002 Class I surface water standards ($C \le 10\%$), plotting the complete Pareto trade-off curve.

### 3. Dual-Engine Adaptive Architecture

**Client-Side Lightweight Engine**  
Pure TypeScript numerical solver running entirely in the browser, enabling zero-latency 60 FPS slider interactions without network latency.

**Backend High-Performance Microservice**  
Asynchronous FastAPI service leveraging NumPy and SciPy for vectorized high-precision simulations, scenario persistence, and batch optimization.

### 4. Apple Liquid Glass Interface & Canvas 2D Particles

**Design System Implementation**  
Built upon modern Liquid Glass design tokens: translucent frosted surfaces, ambient caustic refraction, gentle blue-green mist gradients, and precise HUD meters.

**Fluid Dynamics Visualization**  
HTML5 Canvas 2D particle engine rendering dynamic streamline vectors, flow velocities, and concentration heatmaps.

### 5. Multi-User Real-Time Collaboration

**Synchronized Research Rooms**  
Integrated WebSocket room architecture allowing multiple researchers to observe and manipulate the same simulation session concurrently for interactive demonstrations.

---

## 🔬 Mathematical Formulation

```text
       River Inflow                                                River Outflow
    ───────►   ┌─────────────────┐       ┌─────────────────┐   ───────►
      C_in     │ Micro-Slice Δx_1│ ───►  │ Micro-Slice Δx_n│     C_out
               │ Residence  Δt_1 │       │ Residence  Δt_n │
               └─────────────────┘       └─────────────────┘
                        ▲                         ▲
                        │ Irradiance I_eff        │ Catalyst k
```

1. **Slice Residence Time**:
   $$\Delta t = \frac{\Delta x}{v}$$
2. **Photocatalytic Degradation Kinetics**:
   $$C_{\text{out}} = C_{\text{in}} \cdot \exp\left(-k \cdot \Delta t\right)$$
   $$k = \eta_{\text{catalyst}} \cdot r_{\text{dose}} \cdot I_{\text{eff}} + k_{\text{natural}}$$
3. **Effective Irradiance (Beer-Lambert Law with Turbidity Feedback)**:
   $$I_{\text{eff}} = I_0 \cdot \exp\left(-\alpha \cdot d\right), \quad \alpha = \alpha_0 + \beta \cdot \text{NTU}$$
4. **Hydraulic Continuity Equation**:
   $$Q = v \cdot w \cdot d = \text{const} \implies v = \frac{Q}{w \cdot d}$$

---

## 🛠️ Technology Stack

| Component | Technologies | Purpose |
| :--- | :--- | :--- |
| **Public Deployment** | Cloudflare CDN + SSL | Global edge caching & live application access: [floss.cc.cd](https://floss.cc.cd/) |
| **Frontend Framework** | React 19 + TypeScript + Vite 6 | High-responsiveness single-page application |
| **Visual Design** | Tailwind CSS 4 + Liquid Glass CSS | Translucent optical surfaces & modern Apple Liquid Glass styling |
| **Visualization** | HTML5 Canvas 2D + Chart.js | Streamline particle dynamics, concentration heatmaps, and analytics |
| **Backend Microservice** | Python 3.10+ / FastAPI / Uvicorn | Asynchronous, high-throughput numerical microservice |
| **Scientific Computing** | NumPy / SciPy | Vectorized slice integration and Nelder-Mead simplex optimization |
| **Data Persistence** | SQLAlchemy (Async) + SQLite | Scenario configuration presets and simulation experiment archives |
| **Real-Time Networking** | WebSockets (RFC 6455) | Multi-client room synchronization for collaborative research |
| **Containerization** | Docker + Docker Compose + GHCR | Multi-stage container distribution via GitHub Container Registry |

---

## 🚀 Getting Started & Local Setup

### Option 0: Live Web Application (Recommended - No Installation)

The system is deployed and accessible directly in modern web browsers (Chrome, Edge, Safari, Firefox):  
🔗 **[https://floss.cc.cd/](https://floss.cc.cd/)**

---

### Option 1: One-Command Docker Run

Run the full-stack containerized platform via GitHub Packages (GHCR) without local language runtimes:

```bash
# Method A: Docker CLI
docker run -d -p 80:80 --name river-twin ghcr.io/pinzhuo0905-rgb/river-purification-digital-twin:latest

# Method B: Docker Compose
docker compose up -d
```

Access the interface at `http://localhost`.

---

### Option 2: Local Frontend Development (React + Vite)

```bash
# 1. Install dependencies
npm install

# 2. Launch Vite development server
npm run dev
```

Open `http://localhost:5173` in your browser.

---

### Option 3: Local Backend Microservice (FastAPI + Python)

```bash
# 1. Navigate to backend directory
cd backend

# 2. Install dependencies
pip install -r requirements.txt

# 3. Start FastAPI server
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Swagger Interactive API Docs: `http://localhost:8000/docs`  
Administration Portal: `http://localhost:8000/`

---

## 📂 Repository Structure

```text
├── src/
│   ├── components/            # UI components (Dashboard, RiverCanvas, SegmentControlPanel)
│   ├── engine/                # Core numerical engines (simulation.ts, optimizer.ts, waterQuality.ts)
│   ├── api.ts                 # REST & WebSocket API client
│   ├── App.tsx                # Main digital twin dashboard integration
│   └── index.css              # Liquid Glass visual specifications
├── backend/
│   ├── main.py                # FastAPI application entrypoint & routing
│   ├── simulation.py          # Vectorized NumPy simulation solver
│   ├── optimizer.py           # Nelder-Mead automated dosing optimizer
│   ├── ws_manager.py          # WebSocket multi-client room manager
│   ├── models.py / schemas.py # SQLAlchemy models & Pydantic validation schemas
│   └── requirements.txt       # Python dependencies
├── docs/                      # Architectural specifications & technical implementation plans
├── liquid_glass_river_ppt/    # 22-slide HD presentation deck (PPTX) with speech script (speech.md)
├── poster/                    # Print-ready vector academic research poster (HTML/PDF/PNG)
├── .vscode/                   # Standard IDE launch & debugging configurations
├── .workflows/                # Software engineering standards, code review checklist & test guidelines
├── Dockerfile                 # Multi-stage production container build specification
├── docker-compose.yml         # Container orchestration configuration
├── CITATION.cff               # Standard academic citation metadata
├── DESIGN.md                  # Apple Liquid Glass design system manual
└── LICENSE                    # MIT License
```

---

## 📑 Academic Deliverables

This repository includes a complete suite of academic presentation and project defense materials:

**Presentation Deck**  
Located in `liquid_glass_river_ppt/`, featuring the 22-slide widescreen HD deck (`liquid_glass_river_ppt.pptx`) and complete speech script (`speech.md`).

**Academic Research Poster**  
Located in `poster/output/`, providing print-ready vector PDF and high-resolution PNG outputs.

**Design Specifications**  
See [DESIGN.md](DESIGN.md) for full visual guidelines on translucency, optics, and typography tokens.

**Engineering Workflows**  
See [.workflows/](.workflows/) for software engineering guidelines, quality assurance protocols, and testing suites.

---

## 👥 Authors & Contributors

This project was formulated, derived, and developed by:

**Pinzhuo Liu** ([@pinzhuo0905-rgb](https://github.com/pinzhuo0905-rgb))  
Full-stack system architecture, numerical simulation engine integration, Liquid Glass interface, and open-source release engineering.

**Zhiyu Zhang (John Zhang)** ([@RavenZh-John](https://github.com/RavenZh-John))  
Core mathematical modeling, Riemann slice algorithm derivation, hydrodynamics modeling, and presentation materials.

---

## 📝 Citation

If you utilize this platform, mathematical formulations, or assets in your academic work or research, please cite our repository:

```bibtex
@software{Liu_River_Photocatalytic_Digital_Twin_2026,
  author = {Liu, Pinzhuo and Zhang, Zhiyu},
  title = {{River Photocatalytic Purification Digital Twin System}},
  year = {2026},
  url = {https://floss.cc.cd/},
  note = {GitHub: https://github.com/pinzhuo0905-rgb/river-purification-digital-twin},
  license = {MIT},
  version = {1.0.0}
}
```

---

## 📄 License

This project is open-source under the [MIT License](LICENSE). It is freely available for academic research, educational demonstrations, and engineering development.
