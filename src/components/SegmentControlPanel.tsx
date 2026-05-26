import type { RiverSegmentV3, PollutantType, CatalystPlacement } from '../engine/simulation';

interface SegmentControlPanelProps {
  segments: RiverSegmentV3[];
  onSegmentsChange: (segs: RiverSegmentV3[]) => void;
  light: number;
  setLight: (l: number) => void;
  catalyst: number;
  setCatalyst: (c: number) => void;
  depth: number;
  setDepth: (d: number) => void;
  turbidity: number;
  setTurbidity: (t: number) => void;
  pollutantType: PollutantType;
  setPollutantType: (t: PollutantType) => void;
  doseRatio: number;
  setDoseRatio: (r: number) => void;
  catalystPlacements: CatalystPlacement[];
  setCatalystPlacements: (p: CatalystPlacement[]) => void;
}

let nextId = 100;

export function SegmentControlPanel({
  segments,
  onSegmentsChange,
  light,
  setLight,
  catalyst,
  setCatalyst,
  depth,
  setDepth,
  turbidity,
  setTurbidity,
  pollutantType,
  setPollutantType,
  doseRatio,
  setDoseRatio,
  catalystPlacements,
  setCatalystPlacements,
}: SegmentControlPanelProps) {

  function addSegment() {
    const newSegs = [
      ...segments.map(s => ({ ...s, depth: s.depth ?? 1.5, width: s.width ?? 1.0 })),
      {
        id: nextId++,
        velocity: 2.0,
        directionAngle: 0,
        length: 1 / (segments.length + 1),
        depth: 1.5,
        width: 1.0,
      },
    ];
    const total = newSegs.reduce((acc, s) => acc + s.length, 0);
    onSegmentsChange(newSegs.map(s => ({ ...s, length: s.length / total })));
  }

  function removeSegment(id: number) {
    if (segments.length <= 1) return;
    const next = segments.filter(s => s.id !== id).map(s => ({ ...s }));
    const total = next.reduce((acc, s) => acc + s.length, 0);
    onSegmentsChange(next.map(s => ({ ...s, length: s.length / total })));
  }

  function updateSegment(id: number, key: keyof RiverSegmentV3, value: number) {
    onSegmentsChange(segments.map(s => s.id === id ? { ...s, [key]: value } : s));
  }

  function addPlacement(segIndex: number) {
    const newPlacement: CatalystPlacement = {
      segmentIndex: segIndex,
      activity: catalyst,
      doseRatio,
    };
    setCatalystPlacements([...catalystPlacements, newPlacement]);
  }

  function removePlacement(index: number) {
    setCatalystPlacements(catalystPlacements.filter((_, i) => i !== index));
  }

  function updatePlacement(index: number, updates: Partial<CatalystPlacement>) {
    setCatalystPlacements(
      catalystPlacements.map((p, i) => (i === index ? { ...p, ...updates } : p)),
    );
  }

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  return (
    <div className="flex flex-col gap-4 p-4 bg-white rounded-xl shadow border border-gray-100 h-full overflow-y-auto">
      <h2 className="text-lg font-semibold text-gray-800">参数控制</h2>

      {/* ── 污染物种类 ──────────────────────────────────── */}
      <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">污染物种类</p>
        <div className="flex gap-2">
          <button
            onClick={() => setPollutantType('organic_macromolecule')}
            className={`flex-1 px-3 py-2 text-xs rounded-lg border-2 transition font-medium ${
              pollutantType === 'organic_macromolecule'
                ? 'border-purple-500 bg-purple-50 text-purple-700'
                : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
            }`}
          >
            🧪 大分子有机物
          </button>
          <button
            onClick={() => setPollutantType('sediment_algae')}
            className={`flex-1 px-3 py-2 text-xs rounded-lg border-2 transition font-medium ${
              pollutantType === 'sediment_algae'
                ? 'border-amber-500 bg-amber-50 text-amber-700'
                : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
            }`}
          >
            🏞 泥沙水藻
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-1.5">
          {pollutantType === 'organic_macromolecule'
            ? '大分子有机物：NTU 系数 12，微生物降解速度较快'
            : '泥沙水藻：NTU 系数 35，对水体浊度贡献显著更大'}
        </p>
      </div>

      {/* ── 全局环境参数 ────────────────────────────────── */}
      <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">全局环境</p>

        <div className="mb-3">
          <label className="flex justify-between text-sm font-medium text-gray-700 mb-1">
            <span>光照强度 I₀</span>
            <span className="text-yellow-600 font-bold">{light.toFixed(1)}</span>
          </label>
          <input type="range" min="0.1" max="3.0" step="0.1" value={light}
            onChange={e => setLight(parseFloat(e.target.value))}
            className="w-full accent-yellow-500" />
        </div>

        <div className="mb-3">
          <label className="flex justify-between text-sm font-medium text-gray-700 mb-1">
            <span>催化剂种类（活性常数 k）</span>
          </label>
          <select value={catalyst} onChange={e => setCatalyst(parseFloat(e.target.value))}
            className="w-full p-2 border border-gray-300 rounded text-sm focus:ring-blue-500 focus:border-blue-500 bg-white">
            <option value="0.5">基础 TiO₂（活性 0.5）</option>
            <option value="0.8">复合掺杂 TiO₂（活性 0.8）</option>
            <option value="1.2">等离子激元催化剂（活性 1.2）</option>
            <option value="2.0">石墨烯基复合材料（活性 2.0）</option>
          </select>
        </div>

        <div className="mb-3">
          <label className="flex justify-between text-sm font-medium text-gray-700 mb-1">
            <span>投药比例（清洁物/被清洁物）</span>
            <span className="text-pink-600 font-bold">{doseRatio.toFixed(1)}×</span>
          </label>
          <input type="range" min="0.1" max="5.0" step="0.1" value={doseRatio}
            onChange={e => setDoseRatio(parseFloat(e.target.value))}
            className="w-full accent-pink-500" />
          <p className="text-xs text-gray-400 mt-0.5">摩尔比，越高 = 催化剂剂量越大 = 降解越快</p>
        </div>

        <div className="mb-3">
          <label className="flex justify-between text-sm font-medium text-gray-700 mb-1">
            <span>河水深度</span>
            <span className="text-cyan-600 font-bold">{depth.toFixed(1)} m</span>
          </label>
          <input type="range" min="0.5" max="5.0" step="0.1" value={depth}
            onChange={e => setDepth(parseFloat(e.target.value))}
            className="w-full accent-cyan-500" />
          <p className="text-xs text-gray-400 mt-0.5">越深 → 光衰减越强 → 降解越慢（朗伯-比尔定律）</p>
        </div>

        <div>
          <label className="flex justify-between text-sm font-medium text-gray-700 mb-1">
            <span>水体浊度（基线 NTU）</span>
            <span className="text-orange-600 font-bold">{turbidity.toFixed(0)} NTU</span>
          </label>
          <input type="range" min="0" max="100" step="1" value={turbidity}
            onChange={e => setTurbidity(parseFloat(e.target.value))}
            className="w-full accent-orange-500" />
          <p className="text-xs text-gray-400 mt-0.5">基线浊度 + 污染物贡献 = 动态 NTU → 消光系数 α</p>
        </div>
      </div>

      {/* ── 催化剂投放管理 ──────────────────────────────── */}
      <div className="p-3 bg-amber-50/50 rounded-lg border border-amber-200">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">
            🎯 催化剂投放点（多次投药）
          </p>
          <span className="text-xs text-amber-700 font-medium">
            {catalystPlacements.length} 个投放点
          </span>
        </div>

        {catalystPlacements.length === 0 && (
          <p className="text-xs text-gray-400 italic mb-2">
            尚未设置投放点，请在下方面板中点击段落旁的 [+投药] 按钮添加
          </p>
        )}

        <div className="flex flex-col gap-2 max-h-[180px] overflow-y-auto">
          {catalystPlacements.map((cp, idx) => (
            <div key={idx} className="flex items-center gap-2 bg-white rounded-lg p-2 border border-amber-100 text-xs">
              <span className="w-6 h-6 rounded-full bg-amber-200 text-amber-800 flex items-center justify-center font-bold text-xs">
                {idx + 1}
              </span>
              <span className="font-medium text-gray-700">段落 {cp.segmentIndex + 1}</span>
              <span className="text-gray-400">|</span>
              <span className="text-gray-500">活性 {cp.activity.toFixed(1)}</span>
              <span className="text-gray-400">|</span>
              <span className="text-gray-500">比例 {cp.doseRatio.toFixed(1)}×</span>
              <button
                onClick={() => removePlacement(idx)}
                className="ml-auto text-red-400 hover:text-red-600 transition text-lg leading-none"
                title="删除此投放点"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ── 分段控制 ────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">河流分段控制</p>
          <button
            onClick={addSegment}
            disabled={segments.length >= 6}
            className="text-xs px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            + 添加段落
          </button>
        </div>

        <div className="flex flex-col gap-3">
          {segments.map((seg, idx) => (
            <div key={seg.id} className="p-3 rounded-lg border-l-4 bg-gray-50 border-gray-200"
              style={{ borderLeftColor: COLORS[idx % COLORS.length] }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold" style={{ color: COLORS[idx % COLORS.length] }}>
                  段落 {idx + 1}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => addPlacement(idx)}
                    className="text-xs px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded hover:bg-amber-200 transition"
                    title="在此段投放催化剂"
                  >
                    +投药
                  </button>
                  {segments.length > 1 && (
                    <button onClick={() => removeSegment(seg.id)}
                      className="text-xs text-red-400 hover:text-red-600 transition">✕ 删除</button>
                  )}
                </div>
              </div>

              <div className="mb-2">
                <label className="flex justify-between text-xs text-gray-600 mb-0.5">
                  <span>流速</span>
                  <span className="font-bold text-blue-600">{seg.velocity.toFixed(1)} m/s</span>
                </label>
                <input type="range" min="0.1" max="6.0" step="0.1" value={seg.velocity}
                  onChange={e => updateSegment(seg.id, 'velocity', parseFloat(e.target.value))}
                  className="w-full accent-blue-500" />
              </div>

              <div className="mb-2">
                <label className="flex justify-between text-xs text-gray-600 mb-0.5">
                  <span>流向偏角</span>
                  <span className="font-bold text-green-600">
                    {seg.directionAngle > 0 ? `右偏 ${seg.directionAngle}°` : seg.directionAngle < 0 ? `左偏 ${Math.abs(seg.directionAngle)}°` : '直流 0°'}
                  </span>
                </label>
                <input type="range" min="-40" max="40" step="2" value={seg.directionAngle}
                  onChange={e => updateSegment(seg.id, 'directionAngle', parseInt(e.target.value))}
                  className="w-full accent-green-500" />
              </div>

              <div className="mb-2">
                <label className="flex justify-between text-xs text-gray-600 mb-0.5">
                  <span>水深</span>
                  <span className="font-bold text-cyan-600">{(seg.depth ?? 1.5).toFixed(1)} m</span>
                </label>
                <input type="range" min="0.3" max="5.0" step="0.1" value={seg.depth ?? 1.5}
                  onChange={e => updateSegment(seg.id, 'depth', parseFloat(e.target.value))}
                  className="w-full accent-cyan-500" />
              </div>

              <div>
                <label className="flex justify-between text-xs text-gray-600 mb-0.5">
                  <span>河宽系数 ×{seg.width ?? 1.0} → 物理河宽 {((seg.width ?? 1.0) * 10).toFixed(1)} m</span>
                  <span className="font-bold text-indigo-600">×{(seg.width ?? 1.0).toFixed(1)}</span>
                </label>
                <input type="range" min="0.5" max="2.0" step="0.1" value={seg.width ?? 1.0}
                  onChange={e => updateSegment(seg.id, 'width', parseFloat(e.target.value))}
                  className="w-full accent-indigo-500" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
