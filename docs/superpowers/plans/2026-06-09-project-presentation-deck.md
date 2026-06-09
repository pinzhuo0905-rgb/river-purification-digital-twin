# 项目展示幻灯片（HTML 酷炫版 + 导出 pptx）实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 构建一份 16 页的自包含 HTML 酷炫幻灯片，覆盖「项目原因 / vibe coding / 算法 / 学科知识」，延续程序的 iOS 液态玻璃美学，黄色小人 CSS/SVG 复刻贯穿全场，嵌入真实程序截图，最后导出为便携 .pptx。

**架构：** 单文件 `presentation/index.html`，内联 CSS（液态玻璃设计令牌，复用 DESIGN.md）+ 内联 JS（键盘翻页 + Canvas 水波背景 + 小人表情切换）。每页是一个全屏 `<section class="slide">`。增量构建：先搭骨架与基础设施（导航、背景、小人组件），再逐批填充内容页，最后截图嵌入并导出 pptx。

**技术栈：** 原生 HTML / CSS / JavaScript（零依赖、零构建）；Canvas 2D 水波背景；内联 SVG 小人；Python `python-pptx` 导出；浏览器预览工具截图。

**验证方式：** 幻灯片没有传统单元测试。每个任务的"测试"= 在浏览器中渲染并截图肉眼核对。统一用 `python3 -m http.server` 起本地服务 + Claude Preview MCP 工具（`preview_start` / `preview_screenshot`）截图核对；macOS 上也可用 `open presentation/index.html` 快速目检。

**规格来源：** `docs/superpowers/specs/2026-06-09-project-presentation-deck-design.md`

---

## 文件清单

| 文件 | 职责 |
|------|------|
| 创建：`presentation/index.html` | 全部幻灯片：结构 + 内联样式 + 内联脚本 |
| 创建：`presentation/assets/screenshots/*.png` | 真实程序界面截图（第 15 页用） |
| 创建：`presentation/export_pptx.py` | 把渲染好的各页 PNG 拼成 .pptx 的脚本 |
| 创建：`presentation/项目展示.pptx` | 导出的便携演示版（脚本产物） |

> 注意：**不修改程序任何源码**；不覆盖已有的 `project_presentation.pptx`。

---

## 任务 1：搭建幻灯片骨架（设计令牌 + 导航 + 进度条）

**文件：**
- 创建：`presentation/index.html`

- [ ] **步骤 1：创建骨架 HTML（含液态玻璃设计令牌与导航脚本）**

写入 `presentation/index.html`：

