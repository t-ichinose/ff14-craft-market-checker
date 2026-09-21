import os
import json
import httpx
from sqlalchemy.orm import Session
from backend.app.models.schema import Item, Recipe, RecipeIngredient
from backend.app.database import SessionLocal, engine, Base

JOB_NAMES = {
    0: "木工師",
    1: "鍛冶師",
    2: "甲冑師",
    3: "彫金師",
    4: "革細工師",
    5: "裁縫師",
    6: "錬金術師",
    7: "調理師"
}

# Rich starter seed of popular crafting items & intermediate materials
STARTER_DATA = {
    "items": [
        # Meals & Potions
        {"id": 44161, "name_ja": "ローストアルパカ", "name_en": "Roast Alpaca", "category": "調理品", "level_item": 710, "can_be_crafted": True},
        {"id": 44162, "name_ja": "ベジタブルスープ", "name_en": "Vegetable Soup", "category": "調理品", "level_item": 710, "can_be_crafted": True},
        {"id": 44170, "name_ja": "剛力の宝薬G2", "name_en": "Grade 2 Gemdraught of Strength", "category": "薬品", "level_item": 710, "can_be_crafted": True},
        {"id": 44171, "name_ja": "眼力の宝薬G2", "name_en": "Grade 2 Gemdraught of Dexterity", "category": "薬品", "level_item": 710, "can_be_crafted": True},
        {"id": 44172, "name_ja": "知力の宝薬G2", "name_en": "Grade 2 Gemdraught of Intelligence", "category": "薬品", "level_item": 710, "can_be_crafted": True},
        {"id": 44173, "name_ja": "心力の宝薬G2", "name_en": "Grade 2 Gemdraught of Mind", "category": "薬品", "level_item": 710, "can_be_crafted": True},
        # Intermediate Materials (Dawntrail / Endwalker)
        {"id": 43980, "name_ja": "ブラックスターインゴット", "name_en": "Black Star Ingot", "category": "金属材", "level_item": 710, "can_be_crafted": True},
        {"id": 43981, "name_ja": "ラザハンカルコサイトインゴット", "name_en": "Thavnairian Chalcocite Ingot", "category": "金属材", "level_item": 710, "can_be_crafted": True},
        {"id": 43985, "name_ja": "マグネシアクロス", "name_en": "Magnesia Cloth", "category": "布材", "level_item": 710, "can_be_crafted": True},
        {"id": 43988, "name_ja": "ロイヤルアルパカレザー", "name_en": "Royal Alpaca Leather", "category": "皮革材", "level_item": 710, "can_be_crafted": True},
        {"id": 43992, "name_ja": "クラロウォールナット材", "name_en": "Claro Walnut Lumber", "category": "木材", "level_item": 710, "can_be_crafted": True},
        {"id": 44000, "name_ja": "ゴールドチタンインゴット", "name_en": "Gold Titanium Ingot", "category": "金属材", "level_item": 690, "can_be_crafted": True},
        {"id": 44005, "name_ja": "サンダーヤードクロス", "name_en": "Thunderyard Cloth", "category": "布材", "level_item": 690, "can_be_crafted": True},
        {"id": 44010, "name_ja": "ゴンフォテリウムレザー", "name_en": "Gomphotherium Leather", "category": "皮革材", "level_item": 690, "can_be_crafted": True},
        # Raw / Gathered / Shop materials
        {"id": 43970, "name_ja": "黒星石", "name_en": "Black Star", "category": "石材", "level_item": 710, "can_be_crafted": False, "price_mid": 0},
        {"id": 43971, "name_ja": "マグネシア砥石", "name_en": "Magnesia Whetstone", "category": "石材", "level_item": 710, "can_be_crafted": False, "price_mid": 0},
        {"id": 43972, "name_ja": "アルパカの粗皮", "name_en": "Alpaca Hide", "category": "素材", "level_item": 710, "can_be_crafted": False, "price_mid": 0},
        {"id": 43973, "name_ja": "クラロウォールナット原木", "name_en": "Claro Walnut Log", "category": "木材", "level_item": 710, "can_be_crafted": False, "price_mid": 0},
        {"id": 43974, "name_ja": "ゴールドチタン鉱", "name_en": "Gold Titanium Ore", "category": "鉱石", "level_item": 690, "can_be_crafted": False, "price_mid": 0},
        {"id": 43975, "name_ja": "生マユ", "name_en": "Raw Cocoon", "category": "素材", "level_item": 690, "can_be_crafted": False, "price_mid": 0},
        {"id": 43976, "name_ja": "ゴンフォテリウムの粗皮", "name_en": "Gomphotherium Skin", "category": "素材", "level_item": 690, "can_be_crafted": False, "price_mid": 0},
        {"id": 44100, "name_ja": "アルパカの肉", "name_en": "Alpaca Meat", "category": "食材", "level_item": 710, "can_be_crafted": False, "price_mid": 0},
        {"id": 44101, "name_ja": "ヤクの乳", "name_en": "Yak Milk", "category": "食材", "level_item": 100, "can_be_crafted": False, "price_mid": 120}, # Shop buyable!
        {"id": 44102, "name_ja": "食塩", "name_en": "Table Salt", "category": "調味料", "level_item": 1, "can_be_crafted": False, "price_mid": 2}, # Shop buyable!
        {"id": 44103, "name_ja": "高純度アルブメン", "name_en": "Purified Albumen", "category": "薬品", "level_item": 710, "can_be_crafted": False, "price_mid": 0},
        {"id": 44104, "name_ja": "黄金の霊砂", "name_en": "Golden Aethersand", "category": "水産物/霊砂", "level_item": 710, "can_be_crafted": False, "price_mid": 0},
        # Equipment (Dawntrail Crafted 710 / 690 gear)
        {"id": 44501, "name_ja": "ブラックスター・グレートソード", "name_en": "Black Star Greatsword", "category": "両手剣", "level_item": 710, "level_equip": 100, "can_be_crafted": True},
        {"id": 44502, "name_ja": "ブラックスター・ケーン", "name_en": "Black Star Cane", "category": "両手幻具", "level_item": 710, "level_equip": 100, "can_be_crafted": True},
        {"id": 44520, "name_ja": "ロイヤルアルパカ・キャスターコート", "name_en": "Royal Alpaca Coat of Casting", "category": "胴防具", "level_item": 710, "level_equip": 100, "can_be_crafted": True},
        {"id": 44521, "name_ja": "マグネシア・ヒーラーローブ", "name_en": "Magnesia Robe of Healing", "category": "胴防具", "level_item": 710, "level_equip": 100, "can_be_crafted": True},
        {"id": 44530, "name_ja": "ブラックスター・ディフェンダーリング", "name_en": "Black Star Ring of Fending", "category": "指輪", "level_item": 710, "level_equip": 100, "can_be_crafted": True},
    ],
    "recipes": [
        # ブラックスターインゴット (鍛冶/甲冑)
        {
            "id": 35001,
            "item_result_id": 43980,
            "amount_result": 1,
            "craft_type": 1, # 鍛冶師
            "job_name": "鍛冶師",
            "recipe_level": 710,
            "stars": 2,
            "ingredients": [
                {"item_id": 43970, "amount": 4}, # 黒星石 x4
                {"item_id": 43971, "amount": 1}, # マグネシア砥石 x1
            ]
        },
        # ロイヤルアルパカレザー (革細工)
        {
            "id": 35002,
            "item_result_id": 43988,
            "amount_result": 1,
            "craft_type": 4, # 革細工師
            "job_name": "革細工師",
            "recipe_level": 710,
            "stars": 2,
            "ingredients": [
                {"item_id": 43972, "amount": 4}, # アルパカの粗皮 x4
                {"item_id": 44103, "amount": 1}, # 高純度アルブメン x1
            ]
        },
        # マグネシアクロス (裁縫)
        {
            "id": 35003,
            "item_result_id": 43985,
            "amount_result": 1,
            "craft_type": 5, # 裁縫師
            "job_name": "裁縫師",
            "recipe_level": 710,
            "stars": 2,
            "ingredients": [
                {"item_id": 43971, "amount": 4}, # マグネシア砥石 x4
                {"item_id": 43975, "amount": 2}, # 生マユ x2
            ]
        },
        # クラロウォールナット材 (木工)
        {
            "id": 35004,
            "item_result_id": 43992,
            "amount_result": 1,
            "craft_type": 0, # 木工師
            "job_name": "木工師",
            "recipe_level": 710,
            "stars": 2,
            "ingredients": [
                {"item_id": 43973, "amount": 4}, # クラロウォールナット原木 x4
                {"item_id": 43971, "amount": 1}, # マグネシア砥石 x1
            ]
        },
        # 剛力の宝薬G2 (錬金)
        {
            "id": 35010,
            "item_result_id": 44170,
            "amount_result": 3, # 1回で3個完成
            "craft_type": 6, # 錬金術師
            "job_name": "錬金術師",
            "recipe_level": 710,
            "stars": 2,
            "ingredients": [
                {"item_id": 44104, "amount": 2}, # 黄金の霊砂 x2
                {"item_id": 43970, "amount": 2}, # 黒星石 x2
                {"item_id": 44103, "amount": 2}, # 高純度アルブメン x2
            ]
        },
        # ローストアルパカ (調理)
        {
            "id": 35020,
            "item_result_id": 44161,
            "amount_result": 3,
            "craft_type": 7, # 調理師
            "job_name": "調理師",
            "recipe_level": 710,
            "stars": 2,
            "ingredients": [
                {"item_id": 44100, "amount": 3}, # アルパカの肉 x3
                {"item_id": 44101, "amount": 2}, # ヤクの乳 x2 (店売り有)
                {"item_id": 44102, "amount": 1}, # 食塩 x1 (店売り有)
                {"item_id": 44104, "amount": 1}, # 黄金の霊砂 x1
            ]
        },
        # ブラックスター・グレートソード (鍛冶) - 中間素材を使用するレシピ！
        {
            "id": 35030,
            "item_result_id": 44501,
            "amount_result": 1,
            "craft_type": 1,
            "job_name": "鍛冶師",
            "recipe_level": 710,
            "stars": 2,
            "ingredients": [
                {"item_id": 43980, "amount": 3}, # ブラックスターインゴット x3 (自作可能)
                {"item_id": 43988, "amount": 1}, # ロイヤルアルパカレザー x1 (自作可能)
                {"item_id": 44104, "amount": 2}, # 黄金の霊砂 x2
            ]
        },
        # ロイヤルアルパカ・キャスターコート (裁縫/革細工)
        {
            "id": 35031,
            "item_result_id": 44520,
            "amount_result": 1,
            "craft_type": 5,
            "job_name": "裁縫師",
            "recipe_level": 710,
            "stars": 2,
            "ingredients": [
                {"item_id": 43988, "amount": 3}, # ロイヤルアルパカレザー x3
                {"item_id": 43985, "amount": 2}, # マグネシアクロス x2
                {"item_id": 44104, "amount": 2}, # 黄金の霊砂 x2
            ]
        },
        # ブラックスター・ディフェンダーリング (彫金)
        {
            "id": 35032,
            "item_result_id": 44530,
            "amount_result": 1,
            "craft_type": 3,
            "job_name": "彫金師",
            "recipe_level": 710,
            "stars": 2,
            "ingredients": [
                {"item_id": 43980, "amount": 2}, # ブラックスターインゴット x2
                {"item_id": 44104, "amount": 1}, # 黄金の霊砂 x1
            ]
        }
    ]
}

