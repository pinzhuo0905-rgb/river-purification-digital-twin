"""
结构化日志配置

使用 Python 标准 logging 模块，提供：
  - 终端彩色输出（INFO 及以上级别）
  - 请求日志摘要（方法、路径、状态码、耗时）
  - 可扩展的 JSON 格式文件输出（生产环境）
"""

import logging
import sys
import time
from typing import Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

# ── 日志格式 ─────────────────────────────────────────────────

CONSOLE_FORMAT = (
    "%(asctime)s  %(levelname)-8s  %(name)-20s  %(message)s"
)
DATE_FORMAT = "%H:%M:%S"

# ANSI 颜色（终端友好）
COLORS = {
    "DEBUG": "\033[36m",     # 青色
    "INFO": "\033[32m",      # 绿色
    "WARNING": "\033[33m",   # 黄色
    "ERROR": "\033[31m",     # 红色
    "CRITICAL": "\033[35m",  # 紫色
}
RESET = "\033[0m"


class ColoredFormatter(logging.Formatter):
    """带颜色的终端日志格式化器。"""

    def format(self, record: logging.LogRecord) -> str:
        color = COLORS.get(record.levelname, "")
        if color:
            record.levelname = f"{color}{record.levelname}{RESET}"
        return super().format(record)


def setup_logging(level: int = logging.INFO) -> None:
    """初始化全局日志系统。

    Args:
        level: 日志级别，建议开发环境用 DEBUG，生产用 INFO。
    """
    root = logging.getLogger()
    root.setLevel(level)

    # 已有 handler 则跳过（避免重复初始化）
    if root.handlers:
        return

    # 终端 handler
    console = logging.StreamHandler(sys.stdout)
    console.setLevel(level)
    console.setFormatter(ColoredFormatter(CONSOLE_FORMAT, DATE_FORMAT))
    root.addHandler(console)

    # 抑制过于啰嗦的第三方库日志
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("asyncio").setLevel(logging.WARNING)

    root.info("日志系统初始化完成")


def get_logger(name: str) -> logging.Logger:
    """获取指定模块的 logger 实例。"""
    return logging.getLogger(name)


# ── 请求日志中间件 ────────────────────────────────────────────


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """记录每个 HTTP 请求的方法、路径、状态码和耗时。

    用法（在 FastAPI app 中）:
        app.add_middleware(RequestLoggingMiddleware)
    """

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        logger = get_logger("http.request")
        start = time.perf_counter()

        response = await call_next(request)

        elapsed_ms = (time.perf_counter() - start) * 1000
        status_code = response.status_code

        # 根据状态码选择日志级别
        if status_code >= 500:
            log_fn = logger.error
        elif status_code >= 400:
            log_fn = logger.warning
        else:
            log_fn = logger.info

        log_fn(
            "%s %s → %d  (%.1fms)",
            request.method,
            request.url.path,
            status_code,
            elapsed_ms,
        )
        return response