```html
<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>河流光催化净化动态仿真 · 项目展示</title>
<style>
:root{
  --ios-bg:#eef7ff; --ios-bg-end:#f8fbff;
  --ios-surface:rgba(255,255,255,0.62); --ios-surface-strong:rgba(255,255,255,0.78);
  --ios-stroke:rgba(255,255,255,0.86); --ios-stroke-cool:rgba(101,163,255,0.22);
  --ios-ink:#102033; --ios-muted:#64748b; --ios-faint:#8fa4b8;
  --ios-blue:#007aff; --ios-cyan:#32ade6; --ios-mint:#34c759; --ios-teal:#30d5c8;
  --ios-yellow:#ffcc00; --ios-orange:#ff9500; --ios-red:#ff3b30;
}
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%}
body{
  font-family:"Noto Sans SC","PingFang SC","Hiragino Sans GB",Inter,-apple-system,
    BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;
  color:var(--ios-ink);
  background:linear-gradient(160deg,var(--ios-bg),var(--ios-bg-end));
  overflow:hidden;
}
#water{position:fixed;inset:0;z-index:0;pointer-events:none}
#deck{position:relative;z-index:1;height:100vh;width:100vw}
.slide{
  position:absolute;inset:0;display:none;flex-direction:column;
  justify-content:center;align-items:center;
  padding:6vh 8vw;opacity:0;transition:opacity .5s ease;
}
.slide.active{display:flex;opacity:1;animation:fadeInUp .6s ease both}
@keyframes fadeInUp{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
.glass{
  background:var(--ios-surface);backdrop-filter:blur(14px) saturate(150%);
  -webkit-backdrop-filter:blur(14px) saturate(150%);
  border:1px solid var(--ios-stroke);border-radius:22px;
  box-shadow:0 24px 70px rgba(0,122,255,.14),inset 0 1px 0 rgba(255,255,255,.5);
  padding:32px 40px;
}
h1{font-size:clamp(28px,4.4vw,56px);font-weight:800;letter-spacing:.02em;
  background:linear-gradient(90deg,var(--ios-blue),var(--ios-teal));
  -webkit-background-clip:text;background-clip:text;color:transparent;line-height:1.15}
h2{font-size:clamp(22px,3.2vw,40px);font-weight:800;color:var(--ios-ink);margin-bottom:.5em}
p,li{font-size:clamp(15px,1.7vw,22px);line-height:1.8;color:var(--ios-ink)}
.muted{color:var(--ios-muted)}
.subject-tag{display:inline-block;font-size:14px;font-weight:700;color:var(--ios-blue);
  background:rgba(0,122,255,.1);border:1px solid var(--ios-stroke-cool);
  border-radius:999px;padding:4px 14px;margin-bottom:18px}
.formula{font-family:Inter,system-ui;font-weight:700;
  font-size:clamp(32px,6vw,84px);letter-spacing:.01em;
  background:linear-gradient(90deg,var(--ios-blue),var(--ios-cyan));
  -webkit-background-clip:text;background-clip:text;color:transparent;margin:.3em 0}
.bignum{font-family:Inter,system-ui;font-weight:800;font-size:clamp(40px,8vw,120px);
  color:var(--ios-mint);line-height:1}
ul{list-style:none;display:flex;flex-direction:column;gap:14px;margin-top:10px}
ul li::before{content:"";display:inline-block;width:9px;height:9px;border-radius:50%;
  background:var(--ios-cyan);margin-right:12px;vertical-align:middle}
.center{text-align:center}
#progress{position:fixed;left:0;bottom:0;height:4px;width:0;z-index:3;
  background:linear-gradient(90deg,var(--ios-blue),var(--ios-mint));transition:width .4s ease}
#pageno{position:fixed;right:18px;bottom:14px;z-index:3;font-size:13px;
  font-family:Inter;color:var(--ios-faint)}
@media (prefers-reduced-motion: reduce){
  *,*::before,*::after{animation-duration:.001ms!important;transition-duration:.001ms!important}
}
</style>
</head>
<body>
<canvas id="water"></canvas>
<main id="deck">
  <!-- 幻灯片 section 由后续任务插入到这里 -->
  <section class="slide active"><div class="glass center"><h1>占位封面</h1></div></section>
</main>
<div id="progress"></div>
<div id="pageno">1 / 1</div>
<script>
const deck = document.getElementById('deck');
let slides = [...deck.querySelectorAll('.slide')];
let idx = 0;
function show(n){
  idx = Math.max(0, Math.min(slides.length-1, n));
  slides.forEach((s,i)=>s.classList.toggle('active', i===idx));
  document.getElementById('progress').style.width =
    ((idx+1)/slides.length*100)+'%';
  document.getElementById('pageno').textContent = (idx+1)+' / '+slides.length;
}
function next(){ show(idx+1); }
function prev(){ show(idx-1); }
document.addEventListener('keydown', e=>{
  if(e.key==='ArrowRight'||e.key===' '||e.key==='PageDown'){ e.preventDefault(); next(); }
  else if(e.key==='ArrowLeft'||e.key==='PageUp'){ e.preventDefault(); prev(); }
  else if(e.key==='Home'){ show(0); }
  else if(e.key==='End'){ show(slides.length-1); }
  else if(e.key.toLowerCase()==='f'){ document.documentElement.requestFullscreen?.(); }
});
function refreshSlides(){ slides = [...deck.querySelectorAll('.slide')]; show(idx); }
window.refreshSlides = refreshSlides;
show(0);
</script>
</body>
</html>
```

- [ ] **步骤 2：起本地服务并截图核对骨架**

运行：
```bash
cd presentation && python3 -m http.server 8099 &
```
然后用 Preview 工具打开 `http://localhost:8099/index.html` 并截图（`preview_start` → `preview_screenshot`）。
预期：浅蓝水雾背景上一块玻璃面板，居中显示"占位封面"；底部有细进度条与页码"1 / 1"。键盘 → ← 暂时无多页效果（仅一页）。

- [ ] **步骤 3：Commit**

```bash
git add presentation/index.html
git commit -m "feat(deck): scaffold liquid-glass slide shell with keyboard nav"
```

---

## 任务 2：Canvas 2D 水波背景

**文件：**
- 修改：`presentation/index.html`（替换 `<script>` 末尾的 `show(0);` 之前插入水波代码；不影响导航逻辑）

- [ ] **步骤 1：在导航脚本之后追加水波动画**

在 `presentation/index.html` 的 `<script>` 内、`show(0);` 这一行**之前**插入以下代码：

