import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { SegmentControlPanel } from './components/SegmentControlPanel';
import { Dashboard } from './components/Dashboard';
import { RiverCanvas } from './components/RiverCanvas';
import { simulatePurification, type SimulationResult, type RiverSegment } from './engine/simulation';

// ── 后端 API ─────────────────────────────────────────────────
import {
  fetchScenarios,
  saveScenario,
  deleteScenario,
  updateScenario,
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
  { id: 1, velocity: 2.0, directionAngle: 0,  length: 1/3, depth: 1.5, width: 1.0 },
  { id: 2, velocity: 1.5, directionAngle: 15, length: 1/3, depth: 2.0, width: 1.2 },
  { id: 3, velocity: 2.5, directionAngle: -10, length: 1/3, depth: 1.0, width: 0.8 },
];

const ANIM_DURATION = 6;
const ANIM_STEP = 0.05;

// ═══════════════════════════════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════════════════════════════

/** 将 API 返回的仿真结果转换为前端 SimulationResult 类型 */
function apiResultToSimResult(r: SimulateResult): SimulationResult {
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
    })),
    riverPath: r.river_path.map(p => ({
      x: p.x,
      y: p.y,
      concentration: p.concentration,
      segIndex: p.seg_index,
      widthPx: p.width_px ?? r.river_width_px,
    })),
    riverWidthPx: r.river_width_px,
    segmentWidthsPx: r.segment_widths_px ?? [],
  };
}

// ═══════════════════════════════════════════════════════════════
//  主组件
// ═══════════════════════════════════════════════════════════════

