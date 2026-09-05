# DESIGN.md - Apple Liquid Glass River Observatory Design System

## 1. Visual Theme & Aesthetic Atmosphere

The interface design language adheres to an **Apple Liquid Glass + River Digital Twin Control Console** aesthetic. The user interface evokes the feeling of a frosted, translucent optical glass surface floating atop a tranquil, early-morning river: light-toned, refractive, soft, and deep, while sustaining the high visual and functional information density demanded by scientific digital twins.

* **Core Keywords**: Liquid Glass, ambient aquatic mist, caustic refraction highlights, gentle blue-green palette, floating frosted glass panels, precise HUD metrics, instant reactive feedback.
* **Guiding Principle**: Rendering complex hydraulic and photocatalytic kinetics intuitive, adjustable, and visually transparent—akin to an advanced iOS Control Center.

---

## 2. Color Palette & Visual Token Hierarchy

```css
:root {
  /* Ambient Background Tokens */
  --ios-bg: #eef7ff;
  --ios-bg-rgb: 238, 247, 255;
  --ios-bg-end: #f8fbff;
  --ios-bg-end-rgb: 248, 251, 255;

  /* Translucent Liquid Glass Surfaces */
  --ios-surface: rgba(255, 255, 255, 0.62);
  --ios-surface-rgb: 255, 255, 255;
  --ios-surface-strong: rgba(255, 255, 255, 0.78);
  --ios-surface-strong-rgb: 255, 255, 255;
  --ios-surface-muted: rgba(245, 250, 255, 0.52);
  --ios-surface-muted-rgb: 245, 250, 255;

  /* Specular Borders & Caustic Highlights */
  --ios-stroke: rgba(255, 255, 255, 0.86);
  --ios-stroke-rgb: 255, 255, 255;
  --ios-stroke-cool: rgba(101, 163, 255, 0.22);
  --ios-stroke-cool-rgb: 101, 163, 255;

  /* Typography & Ink Hierarchy */
  --ios-ink: #102033;
  --ios-ink-rgb: 16, 32, 51;
  --ios-muted: #64748b;
  --ios-muted-rgb: 100, 116, 139;
  --ios-faint: #8fa4b8;
  --ios-faint-rgb: 143, 164, 184;

  /* Semantic State Accents */
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

* **Blue (`#007aff`)**: Primary active interactions, active selection states, and solver execution focus.
* **Mint & Teal (`#34c759`, `#30d5c8`)**: Water quality compliance indicators, purification feedback, and connected peer status.
* **Cyan (`#32ade6`)**: River streamlines, fluid velocity vectors, and particle dynamics.
* **Yellow / Orange / Red**: Threshold alarms and water pollution severity indicators (e.g. GB 3838 Class V conditions).

---

## 3. Typography & Numerical Formatting

* **Body & UI Font**: San Francisco (`-apple-system`, `BlinkMacSystemFont`, `Segoe UI`), ensuring clean legibility on Apple and modern desktop displays.
* **Data & Numerical Metrics**: `Inter`, `SF Pro Display`, and tabular monospace figures (`font-variant-numeric: tabular-nums`) for jitter-free real-time value updates.

---

## 4. Optical Translucency & Shadow Standards

* **Glass Backdrop Filter**: Standard `backdrop-filter: blur(24px) saturate(180%)`.
* **Layering & Depth**: Multi-tier shadow hierarchy combining high-diffusion ambient drops with subtle specular borders:
  ```css
  box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.07),
              inset 0 0 0 1px rgba(255, 255, 255, 0.5);
  ```
