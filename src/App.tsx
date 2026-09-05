import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { SegmentControlPanel } from './components/SegmentControlPanel';
import { Dashboard } from './components/Dashboard';
import { RiverCanvas } from './components/RiverCanvas';
import { RiverObservationNote } from './components/RiverObservationNote';
import { WeatherWaterStatus } from './components/WeatherWaterStatus';
import {
  ACADEMIC_SCENARIO_PRESETS,
  getPollutantLabel,
  getSegmentAngle,
  simulatePurification,
  type SimulationResult,
  type SimulationResultV3,
  type RiverSegment,
  type SimulationParamsV3,
  type PollutantType,
  type PollutantMix,
  type PollutantDischarge,
  type CustomPollutantProfile,
  type CatalystPlacement,
  type ScenarioPreset,
} from './engine/simulation';
import type { ParetoPoint } from './engine/optimizer';
import type { WaterQualityClass } from './engine/waterQuality';

// ── 后端 API ─────────────────────────────────────────────────
import {
  fetchScenarios,
  saveScenario,
  deleteScenario,
  runSimulation,
  connectWS,
  fetchRooms,
  checkHealth,
  fetchSimulationRecords,
  saveSimulationRecord,
  deleteSimulationRecord,
  type ScenarioListItem,
  type SimulateResult,
  type WSMessage,
  type RoomInfo,
  type SimulationRecordListItem,
} from './api';

// ═══════════════════════════════════════════════════════════════
//  常量
// ═══════════════════════════════════════════════════════════════

const GRID_W = 400;
const GRID_H = 150;

const DEFAULT_SEGMENTS: RiverSegment[] = [
  { id: 1, velocity: 2.0, angle: 0, directionAngle: 0,  length: 1/3, depth: 1.5, width: 1.0 },
  { id: 2, velocity: 1.5, angle: 15, directionAngle: 15, length: 1/3, depth: 2.0, width: 1.2 },
  { id: 3, velocity: 2.5, angle: -10, directionAngle: -10, length: 1/3, depth: 1.0, width: 0.8 },
];

const DEFAULT_TOTAL_RIVER_LENGTH_M = 1000;
const ANIM_DURATION = 6;

function clonePresetSegments(preset: ScenarioPreset): RiverSegment[] {
  return preset.segments.map(seg => ({ ...seg }));
}

function clonePresetDischarges(preset: ScenarioPreset): PollutantDischarge[] {
  return preset.pollutantDischarges.map(d => ({ ...d }));
}

function clonePresetPlacements(preset: ScenarioPreset): CatalystPlacement[] {
  return preset.catalystPlacements.map(p => ({ ...p }));
}

function formatPollutantMix(mix: PollutantMix): string {
  return Object.entries(mix)
    .filter(([, share]) => (share ?? 0) > 0)
    .map(([type, share]) => `${Math.round((share ?? 0) * 100)}% ${getPollutantLabel(type as PollutantType)}`)
    .join(' + ');
}

// ═══════════════════════════════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════════════════════════════

/** 将 API 返回的仿真结果转换为前端 SimulationResult 类型 */
function apiResultToSimResult(r: SimulateResult): SimulationResultV3 {
  return {
    optimalX: r.optimal_x,
    optimalY: r.optimal_y,
    optimalSegmentIndex: r.optimal_segment_index,
    segmentOutConcentrations: r.segment_out_concentrations,
    segmentMetrics: r.segment_metrics.map(m => ({
      segIndex: m.seg_index,
      velocity: m.velocity,
      residenceTime: m.residence_time,
      effectiveLight: m.effective_light,
      reactionScore: m.reaction_score,
      depth: m.depth ?? 1.5,
      width: m.width ?? 1,
      terrain: (m as any).terrain ?? 'river',
    })),
    riverPath: r.river_path.map(p => ({
      x: p.x,
      y: p.y,
      concentration: p.concentration,
      segIndex: p.seg_index,
      widthPx: p.width_px ?? r.river_width_px,
      ntu: (p as any).ntu ?? 0,
      catalystActive: (p as any).catalystActive ?? false,
    })),
    riverWidthPx: r.river_width_px,
    segmentWidthsPx: r.segment_widths_px ?? [],
    segmentOutNtu: (r as any).segment_out_ntu ?? [],
    waterQualityStandard: (r as any).water_quality_standard ?? {
      classIMet: false,
      residualRatio: 1,
    },
  };
}

// ═══════════════════════════════════════════════════════════════
//  主组件
// ═══════════════════════════════════════════════════════════════

