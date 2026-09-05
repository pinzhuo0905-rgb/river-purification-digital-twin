import {
  getPollutantLabel,
  getSegmentAngle,
  type RiverSegmentV3,
  type TerrainType,
  type PollutantType,
  type PollutantMix,
  type PollutantDischarge,
  type CustomPollutantProfile,
  type CatalystPlacement,
} from '../engine/simulation';

interface SegmentControlPanelProps {
  segments: RiverSegmentV3[];
  onSegmentsChange: (segs: RiverSegmentV3[]) => void;
  totalRiverLengthM: number;
  setTotalRiverLengthM: (lengthM: number) => void;
  light: number;
  setLight: (l: number) => void;
  catalyst: number;
  setCatalyst: (c: number) => void;
  depth: number;
  setDepth: (d: number) => void;
  turbidity: number;
  setTurbidity: (t: number) => void;
  temperature: number;
  setTemperature: (t: number) => void;
  pollutantType: PollutantType;
  setPollutantType: (t: PollutantType) => void;
  pollutantMix: PollutantMix;
  setPollutantMix?: (m: PollutantMix) => void;
  customPollutants: Record<string, CustomPollutantProfile>;
  setCustomPollutants: (p: Record<string, CustomPollutantProfile>) => void;
  pollutantDischarges: PollutantDischarge[];
  setPollutantDischarges: (d: PollutantDischarge[]) => void;
  doseRatio: number;
  setDoseRatio: (r: number) => void;
  catalystPlacements: CatalystPlacement[];
  setCatalystPlacements: (p: CatalystPlacement[]) => void;
}

let nextId = 100;
const MIN_SEGMENTS = 1;
const MAX_SEGMENTS = 8;
const STANDARD_WIDTH_M = 10;
const LIGHT_UNIT_W_PER_M2 = 100;

