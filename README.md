# 🌊 基于微积分切片思想与指数衰减模型的河流光催化净化动态仿真程序
### River Photocatalytic Purification Digital Twin System

<p align="left">
  <img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License" />
  <img src="https://img.shields.io/badge/React-19.x-61dafb.svg" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-5.x-blue.svg" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Vite-6.x-646cff.svg" alt="Vite" />
  <img src="https://img.shields.io/badge/FastAPI-0.110+-009688.svg" alt="FastAPI" />
  <img src="https://img.shields.io/badge/Python-3.10%2B-3776ab.svg" alt="Python" />
  <img src="https://img.shields.io/badge/Standard-GB%203838--2002-blueviolet.svg" alt="GB 3838-2002" />
</p>

---

## 📖 项目简介 (Overview)

在实际水环境治理中，半导体光催化材料（如 $\text{TiO}_2$ 等）的应用常常面临一个核心难题：**“催化剂投在哪里？投多少？能否稳定达标？如何平衡药剂成本与净化收益？”**

本项目是一个跨学科的**数字孪生水质仿真系统**。它将**流体力学连续性、化学反应动力学、环境光学衰减与微积分切片算法**融为一体，构建了一个可调参数、高保真实时推演、支持自动寻优的数字孪生实验平台。用户可以通过交互界面直观观察污染物在河道中的扩散衰减过程，并借助帕累托前沿算法快速获取最佳治理决策。

---

## ✨ 核心特性 (Key Features)

### 1. 物理-化学复合高保真数理模型
* **微积分切片思想（Riemann Slicing）**：将非均质河流沿流向细分微元切片 $\Delta x$，严密计算水流停留时间 $\Delta t = \Delta x / v$。
* **一级反应动力学与指数衰减**：基于 $C(t) = C_0 \cdot e^{-k \cdot \Delta t}$ 推演浓度变化，反应常数由光照强度、药剂活性与投加比动态决定。
* **朗伯-比尔光衰减与浊度负反馈**：光强随水深与水体浊度指数级衰减，且水体浊度与实时污染物浓度动态耦合，真实复现高污染区域光穿透受阻的物理特性。
* **水力学截面守恒**：满足 $Q = v \cdot w \cdot d = \text{const}$，支持河道变宽、变窄、转弯及湖泊滞水区的流速变化模拟。
* **多元污染与复杂工况**：支持连续排污点（Continuous）与瞬时突发排污（Burst），覆盖有机大分子、重金属、石油烃、微塑料等 6 种典型污染物。

### 2. 智能投药帕累托寻优（Pareto Optimization）
* 内置**贪心序列网格搜索 + Nelder-Mead 单纯形局部精修算法**。
* 自动求解在满足国家地表水环境质量标准（**GB 3838-2002 I 类水标准**）前提下的**最优投药次数、投放坐标与药剂剂量**，绘制“投药次数 vs 净化效果”的帕累托前沿曲线。

### 3. 双引擎自适应计算架构
* **前端轻量引擎（TypeScript）**：数值算法纯前端本地运行，用户拖动滑块时无需网络请求即可享受 60 FPS 毫秒级即时推演。
* **后端高性能微服务（FastAPI + NumPy）**：提供大规模矩阵并行计算接口 `/api/simulate` 与优化求解接口 `/api/optimize`，支持多情景沉淀。

### 4. Apple Liquid Glass 苹果液态玻璃控制台
* 遵循现代液态玻璃（Liquid Glass）视觉系统设计：通透毛玻璃、环境折射高光、浅色水雾蓝绿渐变与高精密数据 HUD。
* HTML5 Canvas 2D 粒子流引擎，清晰渲染河流流向、流速矢量与污染物浓度热力渐变。

### 5. 多人实时协同观察室 (WebSocket)
* 内置 WebSocket 房间管理系统，支持多端、多人同时进入同一河流仿真会话，实现参数调节与仿真过程的多人实时同屏推演。

---

## 🔬 数学建模原理 (Mathematical Formulation)

```
       河水流入                                                     河水流出
    ───────►   ┌─────────────────┐       ┌─────────────────┐   ───────►
      C_in     │  切片微元 Δx_1  │ ───►  │  切片微元 Δx_n  │     C_out
               │  停留时间 Δt_1  │       │  停留时间 Δt_n  │
               └─────────────────┘       └─────────────────┘
                        ▲                         ▲
                        │ 光照 I_eff               │ 催化剂 k
```

1. **切片停留时间**：
   $$\Delta t = \frac{\Delta x}{v}$$
2. **光解与催化衰减**：
   $$C_{\text{out}} = C_{\text{in}} \cdot \exp\left(-k \cdot \Delta t\right)$$
   $$k = \eta_{\text{catalyst}} \cdot r_{\text{dose}} \cdot I_{\text{eff}} + k_{\text{natural}}$$
