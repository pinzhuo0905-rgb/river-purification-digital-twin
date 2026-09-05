#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
#  LAN 端口转发脚本 — 让局域网其他设备访问你的 VM 服务
#
# 在你的 Mac 终端运行:
#   chmod +x expose-lan.sh && ./expose-lan.sh
#
# 按 Ctrl+C 停止转发。
# ═══════════════════════════════════════════════════════════════

set -e

VM_IP="192.168.64.154"
FRONTEND_PORT="5173"
BACKEND_PORT="8000"

# ── 1. 获取 Mac 的局域网 IP ───────────────────────────────
LAN_IP=$(ipconfig getifaddr en0 2>/dev/null || echo "")
if [ -z "$LAN_IP" ]; then
  echo "❌ 无法获取局域网 IP，请确认 Wi-Fi 或有线网络已连接"
  exit 1
fi

echo "🖥  你的 Mac 局域网 IP: $LAN_IP"
echo ""

# ── 2. 检查 socat ────────────────────────────────────────
if ! command -v socat &> /dev/null; then
  echo "⚙️  正在安装 socat（需要 Homebrew，仅首次需要）..."
  brew install socat
fi

# ── 3. 清理旧的 socat 进程 ───────────────────────────────
pkill -f "socat TCP-LISTEN:${FRONTEND_PORT}" 2>/dev/null || true
pkill -f "socat TCP-LISTEN:${BACKEND_PORT}" 2>/dev/null || true

# ── 4. 启动端口转发 ─────────────────────────────────────
echo "🔀 启动端口转发..."
echo "   Mac:${FRONTEND_PORT} → VM:${FRONTEND_PORT} (前端)"
echo "   Mac:${BACKEND_PORT} → VM:${BACKEND_PORT} (后端)"
echo ""

socat TCP-LISTEN:${FRONTEND_PORT},fork,reuseaddr,bind=0.0.0.0 TCP:${VM_IP}:${FRONTEND_PORT} &
PID1=$!
socat TCP-LISTEN:${BACKEND_PORT},fork,reuseaddr,bind=0.0.0.0 TCP:${VM_IP}:${BACKEND_PORT} &
PID2=$!

sleep 1

# ── 5. 验证 ─────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║              ✅ 局域网访问已就绪！                      ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║                                                      ║"
echo "║  🌊 前端页面:  http://${LAN_IP}:5173/          ║"
echo "║  📡 后端 API:  http://${LAN_IP}:8000/          ║"
echo "║  📖 API 文档:  http://${LAN_IP}:8000/docs      ║"
echo "║                                                      ║"
echo "║  按 Ctrl+C 停止所有转发                               ║"
echo "╚══════════════════════════════════════════════════════════╝"

# ── 6. 等待退出 ─────────────────────────────────────────
trap "echo '🛑 停止转发...'; kill $PID1 $PID2 2>/dev/null; exit 0" SIGINT SIGTERM
wait