```javascript
// —— 轻量 Canvas 水波背景（低成本，缓慢漂移）——
const wc = document.getElementById('water');
const wx = wc.getContext('2d');
let W, H;
function resize(){ W = wc.width = innerWidth; H = wc.height = innerHeight; }
addEventListener('resize', resize); resize();
const waves = [
  {amp:26, len:0.0016, speed:0.00022, y:0.72, color:'rgba(50,173,230,0.10)'},
  {amp:34, len:0.0011, speed:0.00015, y:0.82, color:'rgba(0,122,255,0.08)'},
  {amp:20, len:0.0022, speed:0.00030, y:0.90, color:'rgba(48,213,200,0.10)'},
];
function drawWater(t){
  wx.clearRect(0,0,W,H);
  for(const wv of waves){
    wx.beginPath();
    wx.moveTo(0,H);
    for(let x=0;x<=W;x+=8){
      const y = H*wv.y + Math.sin(x*wv.len + t*wv.speed)*wv.amp;
      wx.lineTo(x,y);
    }
    wx.lineTo(W,H); wx.closePath();
    wx.fillStyle = wv.color; wx.fill();
  }
  requestAnimationFrame(drawWater);
}
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
if(reduceMotion){ drawWater(0); } else { requestAnimationFrame(drawWater); }
```

- [ ] **步骤 2：截图核对水波**

刷新 `http://localhost:8099/index.html` 截图。
预期：背景下方有 3 层缓慢起伏的半透明蓝绿水波，不影响前景玻璃面板可读性；动画流畅、不卡顿。

- [ ] **步骤 3：Commit**

```bash
git add presentation/index.html
git commit -m "feat(deck): add lightweight canvas water-wave background"
```

---

## 任务 3：黄色小人吉祥物（CSS/SVG 复刻 + 表情切换）

**文件：**
- 修改：`presentation/index.html`（在 `<style>` 末尾加小人样式；提供可复用的内联 SVG 片段）

- [ ] **步骤 1：在 `<style>` 末尾追加小人样式**

在 `presentation/index.html` 的 `</style>` 之前插入：

```css
/* —— 黄色小人吉祥物 —— */
.mascot{width:clamp(90px,11vw,150px);height:auto;filter:drop-shadow(0 10px 18px rgba(0,122,255,.18))}
.mascot .body{fill:#ffce3a}
.mascot .belly{fill:#ffd964}
.mascot .eye{fill:#16324d}
.mascot .mouth{fill:none;stroke:#16324d;stroke-width:5;stroke-linecap:round}
.mascot .cheek{fill:rgba(255,99,71,.25)}
.mascot .brow{stroke:#16324d;stroke-width:5;stroke-linecap:round}
/* 表情：通过 data-expr 控制脸色与口形 */
.mascot[data-expr="dirty"] .body{fill:#bfa94a}      /* 难受/高污染：脸色发暗 */
.mascot[data-expr="dirty"] .belly{fill:#cdb95a}
.mascot.corner{position:absolute;right:4vw;bottom:6vh;z-index:2}
```

- [ ] **步骤 2：定义可复用的小人 SVG（在 `<body>` 顶部加一个隐藏模板）**

在 `<body>` 的 `<canvas id="water">` **之后**插入隐藏模板，供各页 JS 克隆：

```html
<template id="mascot-tpl">
  <svg class="mascot" viewBox="0 0 200 200" data-expr="happy" aria-label="吉祥物小人">
    <ellipse class="body" cx="100" cy="120" rx="72" ry="62"/>
    <ellipse class="belly" cx="100" cy="138" rx="46" ry="36"/>
    <g class="face">
      <circle class="eye left-eye" cx="78" cy="108" r="8"/>
      <circle class="eye right-eye" cx="122" cy="108" r="8"/>
      <path class="brow left-brow" d="M68 92 q10 -6 20 0"/>
      <path class="brow right-brow" d="M112 92 q10 -6 20 0"/>
      <path class="mouth" d="M82 134 q18 18 36 0"/>
      <ellipse class="cheek" cx="66" cy="126" rx="9" ry="6"/>
      <ellipse class="cheek" cx="134" cy="126" rx="9" ry="6"/>
    </g>
  </svg>
</template>
```

- [ ] **步骤 3：在 `<script>` 内追加小人工厂函数（放在 `show(0);` 之前）**

```javascript
// —— 小人工厂：按表情生成一个角落小人 —— 
const MOUTHS = {
  happy:  'M82 134 q18 18 36 0',     // 微笑
  laugh:  'M78 130 q22 26 44 0',     // 大笑
  think:  'M86 138 q14 6 28 0',      // 抿嘴思考
  wow:    'M92 132 a10 10 0 1 0 .1 0',// 张嘴惊叹
  fresh:  'M80 132 q20 20 40 0',     // 清爽笑
  dirty:  'M82 144 q18 -14 36 0',    // 难受下弯嘴
  wave:   'M82 134 q18 16 36 0',     // 挥手笑
};
function makeMascot(expr='happy'){
  const tpl = document.getElementById('mascot-tpl');
  const node = tpl.content.firstElementChild.cloneNode(true);
  node.setAttribute('data-expr', (expr==='dirty')?'dirty':'clean');
  node.querySelector('.mouth').setAttribute('d', MOUTHS[expr]||MOUTHS.happy);
  if(expr==='wow'){ node.querySelector('.left-eye').setAttribute('r','10');
                    node.querySelector('.right-eye').setAttribute('r','10'); }
  if(expr==='dirty'){ // 难受眉毛下压
    node.querySelector('.left-brow').setAttribute('d','M68 96 q10 6 20 0');
    node.querySelector('.right-brow').setAttribute('d','M112 96 q10 6 20 0'); }
  return node;
}
// 给某张幻灯片右下角放小人
function placeMascot(slideEl, expr){
  const m = makeMascot(expr); m.classList.add('corner'); slideEl.appendChild(m);
}
```

