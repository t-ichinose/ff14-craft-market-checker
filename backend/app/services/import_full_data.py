import os
import json
import httpx
import time
from sqlalchemy.orm import Session
from backend.app.database import engine, SessionLocal, Base
from backend.app.models.schema import Item, Recipe, RecipeIngredient

JOB_MAP = {
    8: {"craft_type": 0, "job_name": "木工師"},
    9: {"craft_type": 1, "job_name": "鍛冶師"},
    10: {"craft_type": 2, "job_name": "甲冑師"},
    11: {"craft_type": 3, "job_name": "彫金師"},
    12: {"craft_type": 4, "job_name": "革細工師"},
    13: {"craft_type": 5, "job_name": "裁縫師"},
    14: {"craft_type": 6, "job_name": "錬金術師"},
    15: {"craft_type": 7, "job_name": "調理師"},
}

ITEMS_SEARCH_PATH = r"C:\Users\tichi\.gemini\antigravity-ide\scratch\ff14-market-research\docs\items_search.json"
ICONS_MAP_PATH = r"C:\Users\tichi\.gemini\antigravity-ide\scratch\ff14-market-research\docs\icons_map.json"
RECIPES_URL = "https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/staging/libs/data/src/lib/json/recipes.json"

def compute_icon_url(icon_id) -> str:
    if isinstance(icon_id, str):
        if "universalis-assets/icon2x/http" in icon_id:
            prefix = "https://universalis-ffxiv.github.io/universalis-assets/icon2x/"
            if icon_id.startswith(prefix) and icon_id.endswith(".png"):
                return icon_id[len(prefix):-4]
        if icon_id.startswith("http://") or icon_id.startswith("https://"):
            return icon_id
    try:
        iid = int(icon_id)
        folder_num = (iid // 1000) * 1000
        folder_str = f"{folder_num:06d}"
        icon_str = f"{iid:06d}"
        return f"https://v2.xivapi.com/api/asset?path=ui/icon/{folder_str}/{icon_str}_hr1.tex&format=png"
    except Exception:
        return f"https://universalis-ffxiv.github.io/universalis-assets/icon2x/{icon_id}.png"

def import_all():
    print("=== Starting Full Item & Recipe Database Import ===")
    start_time = time.time()

    # 1. Load items_search.json & icons_map.json
    print("Loading item names and icons...")
    items_search = {}
    if os.path.exists(ITEMS_SEARCH_PATH):
        with open(ITEMS_SEARCH_PATH, "r", encoding="utf-8") as f:
            items_search = {int(k): v for k, v in json.load(f).items() if str(k).isdigit()}
    print(f"Loaded {len(items_search)} item names.")

    icons_map = {}
    if os.path.exists(ICONS_MAP_PATH):
        with open(ICONS_MAP_PATH, "r", encoding="utf-8") as f:
            icons_map = {int(k): v for k, v in json.load(f).items() if str(k).isdigit()}
    print(f"Loaded {len(icons_map)} icons.")

    # 2. Download Teamcraft recipes
    print("Fetching Teamcraft recipes (14,000+)...")
    resp = httpx.get(RECIPES_URL, timeout=60.0)
    recipes_data = resp.json()
    print(f"Fetched {len(recipes_data)} recipes.")

    # Identify all craftable item IDs and ingredient item IDs
    craftable_item_ids = set()
    all_referenced_item_ids = set(items_search.keys())

    for r in recipes_data:
        result_id = r.get("result")
        if isinstance(result_id, int):
            craftable_item_ids.add(result_id)
            all_referenced_item_ids.add(result_id)
        for ing in r.get("ingredients", []):
            ing_id = ing.get("id")
            if isinstance(ing_id, int):
                all_referenced_item_ids.add(ing_id)

    # 3. Drop and recreate tables
    print("Recreating database tables...")
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    db: Session = SessionLocal()

    try:
        # 4. Insert Items in bulk
        print(f"Inserting {len(all_referenced_item_ids)} items...")
        item_objects = []
        for iid in sorted(all_referenced_item_ids):
            name_ja = items_search.get(iid, f"アイテム #{iid}")
            icon_id = icons_map.get(iid, iid)
            icon_url = compute_icon_url(icon_id)
            can_craft = iid in craftable_item_ids

            item_objects.append({
                "id": iid,
                "name_ja": name_ja,
                "name_en": None,
                "icon_url": icon_url,
                "item_ui_category": None,
                "level_item": 1,
                "level_equip": 1,
                "price_mid": 0,
                "can_be_crafted": can_craft,
                "is_marketable": True
            })

        # Bulk insert items in chunks
        chunk_size = 5000
        for i in range(0, len(item_objects), chunk_size):
            db.bulk_insert_mappings(Item, item_objects[i:i + chunk_size])
        db.commit()
        print("Items inserted successfully!")

        # 5. Insert Recipes & Ingredients
        print(f"Inserting recipes and ingredients...")
        recipe_objects = []
        ingredient_objects = []

        for r in recipes_data:
            r_id = str(r.get("id"))
            result_id = r.get("result")
            job_id = r.get("job", 8)
            job_info = JOB_MAP.get(job_id, {"craft_type": 0, "job_name": "木工師"})

            if not r_id or not isinstance(result_id, int) or result_id not in all_referenced_item_ids:
                continue

            recipe_objects.append({
                "id": r_id,
                "item_result_id": result_id,
                "amount_result": r.get("yields", 1) or 1,
                "craft_type": job_info["craft_type"],
                "job_name": job_info["job_name"],
                "recipe_level": r.get("lvl", 1) or 1,
                "stars": r.get("stars", 0) or 0
            })

            for ing in r.get("ingredients", []):
                ing_id = ing.get("id")
                amount = ing.get("amount", 1)
                if isinstance(ing_id, int) and ing_id in all_referenced_item_ids and amount > 0:
                    ingredient_objects.append({
                        "recipe_id": r_id,
                        "item_id": ing_id,
                        "amount": amount
                    })

        # Bulk insert recipes
        print(f"Inserting {len(recipe_objects)} valid craft recipes...")
        for i in range(0, len(recipe_objects), chunk_size):
            db.bulk_insert_mappings(Recipe, recipe_objects[i:i + chunk_size])
        db.commit()

        # Bulk insert ingredients
        print(f"Inserting {len(ingredient_objects)} ingredients...")
        for i in range(0, len(ingredient_objects), chunk_size):
            db.bulk_insert_mappings(RecipeIngredient, ingredient_objects[i:i + chunk_size])
        db.commit()

        elapsed = round(time.time() - start_time, 2)
        print(f"=== Success! Imported {len(item_objects)} items, {len(recipe_objects)} recipes, and {len(ingredient_objects)} ingredients in {elapsed}s ===")

    except Exception as e:
        db.rollback()
        print(f"Error during import: {e}")
        raise e
    finally:
        db.close()

if __name__ == "__main__":
    import_all()
