"""
WebSocket 房间管理器 — 多人全流域协同治理模式 (阶段三)

架构：
  - 每个"河流房间"表示一条共享的 100 米河流。
  - 不同玩家可以加入同一房间，分别控制上游排污/天气或中游投放催化剂。
  - 服务器作为"上帝"角色，实时接收各玩家的操作，融合后广播全量状态。

协议：
  消息格式: JSON { "type": "...", "room_id": "...", "player_id": "...", "payload": {...} }
  消息类型:
    - "join"             玩家加入房间
    - "leave"            玩家离开房间
    - "param_update"     玩家更新全局参数（光强、流速等）
    - "catalyst_place"   玩家在指定位置投放催化剂
    - "state_sync"       服务器广播的完整状态快照
    - "player_list"      房间内玩家列表变更通知
"""

import json
import uuid
from typing import Optional
from fastapi import WebSocket, WebSocketDisconnect


class RiverRoom:
    """一个河流房间，代表一条共享河流的多人协同会话。"""

    def __init__(self, room_id: str, name: str = ""):
        self.room_id = room_id
        self.name = name or f"河流治理室 #{room_id[:6]}"
        # player_id → { "websocket": WebSocket, "role": str, "name": str }
        self.players: dict[str, dict] = {}
        # 共享河流状态（最新一次广播的快照）
        self.shared_state: dict = {
            "light_intensity": 1.0,
            "catalyst_efficiency": 0.8,
            "river_depth": 1.5,
            "turbidity": 5.0,
            "extra_catalysts": [],  # [{"x":float, "y":float, "placed_by":str}, ...]
        }

    def add_player(self, player_id: str, ws: WebSocket, player_name: str = "anonymous") -> None:
        self.players[player_id] = {"websocket": ws, "role": "viewer", "name": player_name}

    def remove_player(self, player_id: str) -> None:
        self.players.pop(player_id, None)

    def update_state(self, player_id: str, payload: dict) -> None:
        """玩家更新全局参数。"""
        for key in ("light_intensity", "catalyst_efficiency", "river_depth", "turbidity"):
            if key in payload:
                self.shared_state[key] = payload[key]

    def place_catalyst(self, player_id: str, payload: dict) -> None:
        """玩家在中游投放催化剂。"""
        self.shared_state.setdefault("extra_catalysts", []).append({
            "x": payload.get("x", 0),
            "y": payload.get("y", 0),
            "placed_by": player_id,
            "placed_at": payload.get("placed_at", ""),
        })

    async def broadcast(self, message: dict, exclude_player: Optional[str] = None) -> None:
        """向房间内所有玩家广播消息。"""
        disconnected = []
        for pid, info in self.players.items():
            if pid == exclude_player:
                continue
            try:
                await info["websocket"].send_text(json.dumps(message, ensure_ascii=False))
            except Exception:
                disconnected.append(pid)
        for pid in disconnected:
            self.remove_player(pid)

    async def broadcast_state(self) -> None:
        """广播完整河流状态给所有玩家。"""
        await self.broadcast({
            "type": "state_sync",
            "room_id": self.room_id,
            "player_id": "server",
            "payload": self.shared_state,
        })

    async def broadcast_player_list(self) -> None:
        """广播当前房间玩家列表。"""
        player_list = [
            {"id": pid, "name": info["name"], "role": info["role"]}
            for pid, info in self.players.items()
        ]
        await self.broadcast({
            "type": "player_list",
            "room_id": self.room_id,
            "player_id": "server",
            "payload": {"players": player_list},
        })

    @property
    def is_empty(self) -> bool:
        return len(self.players) == 0


# ── 全局房间注册表 ────────────────────────────────────────────

_rooms: dict[str, RiverRoom] = {}


def get_or_create_room(room_id: str) -> RiverRoom:
    if room_id not in _rooms:
        _rooms[room_id] = RiverRoom(room_id)
    return _rooms[room_id]


def get_room(room_id: str) -> Optional[RiverRoom]:
    return _rooms.get(room_id)


def list_rooms() -> list[dict]:
    return [
        {
            "room_id": r.room_id,
            "name": r.name,
            "player_count": len(r.players),
        }
        for r in _rooms.values()
    ]


def cleanup_empty_rooms() -> int:
    """清理没有玩家的房间。"""
    empty = [rid for rid, r in _rooms.items() if r.is_empty]
    for rid in empty:
        del _rooms[rid]
    return len(empty)


# ── WebSocket 主处理函数 ─────────────────────────────────────

async def handle_ws(websocket: WebSocket, room_id: str, player_name: str = "anonymous"):
    """
    WebSocket 连接生命周期管理。

    用法（在 FastAPI 路由中）:
        @app.websocket("/ws/{room_id}")
        async def ws_endpoint(websocket: WebSocket, room_id: str):
            player_name = f"研究者_{uuid.uuid4().hex[:4]}"
            await handle_ws(websocket, room_id, player_name)
    """
    await websocket.accept()
    player_id = uuid.uuid4().hex[:8]
    room = get_or_create_room(room_id)
    room.add_player(player_id, websocket, player_name)

    # 通知所有人有新人加入
    await room.broadcast({
        "type": "join",
        "room_id": room_id,
        "player_id": player_id,
        "payload": {"player_name": player_name},
    })
    # 向新玩家发送当前完整状态
    await websocket.send_text(json.dumps({
        "type": "state_sync",
        "room_id": room_id,
        "player_id": "server",
        "payload": {**room.shared_state, "your_player_id": player_id},
    }, ensure_ascii=False))
    await room.broadcast_player_list()

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue

            msg_type = msg.get("type", "")
            payload = msg.get("payload", {})

            if msg_type == "param_update":
                room.update_state(player_id, payload)
                await room.broadcast_state()

            elif msg_type == "catalyst_place":
                room.place_catalyst(player_id, payload)
                await room.broadcast_state()

            elif msg_type == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))

            elif msg_type == "get_rooms":
                await websocket.send_text(json.dumps({
                    "type": "room_list",
                    "payload": {"rooms": list_rooms()},
                }, ensure_ascii=False))

    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        room.remove_player(player_id)
        await room.broadcast({
            "type": "leave",
            "room_id": room_id,
            "player_id": player_id,
            "payload": {"player_name": player_name},
        })
        await room.broadcast_player_list()
        cleanup_empty_rooms()
