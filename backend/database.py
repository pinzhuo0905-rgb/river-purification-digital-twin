"""
数据库配置 — SQLite 异步引擎

选型理由：
  - SQLite 零配置、无需独立数据库进程，适合学术演示和单机部署。
  - 答辩时也可以轻松迁移到 PostgreSQL：只需替换连接字符串和 asyncpg 驱动。
"""

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

DATABASE_URL = "sqlite+aiosqlite:///./river_scenarios.db"

engine = create_async_engine(DATABASE_URL, echo=False)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db() -> AsyncSession:
    """FastAPI 依赖注入：为每个请求提供一个数据库会话。"""
    async with async_session() as session:
        yield session
