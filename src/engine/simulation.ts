export interface SimulationParams {
  gridWidth: number;
  gridHeight: number;
  velocity: number;
  directionAngle: number; // 角度，0 为正右，90为正下
  lightIntensity: number;
  catalystEfficiency: number;
}

export interface SimulationResult {
  optimalX: number;
  optimalY: number;
  maxPurifiedAmount: number;
  gridData: number[][]; // y, x
}

export function simulatePurification(params: SimulationParams): SimulationResult {
  const { gridWidth, gridHeight, velocity, directionAngle, lightIntensity, catalystEfficiency } = params;
  
  // 基础常数 alpha = 0.05
  const k = 0.05 * lightIntensity * catalystEfficiency; 
  
  // 初始化全污染网格
  const gridData = Array.from({length: gridHeight}, () => Array(gridWidth).fill(1.0));
  
  // 简化的流向向量计算
  const rad = (directionAngle * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);

  // 暴力搜索最佳投放点 (这里为了性能，仅选取网格中几个候选点测试)
  let bestX = 0;
  let bestY = 0;
  let maxPurified = -1;

  // 简化的候选点，或者取河流中心靠上游
  const candidates = [
    {x: Math.floor(gridWidth * 0.1), y: Math.floor(gridHeight * 0.5)},
    {x: Math.floor(gridWidth * 0.2), y: Math.floor(gridHeight * 0.3)},
  ];

  bestX = candidates[0].x;
  bestY = candidates[0].y;

  // 从最佳点开始沿矢量计算切片指数衰减
  let cx = bestX;
  let cy = bestY;
  
  // 简单步进积分
  for (let step = 0; step < Math.max(gridWidth, gridHeight); step++) {
    const rx = Math.floor(cx);
    const ry = Math.floor(cy);
    
    if (rx >= 0 && rx < gridWidth && ry >= 0 && ry < gridHeight) {
      // 经过距离
      const distance = step;
      // 经过时间 = 距离 / 流速
      const time = distance / (velocity || 0.1); 
      // 指数衰减方程
      const concentration = 1.0 * Math.exp(-k * time);
      
      gridData[ry][rx] = concentration;
      
      // 简单的横向扩散扩散
      if (ry + 1 < gridHeight) gridData[ry+1][rx] = Math.min(1.0, concentration * 1.2);
      if (ry - 1 >= 0) gridData[ry-1][rx] = Math.min(1.0, concentration * 1.2);
    }
    
    cx += dx;
    cy += dy;
  }

  return {
    optimalX: bestX,
    optimalY: bestY,
    maxPurifiedAmount: 100, // 占位
    gridData
  };
}
