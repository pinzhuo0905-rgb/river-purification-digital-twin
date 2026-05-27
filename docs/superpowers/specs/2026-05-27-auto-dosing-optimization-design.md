# 河流光催化净化 — 最优投药策略自动求解

**日期**: 2026-05-27
**状态**: 设计中
**类型**: new-feature

---

## 1. 问题陈述

当前仿真引擎需要用户**手动**指定每个催化剂投放点（分段、位置、剂量、活性），每次试错调整。需要新增一个自动优化算法，能够：

- 自动计算**最优投药次数 N**
- 自动确定**每个投药点的位置**（哪一段、段内哪个位置）
- 自动确定**每个点的剂量和活性**

## 2. 优化目标

**帕累托前沿**：输出投药次数 vs 最优最终浓度的完整曲线。

- 横轴：投药次数 N（1, 2, 3, ..., maxDosingPoints）
- 纵轴：该 N 下能达到的最低最终浓度
- 曲线上每个点的方案可直接作为 CatalystPlacement[] 渲染到画面

自动推荐规则：
- 有达标方案 → 选达标中投药次数最少的
- 全部不达标 → 选最终浓度最低的

## 3. 约束条件

- **无投药位置限制**：同一分段可投多次，位置可在段内任意处
- **无总预算限制**：每个投药点的 activity 和 doseRatio 独立优化
- 最大投药次数由用户指定（默认 5）
- activity ∈ [0, 1]，doseRatio ∈ [0.01, 10]

## 4. 算法设计

### 4.1 总体策略：贪心序列搜索 + Nelder-Mead 局部精修

```
optimizeDosing(params, maxDosingPoints, gridSize):
  1. 计算无催化剂基线浓度（参考线）
  2. for N = 1 to maxDosingPoints:
     a. 网格搜索：在所有分段 × 离散位置中找最优增量点
     b. Nelder-Mead 精修：联合优化全部 N 个点的连续参数
     c. 评估最终浓度，记录帕累托点
     d. 热启动：当前解作为 N+1 的初始解
  3. 自动推荐最优方案
  4. 返回 ParetoFrontier + optimal
```

### 4.2 网格搜索 (Grid Search)

- 每条河流的每个分段离散化为 K 个等距位置（默认 K=10）
- 每个候选点评估不同的 doseRatio（{1, 1.5, 2, 3, 5}）和 activity（{0.5, 0.8}）
- 对已有 N-1 个点的解，搜索第 N 个点的最佳位置和参数
- 复杂度：O(M × K × doseOptions × activityOptions) ≈ 100 次仿真，约 50ms

### 4.3 Nelder-Mead 精修

- 对全部 N 个投药点的连续参数同时优化：positionRatio, doseRatio, activity
- segmentIndex 作为离散变量随机变异
- 无需求梯度的单纯形法，适应仿真函数（非解析可微）
- 收敛条件：单纯形尺寸 < 1e-4 或最大 200 次迭代

### 4.4 目标函数

```typescript
function objective(dosingPoints: DosingPoint[], params: SimulationParamsV3): number {
  const result = simulatePurification({...params, catalystPlacements: dosingPoints});
  return result.segmentOutConcentrations[last]; // 最小化最终浓度
}
```

## 5. 数据结构

### 5.1 新增类型

```typescript
interface DosingPoint {
  segmentIndex: number;
  positionRatio: number;    // 段内位置 0~1
  activity: number;         // 催化剂活性 0~1
  doseRatio: number;        // 投药比例 0.01~10
}

interface ParetoPoint {
  dosingCount: number;         // 投药次数 N
  finalConcentration: number;  // 最优最终浓度
  dosingPoints: DosingPoint[]; // 对应方案
  classIMet: boolean;          // 是否达到 I 类水标准
  computeTimeMs: number;       // 计算耗时
}

interface OptimizationRequest {
  params: SimulationParamsV3;  // 复用现有河流参数
  maxDosingPoints: number;     // 最大投药次数（默认 5）
  positionGridSize: number;    // 离散化精度（默认 10）
}

interface OptimizationResult {
  paretoFrontier: ParetoPoint[];  // N=1..max 的帕累托曲线
  optimal: ParetoPoint;           // 自动推荐的最优方案
  baselineConcentration: number;  // 无催化剂时的浓度（参考线）
}
```

