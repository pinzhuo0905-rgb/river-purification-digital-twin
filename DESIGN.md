# DESIGN.md - iOS 26 Liquid Glass River Observatory

## 1. Visual Theme & Atmosphere

本次界面升级方向是「iOS 26 式液态玻璃 + 河流数字孪生控制台」。界面要像一块悬浮在清晨河面上的 Apple 系统面板：浅色、通透、柔和、有真实深度，但仍然保持仿真工具所需的信息密度。

关键词：Liquid Glass、浅色水雾、折射高光、柔和蓝绿、悬浮面板、圆润但克制、即时反馈。

一句话定调：让复杂的河流光催化仿真像 iOS 控制中心一样可感、可调、可读。

## 2. Color Palette & Roles

```css
:root {
  --ios-bg: #eef7ff;
  --ios-bg-rgb: 238, 247, 255;
  --ios-bg-end: #f8fbff;
  --ios-bg-end-rgb: 248, 251, 255;
  --ios-surface: rgba(255, 255, 255, 0.62);
  --ios-surface-rgb: 255, 255, 255;
  --ios-surface-strong: rgba(255, 255, 255, 0.78);
  --ios-surface-strong-rgb: 255, 255, 255;
  --ios-surface-muted: rgba(245, 250, 255, 0.52);
  --ios-surface-muted-rgb: 245, 250, 255;
  --ios-stroke: rgba(255, 255, 255, 0.86);
  --ios-stroke-rgb: 255, 255, 255;
  --ios-stroke-cool: rgba(101, 163, 255, 0.22);
  --ios-stroke-cool-rgb: 101, 163, 255;
  --ios-ink: #102033;
  --ios-ink-rgb: 16, 32, 51;
  --ios-muted: #64748b;
  --ios-muted-rgb: 100, 116, 139;
  --ios-faint: #8fa4b8;
  --ios-faint-rgb: 143, 164, 184;
  --ios-blue: #007aff;
  --ios-blue-rgb: 0, 122, 255;
  --ios-cyan: #32ade6;
  --ios-cyan-rgb: 50, 173, 230;
  --ios-mint: #34c759;
  --ios-mint-rgb: 52, 199, 89;
  --ios-teal: #30d5c8;
  --ios-teal-rgb: 48, 213, 200;
  --ios-yellow: #ffcc00;
  --ios-yellow-rgb: 255, 204, 0;
  --ios-orange: #ff9500;
  --ios-orange-rgb: 255, 149, 0;
  --ios-red: #ff3b30;
  --ios-red-rgb: 255, 59, 48;
  --ios-purple: #af52de;
  --ios-purple-rgb: 175, 82, 222;
}
```

蓝色用于主操作、选中态和实时计算焦点；薄荷绿用于达标、净化和协同在线；青色用于河流与数据流；黄橙红只用于提醒和风险状态。背景必须保持浅色水雾感，禁止回到大面积深蓝黑。

## 3. Typography Rules

中文界面使用 Apple 系统中文字体优先，并显式包含中文 fallback。数字和单位使用 Inter 作为后备，保持 UI 的现代感。

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Noto+Sans+SC:wght@400;500;600;700;800&display=swap');