3. **有效光照强度（朗伯-比尔定律耦合动态浊度）**：
   $$I_{\text{eff}} = I_0 \cdot \exp\left(-\alpha \cdot d\right), \quad \alpha = \alpha_0 + \beta \cdot \text{NTU}$$
4. **水流连续性方程**：
   $$Q = v \cdot w \cdot d \implies v = \frac{Q}{w \cdot d}$$

---

## 🛠️ 技术栈 (Tech Stack)

| 模块 | 核心技术 | 说明 |
| :--- | :--- | :--- |
| **前端框架** | React 19 + TypeScript + Vite 6 | 高响应性前端单页应用 |
| **样式与视觉** | Tailwind CSS 4 + Liquid Glass CSS | 现代液态玻璃 UI 系统 |
| **可视化** | HTML5 Canvas 2D + Chart.js | 河流粒子动画、浓度热力图与折线仪表盘 |
| **后端服务** | Python 3.10+ / FastAPI / Uvicorn | 异步微服务架构 |
| **数值计算** | NumPy / SciPy | 高维切片积分与单纯形优化 |
| **数据持久化** | SQLAlchemy (Async) + SQLite | 场景预设快照与仿真实验记录 |
| **实时通讯** | WebSockets | 多人协同观察室实时广播 |

---

## 🚀 快速启动指南 (Quick Start)

### 前置环境
* **Node.js** 18.0 或更高版本
* **Python** 3.10 或更高版本

---

### 1. 启动前端（推荐，纯前端即可完整体验）

```bash
# 1. 安装依赖
npm install

# 2. 启动开发服务器
npm run dev
```

启动后在浏览器打开：`http://localhost:5173`。

---

### 2. 启动后端微服务（可选，用于数据保存与多人协同）

```bash
# 1. 进入后端目录
cd backend

# 2. 安装 Python 依赖
pip install -r requirements.txt

# 3. 启动 FastAPI 服务
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

* API 文档与 Swagger UI 位于：`http://localhost:8000/docs`
* 后台场景管理面板位于：`http://localhost:8000/`

---

## 📂 项目结构 (Repository Structure)

```text
├── src/
│   ├── components/            # UI 组件层 (Dashboard, RiverCanvas, SegmentControlPanel 等)
│   ├── engine/                # 核心数理计算引擎
│   │   ├── simulation.ts      # 微积分切片物理引擎 (v4)
│   │   ├── optimizer.ts       # 帕累托优化算法与单纯形求解器
│   │   └── waterQuality.ts    # GB 3838-2002 水质等级评定
│   ├── api.ts                 # 后端 REST & WebSocket 通讯接口
│   ├── App.tsx                # 主控制台集成
│   └── index.css              # Liquid Glass 视觉样式规范
├── backend/
│   ├── main.py                # FastAPI 路由与应用入口
│   ├── simulation.py          # 基于 NumPy 的向量化仿真
│   ├── optimizer.py           # 投药方案自动优化器
│   ├── ws_manager.py          # WebSocket 协同房间管理器
│   ├── models.py / schemas.py # 数据模型与 Pydantic 规范
│   └── requirements.txt       # Python 依赖清单
├── liquid_glass_river_ppt/    # 22 页学术答辩 PPT 演示资产 (含演讲稿 speech.md)
├── poster/                    # 打印级学术海报 (HTML/CSS)
├── docs/                      # 架构设计演进规范与规划方案
├── DESIGN.md                  # iOS 26 Liquid Glass 视觉设计规范手册
└── LICENSE                    # MIT 开源协议
```

---

## 📑 学术成果与演示材料 (Deliverables)

本仓库附带完整的 PBL 项目答辩与演示交付物：
* 📊 **答辩演示 PPT**：位于 `liquid_glass_river_ppt/`，包含制作完成的 22 页 16:9 高清幻灯片及逐页配套演讲词 [speech.md](liquid_glass_river_ppt/speech.md)。
* 🖼️ **学术展示海报**：位于 `poster/river-photocatalysis-poster.html`，支持直接用浏览器打印或展出。
* 📐 **设计规范**：详见 [DESIGN.md](DESIGN.md)。

---

## 👥 作者与贡献团队 (Authors & Contributors)

本项目由以下作者共同设计、推导与开发：

* **张之御 (Zhiyu Zhang / John Zhang)** ([@RavenZh-John](https://github.com/RavenZh-John))
  * 核心数理模型构建、微积分切片算法推导、流体力学动力学与学术演示设计
* **Pinzhuo Liu (刘品卓)** ([@pinzhuo0905-rgb](https://github.com/pinzhuo0905-rgb))
  * 全栈工程架构、数值仿真计算引擎集成、液态玻璃交互控制台与开源系统发布

---

## 📄 开源协议 (License)

本项目基于 [MIT 协议](LICENSE) 开源，欢迎用于学术研究、教学演示与工程拓展。
