/**
 * 后端 API 客户端 — 统一管理所有远程调用
 *
 * 阶段一: 场景预设方案库 CRUD
 * 阶段二: 云端仿真计算服务
 * 阶段三: WebSocket 多人协同
 */

// ── 配置 ─────────────────────────────────────────────────────
// 开发环境通过 Vite proxy 转发，生产环境使用同源或环境变量
const API_BASE = "";
const WS_BASE = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`;

// ── 类型复用（与后端 Pydantic Schemas 保持一致）───────────────

export interface RiverSegmentDTO {
  id: number;
  velocity: number;
  directionAngle: number;
  length: number;
  depth: number;
  width: number;
  /** 地形类型: "river" | "lake" */
  terrain?: string;
  /** 参考流量 Q (m³/s)，默认 10 */
  referenceDischarge?: number;
}

export interface ScenarioListItem {
  id: number;
  name: string;
  description: string;
  light_intensity: number;
  catalyst_efficiency: number;
  river_depth: number;
  turbidity: number;
  segments: RiverSegmentDTO[];
  author: string;
  tags: string;
  created_at: string;
}

export interface ScenarioCreatePayload {
  name: string;
  description: string;
  light_intensity: number;
  catalyst_efficiency: number;
  river_depth: number;
  turbidity: number;
  segments: RiverSegmentDTO[];
  author: string;
  tags: string;
}

export interface PollutantDischargeDTO {
  segment_index: number;
  position_ratio: number;
  pollutant_type: string;
  mass: number;
  discharge_type: string;
}

export interface CatalystPlacementDTO {
  segment_index: number;
  activity: number;
  dose_ratio: number;
}

export interface ConfluenceConfigDTO {
  river0_segment: number;
  river1_segment: number;
  river0_ratio: number;
  river1_ratio: number;
}

export interface SimulatePayload {
  light_intensity: number;
  base_ntu: number;
  pollutant_type: string;
  segments: RiverSegmentDTO[];
  pollutant_discharges?: PollutantDischargeDTO[];
  catalyst_placements?: CatalystPlacementDTO[];
  secondary_segments?: RiverSegmentDTO[];
  secondary_discharges?: PollutantDischargeDTO[];
  confluence_config?: ConfluenceConfigDTO;
}

export interface WaterQualityStandardDTO {
  class_i_met: boolean;
  residual_ratio: number;
  distance_to_standard?: number;
}

export interface SecondaryResultDTO {
  segment_out_concentrations: number[];
  segment_out_ntu: number[];
  river_path: PathPointDTO[];
}

export interface SimulateResult {
  optimal_x: number;
  optimal_y: number;
  optimal_segment_index: number;
  segment_out_concentrations: number[];
  segment_metrics: SegmentMetricsDTO[];
  river_path: PathPointDTO[];
  river_width_px: number;
  segment_widths_px?: number[];
  compute_time_ms: number;
  water_quality_standard: WaterQualityStandardDTO;
  segment_out_ntu: number[];
  secondary_result?: SecondaryResultDTO;
}

export interface SegmentMetricsDTO {
  seg_index: number;
  velocity: number;
  residence_time: number;
  effective_light: number;
  reaction_score: number;
  depth?: number;
  width?: number;
}

export interface PathPointDTO {
  x: number;
  y: number;
  concentration: number;
  seg_index: number;
  width_px?: number;
}

export interface RoomInfo {
  room_id: string;
  name: string;
  player_count: number;
}

// ── 阶段一: 场景预设方案库 ────────────────────────────────────

export async function fetchScenarios(tag?: string): Promise<ScenarioListItem[]> {
  const params = new URLSearchParams();
  if (tag) params.set("tag", tag);
  params.set("limit", "100");
  const res = await fetch(`${API_BASE}/api/scenarios?${params}`);
  if (!res.ok) throw new Error(`获取场景列表失败: ${res.status}`);
  return res.json();
}

export async function fetchScenario(id: number): Promise<ScenarioListItem> {
  const res = await fetch(`${API_BASE}/api/scenarios/${id}`);
  if (!res.ok) throw new Error(`获取场景详情失败: ${res.status}`);
  return res.json();
}

export async function saveScenario(data: ScenarioCreatePayload): Promise<ScenarioListItem> {
  const res = await fetch(`${API_BASE}/api/scenarios`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`保存场景失败: ${(err as { error?: { message?: string } }).error?.message || res.status}`);
  }
  return res.json();
}

export interface ScenarioUpdatePayload {
  name?: string;
  description?: string;
  light_intensity?: number;
  catalyst_efficiency?: number;
  river_depth?: number;
  turbidity?: number;
  segments?: RiverSegmentDTO[];
  author?: string;
  tags?: string;
}

export async function updateScenario(id: number, data: ScenarioUpdatePayload): Promise<ScenarioListItem> {
  const res = await fetch(`${API_BASE}/api/scenarios/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`更新场景失败: ${(err as { error?: { message?: string } }).error?.message || res.status}`);
  }
  return res.json();
}