### 5.2 向后兼容

- `DosingPoint` 可直接转换为 `CatalystPlacement`，喂给现有 `simulatePurification()`
- `SimulationParamsV3`、`SimulationResultV3` 零改动
- 现有手动投药功能完全保留

## 6. 文件变更清单

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| `src/engine/optimizer.ts` | 新增 | 核心优化算法（TS 版本） |
| `src/engine/optimizer.test.ts` | 新增 | 优化算法单元测试 |
| `backend/optimizer.py` | 新增 | 核心优化算法（Python 版本） |
| `backend/schemas.py` | 小改 | 新增 OptimizeRequest / OptimizeResponse |
| `backend/main.py` | 小改 | 新增 POST /api/optimize |
| `src/components/Dashboard.tsx` | 小改 | 新增"自动优化"按钮 + 帕累托图表 |

不修改的文件：
- `src/engine/simulation.ts` — optimizer 纯消费者，不修改引擎
- `src/components/RiverCanvas.tsx` — 渲染层不变

## 7. API 设计

### POST /api/optimize

**Request**: 与 SimulateRequest 完全相同，增加两个字段：
```json
{
  ...SimulateRequest,
  "max_dosing_points": 5,
  "position_grid_size": 10
}
```

**Response**:
```json
{
  "pareto_frontier": [
    { "dosing_count": 1, "final_concentration": 0.32, "dosing_points": [...], "class_i_met": false },
    { "dosing_count": 2, "final_concentration": 0.12, "dosing_points": [...], "class_i_met": false },
    { "dosing_count": 3, "final_concentration": 0.04, "dosing_points": [...], "class_i_met": true }
  ],
  "optimal": { "dosing_count": 3, "final_concentration": 0.04, ... },
  "baseline_concentration": 0.65,
  "compute_time_ms": 85.2
}
```

## 8. 前端交互

- Dashboard 新增"自动优化投药策略"按钮
- 按钮上方：最大投药次数输入框（默认 5）
- 点击后调用 POST /api/optimize
- 结果用 Chart.js 绘制帕累托曲线（折线图，标注达标线）
- 点击曲线上任意点 → 预览该方案在 RiverCanvas 上的效果
- 点击"应用此方案"→ 将对应 DosingPoint[] 填入催化剂列表

## 9. 测试策略

1. **正确性测试**：
   - N=1 时找到的点应比无催化剂显著改善
   - N 递增时浓度单调递减（更多投药 = 更干净）
   - 湖泊段不应被选为投药点（水深、流速慢，不经济）
   - 已知最优解可手动验证（1 段 + 均匀流 → 投药点应该在段的最上游）

2. **性能测试**：
   - 5 段河流 × maxN=5：完成时间 < 500ms
   - 10 段河流 × maxN=10：完成时间 < 2s

3. **边界测试**：
   - 空河流（0 段）→ 返回空结果
   - maxDosingPoints=0 → 只返回基线浓度
   - 极端参数（I₀=0.1, NTU=100）→ 无解情况下正确报告

## 10. 风险和限制

- **全局最优不保证**：贪心序列搜索可能陷入局部最优，但 Nelder-Mead 精修显著缓解
- **N 很大时性能下降**：N > 20 时每次目标函数评估需要跑完整仿真，耗时会线性增长
- **同段多投的处理**：当多个点落在同一分段时，引擎已支持（CatalystMap 使用 Map<number, CatalystEntry[]>）—无需改动