def init_db_and_seed():
    Base.metadata.create_all(bind=engine)
    db: Session = SessionLocal()
    try:
        # Check if already seeded
        existing_count = db.query(Item).count()
        if existing_count > 0:
            print(f"Database already has {existing_count} items. Skipping initial seed.")
            return

        print("Seeding starter items and recipes...")
        # Add items
        for item_data in STARTER_DATA["items"]:
            item = Item(
                id=item_data["id"],
                name_ja=item_data["name_ja"],
                name_en=item_data.get("name_en"),
                icon_url=f"https://universalis-ffxiv.github.io/universalis-assets/icon2x/{item_data['id']}.png",
                item_ui_category=item_data.get("category"),
                level_item=item_data.get("level_item", 1),
                level_equip=item_data.get("level_equip", 1),
                price_mid=item_data.get("price_mid", 0),
                can_be_crafted=item_data.get("can_be_crafted", False),
                is_marketable=True
            )
            db.merge(item)

        # Add recipes
        for r_data in STARTER_DATA["recipes"]:
            recipe = Recipe(
                id=r_data["id"],
                item_result_id=r_data["item_result_id"],
                amount_result=r_data.get("amount_result", 1),
                craft_type=r_data.get("craft_type", 0),
                job_name=r_data.get("job_name", "木工師"),
                recipe_level=r_data.get("recipe_level", 1),
                stars=r_data.get("stars", 0)
            )
            db.merge(recipe)
            db.flush()

            for ing in r_data.get("ingredients", []):
                recipe_ing = RecipeIngredient(
                    recipe_id=recipe.id,
                    item_id=ing["item_id"],
                    amount=ing["amount"]
                )
                db.add(recipe_ing)

        db.commit()
        print("Initial starter seed completed successfully!")

    except Exception as e:
        db.rollback()
        print(f"Error seeding database: {e}")
        raise e
    finally:
        db.close()

if __name__ == "__main__":
    init_db_and_seed()
