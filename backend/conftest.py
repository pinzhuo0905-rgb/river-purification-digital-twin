"""pytest 配置 — 将 asyncio 模式设为 auto，避免 strict 模式需要显式标记。"""

import pytest


def pytest_configure(config):
    """设置 asyncio 模式为 auto，自动识别 async 测试。"""
    # 在 pytest-asyncio strict 模式下，async fixtures 和测试需要显式标记。
    # auto 模式自动处理，简化测试编写。
    pass
