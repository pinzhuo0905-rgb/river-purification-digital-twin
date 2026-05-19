import React, { useState, useEffect } from 'react';
import { ControlPanel } from './components/ControlPanel';
import { Dashboard } from './components/Dashboard';
import { RiverCanvas } from './components/RiverCanvas';
import { simulatePurification, SimulationResult } from './engine/simulation';

function App() {
  const [velocity, setVelocity] = useState(2.0);
  const [direction, setDirection] = useState(0);
  const [light, setLight] = useState(1.0);
  const [catalyst, setCatalyst] = useState(0.8);

  const [result, setResult] = useState<SimulationResult | null>(null);

  useEffect(() => {
    // 每次参数变更，重新跑仿真计算
    const res = simulatePurification({
      gridWidth: 100, // 代表 100个切片单位
      gridHeight: 50,
      velocity,
      directionAngle: direction,
      lightIntensity: light,
      catalystEfficiency: catalyst
    });
    setResult(res);
  }, [velocity, direction, light, catalyst]);

  return (
    <div className="min-h-screen bg-gray-50 p-6 font-sans text-gray-800">
      <div className="max-w-7xl mx-auto">
        <header className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">基于微积分切片与指数衰减的河流光催化净化仿真系统</h1>
          <p className="text-gray-500 mt-2">实时调节环境参数，观察污染物浓度分布与最佳催化剂投放点</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 左侧控制与仪表盘 */}
          <div className="lg:col-span-1 flex flex-col gap-6">
            <ControlPanel 
              velocity={velocity} setVelocity={setVelocity}
              direction={direction} setDirection={setDirection}
              light={light} setLight={setLight}
              catalyst={catalyst} setCatalyst={setCatalyst}
            />
            {result && (
              <Dashboard 
                gridData={result.gridData} 
                optX={result.optimalX} 
                optY={result.optimalY}
                directionAngle={direction}
              />
            )}
          </div>

          {/* 右侧核心热力图展示 */}
          <div className="lg:col-span-2 flex flex-col h-[600px]">
            {result && (
              <RiverCanvas 
                gridData={result.gridData} 
                optX={result.optimalX} 
                optY={result.optimalY}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