- [ ] **步骤 4：临时验证——给占位封面放一个小人并截图**

在 `show(0);` 之前临时追加一行 `placeMascot(slides[0],'wave');`，刷新截图。
预期：占位封面右下角出现一个黄色团子小人，挥手微笑表情，带柔和投影。
**核对后删除这行临时代码**（真正的小人将在内容任务里按页放置）。

- [ ] **步骤 5：Commit**

```bash
git add presentation/index.html
git commit -m "feat(deck): add CSS/SVG yellow-blob mascot with expression factory"
```

---

## 任务 4：第 1–3 页（封面 / 痛点 / 我们的答案）

**文件：**
- 修改：`presentation/index.html`（用真实页面替换占位封面 section）

- [ ] **步骤 1：替换 `<main id="deck">` 内的占位 section 为前 3 页**

把 `<main id="deck">` 里那一行占位 `<section>` 替换为：

```html
<section class="slide" data-mascot="float">
  <div class="glass center" style="max-width:1000px">
    <div class="subject-tag">环境工程 · 计算建模</div>
    <h1>河流光催化净化<br>动态仿真</h1>
    <p class="muted" style="margin-top:18px">基于微积分切片思想与指数衰减模型</p>
    <p style="margin-top:10px;font-weight:600">让一条河的自我净化，变得可算、可调、可看。</p>
  </div>
</section>

<section class="slide" data-mascot="dirty">
  <div class="glass" style="max-width:980px">
    <div class="subject-tag">为什么做这个项目</div>
    <h2>痛点：河流污染怎么治？</h2>
    <ul>
      <li>河流污染治理是世界性难题，催化剂又贵。</li>
      <li>传统投药靠经验——投多了浪费钱，投少了不达标。</li>
      <li>缺一个能"先算后投"的定量工具：到底在哪投、投多少？</li>
    </ul>
  </div>
</section>

<section class="slide" data-mascot="think">
  <div class="glass" style="max-width:980px">
    <div class="subject-tag">我们的答案</div>
    <h2>一条会"自我净化"的数字河流</h2>
    <ul>
      <li>浏览器里的河流数字孪生：布置排污口和催化剂投放点。</li>
      <li>实时算出污染物沿程浓度怎么衰减、最后能否达标。</li>
      <li>还能自动帮你找"最省催化剂、又能达标"的投放方案。</li>
    </ul>
  </div>
</section>
```

- [ ] **步骤 2：在 `<script>` 的 `show(0);` 之前插入"按 data-mascot 自动放小人"逻辑**

```javascript
// —— 根据每页 data-mascot 自动放置角落小人 ——
function hydrateMascots(){
  slides.forEach(s=>{
    if(s.querySelector('.mascot')) return;       // 已有则跳过
    const expr = s.getAttribute('data-mascot');
    if(expr && expr!=='none'){
      placeMascot(s, expr==='float'?'wave':expr);
    }
  });
}
hydrateMascots();
```

- [ ] **步骤 3：截图核对前 3 页**

刷新 `http://localhost:8099/index.html`，用 → 翻页，逐页截图。
预期：
- 第 1 页：渐变标题"河流光催化净化 动态仿真" + 定调语，右下角小人挥手。
- 第 2 页：痛点三条要点，小人难受脸（脸色发暗、嘴下弯）。
- 第 3 页：答案三条要点，小人思考脸。
页码显示"1 / 3 … 3 / 3"。

- [ ] **步骤 4：Commit**

```bash
git add presentation/index.html
git commit -m "feat(deck): add slides 1-3 (cover / pain point / answer)"
```

---

## 任务 5：第 4–5 页（vibe coding 是什么 / 我们怎么 vibe 出这个项目）

**文件：**
- 修改：`presentation/index.html`

- [ ] **步骤 1：在第 3 页 section 之后插入两页**