export async function deleteScenario(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/scenarios/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`删除场景失败: ${res.status}`);
}

// ── 阶段二: 云端仿真计算服务 ──────────────────────────────────

export async function runSimulation(payload: SimulatePayload): Promise<SimulateResult> {
  const res = await fetch(`${API_BASE}/api/simulate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`仿真计算失败: ${(err as { error?: { message?: string } }).error?.message || res.status}`);
  }
  return res.json();
}

// ── 阶段二增补: 仿真历史记录 ──────────────────────────────────

export interface SimulationRecordListItem {
  id: number;
  scenario_id: number | null;
  light_intensity: number;
  catalyst_efficiency: number;
  turbidity: number;
  segments: RiverSegmentDTO[];
  result: Record<string, unknown>;
  compute_time_ms: number;
  tags: string;
  note: string;
  created_at: string;
}

export interface SimulationRecordCreatePayload {
  scenario_id?: number | null;
  light_intensity: number;
  catalyst_efficiency: number;
  turbidity: number;
  segments: RiverSegmentDTO[];
  result_json: string;
  compute_time_ms: number;
  tags?: string;
  note?: string;
}

export async function fetchSimulationRecords(params?: {
  scenario_id?: number;
  limit?: number;
  offset?: number;
}): Promise<SimulationRecordListItem[]> {
  const search = new URLSearchParams();
  if (params?.scenario_id !== undefined) search.set("scenario_id", String(params.scenario_id));
  if (params?.limit !== undefined) search.set("limit", String(params.limit));
  if (params?.offset !== undefined) search.set("offset", String(params.offset));
  const qs = search.toString();
  const res = await fetch(`${API_BASE}/api/simulation-records${qs ? '?' + qs : ''}`);
  if (!res.ok) throw new Error(`获取仿真记录失败: ${res.status}`);
  return res.json();
}

export async function fetchSimulationRecord(id: number): Promise<SimulationRecordListItem> {
  const res = await fetch(`${API_BASE}/api/simulation-records/${id}`);
  if (!res.ok) throw new Error(`获取仿真记录失败: ${res.status}`);
  return res.json();
}

export async function saveSimulationRecord(data: SimulationRecordCreatePayload): Promise<SimulationRecordListItem> {
  const res = await fetch(`${API_BASE}/api/simulation-records`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`保存仿真记录失败: ${(err as { error?: { message?: string } }).error?.message || res.status}`);
  }
  return res.json();
}

export async function deleteSimulationRecord(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/simulation-records/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`删除仿真记录失败: ${res.status}`);
}

// ── 阶段三: WebSocket 多人协同 ────────────────────────────────

export type WSMessageHandler = (msg: WSMessage) => void;

export interface WSMessage {
  type: string;
  room_id: string;
  player_id: string;
  payload: Record<string, unknown>;
}

export function connectWS(roomId: string, playerName: string): WebSocket {
  const ws = new WebSocket(`${WS_BASE}/ws/${roomId}?name=${encodeURIComponent(playerName)}`);
  return ws;
}

export async function fetchRooms(): Promise<RoomInfo[]> {
  const res = await fetch(`${API_BASE}/api/rooms`);
  if (!res.ok) throw new Error(`获取房间列表失败: ${res.status}`);
  const data = await res.json();
  return data.rooms || [];
}

// ── 健康检查 ─────────────────────────────────────────────────

export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/health`);
    return res.ok;
  } catch {
    return false;
  }
}
