#!/bin/sh
set -e

echo "🌊 Starting River Photocatalytic Digital Twin System..."

# 检查是否已有数据库，若无则初始化种子数据
if [ ! -f "/app/backend/river_scenarios.db" ]; then
    echo "📌 Initializing SQLite database with default scenario presets..."
    python /app/backend/seed_data.py || true
fi

# 在后台启动 FastAPI (Uvicorn)
echo "📡 Starting FastAPI backend on 127.0.0.1:8000..."
cd /app/backend
python -m uvicorn main:app --host 127.0.0.1 --port 8000 --workers 2 &

# 在前台启动 Nginx 接收 HTTP / WebSocket 请求
echo "🎨 Starting Nginx reverse proxy on port 80..."
exec nginx -g "daemon off;"