```html
<section class="slide" data-mascot="laugh">
  <div class="glass" style="max-width:1000px">
    <div class="subject-tag">制作过程 · vibe coding</div>
    <h2>vibe coding 是什么？</h2>
    <ul>
      <li>不再逐行手敲代码，而是用自然语言把想法讲给 AI，AI 落地成代码。</li>
      <li>你专注"我想要什么、感觉对不对"，AI 负责"具体怎么写"。</li>
      <li>快速试错、即时反馈、跟着感觉迭代——所以叫 <b>vibe</b> coding。</li>
    </ul>
  </div>
</section>

<section class="slide" data-mascot="happy">
  <div class="glass" style="max-width:1000px">
    <div class="subject-tag">制作过程 · 真实历程</div>
    <h2>我们怎么 vibe 出这个项目</h2>
    <ul>
      <li>从一句"我想模拟河流光催化净化"开始。</li>
      <li>与 AI 结对：提需求 → 生成代码 → 跑起来看效果 → 再调整。</li>
      <li>物理引擎一路迭代到 v4：物理-渲染分离、消除量纲混用、十条物理定律。</li>
    </ul>
  </div>
</section>
```

- [ ] **步骤 2：截图核对第 4–5 页**

刷新翻到第 4、5 页截图。
预期：第 4 页小人大笑脸，第 5 页小人微笑脸；页码"… / 5"。

- [ ] **步骤 3：Commit**

```bash
git add presentation/index.html
git commit -m "feat(deck): add slides 4-5 (vibe coding intro and journey)"
```

---

## 任务 6：第 6–7 页（河流切片 / 学科·高数）

**文件：**
- 修改：`presentation/index.html`

- [ ] **步骤 1：在第 5 页之后插入两页**

```html
<section class="slide" data-mascot="wow">
  <div class="glass" style="max-width:1000px">
    <div class="subject-tag">核心算法思想</div>
    <h2>把整条河"切片"</h2>
    <ul>
      <li>一整条河又长又复杂，直接算根本算不动。</li>
      <li>微积分的智慧：切成 <b>200 个小段</b>（微元），每段近似看作均匀。</li>
      <li>逐段计算、再首尾相接累加 —— 这就是沿程积分。</li>
    </ul>
  </div>
</section>

<section class="slide" data-mascot="none">
  <div class="glass center" style="max-width:1000px">
    <div class="subject-tag">学科知识 · 高等数学</div>
    <h2>这就是定积分的微元法</h2>
    <div class="bignum">∫</div>
    <ul style="text-align:left;display:inline-flex">
      <li>分割 → 近似 → 求和 → 取极限。</li>
      <li>把连续的河流问题，离散成一块块可计算的小段。</li>
      <li>切得越细，结果越接近真实——程序用 200 段做平衡。</li>
    </ul>
  </div>
</section>
```

- [ ] **步骤 2：截图核对第 6–7 页**

预期：第 6 页小人惊叹脸（圆眼张嘴）；第 7 页大号"∫"符号 + 高数说明，无角落小人。

- [ ] **步骤 3：Commit**

```bash
git add presentation/index.html
git commit -m "feat(deck): add slides 6-7 (river slicing / calculus)"
```

---

## 任务 7：第 8–9 页（指数衰减模型 / 学科·化学动力学）

**文件：**
- 修改：`presentation/index.html`

- [ ] **步骤 1：在第 7 页之后插入两页**

```html
<section class="slide" data-mascot="fresh">
  <div class="glass center" style="max-width:1000px">
    <div class="subject-tag">核心算法 · 指数衰减模型</div>
    <h2>污染物按比例越变越少</h2>
    <div class="formula">C(t) = C₀ · e<sup style="font-size:.5em">−k·t</sup></div>
    <ul style="text-align:left;display:inline-flex">
      <li>C₀ 是初始浓度，t 是停留时间，k 是降解速率常数。</li>
      <li>k 越大、河水停留越久，净化得越彻底。</li>
    </ul>
  </div>
</section>

<section class="slide" data-mascot="none">
  <div class="glass" style="max-width:1000px">
    <div class="subject-tag">学科知识 · 化学动力学</div>
    <h2>一级反应与半衰期</h2>
    <ul>
      <li>一级反应：反应速率正比于当前浓度——浓度越高，降得越快。</li>
      <li>半衰期：浓度减半所需时间是固定的，和指数衰减一一对应。</li>
      <li>程序里 k = 催化剂活性 × 投药比 × 有效光强，没有"魔法数字"。</li>
    </ul>
  </div>
</section>
```

- [ ] **步骤 2：截图核对第 8–9 页**

预期：第 8 页大号公式 `C(t)=C₀·e^(−k·t)`，小人清爽脸；第 9 页化学动力学三条要点。

- [ ] **步骤 3：Commit**

```bash
git add presentation/index.html
git commit -m "feat(deck): add slides 8-9 (exponential decay / chemical kinetics)"
```

---

## 任务 8：第 10–11 页（朗伯-比尔定律 / 学科·物理光学 + 流体力学）

**文件：**
- 修改：`presentation/index.html`

