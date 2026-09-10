from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Dict, Any, Optional, List
from pydantic import BaseModel

from backend.app.database import get_db
from backend.app.services.recipe_service import RecipeService
from backend.app.services.calc_service import CalcService
from backend.app.services.universalis_service import UniversalisService

router = APIRouter(prefix="/api", tags=["Market & Craft"])

class CraftEvaluationRequest(BaseModel):
    item_id: int
    amount: int = 1
    selected_dc: str = "Japan"
    home_world: Optional[str] = None
    force_craft_overrides: Optional[Dict[int, bool]] = None

@router.get("/recipe/{item_id}")
def get_recipe_tree(item_id: int, amount: int = 1, db: Session = Depends(get_db)):
    """
    指定したアイテムIDのクラフトレシピツリーを再帰的に取得
    """
    tree = RecipeService.get_recipe_tree(db, item_id, multiplier=amount)
    if not tree:
        raise HTTPException(status_code=404, detail="Recipe or item not found")
    return tree

@router.post("/craft/evaluate")
async def evaluate_craft(req: CraftEvaluationRequest, db: Session = Depends(get_db)):
    """
    リアルタイム相場と組み合わせたクラフトツリーの最適仕入れ・原価シミュレーション
    """
    result = await CalcService.evaluate_craft_tree(
        db=db,
        root_item_id=req.item_id,
        amount=req.amount,
        selected_dc=req.selected_dc,
        home_world=req.home_world,
        force_craft_overrides=req.force_craft_overrides,
    )
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result

@router.get("/market/{world_or_dc}/{item_id}")
async def get_market_cache(
    world_or_dc: str,
    item_id: int,
    force_refresh: bool = False,
    db: Session = Depends(get_db)
):
    """
    DBキャッシュ付きの Universalis 相場データ取得
    """
    data = await UniversalisService.fetch_market_data(
        db=db,
        item_ids=[item_id],
        world_or_dc=world_or_dc,
        force_refresh=force_refresh,
    )
    if item_id not in data:
        raise HTTPException(status_code=404, detail="Market data not found")
    return data[item_id]
