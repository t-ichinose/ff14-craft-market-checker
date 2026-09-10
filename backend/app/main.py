from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.app.database import engine, Base
from backend.app.models.schema import *
from backend.app.api.endpoints import router as api_router

app = FastAPI(
    title="FF14 Craft Market Rate Checker API",
    description="FF14 マーケット相場とクラフトレシピを組み合わせたレートチェック & 利益最適化API",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
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