- [ ] **步骤 1：在第 9 页之后插入两页**

```html
<section class="slide" data-mascot="dirty">
  <div class="glass center" style="max-width:1000px">
    <div class="subject-tag">核心算法 · 朗伯-比尔定律</div>
    <h2>光，进不去浑水的底</h2>
    <div class="formula">I = I₀ · e<sup style="font-size:.5em">−α·d</sup></div>
    <ul style="text-align:left;display:inline-flex">
      <li>光进入水里会被吸收，水越深 d，剩下的光 I 越弱。</li>
      <li>水越浑（NTU 越高），衰减系数 α 越大，光催化越难发生。</li>
    </ul>
  </div>
</section>

<section class="slide" data-mascot="none">
  <div class="glass" style="max-width:1000px">
    <div class="subject-tag">学科知识 · 物理光学 + 流体力学</div>
    <h2>光 + 水流，共同决定净化能力</h2>
    <ul>
      <li>物理光学：朗伯-比尔定律解释了"浑水底下几乎没有光"。</li>
      <li>流体力学：连续性方程 <b>Q = v · A</b>，河道越窄流速越快、停留越短。</li>
      <li>光强不足或停留太短的河段，催化剂效率都会大打折扣。</li>
    </ul>
  </div>
</section>
```

- [ ] **步骤 2：截图核对第 10–11 页**

预期：第 10 页大号公式 `I=I₀·e^(−α·d)`，小人难受脸；第 11 页光学+流体力学要点（含 Q=v·A）。

- [ ] **步骤 3：Commit**

```bash
git add presentation/index.html
git commit -m "feat(deck): add slides 10-11 (Lambert-Beer / optics + fluid dynamics)"
```

---

## 任务 9：第 12–13 页（帕累托前沿优化 / 学科·运筹学）

**文件：**
- 修改：`presentation/index.html`

- [ ] **步骤 1：在第 11 页之后插入两页**

```html
<section class="slide" data-mascot="wow">
  <div class="glass" style="max-width:1000px">
    <div class="subject-tag">核心算法 · 自动优化</div>
    <h2>一键找到最优投药方案</h2>
    <ul>
      <li>投药越多越干净，但成本也越高——到底怎么权衡？</li>
      <li>用<b>贪心搜索</b>快速逼近，再用 <b>Nelder-Mead</b> 局部精修。</li>
      <li>自动构建帕累托前沿，给出"最少投药点 × 恰好达标"的方案。</li>
    </ul>
  </div>
</section>

<section class="slide" data-mascot="none">
  <div class="glass" style="max-width:1000px">
    <div class="subject-tag">学科知识 · 运筹学 / 最优化</div>
    <h2>多目标优化与帕累托最优</h2>
    <ul>
      <li>两个目标互相打架（少投药 vs 高净化），没有唯一最优解。</li>
      <li>帕累托前沿：上面每个点都"想更省就得牺牲效果，反之亦然"。</li>
      <li>贪心负责快、Nelder-Mead 负责准，组合起来又快又好。</li>
    </ul>
  </div>
</section>
```

- [ ] **步骤 2：截图核对第 12–13 页**

预期：第 12 页小人惊叹脸 + 帕累托要点；第 13 页运筹学说明。

- [ ] **步骤 3：Commit**

```bash
git add presentation/index.html
git commit -m "feat(deck): add slides 12-13 (Pareto optimization / operations research)"
```

---

## 任务 10：第 14 页（GB3838 达标）与第 16 页（总结致谢）

> 第 15 页（现场演示）依赖截图，单独放在任务 11。本任务先把第 14、16 页做好，第 15 页留一个空 section 占位以保证页序正确。

**文件：**
- 修改：`presentation/index.html`

- [ ] **步骤 1：在第 13 页之后插入第 14 页、第 15 页占位、第 16 页**

```html
<section class="slide" data-mascot="fresh">
  <div class="glass" style="max-width:1000px">
    <div class="subject-tag">达标判定 · 国家标准</div>
    <h2>GB3838-2002 六级水质分类</h2>
    <ul>
      <li>对照《地表水环境质量标准》，实时判定每段属 I 类到劣 V 类。</li>
      <li>界面用红 / 黄 / 绿信号灯直观提示水质好坏。</li>
      <li>残留浓度低于 10% → 达到 I 类地表水标准。</li>
    </ul>
  </div>
</section>

<section class="slide" id="slide-demo" data-mascot="none">
  <div class="glass center" style="max-width:1100px">
    <div class="subject-tag">现场演示</div>
    <h2>现在，看看真实的程序</h2>
    <p class="muted">（截图将在任务 11 插入此处）</p>
  </div>
</section>

<section class="slide" data-mascot="wave">
  <div class="glass center" style="max-width:1000px">
    <div class="subject-tag">总结 · 致谢</div>
    <h2>我们做到了什么</h2>
    <ul style="text-align:left;display:inline-flex">
      <li>用 vibe coding，把高数、化学、物理、运筹学缝进了一条"会自我净化的数字河流"。</li>
      <li>收获：跨学科建模能力 + 与 AI 协作开发的真实经验。</li>
      <li>感谢老师与同学们的聆听！</li>
    </ul>
  </div>
</section>
```

