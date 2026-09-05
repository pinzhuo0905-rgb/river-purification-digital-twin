# ═══════════════════════════════════════════════════════════════
#  Multi-stage Dockerfile - 河流光催化净化数字孪生全栈系统
# ═══════════════════════════════════════════════════════════════

# ── 阶段一：前端静态打包 (Node.js) ───────────────────────────
FROM node:20-alpine AS frontend-builder
WORKDIR /app

# 安装前端依赖
COPY package*.json ./
RUN npm ci

# 复制前端代码并构建
COPY . .
RUN npm run build

# ── 阶段二：生产镜像 (Python 3.11 + Nginx 反向代理) ───────────
FROM python:3.11-slim
WORKDIR /app

# 安装 Nginx
RUN apt-get update && apt-get install -y --no-install-recommends \
    nginx \
    curl \
    && rm -rf /var/lib/apt/lists/*

# 安装 Python 后端核心科学计算与 Web 依赖
COPY backend/requirements.txt ./backend/
RUN pip install --no-cache-dir -r ./backend/requirements.txt

# 复制后端源码
COPY backend/ ./backend/

# 将阶段一构建的前端静态产物复制至 Nginx 静态文件目录
COPY --from=frontend-builder /app/dist /var/www/html/

# 部署 Nginx 统一反向代理配置
COPY nginx.conf /etc/nginx/sites-available/default

# 复制容器入口脚本
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# 暴露 HTTP 统一服务端口
EXPOSE 80

# 容器健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost/api/health || exit 1

ENTRYPOINT ["/docker-entrypoint.sh"]
