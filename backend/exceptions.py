"""
统一异常处理 — 规范化 API 错误响应

所有异常都会被捕获并转换为:
  { "error": { "code": "...", "message": "...", "detail": "..." } }
"""

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from logging_config import get_logger

logger = get_logger(__name__)


# ── 标准错误响应模型 ──────────────────────────────────────────

def error_response(
    status_code: int,
    code: str,
    message: str,
    detail: str = "",
) -> JSONResponse:
    """构建统一格式的错误 JSON 响应。

    Args:
        status_code: HTTP 状态码
        code: 业务错误码（如 "NOT_FOUND", "VALIDATION_ERROR"）
        message: 人类可读的错误概述
        detail: 详细错误说明（可选）
    """
    return JSONResponse(
        status_code=status_code,
        content={
            "error": {
                "code": code,
                "message": message,
                "detail": detail or message,
            }
        },
    )


# ── 注册到 FastAPI app ────────────────────────────────────────

def register_exception_handlers(app):
    """为 FastAPI 应用注册全局异常处理器。

    Args:
        app: FastAPI 应用实例
    """

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException):
        """FastAPI/Starlette 内置 HTTP 异常。"""
        logger.warning(
            "HTTP %d: %s %s",
            exc.status_code,
            request.method,
            request.url.path,
        )
        if exc.status_code == 404:
            return error_response(404, "NOT_FOUND", "资源不存在", str(exc.detail))
        elif exc.status_code == 400:
            return error_response(400, "BAD_REQUEST", "请求参数错误", str(exc.detail))
        elif exc.status_code == 422:
            return error_response(422, "VALIDATION_ERROR", "数据验证失败", str(exc.detail))
        return error_response(exc.status_code, "HTTP_ERROR", "请求处理失败", str(exc.detail))

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        """Pydantic 请求体验证失败。"""
        errors = []
        for err in exc.errors():
            field = " → ".join(str(loc) for loc in err["loc"])
            errors.append(f"{field}: {err['msg']}")

        detail = "; ".join(errors)
        logger.warning("验证失败 [%s %s]: %s", request.method, request.url.path, detail)

        return error_response(422, "VALIDATION_ERROR", "请求数据格式不正确", detail)

    @app.exception_handler(Exception)
    async def general_exception_handler(request: Request, exc: Exception):
        """兜底处理：未预期的内部错误。"""
        logger.exception(
            "未处理异常 [%s %s]: %s",
            request.method,
            request.url.path,
            exc,
        )
        return error_response(
            500,
            "INTERNAL_ERROR",
            "服务器内部错误",
            "请查看服务端日志获取详情",
        )

    logger.info("全局异常处理器已注册")