font-family: "Noto Sans SC", "PingFang SC", "Hiragino Sans GB", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
```

字号层级：

- 页面标题：26-32px，字重 800，字距 0.02em，可使用轻微液态渐变。
- 区块标题：15-18px，字重 700，颜色为 `--ios-ink`。
- 控制标签：13-14px，字重 600，行高不低于 1.7。
- 辅助解释：12px，行高 1.75，颜色为 `--ios-muted`。
- 数据单位：12-13px，使用 Inter fallback，颜色弱化。

标题可有极轻的蓝绿渐变，但不使用强投影、强霓虹或负字距。

## 4. Component Stylings

按钮：

```css
.ios-button {
  min-height: 36px;
  border-radius: 999px;
  background: linear-gradient(180deg, rgba(var(--ios-blue-rgb), 0.92), rgba(var(--ios-cyan-rgb), 0.82));
  color: white;
  border: 1px solid rgba(var(--ios-stroke-rgb), 0.76);
  box-shadow: 0 12px 26px rgba(var(--ios-blue-rgb), 0.22), inset 0 1px 0 rgba(255,255,255,0.42);
}
.ios-button:hover { transform: translateY(-1px); box-shadow: 0 16px 34px rgba(var(--ios-blue-rgb), 0.28); }
.ios-button:active { transform: translateY(0) scale(0.98); }
.ios-button:focus-visible { outline: 3px solid rgba(var(--ios-blue-rgb), 0.26); outline-offset: 2px; }
.ios-button:disabled { opacity: 0.42; cursor: not-allowed; transform: none; }
```

玻璃面板：使用半透明白底、14px 以内 blur、细白边、高光扫过和低透明蓝色阴影。面板圆角为 18-24px；重复小卡片可用 16px；不要使用巨大胶囊承载大量文本。

输入控件：输入框和下拉框使用半透明白底、蓝色 focus ring、44px 左右触摸高度。滑块轨道使用蓝绿渐变，thumb 像 iOS 控制中心的小白圆点。

表格：保留紧凑密度，但表头使用淡蓝玻璃底，行 hover 使用浅蓝水波高亮。

状态胶囊：在线、离线、天气、水况用半透明胶囊，不使用 emoji 作为主要视觉语言。

## 5. Layout Principles

主界面仍是应用工作台，不做 landing page。桌面端采用左侧控制栏 + 右侧实时预览与数据区；顶部工具条像 iOS Control Center 的浮动模块。内容宽度最大 1440px，页面外边距 20-28px。

玻璃面板之间保持 16-20px 间距。Canvas 是第一视觉主角，需要比普通卡片更大、更通透；左侧控制栏可以滚动，但不可厚重压住主视图。移动端改为单列，控制栏在上，Canvas 保持第一屏可见。

## 6. Depth & Elevation

深度来自三层：

- 背景水雾渐变和极淡网格，表示空间和河道环境。
- 玻璃面板的 `backdrop-filter: blur(14px) saturate(150%)`，只用于局部面板。
- 柔和投影：`0 24px 70px rgba(var(--ios-blue-rgb), 0.14)` 和内高光。

禁止大面积暗色遮罩、强霓虹外发光、沉重 3D、扫描线、紫蓝赛博风。

## 7. Animation & Interaction

交互档位：L2 流畅交互。

- 首屏入场：顶部、工具栏、主网格使用 `fadeInUp` 轻柔入场。
- 面板 hover：上浮 1-2px，玻璃边缘提亮。
- 按钮 active：轻微 scale 到 0.98。
- 状态点：低频呼吸，离线状态不闪烁过强。
- 背景：只使用 CSS 低成本水雾漂移，不使用持续 WebGL。
- 滚动：原生滚动，移动端保持流畅。
- Canvas 角色探针：水流观察窗允许显示一个漂流小人。自动状态下，小人跟随仿真前缘漂流；开启探查后，用户可拖动小人到河道采样点，松手后停留作为污染探针。
- 表情映射：小人表情按局部污染浓度分为清爽、略浑、难受、高污染四档。表情变化要通过眉毛、眼睛、嘴形和脸色共同体现，保证在 340px 高的观察窗中仍可读。
- 探针反馈：拖动时吸附到最近河道中心采样点，旁边使用小型玻璃标签显示当前污染感受，不显示大段说明文字。
- 控制方式：顶部工具栏提供“显示/隐藏”和“跟随漂流/可拖动探查”两个轻量开关；Canvas 标题区在探针停留时提供“跟随漂流”复位操作。

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
    transition-duration: 0.001ms !important;
  }
}
```

## 8. Do's and Don'ts

Do:

- 用 Liquid Glass 表达苹果感，但保留仿真工具的信息密度。
- 让主操作、下拉、滑块都有明确 hover / focus / active。
- 用浅色背景和蓝绿状态色建立清洁水域气质。
- 让 Canvas 预览区成为视觉中心。
- 让表格、图表、控制栏在浅色主题里仍然清晰可读。
- 保留中文专业参数，但用友好辅助文案降低理解门槛。

Don't:

- 不把界面做成纯深色赛博仪表盘。
- 不使用大面积紫蓝霓虹渐变。
- 不用强 `filter: blur()` 移动元素制造景深。
- 不让玻璃层覆盖整页滚动区域。
- 不在按钮里堆过多 emoji。
- 不把卡片套卡片做得层级混乱。
- 不使用负字距或跟随视口缩放字号。
- 不牺牲移动端触摸目标。

## 9. Responsive Behavior

桌面端：最大容器 1440px，左侧控制栏 280px，右侧自适应。工具栏允许换行但不拥挤。

平板端：主内容改为单列，控制栏和结果区保持 16px 间距，Canvas 高度 300-340px。

移动端（≤ 600px）：页面 padding 12px，控制栏宽度 100%，所有按钮和输入控件触摸目标 ≥ 44px；表格允许横向滚动；任何文本不得溢出按钮或卡片。