function clampNumber(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function normalizeSegments(segs: RiverSegmentV3[]): RiverSegmentV3[] {
  const total = segs.reduce((acc, s) => acc + Math.max(s.length, 0.01), 0);
  if (total <= 0) {
    const length = 1 / Math.max(1, segs.length);
    return segs.map(s => ({ ...s, length }));
  }
  return segs.map(s => ({ ...s, length: Math.max(s.length, 0.01) / total }));
}

function createSegment(source?: RiverSegmentV3): RiverSegmentV3 {
  const angle = source ? getSegmentAngle(source) * 0.5 : 0;
  return {
    id: nextId++,
    velocity: source?.velocity ?? 2.0,
    angle,
    directionAngle: angle,
    length: 1,
    depth: source?.depth ?? 1.5,
    width: source?.width ?? 1.0,
    terrain: source?.terrain,
  };
}

function formatLengthM(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`;
  return `${Math.round(meters)} m`;
}

function formatFlowRate(seg: RiverSegmentV3): string {
  const widthM = (seg.width ?? 1.0) * STANDARD_WIDTH_M;
  const depthM = seg.depth ?? 1.5;
  return `${(seg.velocity * widthM * depthM).toFixed(1)} m3/s`;
}

function parseNumberInput(value: string, fallback: number): number {
  const next = parseFloat(value);
  return Number.isFinite(next) ? next : fallback;
}

const POLLUTANT_OPTIONS: Array<{
  type: PollutantType;
  short: string;
  desc: string;
  activeClass: string;
  detail: string;
  ntuCoefficient: number;
  naturalDecayBoost: number;
  supportsSettling: boolean;
}> = [
  { type: 'organic_macromolecule', short: '大分子有机物', desc: '生物可降解', activeClass: 'border-sky-500 bg-sky-50 text-sky-700', detail: 'NTU 12 · 生物可降解', ntuCoefficient: 12, naturalDecayBoost: 1.5, supportsSettling: false },
  { type: 'sediment_algae', short: '泥沙水藻', desc: '高浊度沉降', activeClass: 'border-amber-500 bg-amber-50 text-amber-700', detail: 'NTU 35 · 高浊度沉降', ntuCoefficient: 35, naturalDecayBoost: 0.5, supportsSettling: true },
  { type: 'heavy_metal', short: '重金属离子', desc: '极难降解', activeClass: 'border-red-500 bg-red-50 text-red-700', detail: 'NTU 2 · 极难降解', ntuCoefficient: 2, naturalDecayBoost: 0.03, supportsSettling: false },
  { type: 'petroleum_hydrocarbon', short: '石油烃类', desc: '光解主导', activeClass: 'border-orange-500 bg-orange-50 text-orange-700', detail: 'NTU 18 · 光解主导', ntuCoefficient: 18, naturalDecayBoost: 0.8, supportsSettling: false },
  { type: 'nutrient_runoff', short: '氮磷富营养化', desc: '快速生物降解', activeClass: 'border-green-500 bg-green-50 text-green-700', detail: 'NTU 10 · 快速生物降解', ntuCoefficient: 10, naturalDecayBoost: 2.5, supportsSettling: false },
  { type: 'microplastic', short: '微塑料', desc: '低自然降解', activeClass: 'border-gray-500 bg-gray-100 text-gray-700', detail: 'NTU 1 · 近乎永恒', ntuCoefficient: 1, naturalDecayBoost: 0.01, supportsSettling: true },
];

const CUSTOM_ACTIVE_CLASS = 'border-teal-500 bg-teal-50 text-teal-700';

function builtInProfile(type: PollutantType): CustomPollutantProfile | undefined {
  const option = POLLUTANT_OPTIONS.find(item => item.type === type);
  if (!option) return undefined;
  return {
    id: option.type,
    label: option.short,
    ntuCoefficient: option.ntuCoefficient,
    naturalDecayBoost: option.naturalDecayBoost,
    supportsSettling: option.supportsSettling,
  };
}

function isBuiltInPollutant(type: PollutantType): boolean {
  return POLLUTANT_OPTIONS.some(item => item.type === type);
}

function normalizeMix(mix: PollutantMix, fallback: PollutantType): PollutantMix {
  const entries = Object.entries(mix)
    .filter(([, share]) => (share ?? 0) > 0) as Array<[PollutantType, number]>;
  if (entries.length === 0) return { [fallback]: 1 };
  const total = entries.reduce((sum, [, share]) => sum + share, 0);
  if (total <= 0) return { [fallback]: 1 };
  return Object.fromEntries(entries.map(([type, share]) => [type, share / total])) as PollutantMix;
}

function dominantType(mix: PollutantMix, fallback: PollutantType): PollutantType {
  let best = fallback;
  let bestShare = -1;
  for (const [type, share] of Object.entries(mix) as Array<[PollutantType, number]>) {
    if ((share ?? 0) > bestShare) {
      best = type;
      bestShare = share ?? 0;
    }
  }
  return best;
}

export function SegmentControlPanel({
  segments,
  onSegmentsChange,
  totalRiverLengthM,
  setTotalRiverLengthM,
  light,
  setLight,
  catalyst,
  setCatalyst,
  depth,
  setDepth,
  turbidity,
  setTurbidity,
  temperature,
  setTemperature,
  pollutantType,
  setPollutantType,
  pollutantMix,
  setPollutantMix,
  customPollutants,
  setCustomPollutants,
  pollutantDischarges,
  setPollutantDischarges,
  doseRatio,
  setDoseRatio,
  catalystPlacements,
  setCatalystPlacements,
}: SegmentControlPanelProps) {

  function addSegment() {
    if (segments.length >= MAX_SEGMENTS) return;
    const template = segments[segments.length - 1];
    const newSegs = [
      ...segments.map(s => ({ ...s, depth: s.depth ?? 1.5, width: s.width ?? 1.0 })),
      createSegment(template),
    ];
    onSegmentsChange(normalizeSegments(newSegs));
  }

  function removeSegment(id: number) {
    if (segments.length <= MIN_SEGMENTS) return;
    const removedIndex = segments.findIndex(s => s.id === id);
    const next = segments.filter(s => s.id !== id).map(s => ({ ...s }));
    onSegmentsChange(normalizeSegments(next));
    if (removedIndex >= 0) {
      const maxIndex = Math.max(0, next.length - 1);
      setCatalystPlacements(catalystPlacements
        .filter(p => p.segmentIndex !== removedIndex)
        .map(p => ({
          ...p,
          segmentIndex: p.segmentIndex > removedIndex ? p.segmentIndex - 1 : Math.min(p.segmentIndex, maxIndex),
        })));
      setPollutantDischarges(pollutantDischarges
        .filter(d => d.segmentIndex !== removedIndex)
        .map(d => ({
          ...d,
          segmentIndex: d.segmentIndex > removedIndex ? d.segmentIndex - 1 : Math.min(d.segmentIndex, maxIndex),
        })));
    }
  }

  function updateSegment(id: number, key: keyof RiverSegmentV3, value: number) {
    if (key === 'length') {
      updateSegmentLength(id, value);
      return;
    }
    onSegmentsChange(segments.map(s => {
      if (s.id !== id) return s;
      if (key === 'angle' || key === 'directionAngle') {
        return { ...s, angle: value, directionAngle: value };
      }
      return { ...s, [key]: value };
    }));
  }

  function updateSegmentTerrain(id: number, terrain: TerrainType) {
    onSegmentsChange(segments.map(s => (
      s.id === id ? { ...s, terrain } : s
    )));
  }

  function updateSegmentPhysicalLength(id: number, meters: number) {
    updateSegmentLength(id, clampNumber(meters, totalRiverLengthM * 0.05, totalRiverLengthM * 0.9) / totalRiverLengthM);
  }

  function updateSegmentPhysicalWidth(id: number, meters: number) {
    updateSegment(id, 'width', clampNumber(meters / STANDARD_WIDTH_M, 0.5, 2.0));
  }

  function updateSegmentLength(id: number, value: number) {
    const clamped = clampNumber(value, 0.05, 0.9);
    const targetIndex = segments.findIndex(s => s.id === id);
    if (targetIndex < 0) return;
    if (segments.length === 1) {
      onSegmentsChange([{ ...segments[0], length: 1 }]);
      return;
    }

    const remainingTotal = 1 - clamped;
    const others = segments.filter((_, idx) => idx !== targetIndex);
    const otherTotal = others.reduce((acc, s) => acc + Math.max(s.length, 0.01), 0);
    onSegmentsChange(segments.map((s, idx) => {
      if (idx === targetIndex) return { ...s, length: clamped };
      return { ...s, length: remainingTotal * (Math.max(s.length, 0.01) / otherTotal) };
    }));
  }

  function setSegmentCount(nextCountRaw: number) {
    const nextCount = Math.round(clampNumber(nextCountRaw, MIN_SEGMENTS, MAX_SEGMENTS));
    if (nextCount === segments.length) return;

    if (nextCount > segments.length) {
      let next = segments.map(s => ({ ...s, depth: s.depth ?? 1.5, width: s.width ?? 1.0 }));
      while (next.length < nextCount) {
        next = [...next, createSegment(next[next.length - 1])];
      }
      onSegmentsChange(normalizeSegments(next));
      return;
    }

    const next = normalizeSegments(segments.slice(0, nextCount).map(s => ({ ...s })));
    onSegmentsChange(next);
    const maxIndex = Math.max(0, nextCount - 1);
    setCatalystPlacements(catalystPlacements
      .filter(p => p.segmentIndex < nextCount)
      .map(p => ({ ...p, segmentIndex: Math.min(p.segmentIndex, maxIndex) })));
    setPollutantDischarges(pollutantDischarges
      .filter(d => d.segmentIndex < nextCount)
      .map(d => ({ ...d, segmentIndex: Math.min(d.segmentIndex, maxIndex) })));
  }

  function addPlacement(segIndex: number) {
    const newPlacement: CatalystPlacement = {
      segmentIndex: segIndex,
      activity: catalyst,
      doseRatio,
    };
    setCatalystPlacements([...catalystPlacements, newPlacement]);
  }

  const normalizedMix = normalizeMix(pollutantMix, pollutantType);
  const dominantPollutant = dominantType(normalizedMix, pollutantType);
  const pollutantOptions = [
    ...POLLUTANT_OPTIONS.map(option => {
      const profile = customPollutants[option.type] ?? builtInProfile(option.type)!;
      return {
        ...option,
        short: profile.label,
        detail: `NTU ${profile.ntuCoefficient.toFixed(1)} · 自然降解 ${profile.naturalDecayBoost.toFixed(2)}×`,
      };
    }),
    ...Object.values(customPollutants).filter(profile => !isBuiltInPollutant(profile.id)).map(profile => ({
      type: profile.id as PollutantType,
      short: profile.label,
      desc: '自定义污染物',
      activeClass: CUSTOM_ACTIVE_CLASS,
      detail: `NTU ${profile.ntuCoefficient.toFixed(1)} · 自然降解 ${profile.naturalDecayBoost.toFixed(2)}×`,
    })),
  ];

  function updateMix(nextMix: PollutantMix) {
    const normalized = normalizeMix(nextMix, pollutantType);
    setPollutantMix?.(normalized);
    setPollutantType(dominantType(normalized, pollutantType));
  }

  function togglePollutant(type: PollutantType) {
    const isEnabled = (normalizedMix[type] ?? 0) > 0;
    if (isEnabled) {
      const next = { ...normalizedMix };
      delete next[type];
      updateMix(next);
      return;
    }
    updateMix({ ...normalizedMix, [type]: 0.2 });
  }

  function setPollutantShare(type: PollutantType, share: number) {
    updateMix({ ...normalizedMix, [type]: clampNumber(share, 0, 1) });
  }

  function ensurePollutantInMix(type: PollutantType) {
    if ((normalizedMix[type] ?? 0) > 0) return;
    updateMix({ ...normalizedMix, [type]: 0.2 });
  }

  function addDischarge(type: PollutantType = dominantPollutant) {
    ensurePollutantInMix(type);
    const next: PollutantDischarge = {
      segmentIndex: 0,
      positionRatio: 0,
      pollutantType: type,
      mass: 0.2,
      dischargeType: 'continuous',
    };
    setPollutantDischarges([...pollutantDischarges, next]);
  }

  function updateDischarge(index: number, patch: Partial<PollutantDischarge>) {
    if (patch.pollutantType) ensurePollutantInMix(patch.pollutantType);
    setPollutantDischarges(pollutantDischarges.map((item, i) => (
      i === index ? { ...item, ...patch } : item
    )));
  }

  function removeDischarge(index: number) {
    setPollutantDischarges(pollutantDischarges.filter((_, i) => i !== index));
  }

  function addCustomPollutant() {
    const id = `custom_${nextId++}`;
    const next: CustomPollutantProfile = {
      id,
      label: '自定义污染物',
      ntuCoefficient: 12,
      naturalDecayBoost: 1,
      supportsSettling: false,
    };
    setCustomPollutants({ ...customPollutants, [id]: next });
    updateMix({ ...normalizedMix, [id]: 0.2 });
  }

  function getPollutantProfile(type: PollutantType): CustomPollutantProfile {
    return customPollutants[type] ?? builtInProfile(type) ?? {
      id: type,
      label: getPollutantLabel(type, customPollutants),
      ntuCoefficient: 12,
      naturalDecayBoost: 1,
      supportsSettling: false,
    };
  }

  function updatePollutantProfile(id: string, patch: Partial<CustomPollutantProfile>) {
    const current = getPollutantProfile(id);
    setCustomPollutants({
      ...customPollutants,
      [id]: { ...current, ...patch, id },
    });
  }

  function removeCustomPollutant(id: string) {
    const nextProfiles = { ...customPollutants };
    delete nextProfiles[id];
    setCustomPollutants(nextProfiles);

    const nextMix = { ...normalizedMix };
    delete nextMix[id];
    updateMix(nextMix);
    setPollutantDischarges(pollutantDischarges.filter(item => item.pollutantType !== id));
  }

  function resetBuiltInPollutant(id: string) {
    const nextProfiles = { ...customPollutants };
    delete nextProfiles[id];
    setCustomPollutants(nextProfiles);
  }

  function removePlacement(index: number) {
    setCatalystPlacements(catalystPlacements.filter((_, i) => i !== index));
  }

  const COLORS = [
    'var(--ios-blue)',
    'var(--ios-mint)',
    'var(--ios-orange)',
    'var(--ios-red)',
    'var(--ios-purple)',
    'var(--ios-teal)',
  ];

  return (
    <div className="control-panel min-h-0 flex-1 flex flex-col gap-4 p-4 overflow-y-auto">
      <div>
        <h2 className="text-lg font-semibold text-slate-100">参数控制</h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-400">
          调节环境、污染物与河段几何参数，实时观察净化过程。
        </p>
      </div>

      {/* ── 河流段数控制台 ────────────────────────────── */}
      <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">河流段数控制台</p>
          <span className="text-sm font-bold text-blue-600">{segments.length} 段</span>
        </div>
        <div className="grid grid-cols-[34px_1fr_34px] items-center gap-2">
          <button
            onClick={() => setSegmentCount(segments.length - 1)}
            disabled={segments.length <= MIN_SEGMENTS}
            className="h-9 min-h-9 rounded-full bg-white text-blue-600"
            title="减少河段"
          >
            -
          </button>
          <input
            type="range"
            min={MIN_SEGMENTS}
            max={MAX_SEGMENTS}
            step="1"
            value={segments.length}
            onChange={e => setSegmentCount(parseInt(e.target.value, 10))}
            className="w-full accent-blue-500"
            aria-label="河流段数"
          />
          <button
            onClick={() => setSegmentCount(segments.length + 1)}
            disabled={segments.length >= MAX_SEGMENTS}
            className="h-9 min-h-9 rounded-full bg-blue-500 text-white"
            title="增加河段"
          >
            +
          </button>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">精确段数</span>
            <input
              type="number"
              min={MIN_SEGMENTS}
              max={MAX_SEGMENTS}
              step="1"
              value={segments.length}
              onChange={e => setSegmentCount(parseNumberInput(e.target.value, segments.length))}
              className="w-20 rounded-lg border border-blue-200 bg-white px-2 py-1.5 text-right text-sm font-semibold text-blue-700"
              aria-label="精确输入河流段数"
            />
          </div>
          <span className="text-[11px] text-slate-400">范围 {MIN_SEGMENTS}-{MAX_SEGMENTS} 段 · 总长 {formatLengthM(totalRiverLengthM)}</span>
        </div>
      </div>

      {/* ── 环境与投药控制台 ────────────────────────────── */}
      <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">环境与投药控制台</p>
          <span className="text-[11px] text-slate-400">单位化调节</span>
        </div>

        <div className="mb-3">
          <label className="flex justify-between text-sm font-medium text-gray-700 mb-1">
            <span>模拟河道总长</span>
            <span className="text-blue-600 font-bold">{formatLengthM(totalRiverLengthM)}</span>
          </label>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min="100"
              max="20000"
              step="100"
              value={totalRiverLengthM}
              onChange={e => setTotalRiverLengthM(parseFloat(e.target.value))}
              className="w-full accent-blue-500"
            />
            <div className="flex w-28 overflow-hidden rounded-lg border border-gray-300 bg-white">
              <input
                type="number"
                min="100"
                max="20000"
                step="100"
                value={Math.round(totalRiverLengthM)}
                onChange={e => setTotalRiverLengthM(clampNumber(parseFloat(e.target.value), 100, 20000))}
                className="min-w-0 flex-1 border-0 px-2 py-1.5 text-right text-sm focus:ring-blue-500"
                aria-label="模拟河道总长"
              />
              <span className="flex items-center px-2 text-xs text-gray-500">m</span>
            </div>
          </div>
        </div>

        <div className="mb-3">
          <label className="flex justify-between text-sm font-medium text-gray-700 mb-1">
            <span>太阳辐照度</span>
            <span className="text-yellow-600 font-bold">{Math.round(light * LIGHT_UNIT_W_PER_M2)} W/m2</span>
          </label>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min="0"
              max="1000"
              step="10"
              value={light * LIGHT_UNIT_W_PER_M2}
              onChange={e => setLight(parseFloat(e.target.value) / LIGHT_UNIT_W_PER_M2)}
              className="w-full accent-yellow-500"
            />
            <div className="flex w-32 overflow-hidden rounded-lg border border-gray-300 bg-white">
              <input
                type="number"
                min="0"
                max="1000"
                step="10"
                value={Math.round(light * LIGHT_UNIT_W_PER_M2)}
                onChange={e => setLight(clampNumber(parseFloat(e.target.value), 0, 1000) / LIGHT_UNIT_W_PER_M2)}
                className="min-w-0 flex-1 border-0 px-2 py-1.5 text-right text-sm focus:ring-yellow-500"
                aria-label="太阳辐照度"
              />
              <span className="flex items-center px-2 text-xs text-gray-500">W/m2</span>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">界面以辐照度显示，仿真内部按 I0 等效强度计算光衰减。</p>
        </div>

        <div className="mb-3">
          <label className="flex justify-between text-sm font-medium text-gray-700 mb-1">
            <span>基准浊度</span>
            <span className="text-orange-600 font-bold">{turbidity.toFixed(0)} NTU</span>
          </label>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min="0"
              max="200"
              step="1"
              value={turbidity}
              onChange={e => setTurbidity(parseFloat(e.target.value))}
              className="w-full accent-orange-500"
            />
            <div className="flex w-28 overflow-hidden rounded-lg border border-gray-300 bg-white">
              <input
                type="number"
                min="0"
                max="200"
                step="1"
                value={turbidity}
                onChange={e => setTurbidity(clampNumber(parseFloat(e.target.value), 0, 200))}
                className="min-w-0 flex-1 border-0 px-2 py-1.5 text-right text-sm focus:ring-orange-500"
                aria-label="基准浊度"
              />
              <span className="flex items-center px-2 text-xs text-gray-500">NTU</span>
            </div>
          </div>
        </div>

        <div className="mb-3">
          <label className="flex justify-between text-sm font-medium text-gray-700 mb-1">
            <span>水温</span>
            <span className="text-rose-600 font-bold">{temperature.toFixed(0)} degC</span>
          </label>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min="0"
              max="45"
              step="1"
              value={temperature}
              onChange={e => setTemperature(parseFloat(e.target.value))}
              className="w-full accent-rose-500"
            />
            <div className="flex w-24 overflow-hidden rounded-lg border border-gray-300 bg-white">
              <input
                type="number"
                min="0"
                max="45"
                step="1"
                value={temperature}
                onChange={e => setTemperature(clampNumber(parseFloat(e.target.value), 0, 45))}
                className="min-w-0 flex-1 border-0 px-2 py-1.5 text-right text-sm focus:ring-rose-500"
                aria-label="水温"
              />
              <span className="flex items-center px-2 text-xs text-gray-500">C</span>
            </div>
          </div>
        </div>

        <div className="mb-3">
          <label className="flex justify-between text-sm font-medium text-gray-700 mb-1">
            <span>平均水深</span>
            <span className="text-cyan-600 font-bold">{depth.toFixed(1)} m</span>
          </label>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min="0.3"
              max="20"
              step="0.1"
              value={depth}
              onChange={e => setDepth(parseFloat(e.target.value))}
              className="w-full accent-cyan-500"
            />
            <div className="flex w-24 overflow-hidden rounded-lg border border-gray-300 bg-white">
              <input
                type="number"
                min="0.3"
                max="20"
                step="0.1"
                value={depth}
                onChange={e => setDepth(clampNumber(parseFloat(e.target.value), 0.3, 20))}
                className="min-w-0 flex-1 border-0 px-2 py-1.5 text-right text-sm focus:ring-cyan-500"
                aria-label="平均水深"
              />
              <span className="flex items-center px-2 text-xs text-gray-500">m</span>
            </div>
          </div>
        </div>

        <div className="mb-3">
          <label className="flex justify-between text-sm font-medium text-gray-700 mb-1">
            <span>催化反应活性</span>
            <span className="text-indigo-600 font-bold">{catalyst.toFixed(2)} 1/s eq.</span>
          </label>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min="0.1"
              max="2.0"
              step="0.05"
              value={catalyst}
              onChange={e => setCatalyst(parseFloat(e.target.value))}
              className="w-full accent-indigo-500"
            />
            <div className="flex w-28 overflow-hidden rounded-lg border border-gray-300 bg-white">
              <input
                type="number"
                min="0.1"
                max="2.0"
                step="0.05"
                value={catalyst}
                onChange={e => setCatalyst(clampNumber(parseFloat(e.target.value), 0.1, 2.0))}
                className="min-w-0 flex-1 border-0 px-2 py-1.5 text-right text-sm focus:ring-indigo-500"
                aria-label="催化反应活性"
              />
              <span className="flex items-center px-2 text-xs text-gray-500">k</span>
            </div>
          </div>
        </div>

        <div>
          <label className="flex justify-between text-sm font-medium text-gray-700 mb-1">
            <span>投药等效浓度</span>
            <span className="text-emerald-600 font-bold">{doseRatio.toFixed(1)} mg/L eq.</span>
          </label>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min="0.1"
              max="5.0"
              step="0.1"
              value={doseRatio}
              onChange={e => setDoseRatio(parseFloat(e.target.value))}
              className="w-full accent-emerald-500"
            />
            <div className="flex w-32 overflow-hidden rounded-lg border border-gray-300 bg-white">
              <input
                type="number"
                min="0.1"
                max="5.0"
                step="0.1"
                value={doseRatio}
                onChange={e => setDoseRatio(clampNumber(parseFloat(e.target.value), 0.1, 5.0))}
                className="min-w-0 flex-1 border-0 px-2 py-1.5 text-right text-sm focus:ring-emerald-500"
                aria-label="投药等效浓度"
              />
              <span className="flex items-center px-2 text-xs text-gray-500">mg/L</span>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">投药值以等效浓度显示，内部仍用于剂量强度计算。</p>
        </div>
      </div>

      {/* ── 污染物种类 ──────────────────────────────────── */}
      <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
        <div className="flex items-center justify-between gap-2 mb-3">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">污染物组成配比</p>
          <span className="text-[11px] text-slate-400">
            主导：{getPollutantLabel(dominantPollutant, customPollutants)}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {pollutantOptions.map(({ type, short, desc, activeClass, detail }) => (
            <button
              key={type}
              onClick={() => togglePollutant(type)}
              title={detail}
              className={`px-2.5 py-1.5 text-xs rounded-lg border-2 transition font-medium text-left flex items-center gap-1.5 ${
                (normalizedMix[type] ?? 0) > 0
                  ? activeClass
                  : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
              }`}
            >
              <span className="leading-tight">
                <span className="block">{short}</span>
                <span className="block text-[10px] opacity-70">{desc}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="mt-3 flex flex-col gap-2">
          {pollutantOptions.filter(({ type }) => (normalizedMix[type] ?? 0) > 0).map(({ type, detail }) => (
            <div key={type} className="rounded-lg border border-white/10 bg-white/5 p-2">
              <label className="flex justify-between text-xs text-gray-600 mb-1">
                <span>{getPollutantLabel(type, customPollutants)} 配比 φ</span>
                <span className="font-bold text-cyan-600">{Math.round((normalizedMix[type] ?? 0) * 100)}%</span>
              </label>
              <input
                type="range"
                min="0.01"
                max="1"
                step="0.01"
                value={normalizedMix[type] ?? 0}
                onChange={e => setPollutantShare(type, parseFloat(e.target.value))}
                className="w-full accent-cyan-500"
              />
              <p className="mt-1 text-[11px] text-gray-400">{detail}</p>
            </div>
          ))}
          <p className="text-[11px] text-slate-400">
            配比会自动归一化为 100%，用于 NTU 贡献、自然降解系数与水质评价主导污染物判定。
          </p>
        </div>

        <div className="mt-3 rounded-lg border border-white/10 bg-white/5 p-2">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">污染物参数</p>
            <button
              onClick={addCustomPollutant}
              className="px-2 py-1 text-xs font-medium text-white bg-cyan-500"
            >
              + 新建自定义
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {pollutantOptions.filter(({ type }) => (normalizedMix[type] ?? 0) > 0).map(({ type }) => {
              const profile = getPollutantProfile(type);
              const builtIn = isBuiltInPollutant(type);
              return (
                <div key={type} className="rounded-lg border border-cyan-200/30 bg-white/5 p-2">
                  <div className="mb-2 flex items-center gap-2">
                    <input
                      value={profile.label}
                      onChange={e => updatePollutantProfile(type, { label: e.target.value || '自定义污染物' })}
                      disabled={builtIn}
                      className="min-w-0 flex-1 px-2 py-1 text-xs disabled:opacity-70"
                      aria-label={`${profile.label} 名称`}
                    />
                    {builtIn ? (
                      <button
                        onClick={() => resetBuiltInPollutant(type)}
                        disabled={!customPollutants[type]}
                        className="px-2 py-1 text-xs text-white bg-slate-500/60 disabled:opacity-40"
                      >
                        恢复默认
                      </button>
                    ) : (
                      <button
                        onClick={() => removeCustomPollutant(type)}
                        className="px-2 py-1 text-xs text-white bg-red-500/60"
                      >
                        删除
                      </button>
                    )}
                  </div>
                  <label className="mb-1 flex justify-between text-[11px] text-gray-600">
                    <span>浊度贡献系数 NTU_coeff</span>
                    <span className="font-bold text-cyan-600">{profile.ntuCoefficient.toFixed(1)}</span>
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="60"
                    step="0.5"
                    value={profile.ntuCoefficient}
                    onChange={e => updatePollutantProfile(type, { ntuCoefficient: parseFloat(e.target.value) })}
                    className="w-full accent-cyan-500"
                  />
                  <label className="mb-1 mt-2 flex justify-between text-[11px] text-gray-600">
                    <span>自然降解倍率 β_nat</span>
                    <span className="font-bold text-emerald-600">{profile.naturalDecayBoost.toFixed(2)}×</span>
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="3"
                    step="0.05"
                    value={profile.naturalDecayBoost}
                    onChange={e => updatePollutantProfile(type, { naturalDecayBoost: parseFloat(e.target.value) })}
                    className="w-full accent-emerald-500"
                  />
                  <label className="mt-2 flex items-center gap-2 text-[11px] text-gray-600">
                    <input
                      type="checkbox"
                      checked={profile.supportsSettling ?? false}
                      onChange={e => updatePollutantProfile(type, { supportsSettling: e.target.checked })}
                      className="h-4 w-4 accent-cyan-500"
                    />
                    参与沉降 / 再悬浮计算
                  </label>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-gray-400">
            默认六类污染物也可调参数；调过后将覆盖内置模型常数，并立即参与仿真。
          </p>
        </div>
      </div>

      {/* ── 污染源 / 排放负荷 ────────────────────────────── */}
      <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">污染源排放负荷</p>
          <button
            onClick={() => addDischarge()}
            className="text-xs px-2 py-1 bg-cyan-500 text-white rounded hover:bg-cyan-600 transition"
          >
            + 添加污染物
          </button>
        </div>

        {pollutantDischarges.length === 0 ? (
          <p className="text-xs text-gray-400 italic">
            未设置额外污染源。系统会按污染物组成在上游生成默认连续排放。
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {pollutantDischarges.map((item, idx) => (
              <div key={idx} className="rounded-lg border border-cyan-200/30 bg-white/5 p-2 text-xs">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-6 h-6 rounded-full bg-cyan-200 text-cyan-900 flex items-center justify-center font-bold">
                    {idx + 1}
                  </span>
                  <select
                    value={item.pollutantType}
                    onChange={e => updateDischarge(idx, { pollutantType: e.target.value as PollutantType })}
                    className="min-w-0 flex-1 rounded border border-cyan-300/30 bg-slate-950/50 px-2 py-1 text-xs"
                    aria-label={`污染源 ${idx + 1} 类型`}
                  >
                    {pollutantOptions.map(({ type }) => (
                      <option key={type} value={type}>{getPollutantLabel(type, customPollutants)}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => removeDischarge(idx)}
                    className="text-red-400 hover:text-red-600 transition"
                    title="删除该污染源"
                  >
                    删除
                  </button>
                </div>

                <label className="flex justify-between text-gray-600 mb-0.5">
                  <span>排放河段 s</span>
                  <span className="font-bold text-blue-600">河段 {item.segmentIndex + 1}</span>
                </label>
                <input
                  type="range"
                  min="0"
                  max={Math.max(0, segments.length - 1)}
                  step="1"
                  value={Math.min(item.segmentIndex, Math.max(0, segments.length - 1))}
                  onChange={e => updateDischarge(idx, { segmentIndex: parseInt(e.target.value) })}
                  className="w-full accent-blue-500 mb-2"
                />

                <label className="flex justify-between text-gray-600 mb-0.5">
                  <span>段内位置</span>
                  <span className="font-bold text-emerald-600">
                    {formatLengthM(item.positionRatio * ((segments[item.segmentIndex]?.length ?? 0) * totalRiverLengthM))}
                  </span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={item.positionRatio}
                  onChange={e => updateDischarge(idx, { positionRatio: parseFloat(e.target.value) })}
                  className="w-full accent-emerald-500 mb-2"
                />

                <label className="flex justify-between text-gray-600 mb-0.5">
                  <span>污染物质量/负荷 M</span>
                  <span className="font-bold text-orange-600">{item.mass.toFixed(2)} mg/L 等效</span>
                </label>
                <input
                  type="range"
                  min="0.01"
                  max="2"
                  step="0.01"
                  value={item.mass}
                  onChange={e => updateDischarge(idx, { mass: parseFloat(e.target.value) })}
                  className="w-full accent-orange-500 mb-2"
                />

                <label className="flex justify-between text-gray-600 mb-0.5">
                  <span>排放方式</span>
                  <span className="font-bold text-violet-600">
                    {item.dischargeType === 'continuous' ? '连续排放' : '瞬时排放'}
                  </span>
                </label>
                <select
                  value={item.dischargeType}
                  onChange={e => updateDischarge(idx, { dischargeType: e.target.value as PollutantDischarge['dischargeType'] })}
                  className="w-full rounded border border-violet-300/30 bg-slate-950/50 px-2 py-1 text-xs"
                  aria-label={`污染源 ${idx + 1} 排放方式`}
                >
                  <option value="continuous">连续排放 continuous</option>
                  <option value="burst">瞬时排放 burst</option>
                </select>
              </div>
            ))}
          </div>
        )}
        <p className="mt-2 text-[11px] text-slate-400">
          排放负荷会进入沿程积分；未设置时自动使用污染物组成生成上游默认负荷。
        </p>
      </div>

      {/* ── 催化剂投放管理 ──────────────────────────────── */}
      <div className="p-3 bg-amber-50/50 rounded-lg border border-amber-200">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">
            催化剂投放点
          </p>
          <span className="text-xs text-amber-700 font-medium">
            {catalystPlacements.length} 个投放点
          </span>
        </div>

        {catalystPlacements.length === 0 && (
          <p className="text-xs text-gray-400 italic mb-2">
            尚未设置投放点，请在下方河段中点击“+投药”添加催化剂投放位置。
          </p>
        )}

        <div className="flex flex-col gap-2 max-h-[180px] overflow-y-auto">
          {catalystPlacements.map((cp, idx) => (
            <div key={idx} className="flex items-center gap-2 bg-white rounded-lg p-2 border border-amber-100 text-xs">
              <span className="w-6 h-6 rounded-full bg-amber-200 text-amber-800 flex items-center justify-center font-bold text-xs">
                {idx + 1}
              </span>
              <span className="font-medium text-gray-700">河段 {cp.segmentIndex + 1}</span>
              <span className="text-gray-400">|</span>
              <span className="text-gray-500">活性 k {cp.activity.toFixed(1)}</span>
              <span className="text-gray-400">|</span>
              <span className="text-gray-500">剂量 R {cp.doseRatio.toFixed(1)}×</span>
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
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">河段水动力参数</p>
          <button
            onClick={addSegment}
            disabled={segments.length >= MAX_SEGMENTS}
            className="text-xs px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            + 添加河段
          </button>
        </div>

        <div className="flex flex-col gap-3">
          {segments.map((seg, idx) => (
            <div key={seg.id} className="p-3 rounded-lg border-l-4 bg-gray-50 border-gray-200"
              style={{ borderLeftColor: COLORS[idx % COLORS.length] }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold" style={{ color: COLORS[idx % COLORS.length] }}>
                  河段 {idx + 1}
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
                      className="text-xs text-red-400 hover:text-red-600 transition">删除</button>
                  )}
                </div>
              </div>

              <div className="mb-2">
                <label className="flex justify-between text-xs text-gray-600 mb-0.5">
                  <span>断面流速 v</span>
                  <span className="font-bold text-blue-600">{seg.velocity.toFixed(1)} m/s</span>
                </label>
                <div className="flex items-center gap-2">
                  <input type="range" min="0.1" max="6.0" step="0.1" value={seg.velocity}
                    onChange={e => updateSegment(seg.id, 'velocity', parseFloat(e.target.value))}
                    className="w-full accent-blue-500" />
                  <div className="flex w-24 overflow-hidden rounded-lg border border-gray-300 bg-white">
                    <input
                      type="number"
                      min="0.1"
                      max="6"
                      step="0.1"
                      value={seg.velocity}
                      onChange={e => updateSegment(seg.id, 'velocity', clampNumber(parseNumberInput(e.target.value, seg.velocity), 0.1, 6))}
                      className="min-w-0 flex-1 border-0 px-2 py-1 text-right text-xs"
                      aria-label={`河段 ${idx + 1} 断面流速`}
                    />
                    <span className="flex items-center px-1.5 text-[10px] text-gray-500">m/s</span>
                  </div>
                </div>
                <p className="mt-0.5 text-[11px] text-gray-400">估算流量 Q = {formatFlowRate(seg)}</p>
              </div>

              <div className="mb-2">
                <label className="flex justify-between text-xs text-gray-600 mb-0.5">
                  <span>流向偏角 θ</span>
                  <span className="font-bold text-green-600">
                    {getSegmentAngle(seg) > 0 ? `右偏 ${getSegmentAngle(seg)}°` : getSegmentAngle(seg) < 0 ? `左偏 ${Math.abs(getSegmentAngle(seg))}°` : '直流 0°'}
                  </span>
                </label>
                <div className="flex items-center gap-2">
                  <input type="range" min="-40" max="40" step="2" value={getSegmentAngle(seg)}
                    onChange={e => updateSegment(seg.id, 'angle', parseInt(e.target.value))}
                    className="w-full accent-green-500" />
                  <div className="flex w-20 overflow-hidden rounded-lg border border-gray-300 bg-white">
                    <input
                      type="number"
                      min="-40"
                      max="40"
                      step="1"
                      value={getSegmentAngle(seg)}
                      onChange={e => updateSegment(seg.id, 'angle', clampNumber(parseNumberInput(e.target.value, getSegmentAngle(seg)), -40, 40))}
                      className="min-w-0 flex-1 border-0 px-2 py-1 text-right text-xs"
                      aria-label={`河段 ${idx + 1} 流向偏角`}
                    />
                    <span className="flex items-center px-1.5 text-[10px] text-gray-500">deg</span>
                  </div>
                </div>
              </div>

              <div className="mb-2">
                <label className="flex justify-between text-xs text-gray-600 mb-0.5">
                  <span>河段长度 L</span>
                  <span className="font-bold text-violet-600">{formatLengthM(seg.length * totalRiverLengthM)}</span>
                </label>
                <div className="flex items-center gap-2">
                  <input type="range" min="0.05" max="0.9" step="0.01" value={seg.length}
                    onChange={e => updateSegment(seg.id, 'length', parseFloat(e.target.value))}
                    className="w-full accent-violet-500" />
                  <div className="flex w-28 overflow-hidden rounded-lg border border-gray-300 bg-white">
                    <input
                      type="number"
                      min={Math.round(totalRiverLengthM * 0.05)}
                      max={Math.round(totalRiverLengthM * 0.9)}
                      step="10"
                      value={Math.round(seg.length * totalRiverLengthM)}
                      onChange={e => updateSegmentPhysicalLength(seg.id, parseNumberInput(e.target.value, seg.length * totalRiverLengthM))}
                      className="min-w-0 flex-1 border-0 px-2 py-1 text-right text-xs"
                      aria-label={`河段 ${idx + 1} 长度`}
                    />
                    <span className="flex items-center px-1.5 text-[10px] text-gray-500">m</span>
                  </div>
                </div>
              </div>

              <div className="mb-2">
                <label className="flex justify-between text-xs text-gray-600 mb-0.5">
                  <span>河段水深 h</span>
                  <span className="font-bold text-cyan-600">{(seg.depth ?? 1.5).toFixed(1)} m</span>
                </label>
                <div className="flex items-center gap-2">
                  <input type="range" min="0.3" max="20.0" step="0.1" value={seg.depth ?? 1.5}
                    onChange={e => updateSegment(seg.id, 'depth', parseFloat(e.target.value))}
                    className="w-full accent-cyan-500" />
                  <div className="flex w-24 overflow-hidden rounded-lg border border-gray-300 bg-white">
                    <input
                      type="number"
                      min="0.3"
                      max="20"
                      step="0.1"
                      value={seg.depth ?? 1.5}
                      onChange={e => updateSegment(seg.id, 'depth', clampNumber(parseNumberInput(e.target.value, seg.depth ?? 1.5), 0.3, 20))}
                      className="min-w-0 flex-1 border-0 px-2 py-1 text-right text-xs"
                      aria-label={`河段 ${idx + 1} 水深`}
                    />
                    <span className="flex items-center px-1.5 text-[10px] text-gray-500">m</span>
                  </div>
                </div>
              </div>

              <div className="mb-2">
                <label className="flex justify-between text-xs text-gray-600 mb-0.5">
                  <span>平均河宽 W</span>
                  <span className="font-bold text-indigo-600">{((seg.width ?? 1.0) * STANDARD_WIDTH_M).toFixed(1)} m</span>
                </label>
                <div className="flex items-center gap-2">
                  <input type="range" min="0.5" max="2.0" step="0.1" value={seg.width ?? 1.0}
                    onChange={e => updateSegment(seg.id, 'width', parseFloat(e.target.value))}
                    className="w-full accent-indigo-500" />
                  <div className="flex w-24 overflow-hidden rounded-lg border border-gray-300 bg-white">
                    <input
                      type="number"
                      min="5"
                      max="20"
                      step="0.5"
                      value={Number(((seg.width ?? 1.0) * STANDARD_WIDTH_M).toFixed(1))}
                      onChange={e => updateSegmentPhysicalWidth(seg.id, parseNumberInput(e.target.value, (seg.width ?? 1.0) * STANDARD_WIDTH_M))}
                      className="min-w-0 flex-1 border-0 px-2 py-1 text-right text-xs"
                      aria-label={`河段 ${idx + 1} 河宽`}
                    />
                    <span className="flex items-center px-1.5 text-[10px] text-gray-500">m</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="flex justify-between text-xs text-gray-600 mb-0.5">
                  <span>河段类型</span>
                  <span className="font-bold text-slate-600">{seg.terrain === 'lake' ? '湖泊/缓流区' : '河道/急流区'}</span>
                </label>
                <select
                  value={seg.terrain ?? 'river'}
                  onChange={e => updateSegmentTerrain(seg.id, e.target.value as TerrainType)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-700"
                  aria-label={`河段 ${idx + 1} 类型`}
                >
                  <option value="river">河道 / 急流区</option>
                  <option value="lake">湖泊 / 缓流区</option>
                </select>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