- [ ] **步骤 2：截图核对第 14、16 页**

预期：第 14 页小人清爽达标脸 + GB3838 要点；第 15 页是"现场演示"占位；第 16 页小人挥手 + 总结致谢；页码"… / 16"。

- [ ] **步骤 3：Commit**

```bash
git add presentation/index.html
git commit -m "feat(deck): add slides 14 & 16 (GB3838 standard / summary), demo placeholder"
```

---

## 任务 11：采集真实程序截图并完成第 15 页

**文件：**
- 创建：`presentation/assets/screenshots/river.png`、`dosing.png`、`pareto.png`、`standard.png`
- 修改：`presentation/index.html`（替换第 15 页占位内容）

- [ ] **步骤 1：把程序跑起来**

优先用现成构建产物起静态服务（仓库已有 `dist/`）：
```bash
cd "$(git rev-parse --show-toplevel)" && python3 -m http.server 8090 --directory dist &
```
若 `dist/` 打开后页面空白或资源 404，则改用开发服务器：
```bash
cd "$(git rev-parse --show-toplevel)" && npm run dev &
```
记下实际访问地址（dist 一般是 `http://localhost:8090/`，dev 见终端输出，通常 `http://localhost:5173/`）。

- [ ] **步骤 2：用 Preview 工具截四张关键界面图**

用 `preview_start` 打开程序地址，加载一个内置场景后，分别截图保存到 `presentation/assets/screenshots/`：
1. `river.png` —— 河道全景（分段 + 流向 + 浓度色带）
2. `dosing.png` —— 催化剂投药点配置面板
3. `pareto.png` —— 帕累托前沿图表（Chart.js）
4. `standard.png` —— GB3838 达标信号灯 / 水质分类

预期：四张 PNG 落盘，内容清晰、能代表程序核心功能。

- [ ] **步骤 3：在 `<style>` 末尾追加截图网格样式**

在 `</style>` 之前插入：
```css
.shots{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:18px;width:100%}
.shots img{width:100%;border-radius:14px;border:1px solid var(--ios-stroke);
  box-shadow:0 16px 40px rgba(0,122,255,.16)}
.demo-hint{margin-top:18px;font-weight:700;color:var(--ios-blue)}
```

- [ ] **步骤 4：替换第 15 页占位内容为真实截图 + 切换提示**

把 `id="slide-demo"` 那个 section 的 `.glass` 内容替换为：
```html
<div class="glass" style="max-width:1180px">
  <div class="subject-tag">现场演示</div>
  <h2>真实程序长这样</h2>
  <div class="shots">
    <img src="assets/screenshots/river.png" alt="河道全景">
    <img src="assets/screenshots/dosing.png" alt="投药配置">
    <img src="assets/screenshots/pareto.png" alt="帕累托前沿">
    <img src="assets/screenshots/standard.png" alt="GB3838 达标信号灯">
  </div>
  <p class="demo-hint">▶ 切到真实程序，现场操作演示</p>
</div>
```

- [ ] **步骤 5：截图核对第 15 页**

刷新 `http://localhost:8099/index.html` 翻到第 15 页截图。
预期：2×2 截图网格清晰展示四个界面，底部蓝色"▶ 切到真实程序"提示。

- [ ] **步骤 6：Commit**

```bash
git add presentation/index.html presentation/assets/screenshots
git commit -m "feat(deck): capture real app screenshots and finish demo slide 15"
```

---

## 任务 12：整体打磨与全片走查

**文件：**
- 修改：`presentation/index.html`

- [ ] **步骤 1：逐页全片走查并修正**

从第 1 页用 → 翻到第 16 页，逐页截图核对以下清单，发现问题就地修正：
- 每页文字不溢出玻璃面板；标题与正文层级清晰。
- 小人表情与页面情绪一致（痛点/朗伯-比尔=难受，达标/指数衰减=清爽，优化=惊叹，封面/总结=挥手）。
- 公式页（8/10）大号公式居中、上标可读。
- 进度条随页递进、页码正确显示"N / 16"。

- [ ] **步骤 2：确认降低动效偏好生效**

在浏览器开启"减少动态效果"后刷新，确认水波静止、入场动画停用、内容仍完整可读。

- [ ] **步骤 3：Commit（如有修改）**

```bash
git add presentation/index.html
git commit -m "polish(deck): full 16-slide review, fix overflow & expression cues"
```

