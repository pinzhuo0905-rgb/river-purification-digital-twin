#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
#  河流光催化净化数字孪生系统 — 一键启动脚本
# ═══════════════════════════════════════════════════════════════
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"

echo "╔══════════════════════════════════════════════════════════╗"
echo "║    🌊 河流光催化净化数字孪生系统 启动中...           ║"
echo "╚══════════════════════════════════════════════════════════╝"

# ── 1. 启动后端 (FastAPI + SQLite + WebSocket) ─────────────
echo ""
echo "📡 [1/3] 启动后端 API 服务 (端口 8000)..."
cd "$BACKEND_DIR"

# 如果数据库不存在，先 seed
if [ ! -f "river_scenarios.db" ]; then
  echo "   → 首次运行：初始化数据库 & 种子数据..."
  python3 seed_data.py
fi

nohup python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload \
  > /tmp/river_backend.log 2>&1 &
BACKEND_PID=$!
echo "   → 后端 PID: $BACKEND_PID"
sleep 2

# 健康检查
if curl -s http://localhost:8000/api/health > /dev/null 2>&1; then
  echo "   ✅ 后端就绪: http://localhost:8000"
  echo "   📖 API 文档: http://localhost:8000/docs"
else
  echo "   ⚠️  后端可能启动失败，请查看 /tmp/river_backend.log"
fi

# ── 2. 启动前端 (Vite + React) ────────────────────────────
echo ""
echo "🎨 [2/3] 启动前端开发服务器 (端口 5173)..."
cd "$SCRIPT_DIR"
nohup npx vite --host 0.0.0.0 --port 5173 \
  > /tmp/river_frontend.log 2>&1 &
FRONTEND_PID=$!
echo "   → 前端 PID: $FRONTEND_PID"
sleep 3

if curl -s http://localhost:5173 > /dev/null 2>&1; then
  echo "   ✅ 前端就绪: http://localhost:5173"
else
  echo "   ⚠️  前端可能启动失败，请查看 /tmp/river_frontend.log"
fi

# ── 3. 总结 ──────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║              ✅ 系统启动完成！                         ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║  前端页面:  http://localhost:5173                     ║"
echo "║  后端 API:  http://localhost:8000                     ║"
echo "║  Swagger:   http://localhost:8000/docs                ║"
echo "║                                                      ║"
echo "║  停止服务:                                            ║"
echo "║    kill $BACKEND_PID $FRONTEND_PID                    ║"
echo "╚══════════════════════════════════════════════════════════╝"
