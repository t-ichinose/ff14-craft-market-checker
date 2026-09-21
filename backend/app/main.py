import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from backend.app.database import engine, Base
import backend.app.models.schema  # noqa: F401 - Register models with SQLAlchemy metadata
from backend.app.api.endpoints import router as api_router

logger = logging.getLogger("app.main")

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    アプリケーションの起動時とシャットダウン時のライフサイクル管理
    """
    logger.info("Initializing database connection and tables...")
    try:
        # DB接続確認
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        logger.info("Database connection successfully established.")
    except Exception as exc:
        logger.error(f"Database connection check failed: {exc}", exc_info=True)
    
    yield

    # シャットダウン時のリソース解放
    logger.info("Disposing database engine connection pool...")
    engine.dispose()
    logger.info("Cleanup completed. Server shutting down.")

app = FastAPI(
    title="FF14 Craft Market Rate Checker API",
    description="FF14 マーケット相場とクラフトレシピを組み合わせたレートチェック & 利益最適化API",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)

@app.get("/health")
def health_check():
    return {"status": "ok", "app": "FF14 Craft Market Rate Checker"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.app.main:app", host="127.0.0.1", port=8000, reload=True)