---

## 任务 13：导出便携 .pptx

**文件：**
- 创建：`presentation/export_pptx.py`
- 创建：`presentation/项目展示.pptx`（脚本产物）
- 创建（中间产物）：`presentation/assets/slides/slide-01.png` … `slide-16.png`

- [ ] **步骤 1：把 16 页逐页渲染为 1920×1080 PNG**

用 Preview 工具打开 `http://localhost:8099/index.html`，先 `preview_resize` 到 1920×1080，再逐页 `→` 翻页并 `preview_screenshot`，依次保存为 `presentation/assets/slides/slide-01.png` … `slide-16.png`。
预期：16 张满版 PNG，顺序与页序一致。

- [ ] **步骤 2：编写 pptx 拼装脚本**

写入 `presentation/export_pptx.py`：
```python
"""把 16 张满版幻灯片 PNG 拼成 16:9 的 .pptx。"""
from pathlib import Path
from pptx import Presentation
from pptx.util import Inches

HERE = Path(__file__).parent
SLIDES_DIR = HERE / "assets" / "slides"
OUT = HERE / "项目展示.pptx"

prs = Presentation()
prs.slide_width = Inches(13.333)   # 16:9
prs.slide_height = Inches(7.5)
blank = prs.slide_layouts[6]       # 空白版式

pngs = sorted(SLIDES_DIR.glob("slide-*.png"))
assert pngs, f"未找到幻灯片 PNG：{SLIDES_DIR}"
for png in pngs:
    slide = prs.slides.add_slide(blank)
    slide.shapes.add_picture(str(png), 0, 0,
                             width=prs.slide_width, height=prs.slide_height)

prs.save(OUT)
print(f"已导出 {len(pngs)} 页 → {OUT}")
```

- [ ] **步骤 3：安装依赖并运行脚本**

仓库已有 `backend/.venv311`（含 pytest 等）。优先复用该虚拟环境装 `python-pptx`；若该环境不可写或缺失，则新建一个：
```bash
cd presentation
python3 -m venv .venv && . .venv/bin/activate
pip install python-pptx
python export_pptx.py
```
预期输出：`已导出 16 页 → …/presentation/项目展示.pptx`。

- [ ] **步骤 4：核对 pptx**

确认 `presentation/项目展示.pptx` 存在且大小合理（每页一张满版图，通常 > 1MB）。可用以下命令快速校验页数：
```bash
python3 -c "from pptx import Presentation; print(len(Presentation('presentation/项目展示.pptx').slides._sldIdLst))"
```
预期：打印 `16`。

- [ ] **步骤 5：Commit**

```bash
git add presentation/export_pptx.py presentation/项目展示.pptx presentation/assets/slides
git commit -m "feat(deck): export portable 16-slide pptx from rendered pages"
```

---

## 自检

**1. 规格覆盖度：**

| 规格章节 | 对应任务 |
|---------|---------|
| §3.1 HTML 幻灯片（单文件/导航/背景） | 任务 1、2 |
| §3.2 导出 pptx | 任务 13 |
| §4 视觉规格（液态玻璃/配色/字体/大字报） | 任务 1（令牌）+ 各内容任务 |
| §5 黄色小人吉祥物 + 表情集 | 任务 3，各内容任务按页放置 |
| §6 16 页内容结构 | 任务 4–11（页 1–16） |
| §6 vibe coding 叙事线（页 4–5 + 结尾呼应） | 任务 5 + 任务 10（第 16 页） |
| §7 现场演示页素材（4 张截图 + 切换提示） | 任务 11 |
| §8 不改源码 / 不覆盖旧 pptx | 全程遵守（新文件 `项目展示.pptx`） |

覆盖完整，无遗漏。

**2. 占位符扫描：** 计划内每个步骤均含可执行的真实 HTML/CSS/JS/Python 代码与真实中文文案；第 10 页的"第 15 页占位"是有意的页序占位，并在任务 11 步骤 4 明确替换——非计划缺陷。

**3. 类型/标识一致性：**
- `placeMascot(slideEl, expr)`、`makeMascot(expr)`、`hydrateMascots()`、`refreshSlides()` 命名在任务 3–4 定义后保持一致。
- 表情键 `happy/laugh/think/wow/fresh/dirty/wave` 在 `MOUTHS` 表（任务 3）与各页 `data-mascot`（任务 4–10）一致；`data-mascot="float"` 在 `hydrateMascots()` 中映射为 `wave`，`none` 表示不放小人——一致。
- 截图文件名 `river/dosing/pareto/standard.png`（任务 11）与第 15 页 `<img src>` 一致。
- pptx 中间图 `slide-01..16.png`（任务 13 步骤 1）与脚本 `glob("slide-*.png")` 一致。

无不一致项。
