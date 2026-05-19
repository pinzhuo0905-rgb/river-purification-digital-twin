import React, { useRef, useEffect } from 'react';

interface RiverCanvasProps {
  gridData: number[][];
  optX: number;
  optY: number;
}

export function RiverCanvas({ gridData, optX, optY }: RiverCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    
    if (!gridData || gridData.length === 0) return;
    
    const rows = gridData.length;
    const cols = gridData[0].length;
    const cellW = width / cols;
    const cellH = height / rows;

    ctx.clearRect(0, 0, width, height);

    // 绘制热力图 (1.0 黑色污染 -> 0.0 浅蓝色清水)
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const val = gridData[y][x];
        // 颜色映射算法
        // 污染高 val=1 -> rgb(50,50,50)
        // 污染低 val=0 -> rgb(100,200,250)
        const r = Math.floor(100 + (val * -50));
        const g = Math.floor(200 + (val * -150));
        const b = Math.floor(250 + (val * -200));
        
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        ctx.fillRect(x * cellW, y * cellH, cellW, cellH);
      }
    }

    // 绘制最佳投放点
    const pX = optX * cellW + cellW / 2;
    const pY = optY * cellH + cellH / 2;

    ctx.beginPath();
    ctx.arc(pX, pY, Math.max(cellW * 1.5, 8), 0, Math.PI * 2);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ef4444'; // red-500
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(pX, pY, Math.max(cellW * 0.5, 3), 0, Math.PI * 2);
    ctx.fillStyle = '#ef4444';
    ctx.fill();
    
    ctx.fillStyle = '#fff';
    ctx.font = '12px sans-serif';
    ctx.fillText('最佳投放点', pX + 15, pY + 5);

  }, [gridData, optX, optY]);

  return (
    <div className="w-full h-full bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden p-2 flex flex-col">
      <h2 className="text-lg font-semibold text-gray-800 mb-2 px-2">河流 2D 热力仿真视图</h2>
      <div className="flex-1 w-full bg-gray-50 rounded border border-gray-200 overflow-hidden relative">
        <canvas 
          ref={canvasRef} 
          width={800} 
          height={400} 
          className="w-full h-full object-fill"
        />
        <div className="absolute bottom-2 left-2 bg-white/80 p-2 text-xs rounded shadow">
          <div className="flex items-center gap-2 mb-1"><div className="w-4 h-4 bg-[rgb(50,50,50)] rounded-sm"></div>重度污染 (1.0)</div>
          <div className="flex items-center gap-2 mb-1"><div className="w-4 h-4 bg-[rgb(75,125,150)] rounded-sm"></div>中度污染 (0.5)</div>
          <div className="flex items-center gap-2"><div className="w-4 h-4 bg-[rgb(100,200,250)] rounded-sm"></div>清澈水质 (0.0)</div>
        </div>
      </div>
    </div>
  );
}
