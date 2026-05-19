import React from 'react';

export interface ControlPanelProps {
  velocity: number;
  setVelocity: (v: number) => void;
  direction: number;
  setDirection: (d: number) => void;
  light: number;
  setLight: (l: number) => void;
  catalyst: number;
  setCatalyst: (c: number) => void;
}

export function ControlPanel(props: ControlPanelProps) {
  return (
    <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100 flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-gray-800">环境与参数控制</h2>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          河流流速: {props.velocity.toFixed(1)} m/s
        </label>
        <input 
          type="range" min="0.1" max="5" step="0.1" 
          value={props.velocity} 
          onChange={e => props.setVelocity(parseFloat(e.target.value))}
          className="w-full accent-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          河流流向: {props.direction}°
        </label>
        <input 
          type="range" min="-90" max="90" step="5" 
          value={props.direction} 
          onChange={e => props.setDirection(parseInt(e.target.value))}
          className="w-full accent-blue-500"
        />
        <p className="text-xs text-gray-500 mt-1">0°为正右方扩散，正数为向下倾斜</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          光照强度 (I): {props.light.toFixed(1)}
        </label>
        <input 
          type="range" min="0.1" max="2.0" step="0.1" 
          value={props.light} 
          onChange={e => props.setLight(parseFloat(e.target.value))}
          className="w-full accent-yellow-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          催化剂种类
        </label>
        <select 
          value={props.catalyst} 
          onChange={e => props.setCatalyst(parseFloat(e.target.value))}
          className="w-full p-2 border border-gray-300 rounded text-sm focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="0.5">基础 TiO2 (效率: 0.5)</option>
          <option value="0.8">复合掺杂 TiO2 (效率: 0.8)</option>
          <option value="1.2">新型等离子激元光催化剂 (效率: 1.2)</option>
          <option value="2.0">石墨烯基复合材料 (效率: 2.0)</option>
        </select>
      </div>
    </div>
  );
}