function App() {
  // ── 仿真参数 ──────────────────────────────────────────────
  const [segments, setSegments] = useState<RiverSegment[]>(DEFAULT_SEGMENTS);
  const [light, setLight] = useState(1.0);
  const [catalyst, setCatalyst] = useState(0.8);
  const [depth, setDepth] = useState(1.5);
  const [turbidity, setTurbidity] = useState(5);
  const [result, setResult] = useState<SimulationResult | null>(null);

  // ── 动画 ──────────────────────────────────────────────────
  const [animTime, setAnimTime] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
  const [selectedRecordDetail, setSelectedRecordDetail] = useState<SimulationRecordListItem | null>(null);

  // ── 阶段二：仿真模式切换 ──────────────────────────────────
  const [useRemote, setUseRemote] = useState(false);
  const [simLoading, setSimLoading] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);
  const [computeTime, setComputeTime] = useState<number | null>(null);

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
          directionAngle: s.directionAngle, length: s.length,
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
        pollutant_type: 'organic_macromolecule',
        segments: segments.map(s => ({
          id: s.id,
          velocity: s.velocity,
          directionAngle: s.directionAngle,
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
      // ── 本地计算（原逻辑） ──────────────────────────────
      setSimLoading(false);
      setSimError(null);
      setComputeTime(null);
      const res = simulatePurification({
        gridWidth: GRID_W,
        gridHeight: GRID_H,
        segments,
        lightIntensity: light,
        catalystEfficiency: catalyst,
        turbidity,
      });
      setResult(res);
    }
    // 重置动画
    clearTimer();
    setAnimTime(0);
    setIsRunning(false);
  }, [segments, light, catalyst, depth, turbidity, useRemote]); // eslint-disable-line

  // ── 动画控制 ──────────────────────────────────────────────
  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const handleStart = useCallback(() => {
    if (isRunning) return;
    setIsRunning(true);
    timerRef.current = setInterval(() => {
      setAnimTime(prev => {
        if (prev >= ANIM_DURATION) {
          clearInterval(timerRef.current!);
          timerRef.current = null;
          setIsRunning(false);
          return ANIM_DURATION;
        }
        return prev + ANIM_STEP;
      });
    }, ANIM_STEP * 1000);
  }, [isRunning]);

  const handlePause = useCallback(() => { clearTimer(); setIsRunning(false); }, [clearTimer]);
  const handleReset = useCallback(() => { clearTimer(); setIsRunning(false); setAnimTime(0); }, [clearTimer]);
  useEffect(() => clearTimer, [clearTimer]);

  const animProgress = Math.min(animTime / ANIM_DURATION, 1);

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
          directionAngle: s.directionAngle, length: s.length,
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
      setLight(s.light_intensity);
      setCatalyst(s.catalyst_efficiency);
      setDepth(s.river_depth);
      setTurbidity(s.turbidity);
      setSegments(s.segments.map(seg => ({
        id: seg.id,
        velocity: seg.velocity,
        directionAngle: seg.directionAngle,
        length: seg.length,
        depth: (seg as any).depth ?? 1.5,
        width: (seg as any).width ?? 1.0,
      })));
    } catch {
      alert('加载失败，请确认后端已启动');
    }
  }, []);

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
    <div className="min-h-screen bg-gradient-to-br from-slate-800 to-slate-900 p-5 font-sans text-gray-800">
      <div className="max-w-screen-xl mx-auto flex flex-col gap-5">
        {/* ── Header ──────────────────────────────────────── */}
        <header className="text-white">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                🌊 河流光催化净化动态仿真系统
              </h1>
              <p className="text-slate-400 text-sm mt-1">
                基于微积分切片思想与指数衰减模型 · 前后端分离数字孪生系统
              </p>
            </div>
            {/* 后端状态指示器 */}
            <div className="flex items-center gap-3">
              <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full ${
                backendOnline ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'
              }`}>
                <span className={`w-2 h-2 rounded-full ${backendOnline ? 'bg-emerald-400' : 'bg-red-400'}`} />
                {backendOnline ? '后端在线' : '后端离线'}
              </span>
            </div>
          </div>
        </header>

        {/* ── 场景方案库工具栏（阶段一）────────────────────── */}
        {backendOnline && (
          <div className="bg-white/10 backdrop-blur rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap">
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
          <div className="bg-white/10 backdrop-blur rounded-xl px-4 py-3">
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

        {/* ── 高级工具栏（阶段二 + 阶段三）────────────────────── */}
        <div className="bg-white/10 backdrop-blur rounded-xl px-4 py-2 flex items-center gap-4 flex-wrap">
          {/* 阶段二：仿真模式 */}
          <div className="flex items-center gap-2">
            <span className="text-slate-300 text-xs font-medium whitespace-nowrap">
              仿真引擎:
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
              {useRemote ? '☁️ 云端 Python' : '💻 本地 TypeScript'}
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

          {/* 阶段三：多人协同 */}
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-slate-300 text-xs font-medium whitespace-nowrap">
              多人协同:
            </span>
            {!wsMode ? (
              <button
                onClick={() => setWsMode(true)}
                disabled={!backendOnline}
                className="px-3 py-1 text-xs rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition disabled:opacity-40"
              >
                👥 进入协同模式
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

        <div className="flex gap-5 items-start">
          {/* 左栏：参数控制 */}
          <div className="w-64 shrink-0 flex flex-col gap-4">
            <SegmentControlPanel
              segments={segments}
              onSegmentsChange={setSegments}
              light={light} setLight={setLight}
              catalyst={catalyst} setCatalyst={setCatalyst}
              depth={depth} setDepth={setDepth}
              turbidity={turbidity} setTurbidity={setTurbidity}
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
            <div className="grid grid-cols-4 gap-3">
              <div className="bg-white/10 text-white rounded-xl p-3 backdrop-blur">
                <p className="text-xs text-slate-400">最佳投放段落</p>
                <p className="text-2xl font-bold">段落 {(result?.optimalSegmentIndex ?? 0) + 1}</p>
              </div>
              <div className="bg-white/10 text-white rounded-xl p-3 backdrop-blur">
                <p className="text-xs text-slate-400">河流总段数</p>
                <p className="text-2xl font-bold">{segments.length} 段</p>
              </div>
              <div className={`rounded-xl p-3 backdrop-blur ${finalConc < 0.3 ? 'bg-emerald-500/30 text-emerald-200' : finalConc < 0.6 ? 'bg-yellow-500/30 text-yellow-200' : 'bg-red-500/30 text-red-200'}`}>
                <p className="text-xs opacity-70">出水口残留污染物</p>
                <p className="text-2xl font-bold">{(finalConc * 100).toFixed(1)}%</p>
              </div>
              {/* 动画控制按钮 */}
              <div className="bg-white/10 text-white rounded-xl p-3 backdrop-blur flex flex-col gap-2">
                <p className="text-xs text-slate-400">动画控制</p>
                <div className="flex gap-2">
                  <button
                    onClick={isRunning ? handlePause : handleStart}
                    className={`flex-1 px-2 py-1 rounded-lg text-xs font-bold transition-all ${
                      isRunning
                        ? 'bg-yellow-400/80 hover:bg-yellow-300 text-yellow-900'
                        : 'bg-emerald-500/80 hover:bg-emerald-400 text-white'
                    }`}
                  >
                    {isRunning ? '⏸ 暂停' : animTime > 0 ? '▶ 继续' : '▶ 开始'}
                  </button>
                  <button
                    onClick={handleReset}
                    className="flex-1 px-2 py-1 rounded-lg text-xs font-bold bg-slate-500/60 hover:bg-slate-400/60 text-white transition-all"
                  >
                    ↺ 重置
                  </button>
                </div>
                <div className="w-full bg-white/10 rounded-full h-1.5">
                  <div
                    className="bg-blue-400 h-1.5 rounded-full transition-all"
                    style={{ width: `${animProgress * 100}%` }}
                  />
                </div>
              </div>
            </div>

            {/* 2D 仿真视图 */}
            <div className="h-[340px]">
              <RiverCanvas
                result={result}
                gridWidth={GRID_W}
                gridHeight={GRID_H}
                animProgress={animProgress}
              />
            </div>

            {/* 折线图仪表盘 */}
            {result && (
              <Dashboard
                riverPath={result.riverPath}
                optX={result.optimalX}
                optY={result.optimalY}
                segmentOutConcentrations={result.segmentOutConcentrations}
                segmentMetrics={result.segmentMetrics}
                optimalSegmentIndex={result.optimalSegmentIndex}
                animProgress={animProgress}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