function App() {
  // ── 仿真参数 ──────────────────────────────────────────────
  const [segments, setSegments] = useState<RiverSegment[]>(DEFAULT_SEGMENTS);
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [totalRiverLengthM, setTotalRiverLengthM] = useState(DEFAULT_TOTAL_RIVER_LENGTH_M);
  const [light, setLight] = useState(1.0);
  const [catalyst, setCatalyst] = useState(0.8);
  const [depth, setDepth] = useState(1.5);
  const [turbidity, setTurbidity] = useState(5);
  const [temperature, setTemperature] = useState(25);
  const [pollutantType, setPollutantType] = useState<PollutantType>('organic_macromolecule');
  const [pollutantMix, setPollutantMix] = useState<PollutantMix>({ organic_macromolecule: 1 });
  const [customPollutants, setCustomPollutants] = useState<Record<string, CustomPollutantProfile>>({});
  const [pollutantDischarges, setPollutantDischarges] = useState<PollutantDischarge[]>([]);
  const [doseRatio, setDoseRatio] = useState(2.0);
  const [catalystPlacements, setCatalystPlacements] = useState<CatalystPlacement[]>([]);
  const [result, setResult] = useState<SimulationResult | null>(null);

  // ── 自动投药优化 ──────────────────────────────────────────
  const [paretoFrontier, setParetoFrontier] = useState<ParetoPoint[] | undefined>();
  const [baselineConcentration, setBaselineConcentration] = useState<number | undefined>();
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [maxDosingPoints, setMaxDosingPoints] = useState(5);
  const [targetWaterClass, setTargetWaterClass] = useState<WaterQualityClass>('II');
  const [requiredDose, setRequiredDose] = useState<number | null>(null);
  const [isCalculatingDose, setIsCalculatingDose] = useState(false);

  // 向后兼容：catalystPlacements 为空时从旧 catalyst 全局参数生成
  const effectivePlacements: CatalystPlacement[] = useMemo(() => {
    if (catalystPlacements.length > 0) return catalystPlacements;
    if (result) {
      return [{
        segmentIndex: result.optimalSegmentIndex,
        activity: catalyst,
        doseRatio,
      }];
    }
    return [{ segmentIndex: 0, activity: catalyst, doseRatio }];
  }, [catalystPlacements, catalyst, doseRatio, result?.optimalSegmentIndex]);

  const selectedPreset = useMemo(
    () => ACADEMIC_SCENARIO_PRESETS.find(p => p.id === selectedPresetId),
    [selectedPresetId],
  );

  const handleApplyPreset = useCallback((presetId: string) => {
    const preset = ACADEMIC_SCENARIO_PRESETS.find(p => p.id === presetId);
    setSelectedPresetId(presetId);
    if (!preset) return;

    setTotalRiverLengthM(preset.totalRiverLengthM);
    setLight(preset.lightIntensity);
    setTurbidity(preset.baseNtu);
    setTemperature(preset.temperature);
    setPollutantType(preset.pollutantType);
    setPollutantMix({ ...preset.pollutantMix });
    setPollutantDischarges(clonePresetDischarges(preset));
    setSegments(clonePresetSegments(preset));
    setCatalystPlacements(clonePresetPlacements(preset));

    const firstPlacement = preset.catalystPlacements[0];
    if (firstPlacement) {
      setCatalyst(firstPlacement.activity);
      setDoseRatio(firstPlacement.doseRatio);
    }
    setParetoFrontier(undefined);
    setBaselineConcentration(undefined);
    setRequiredDose(null);
  }, []);

  // ── 动画 ──────────────────────────────────────────────────
  const [animTime, setAnimTime] = useState(ANIM_DURATION);
  const [isRunning, setIsRunning] = useState(false);
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number | null>(null);

  // ── 阶段一：场景方案库 ────────────────────────────────────
  const [scenarios, setScenarios] = useState<ScenarioListItem[]>([]);
  const [scenarioLoading, setScenarioLoading] = useState(false);
  const [backendOnline, setBackendOnline] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveDesc, setSaveDesc] = useState('');
  const [saveTags, setSaveTags] = useState('');
  const [saveAuthor, setSaveAuthor] = useState('匿名研究者');

  // ── 仿真历史记录面板 ────────────────────────────────────
  const [simRecords, setSimRecords] = useState<SimulationRecordListItem[]>([]);
  const [simHistoryOpen, setSimHistoryOpen] = useState(false);
  const [, setSelectedRecordDetail] = useState<SimulationRecordListItem | null>(null);

  // ── 阶段二：仿真模式切换 ──────────────────────────────────
  const [useRemote, setUseRemote] = useState(false);
  const [simLoading, setSimLoading] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);
  const [computeTime, setComputeTime] = useState<number | null>(null);
  const [showDrifter, setShowDrifter] = useState(true);
  const [drifterInteractive, setDrifterInteractive] = useState(false);

  // ── 阶段三：多人协同 ──────────────────────────────────────
  const [wsMode, setWsMode] = useState(false);
  const [roomId, setRoomId] = useState('default-room');
  const [playerName, setPlayerName] = useState('研究者_A');
  const [wsConnected, setWsConnected] = useState(false);
  const [rooms, setRooms] = useState<RoomInfo[]>([]);
  const [players, setPlayers] = useState<Array<{ id: string; name: string; role: string }>>([]);
  const wsRef = useRef<WebSocket | null>(null);

  // ── 后端健康检查（启动时） ──────────────────────────────
  useEffect(() => {
    checkHealth().then(setBackendOnline);
  }, []);

  // ── 加载场景列表 ──────────────────────────────────────────
  const loadScenarios = useCallback(async () => {
    if (!backendOnline) return;
    setScenarioLoading(true);
    try {
      const list = await fetchScenarios();
      setScenarios(list);
    } catch {
      // 静默失败
    } finally {
      setScenarioLoading(false);
    }
  }, [backendOnline]);

  useEffect(() => { loadScenarios(); }, [loadScenarios]);

  // ── 加载仿真历史 ──────────────────────────────────────────
  const loadSimRecords = useCallback(async () => {
    if (!backendOnline) return;
    try {
      const records = await fetchSimulationRecords({ limit: 30 });
      setSimRecords(records);
    } catch { /* 静默 */ }
  }, [backendOnline]);

  useEffect(() => {
    if (simHistoryOpen) loadSimRecords();
  }, [simHistoryOpen, loadSimRecords]);

  // ── 保存当前仿真结果为历史记录 ────────────────────────────
  const handleSaveSimRecord = useCallback(async () => {
    if (!result || !backendOnline) return;
    try {
      const resultJson = JSON.stringify({
        optimal_x: result.optimalX,
        optimal_y: result.optimalY,
        optimal_segment_index: result.optimalSegmentIndex,
        segment_out_concentrations: result.segmentOutConcentrations,
        segment_metrics: result.segmentMetrics,
      });
      await saveSimulationRecord({
        light_intensity: light,
        catalyst_efficiency: catalyst,
        turbidity,
        segments: segments.map(s => ({
          id: s.id, velocity: s.velocity,
          angle: getSegmentAngle(s), directionAngle: getSegmentAngle(s), length: s.length,
          depth: s.depth ?? 1.5, width: s.width ?? 1.0,
        })),
        result_json: resultJson,
        compute_time_ms: computeTime ?? 0,
        tags: '',
        note: '',
      });
      if (simHistoryOpen) await loadSimRecords();
    } catch {
      alert('保存仿真记录失败');
    }
  }, [result, backendOnline, light, catalyst, turbidity, segments, computeTime, simHistoryOpen, loadSimRecords]);

  // ── 动画控制 ──────────────────────────────────────────────
  const clearTimer = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    lastFrameRef.current = null;
  }, []);

  // ── 仿真计算（本地 or 远程） ──────────────────────────────
  useEffect(() => {
    if (useRemote) {
      // ── 阶段二: 远程 API 调用 ───────────────────────────
      let cancelled = false;
      setSimLoading(true);
      setSimError(null);
      runSimulation({
        light_intensity: light,
        base_ntu: turbidity,
        pollutant_type: pollutantType,
        segments: segments.map(s => ({
          id: s.id,
          velocity: s.velocity,
          angle: getSegmentAngle(s),
          directionAngle: getSegmentAngle(s),
          length: s.length,
          depth: s.depth ?? 1.5,
          width: s.width ?? 1.0,
        })),
      }).then(apiRes => {
        if (cancelled) return;
        setResult(apiResultToSimResult(apiRes));
        setComputeTime(apiRes.compute_time_ms);
        setSimLoading(false);
      }).catch(err => {
        if (cancelled) return;
        setSimError(err instanceof Error ? err.message : String(err));
        setSimLoading(false);
        // 回退到本地计算
        setUseRemote(false);
      });

      return () => { cancelled = true; };
    } else {
      // ── 本地计算（v4 引擎） ──────────────────────────────
      setSimLoading(false);
      setSimError(null);
      setComputeTime(null);
      const v4Params: SimulationParamsV3 = {
        gridWidth: GRID_W,
        gridHeight: GRID_H,
        segments: segments as any,
        lightIntensity: light,
        baseNtu: turbidity,
        totalRiverLengthM,
        temperature,
        pollutantType,
        pollutantMix,
        customPollutants,
        pollutantDischarges,
        catalystPlacements: effectivePlacements.length > 0 ? effectivePlacements : undefined,
      };
      const res = simulatePurification(v4Params);
      setResult(res);
    }
    // 重置动画
    clearTimer();
    setAnimTime(ANIM_DURATION);
    setIsRunning(false);
  }, [segments, light, catalyst, depth, turbidity, totalRiverLengthM, temperature, pollutantType, pollutantMix, customPollutants, pollutantDischarges, doseRatio, effectivePlacements, useRemote]); // eslint-disable-line

  const handleStart = useCallback(() => {
    if (isRunning) return;
    if (animTime >= ANIM_DURATION) setAnimTime(0);
    setIsRunning(true);
  }, [isRunning, animTime]);

  useEffect(() => {
    if (!isRunning) {
      clearTimer();
      return;
    }

    lastFrameRef.current = performance.now();
    const tick = (now: number) => {
      const last = lastFrameRef.current ?? now;
      const delta = Math.min(0.08, Math.max(0, (now - last) / 1000));
      lastFrameRef.current = now;
      setAnimTime(prev => {
        const next = Math.min(ANIM_DURATION, prev + delta);
        if (next >= ANIM_DURATION) {
          setIsRunning(false);
        }
        return next;
      });
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return clearTimer;
  }, [isRunning, clearTimer]);

  const handlePause = useCallback(() => { clearTimer(); setIsRunning(false); }, [clearTimer]);
  const handleReset = useCallback(() => { clearTimer(); setIsRunning(false); setAnimTime(0); }, [clearTimer]);
  useEffect(() => clearTimer, [clearTimer]);

  const animProgress = Math.min(animTime / ANIM_DURATION, 1);

  // ── 自动投药优化 ──────────────────────────────────────────
  const handleOptimize = useCallback(async () => {
    setIsOptimizing(true);
    try {
      const payload = {
        light_intensity: light,
        base_ntu: turbidity,
        pollutant_type: pollutantType,
        segments: segments.map(s => ({
          id: s.id,
          velocity: s.velocity,
          angle: getSegmentAngle(s),
          directionAngle: getSegmentAngle(s),
          length: s.length,
          depth: s.depth ?? 1.5,
          width: s.width ?? 1.0,
        })),
        max_dosing_points: maxDosingPoints,
        position_grid_size: 10,
      };
      const res = await fetch('http://localhost:8000/api/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      // API 返回 snake_case → 转换为前端 camelCase 类型
      const mappedPareto: ParetoPoint[] = (data.pareto_frontier ?? []).map((p: any) => ({
        dosingCount: p.dosing_count,
        finalConcentration: p.final_concentration,
        dosingPoints: (p.dosing_points ?? []).map((dp: any) => ({
          segmentIndex: dp.segment_index,
          positionRatio: dp.position_ratio,
          activity: dp.activity,
          doseRatio: dp.dose_ratio,
        })),
        classIMet: p.class_i_met,
        waterQualityClass: p.water_quality_class ?? '劣V',
        computeTimeMs: p.compute_time_ms,
      }));
      setParetoFrontier(mappedPareto);
      setBaselineConcentration(data.baseline_concentration);
      // 自动应用最优方案
      if (data.optimal?.dosing_points) {
        const placements: CatalystPlacement[] = data.optimal.dosing_points.map(
          (dp: any) => ({
            segmentIndex: dp.segment_index,
            activity: dp.activity,
            doseRatio: dp.dose_ratio,
            effectiveAfterRatio: dp.position_ratio,
          })
        );
        setCatalystPlacements(placements);
      }
    } catch (err) {
      console.error('优化失败:', err);
    } finally {
      setIsOptimizing(false);
    }
  }, [light, turbidity, pollutantType, segments, maxDosingPoints]);

  // 帕累托选点处理
  const handleSelectParetoPoint = useCallback((point: ParetoPoint) => {
    const placements: CatalystPlacement[] = point.dosingPoints.map(dp => ({
      segmentIndex: dp.segmentIndex,
      activity: dp.activity,
      doseRatio: dp.doseRatio,
      effectiveAfterRatio: dp.positionRatio,
    }));
    setCatalystPlacements(placements);
  }, []);

  // ── 反向投药计算 ──────────────────────────────────────────
  const handleCalculateDose = useCallback(async () => {
    setIsCalculatingDose(true);
    setRequiredDose(null);
    try {
      const res = await fetch('http://localhost:8000/api/calculate-dose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_class: targetWaterClass,
          pollutant_type: pollutantType,
          segments: segments.map(s => ({
            id: s.id,
            velocity: s.velocity,
            angle: getSegmentAngle(s),
            directionAngle: getSegmentAngle(s),
            length: s.length,
            depth: s.depth ?? 1.5,
            width: s.width ?? 1.0,
          })),
          light_intensity: light,
          base_ntu: turbidity,
        }),
      });
      const data = await res.json();
      setRequiredDose(data.required_dose_ratio);
      if (data.required_dose_ratio > 0) {
        setDoseRatio(data.required_dose_ratio);
      }
    } catch (err) {
      console.error('剂量计算失败:', err);
    } finally {
      setIsCalculatingDose(false);
    }
  }, [targetWaterClass, pollutantType, segments, light, turbidity]);

  // ── 阶段一：保存场景 ──────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!saveName.trim()) return;
    try {
      await saveScenario({
        name: saveName.trim(),
        description: saveDesc.trim(),
        light_intensity: light,
        catalyst_efficiency: catalyst,
        river_depth: depth,
        turbidity,
        segments: segments.map(s => ({
          id: s.id, velocity: s.velocity,
          angle: getSegmentAngle(s), directionAngle: getSegmentAngle(s), length: s.length,
          depth: s.depth ?? 1.5, width: s.width ?? 1.0,
        })),
        author: saveAuthor.trim() || '匿名研究者',
        tags: saveTags.trim(),
      });
      setSaveDialogOpen(false);
      setSaveName('');
      setSaveDesc('');
      setSaveTags('');
      await loadScenarios();
    } catch {
      alert('保存失败，请确认后端已启动');
    }
  }, [saveName, saveDesc, saveTags, saveAuthor, light, catalyst, depth, turbidity, segments, loadScenarios]);

  // ── 阶段一：加载场景 ──────────────────────────────────────
  const handleLoad = useCallback(async (id: number) => {
    try {
      const list = await fetchScenarios();
      const s = list.find(x => x.id === id);
      if (!s) return;
      setSelectedPresetId('');
      setTotalRiverLengthM(DEFAULT_TOTAL_RIVER_LENGTH_M);
      setLight(s.light_intensity);
      setCatalyst(s.catalyst_efficiency);
      setDepth(s.river_depth);
      setTurbidity(s.turbidity);
      setPollutantMix({ [pollutantType]: 1 });
      setPollutantDischarges([]);
      setSegments(s.segments.map(seg => ({
        id: seg.id,
        velocity: seg.velocity,
        angle: seg.angle ?? seg.directionAngle ?? 0,
        directionAngle: seg.angle ?? seg.directionAngle ?? 0,
        length: seg.length,
        depth: (seg as any).depth ?? 1.5,
        width: (seg as any).width ?? 1.0,
      })));
    } catch {
      alert('加载失败，请确认后端已启动');
    }
  }, [pollutantType]);

  const handleDelete = useCallback(async (id: number) => {
    if (!confirm('确认删除此场景？')) return;
    try {
      await deleteScenario(id);
      await loadScenarios();
    } catch {
      alert('删除失败');
    }
  }, [loadScenarios]);

  // ── 阶段三：WebSocket 连接 ────────────────────────────────
  const connectRoom = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    const ws = connectWS(roomId, playerName);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
      fetchRooms().then(setRooms).catch(() => {});
    };

    ws.onmessage = (event) => {
      try {
        const msg: WSMessage = JSON.parse(event.data);
        if (msg.type === 'state_sync') {
          // 同步河流状态
          const p = msg.payload as Record<string, unknown>;
          if (p.light_intensity !== undefined) setLight(p.light_intensity as number);
          if (p.catalyst_efficiency !== undefined) setCatalyst(p.catalyst_efficiency as number);
          if (p.river_depth !== undefined) setDepth(p.river_depth as number);
          if (p.turbidity !== undefined) setTurbidity(p.turbidity as number);
        } else if (msg.type === 'player_list') {
          setPlayers((msg.payload.players || []) as Array<{ id: string; name: string; role: string }>);
        } else if (msg.type === 'join' || msg.type === 'leave') {
          fetchRooms().then(setRooms).catch(() => {});
        } else if (msg.type === 'room_list') {
          setRooms((msg.payload.rooms || []) as RoomInfo[]);
        }
      } catch { /* ignore malformed */ }
    };

    ws.onclose = () => {
      setWsConnected(false);
      setPlayers([]);
    };

    ws.onerror = () => {
      setWsConnected(false);
    };
  }, [roomId, playerName]);

  const disconnectRoom = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    setWsConnected(false);
    setPlayers([]);
  }, []);

  const broadcastParam = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({
      type: 'param_update',
      room_id: roomId,
      player_id: playerName,
      payload: {
        light_intensity: light,
        catalyst_efficiency: catalyst,
        river_depth: depth,
        turbidity,
      },
    }));
  }, [roomId, playerName, light, catalyst, depth, turbidity]);

  // ── 计算 ──────────────────────────────────────────────────
  const finalConc = useMemo(() => {
    if (!result?.segmentOutConcentrations.length) return 1;
    return result.segmentOutConcentrations[result.segmentOutConcentrations.length - 1];
  }, [result]);

  return (
    <div className="app-shell min-h-screen p-5 font-sans">
      <div className="app-frame max-w-[1440px] mx-auto flex flex-col gap-5">
        {/* ── Header ──────────────────────────────────────── */}
        <header className="app-header">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h1 className="neon-title text-2xl font-bold tracking-tight">
                城市河流净化观察台
              </h1>
              <p className="app-subtitle text-sm mt-1">
                像调一条真实河道一样，观察阳光、水流、浑浊和净化效果
              </p>
            </div>
            <div className="flex items-center gap-3">
              <WeatherWaterStatus
                light={light}
                turbidity={turbidity}
                temperature={temperature}
                backendOnline={backendOnline}
              />
              <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full ${
                backendOnline ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'
              }`}>
                <span className={`w-2 h-2 rounded-full ${backendOnline ? 'bg-emerald-400' : 'bg-red-400'}`} />
                {backendOnline ? '后端在线' : '后端离线'}
              </span>
            </div>
          </div>
        </header>

        {/* ── 内置学术级预设场景库 ───────────────────────────── */}
        <div className="toolbar-glass bg-white/10 backdrop-blur rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap">
          <span className="text-slate-300 text-sm font-medium whitespace-nowrap">
            常见河道场景
          </span>
          <select
            className="bg-slate-700 text-white text-sm px-3 py-1.5 rounded-lg border border-slate-600 focus:ring-2 focus:ring-cyan-400 min-w-[300px]"
            value={selectedPresetId}
            onChange={e => handleApplyPreset(e.target.value)}
            aria-label="选择常见河道场景"
          >
            <option value="">— 选一条类似的河道 —</option>
            {ACADEMIC_SCENARIO_PRESETS.map(preset => (
              <option key={preset.id} value={preset.id}>
                {preset.name} · {preset.domain}
              </option>
            ))}
          </select>
          {selectedPreset && (
            <div className="flex-1 min-w-[280px] text-xs text-slate-300 leading-relaxed">
              <span className="text-cyan-200 font-semibold">{selectedPreset.domain}</span>
              <span className="mx-2 text-slate-500">|</span>
              <span>{formatPollutantMix(selectedPreset.pollutantMix)}</span>
              <span className="mx-2 text-slate-500">|</span>
              <span>{(selectedPreset.totalRiverLengthM / 1000).toFixed(1)} km · 浑浊 {selectedPreset.baseNtu} NTU · 阳光 {selectedPreset.lightIntensity}</span>
              <p className="text-slate-400 mt-1">{selectedPreset.researchValue}</p>
            </div>
          )}
        </div>

        {/* ── 场景方案库工具栏（阶段一）────────────────────── */}
        {backendOnline && (
          <div className="toolbar-glass bg-white/10 backdrop-blur rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap">
            <span className="text-slate-300 text-sm font-medium whitespace-nowrap">
              📁 场景方案库
            </span>

            {/* 场景加载下拉 */}
            <select
              className="bg-slate-700 text-white text-sm px-3 py-1.5 rounded-lg border border-slate-600 focus:ring-2 focus:ring-blue-400 min-w-[180px] disabled:opacity-40"
              value=""
              onChange={e => {
                if (e.target.value) handleLoad(Number(e.target.value));
                e.target.value = '';
              }}
              disabled={scenarioLoading || scenarios.length === 0}
            >
              <option value="">
                {scenarioLoading ? '加载中...' : scenarios.length === 0 ? '（暂无场景）' : '— 选择预设场景 —'}
              </option>
              {scenarios.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} — {s.author}
                </option>
              ))}
            </select>

            {/* 保存按钮 */}
            <button
              onClick={() => setSaveDialogOpen(true)}
              className="px-3 py-1.5 bg-blue-500/80 hover:bg-blue-500 text-white text-sm rounded-lg transition"
            >
              💾 保存当前配置
            </button>

            {/* 删除当前选中场景 */}
            {scenarios.length > 0 && (
              <button
                onClick={() => {
                  const select = document.querySelector('select') as HTMLSelectElement;
                  if (select?.value) handleDelete(Number(select.value));
                }}
                className="px-3 py-1.5 bg-red-500/50 hover:bg-red-500/70 text-white text-sm rounded-lg transition"
                title="删除列表中选中的场景"
              >
                🗑 删除
              </button>
            )}

            {/* 快速标签筛选 */}
            <div className="flex gap-1.5 ml-1">
              {['暴雨', '城市', '山地', '晴天'].map(tag => (
                <button
                  key={tag}
                  onClick={async () => {
                    try {
                      const list = await fetchScenarios(tag);
                      setScenarios(list);
                    } catch {}
                  }}
                  className="text-xs px-2 py-1 rounded-full bg-slate-700 hover:bg-slate-600 text-slate-300 transition"
                >
                  {tag}
                </button>
              ))}
              <button
                onClick={() => loadScenarios()}
                className="text-xs px-2 py-1 rounded-full bg-slate-700 hover:bg-slate-600 text-slate-400 transition"
              >
                全部
              </button>
            </div>

            {/* 仿真历史入口 */}
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={handleSaveSimRecord}
                disabled={!result}
                className="px-3 py-1.5 bg-emerald-500/60 hover:bg-emerald-500 disabled:opacity-30 disabled:cursor-not-allowed text-white text-sm rounded-lg transition"
                title="将当前仿真结果保存到历史记录"
              >
                📝 记录本次仿真
              </button>
              <button
                onClick={() => setSimHistoryOpen(v => !v)}
                className="px-3 py-1.5 bg-slate-600/60 hover:bg-slate-500 text-white text-sm rounded-lg transition flex items-center gap-1"
              >
                📊 仿真历史 {simRecords.length > 0 && `(${simRecords.length})`}
              </button>
            </div>
          </div>
        )}

        {/* ── 仿真历史面板 ──────────────────────────────────── */}
        {simHistoryOpen && backendOnline && (
          <div className="toolbar-glass bg-white/10 backdrop-blur rounded-xl px-4 py-3">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white text-sm font-bold">📊 仿真历史记录</h3>
              <button
                onClick={() => setSimHistoryOpen(false)}
                className="text-slate-400 hover:text-white text-xs transition"
              >
                ✕ 关闭
              </button>
            </div>
            {simRecords.length === 0 ? (
              <p className="text-slate-400 text-xs">暂无仿真记录，运行云端仿真后可在此查看历史</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-slate-300">
                  <thead>
                    <tr className="border-b border-white/10 text-slate-400">
                      <th className="py-1.5 px-2 text-left">#</th>
                      <th className="py-1.5 px-2 text-left">光照</th>
                      <th className="py-1.5 px-2 text-left">催化剂</th>
                      <th className="py-1.5 px-2 text-left">浊度</th>
                      <th className="py-1.5 px-2 text-left">最终浓度</th>
                      <th className="py-1.5 px-2 text-left">最佳段</th>
                      <th className="py-1.5 px-2 text-left">耗时</th>
                      <th className="py-1.5 px-2 text-left">时间</th>
                      <th className="py-1.5 px-2 text-left">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {simRecords.map(rec => {
                      const finalConc = (rec.result as any)?.segment_out_concentrations?.slice(-1)?.[0];
                      const optSeg = (rec.result as any)?.optimal_segment_index;
                      return (
                        <tr key={rec.id} className="border-b border-white/5 hover:bg-white/5 transition">
                          <td className="py-1.5 px-2">{rec.id}</td>
                          <td className="py-1.5 px-2">{rec.light_intensity.toFixed(1)}</td>
                          <td className="py-1.5 px-2">{rec.catalyst_efficiency.toFixed(1)}</td>
                          <td className="py-1.5 px-2">{rec.turbidity.toFixed(0)}</td>
                          <td className="py-1.5 px-2 font-mono">{(finalConc !== undefined ? finalConc * 100 : 100).toFixed(1)}%</td>
                          <td className="py-1.5 px-2">{optSeg !== undefined ? `段落${optSeg + 1}` : '—'}</td>
                          <td className="py-1.5 px-2 font-mono text-slate-400">{rec.compute_time_ms.toFixed(1)}ms</td>
                          <td className="py-1.5 px-2 text-slate-400">{new Date(rec.created_at).toLocaleTimeString('zh-CN')}</td>
                          <td className="py-1.5 px-2">
                            <button
                              onClick={() => setSelectedRecordDetail(rec)}
                              className="text-blue-400 hover:underline mr-2"
                            >
                              详情
                            </button>
                            <button
                              onClick={async () => {
                                if (!confirm('确认删除？')) return;
                                try {
                                  await deleteSimulationRecord(rec.id);
                                  await loadSimRecords();
                                } catch { alert('删除失败'); }
                              }}
                              className="text-red-400 hover:underline"
                            >
                              删除
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── 保存对话框 ────────────────────────────────────── */}
        {saveDialogOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setSaveDialogOpen(false)}>
            <div className="bg-white rounded-xl p-6 shadow-2xl w-[400px] max-w-[90vw]" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-gray-800 mb-4">保存场景预设</h3>
              <div className="flex flex-col gap-3">
                <input
                  className="w-full p-2 border border-gray-300 rounded-lg text-sm"
                  placeholder="场景名称（必填）*"
                  value={saveName}
                  onChange={e => setSaveName(e.target.value)}
                  autoFocus
                />
                <input
                  className="w-full p-2 border border-gray-300 rounded-lg text-sm"
                  placeholder="简要描述（可选）"
                  value={saveDesc}
                  onChange={e => setSaveDesc(e.target.value)}
                />
                <input
                  className="w-full p-2 border border-gray-300 rounded-lg text-sm"
                  placeholder="标签，用逗号分隔（可选）"
                  value={saveTags}
                  onChange={e => setSaveTags(e.target.value)}
                />
                <input
                  className="w-full p-2 border border-gray-300 rounded-lg text-sm"
                  placeholder="作者署名"
                  value={saveAuthor}
                  onChange={e => setSaveAuthor(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2 mt-5">
                <button onClick={() => setSaveDialogOpen(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition">
                  取消
                </button>
                <button onClick={handleSave} className="px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition">
                  保存
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── 工具栏（阶段二 + 阶段三）────────────────────── */}
        <div className="toolbar-glass bg-white/10 backdrop-blur rounded-xl px-4 py-2 flex items-center gap-4 flex-wrap">
          {/* 阶段二：仿真模式 */}
          <div className="flex items-center gap-2">
            <span className="text-slate-300 text-xs font-medium whitespace-nowrap">
              计算方式:
            </span>
            <button
              onClick={() => setUseRemote(v => !v)}
              disabled={!backendOnline}
              className={`px-3 py-1 text-xs rounded-lg transition font-medium ${
                useRemote
                  ? 'bg-purple-500/80 text-white'
                  : 'bg-slate-700 text-slate-300'
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              {useRemote ? '云端计算' : '本地计算'}
            </button>
            {simLoading && (
              <span className="text-yellow-400 text-xs animate-pulse">计算中...</span>
            )}
            {simError && (
              <span className="text-red-400 text-xs" title={simError}>
                ⚠️ 已回退本地计算
              </span>
            )}
            {computeTime !== null && (
              <span className="text-emerald-400 text-xs">
                {computeTime.toFixed(1)}ms
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-300 text-xs font-medium whitespace-nowrap">
              漂流小人:
            </span>
            <button
              type="button"
              onClick={() => setShowDrifter(v => !v)}
              className={`px-3 py-1 text-xs rounded-lg transition font-medium ${
                showDrifter
                  ? 'bg-cyan-500/75 text-white'
                  : 'bg-slate-700 text-slate-300'
              }`}
              aria-pressed={showDrifter}
            >
              {showDrifter ? '显示中' : '已隐藏'}
            </button>
            <button
              type="button"
              onClick={() => setDrifterInteractive(v => !v)}
              disabled={!showDrifter}
              className={`px-3 py-1 text-xs rounded-lg transition font-medium disabled:opacity-40 disabled:cursor-not-allowed ${
                showDrifter && drifterInteractive
                  ? 'bg-emerald-500/75 text-white'
                  : 'bg-slate-700 text-slate-300'
              }`}
              aria-pressed={drifterInteractive}
            >
              {drifterInteractive ? '可拖动探查' : '跟随漂流'}
            </button>
          </div>

          {/* 阶段三：多人协同 */}
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-slate-300 text-xs font-medium whitespace-nowrap">
              一起观察:
            </span>
            {!wsMode ? (
              <button
                onClick={() => setWsMode(true)}
                disabled={!backendOnline}
                className="px-3 py-1 text-xs rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition disabled:opacity-40"
              >
                进入协同模式
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  className="w-28 p-1 text-xs bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-400"
                  placeholder="房间ID"
                  value={roomId}
                  onChange={e => setRoomId(e.target.value)}
                  disabled={wsConnected}
                />
                <input
                  className="w-24 p-1 text-xs bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-400"
                  placeholder="昵称"
                  value={playerName}
                  onChange={e => setPlayerName(e.target.value)}
                  disabled={wsConnected}
                />
                {!wsConnected ? (
                  <button onClick={connectRoom} className="px-3 py-1 text-xs rounded-lg bg-emerald-500/80 hover:bg-emerald-500 text-white transition">
                    ▶ 加入
                  </button>
                ) : (
                  <>
                    <span className="text-emerald-400 text-xs flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      在线 ({players.length}人)
                    </span>
                    <button onClick={broadcastParam} className="px-2 py-1 text-xs rounded bg-blue-500/60 hover:bg-blue-500/80 text-white transition">
                      同步参数
                    </button>
                    <button onClick={disconnectRoom} className="px-2 py-1 text-xs rounded bg-red-500/60 hover:bg-red-500/80 text-white transition">
                      离开
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="main-grid flex gap-5 items-start">
          {/* 左栏：调水况 */}
          <div className="w-96 shrink-0 sticky top-5 max-h-[calc(100vh-2.5rem)] flex flex-col gap-4">
            <SegmentControlPanel
              segments={segments}
              onSegmentsChange={setSegments}
              totalRiverLengthM={totalRiverLengthM}
              setTotalRiverLengthM={setTotalRiverLengthM}
              light={light} setLight={setLight}
              catalyst={catalyst} setCatalyst={setCatalyst}
              depth={depth} setDepth={setDepth}
              turbidity={turbidity} setTurbidity={setTurbidity}
              temperature={temperature} setTemperature={setTemperature}
              pollutantType={pollutantType} setPollutantType={setPollutantType}
              pollutantMix={pollutantMix}
              setPollutantMix={setPollutantMix}
              customPollutants={customPollutants}
              setCustomPollutants={setCustomPollutants}
              pollutantDischarges={pollutantDischarges}
              setPollutantDischarges={setPollutantDischarges}
              doseRatio={doseRatio} setDoseRatio={setDoseRatio}
              catalystPlacements={catalystPlacements}
              setCatalystPlacements={setCatalystPlacements}
            />
            <RiverObservationNote
              light={light}
              turbidity={turbidity}
              temperature={temperature}
              finalConcentration={finalConc}
              pollutantType={pollutantType}
              customPollutants={customPollutants}
            />
            {/* WebSocket 玩家列表 */}
            {wsConnected && players.length > 0 && (
              <div className="bg-white/10 backdrop-blur rounded-xl p-3 text-white">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">
                  👥 同房间玩家
                </p>
                <div className="flex flex-col gap-1">
                  {players.map(p => (
                    <div key={p.id} className="flex items-center gap-2 text-sm">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      <span>{p.name}</span>
                      <span className="text-xs text-slate-400 ml-auto italic">{p.role}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* 活跃房间列表 */}
            {wsMode && !wsConnected && rooms.length > 0 && (
              <div className="bg-white/10 backdrop-blur rounded-xl p-3 text-white">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">
                  🏠 活跃房间
                </p>
                <div className="flex flex-col gap-1">
                  {rooms.map(r => (
                    <button
                      key={r.room_id}
                      onClick={() => setRoomId(r.room_id)}
                      className="text-sm text-left px-2 py-1 rounded hover:bg-slate-700 transition flex justify-between"
                    >
                      <span>{r.name || r.room_id}</span>
                      <span className="text-xs text-slate-400">{r.player_count}人</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 右栏：主视图 + 数据 */}
          <div className="flex-1 flex flex-col gap-4">
            {/* 顶部指标栏 */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <div className="metric-card">
                <p className="text-xs text-slate-400">建议先处理这里</p>
                <p className="text-2xl font-bold">段落 {(result?.optimalSegmentIndex ?? 0) + 1}</p>
              </div>
              <div className="metric-card">
                <p className="text-xs text-slate-400">这条河的长度</p>
                <p className="text-2xl font-bold">{segments.length} 段</p>
                <p className="text-xs text-slate-400 mt-0.5">{(totalRiverLengthM / 1000).toFixed(1)} km</p>
              </div>
              <div className="metric-card">
                <p className="text-xs text-slate-400">今天水温</p>
                <p className="text-2xl font-bold">{temperature.toFixed(0)}°C</p>
              </div>
              <div className={`metric-card ${finalConc < 0.3 ? 'text-emerald-200' : finalConc < 0.6 ? 'text-yellow-200' : 'text-red-200'}`}>
                <p className="text-xs opacity-70">下游还剩多少污染</p>
                <p className="text-2xl font-bold">{(finalConc * 100).toFixed(1)}%</p>
              </div>
              {/* 动画控制按钮 */}
              <div className="metric-card flex flex-col gap-2">
                <p className="text-xs text-slate-400">看水流变化</p>
                <div className="flex gap-2">
                  <button
                    onClick={isRunning ? handlePause : handleStart}
                    className={`sci-fi-button flex-1 px-2 py-1 rounded-lg text-xs font-bold transition-all ${
                      isRunning
                        ? 'bg-yellow-400/80 hover:bg-yellow-300 text-yellow-900'
                        : 'bg-emerald-500/80 hover:bg-emerald-400 text-white'
                    }`}
                  >
                    {isRunning ? '⏸ 暂停' : animTime >= ANIM_DURATION ? '▶ 重播' : animTime > 0 ? '▶ 继续' : '▶ 开始'}
                  </button>
                  <button
                    onClick={handleReset}
                    className="sci-fi-button flex-1 px-2 py-1 rounded-lg text-xs font-bold bg-slate-500/60 hover:bg-slate-400/60 text-white transition-all"
                  >
                    ↺ 重置
                  </button>
                </div>
                <div className="w-full bg-white/10 rounded-full h-1.5">
                  <div
                    className="bg-blue-400 h-1.5 rounded-full transition-all progress-neon"
                    style={{ width: `${animProgress * 100}%` }}
                  />
                </div>
              </div>
            </div>

            {/* 2D 仿真视图 */}
            <div className="canvas-shell h-[340px]">
              <RiverCanvas
                result={result as SimulationResultV3 | null}
                gridWidth={GRID_W}
                gridHeight={GRID_H}
                animProgress={animProgress}
                catalystPlacements={effectivePlacements}
                segments={segments}
                showDrifter={showDrifter}
                drifterInteractive={drifterInteractive}
              />
            </div>

            {/* 折线图仪表盘 */}
            {result && (
              <Dashboard
                riverPath={result.riverPath}
                optX={result.optimalX}
                optY={result.optimalY}
                segmentOutConcentrations={result.segmentOutConcentrations}
                segmentOutNtu={(result as SimulationResultV3).segmentOutNtu}
                segmentMetrics={result.segmentMetrics}
                optimalSegmentIndex={result.optimalSegmentIndex}
                animProgress={animProgress}
                waterQualityStandard={(result as SimulationResultV3).waterQualityStandard}
                paretoFrontier={paretoFrontier}
                baselineConcentration={baselineConcentration}
                isOptimizing={isOptimizing}
                onOptimize={handleOptimize}
                onSelectParetoPoint={handleSelectParetoPoint}
                maxDosingPoints={maxDosingPoints}
                onMaxDosingPointsChange={setMaxDosingPoints}
                targetWaterClass={targetWaterClass}
                onTargetWaterClassChange={setTargetWaterClass}
                requiredDose={requiredDose}
                isCalculatingDose={isCalculatingDose}
                onCalculateDose={handleCalculateDose}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
