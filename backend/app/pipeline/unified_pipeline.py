import asyncio
import httpx
import sqlite3
import time
import sys
import os
import json
import gzip
import argparse
from datetime import datetime, timezone, timedelta
from collections import defaultdict

sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)

DB_PATH = "data/ff14_craft.db"
OUTPUT_GZ_PATH = "frontend/public/data.json.gz"
OUTPUT_DATA_DIR_GZ = "data/data.json.gz"
OUTPUT_FALLBACK_JSON = "frontend/public/data.json"

OUTPUT_CRAFT_JSON = "frontend/public/craft.json"
OUTPUT_CRAFT_GZ = "frontend/public/craft.json.gz"

JAPAN_DCS = ["Elemental", "Gaia", "Mana", "Meteor"]
DC_WORLDS = {
    "Mana": ["Anima", "Asura", "Chocobo", "Hades", "Ixion", "Masamune", "Pandaemonium", "Titan"],
    "Elemental": ["Carbuncle", "Gungnir", "Kujata", "Typhon", "Atomos", "Tonberry", "Aegis", "Garuda"],
    "Gaia": ["Alexander", "Bahamut", "Durandal", "Fenrir", "Ifrit", "Ridill", "Tiamat", "Ultima"],
    "Meteor": ["Belias", "Mandragora", "Ramuh", "Shinryu", "Unicorn", "Valefor", "Yojimbo", "Zeromus"]
}
WORLD_TO_DC = {}
ALL_WORLDS = []
for dc, worlds in DC_WORLDS.items():
    for w in worlds:
        WORLD_TO_DC[w] = dc
        ALL_WORLDS.append(w)

JOB_SHORT = {
    "木工師": "木工", "鍛冶師": "鍛冶", "甲冑師": "甲冑", "彫金師": "彫金",
    "革細工師": "革細", "裁縫師": "裁縫", "錬金術師": "錬金", "調理師": "調理"
}

async def fetch_chunk(client: httpx.AsyncClient, dc_name: str, chunk: list, sem: asyncio.Semaphore, retry_limit: int = 3):
    chunk_str = ",".join(str(x) for x in chunk)
    url = f"https://universalis.app/api/v2/history/{dc_name}/{chunk_str}?entriesWithin=604800"
    last_err = None
    
    async with sem:
        for attempt in range(retry_limit):
            try:
                resp = await client.get(url)
                if resp.status_code == 200:
                    data = resp.json()
                    items_dict = data.get("items", {})
                    if not items_dict and "entries" in data:
                        items_dict = {str(data.get("itemID")): data}

                    records = []
                    for item_id_str, item_data in items_dict.items():
                        try:
                            iid = int(item_id_str)
                        except:
                            continue
                        for e in item_data.get("entries", []):
                            records.append((
                                iid,
                                dc_name,
                                e.get("worldName", ""),
                                1 if e.get("hq") else 0,
                                e.get("pricePerUnit", 0),
                                e.get("quantity", 0),
                                e.get("timestamp", 0),
                                e.get("buyerName", "")
                            ))
                    return records, True
                elif resp.status_code == 429:
                    last_err = "HTTP 429 (Rate Limit)"
                    backoff = 2.0 * (2 ** attempt)
                    await asyncio.sleep(backoff)
                else:
                    last_err = f"HTTP {resp.status_code}"
                    backoff = 1.0 * (2 ** attempt)
                    await asyncio.sleep(backoff)
            except Exception as e:
                last_err = f"{type(e).__name__}"
                backoff = 1.0 * (2 ** attempt)
                await asyncio.sleep(backoff)

    print(f"  ⚠️ [API Warning] Failed to fetch chunk for {dc_name} ({len(chunk)} items, ID range: {chunk[0]}..{chunk[-1]}) after {retry_limit} retries ({last_err}). Skipped & preserving prior DB data.")
    return [], False

def restore_from_existing_data_json(conn: sqlite3.Connection) -> int:
    """
    DBが空またはレコードが少ない場合に、既存の data.json.gz または data.json から
    直近7日以内の有効な取引履歴を SQLite DB (sales_history) に復元・マージする。
    これにより、API一時障害時でも前回の取引履歴が維持されデータ欠落を防ぐ。
    """
    candidate_paths = [
        OUTPUT_GZ_PATH,
        OUTPUT_DATA_DIR_GZ,
        "data/data.json.gz",
        OUTPUT_FALLBACK_JSON
    ]
    loaded_path = None
    existing_data = None
    for p in candidate_paths:
        if os.path.exists(p) and os.path.getsize(p) > 0:
            try:
                if p.endswith(".gz"):
                    with gzip.open(p, "rt", encoding="utf-8") as f:
                        existing_data = json.load(f)
                else:
                    with open(p, "r", encoding="utf-8") as f:
                        existing_data = json.load(f)
                loaded_path = p
                break
            except Exception as e:
                print(f"⚠️ Notice: Could not read {p}: {e}")

    if not existing_data or "data" not in existing_data:
        return 0

    now_utc = datetime.now(timezone.utc)
    seven_days_ago_ts = int((now_utc - timedelta(days=7)).timestamp())

    cursor = conn.cursor()
    records_to_insert = []

    for world_name, item_list in existing_data.get("data", {}).items():
        dc_name = WORLD_TO_DC.get(world_name, "")
        for item in item_list:
            iid = item.get("item_id")
            if not iid:
                continue
            for h in item.get("history", []):
                ts = h.get("ts", 0)
                if ts >= seven_days_ago_ts:
                    records_to_insert.append((
                        iid,
                        dc_name,
                        world_name,
                        1 if h.get("hq") else 0,
                        h.get("price", 0),
                        h.get("qty", 0),
                        ts,
                        h.get("buyer", "")
                    ))

    if records_to_insert:
        cursor.executemany("""
        INSERT OR IGNORE INTO sales_history (item_id, dc_name, world_name, hq, price_per_unit, quantity, timestamp, buyer_name)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, records_to_insert)
        conn.commit()
        print(f"🛡️ Restored & Merged {len(records_to_insert):,} fallback trade records from existing {loaded_path}")
        return len(records_to_insert)
    return 0

def sanitize_icon_url(url: str) -> str:
    if not url:
        return ""
    prefix = "https://universalis-ffxiv.github.io/universalis-assets/icon2x/"
    if url.startswith(prefix) and "http" in url[len(prefix):]:
        url = url[len(prefix):]
        if url.endswith(".png") and "&format=png" in url:
            url = url[:-4]
    return url

def get_items_metadata(conn: sqlite3.Connection) -> dict:
    """
    アイテムメタデータ（名前、カテゴリ、アイコン、店売り価格、IL）を取得。
    1. SQLite の items テーブルが存在しデータがあればそれを利用
    2. なければ data/items_metadata.json.gz から復元し、SQLite に items テーブルを自動作成
    3. 万が一どちらもなければ sales_history の item_id からフォールバックを生成
    """
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='items'")
    has_table = cursor.fetchone() is not None

    if has_table:
        cursor.execute("SELECT COUNT(*) FROM items")
        count = cursor.fetchone()[0]
        if count > 0:
            cursor.execute("SELECT id, name_ja, item_ui_category, icon_url, price_mid, level_item FROM items")
            meta_dict = {}
            for r in cursor.fetchall():
                meta_dict[r[0]] = {
                    "name": r[1],
                    "category": r[2] or "その他",
                    "icon": sanitize_icon_url(r[3] or ""),
                    "shop_price": r[4] or 0,
                    "ilvl": r[5] or 1
                }
            return meta_dict

    meta_dict = {}
    candidate_paths = [
        "data/items_metadata.json.gz",
        "data/items_metadata.json",
        os.path.join(os.path.dirname(__file__), "../../../data/items_metadata.json.gz"),
        os.path.join(os.path.dirname(__file__), "../../../data/items_metadata.json")
    ]

    loaded_path = None
    for p in candidate_paths:
        norm_p = os.path.normpath(p)
        if os.path.exists(norm_p):
            try:
                if norm_p.endswith(".gz"):
                    with gzip.open(norm_p, "rt", encoding="utf-8") as f:
                        raw_data = json.load(f)
                else:
                    with open(norm_p, "r", encoding="utf-8") as f:
                        raw_data = json.load(f)

                for k, v in raw_data.items():
                    iid = int(k)
                    meta_dict[iid] = {
                        "name": v.get("name", f"Item #{iid}"),
                        "category": v.get("category", "その他"),
                        "icon": sanitize_icon_url(v.get("icon", "")),
                        "shop_price": v.get("shop_price", 0),
                        "ilvl": v.get("ilvl", 1)
                    }
                loaded_path = norm_p
                print(f"📦 Successfully restored {len(meta_dict):,} items metadata from {loaded_path}")
                break
            except Exception as e:
                print(f"⚠️ Error reading {norm_p}: {e}")

    if meta_dict:
        try:
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS items (
                id INTEGER PRIMARY KEY,
                name_ja VARCHAR(255) NOT NULL,
                name_en VARCHAR(255),
                icon_url VARCHAR(512),
                item_ui_category VARCHAR(100),
                level_item INTEGER,
                level_equip INTEGER,
                price_mid INTEGER,
                can_be_crafted BOOLEAN,
                is_marketable BOOLEAN
            );
            """)
            items_to_insert = [
                (iid, m["name"], None, m["icon"], m["category"], m["ilvl"], 1, m["shop_price"], False, True)
                for iid, m in meta_dict.items()
            ]
            cursor.executemany("""
            INSERT OR IGNORE INTO items (id, name_ja, name_en, icon_url, item_ui_category, level_item, level_equip, price_mid, can_be_crafted, is_marketable)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, items_to_insert)
            conn.commit()
            print(f"✨ Populated `items` table in SQLite with {len(items_to_insert):,} items.")
        except Exception as e:
            print(f"⚠️ Notice: Could not populate SQLite items table: {e}")
    else:
        print("⚠️ Warning: items_metadata file not found. Generating fallback entries from sales_history...")
        cursor.execute("SELECT DISTINCT item_id FROM sales_history")
        for (iid,) in cursor.fetchall():
            meta_dict[iid] = {
                "name": f"Item #{iid}",
                "category": "その他",
                "icon": sanitize_icon_url(f"https://universalis-ffxiv.github.io/universalis-assets/icon2x/{iid}.png"),
                "shop_price": 0,
                "ilvl": 1
            }

    return meta_dict


def export_recipes_json(conn, meta_dict=None):
    print("\n=== [5/5] Checking & Exporting recipes.json ===")
    t_start = time.time()
    c = conn.cursor()

    c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='recipes'")
    has_recipes_table = c.fetchone() is not None

    if has_recipes_table:
        if meta_dict is None:
            meta_dict = get_items_metadata(conn)

        c.execute("SELECT id, item_result_id, job_name, recipe_level, amount_result FROM recipes")
        recipes_raw = c.fetchall()

        c.execute("SELECT recipe_id, item_id, amount FROM recipe_ingredients")
        ingredients_by_recipe = defaultdict(list)
        for r_id, ing_id, amt in c.fetchall():
            ingredients_by_recipe[r_id].append([ing_id, amt])

        item_recipes_map = defaultdict(list)
        for r in recipes_raw:
            item_recipes_map[r[1]].append(r)

        recipes_dict = {}
        for result_id, r_list in item_recipes_map.items():
            first_r = r_list[0]
            r_id, _, job, r_lvl, amt_res = first_r
            ings = ingredients_by_recipe.get(r_id, [])
            if not ings:
                for alt_r in r_list:
                    alt_ings = ingredients_by_recipe.get(alt_r[0], [])
                    if alt_ings:
                        r_id, _, job, r_lvl, amt_res = alt_r
                        ings = alt_ings
                        break
            if not ings:
                continue

            unique_jobs = []
            for r_entry in r_list:
                j = r_entry[2]
                if j and j not in unique_jobs:
                    unique_jobs.append(j)

            meta = meta_dict.get(result_id, {}) if meta_dict else {}
            cat = meta.get('category', '')
            name = meta.get('name', '')

            is_company = (
                str(r_id).startswith('fc') or
                'パーツ' in cat or '外壁' in cat or '潜水艇' in cat or '飛空艇' in cat or
                '潜水艦' in name or '飛空艇' in name or '外壁' in name or '屋根' in name
            )

            if is_company:
                job_display = "カンパニークラフト"
            elif len(unique_jobs) == 8:
                job_display = "全職"
            elif len(unique_jobs) == 1:
                job_display = unique_jobs[0]
            elif len(unique_jobs) <= 3:
                job_display = "/".join(JOB_SHORT.get(j, j) for j in unique_jobs)
            else:
                job_display = f"{JOB_SHORT.get(unique_jobs[0], unique_jobs[0])}/{JOB_SHORT.get(unique_jobs[1], unique_jobs[1])}/他{len(unique_jobs)-2}"

            recipes_dict[str(result_id)] = {
                "id": r_id,
                "job": job_display,
                "lvl": r_lvl or 1,
                "amt": amt_res or 1,
                "is_company": is_company,
                "ings": ings
            }

        json_bytes = json.dumps(recipes_dict, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        gz_bytes = gzip.compress(json_bytes, compresslevel=6)

        targets = [
            ("frontend/public/recipes.json", json_bytes),
            ("frontend/public/recipes.json.gz", gz_bytes),
            ("data/recipes.json", json_bytes),
            ("data/recipes.json.gz", gz_bytes)
        ]
        for path, data in targets:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "wb") as f:
                f.write(data)

        t_end = time.time() - t_start
        print(f"✨ recipes.json ({len(json_bytes)/1024:.1f} KB, gz: {len(gz_bytes)/1024:.1f} KB) exported in {t_end:.2f}s!\n")
    else:
        # DB に recipes テーブルがない場合は既存の recipes.json を同期・利用
        src_path = None
        for p in ["data/recipes.json", "frontend/public/recipes.json"]:
            if os.path.exists(p) and os.path.getsize(p) > 0:
                src_path = p
                break
        
        if src_path:
            with open(src_path, "rb") as f:
                content = f.read()
            gz_content = gzip.compress(content, compresslevel=6)
            for target in ["frontend/public/recipes.json", "data/recipes.json"]:
                if not os.path.exists(target) or os.path.getsize(target) == 0:
                    os.makedirs(os.path.dirname(target), exist_ok=True)
                    with open(target, "wb") as f:
                        f.write(content)
            for gz_target in ["frontend/public/recipes.json.gz", "data/recipes.json.gz"]:
                if not os.path.exists(gz_target) or os.path.getsize(gz_target) == 0:
                    os.makedirs(os.path.dirname(gz_target), exist_ok=True)
                    with open(gz_target, "wb") as f:
                        f.write(gz_content)
            print(f"✨ `recipes` table not in DB; safely used existing {src_path} ({len(content)/1024:.1f} KB).\n")
        else:
            print("⚠️ Notice: No recipes table or recipes.json found; skipping recipe sync.\n")

async def auto_sync_new_items_and_recipes(conn: sqlite3.Connection, marketable_ids: list):
    """
    Universalis の取引可能アイテムIDと手元DBを突合し、
    未登録アイテムがあれば XIVAPI v2 から名前・カテゴリ・アイコンを取得してDBおよびメタデータに自動補完する。
    また、Teamcraft の最新 recipes.json をチェックして新レシピがあれば自動登録する。
    """
    print("\n=== [0/4] Checking DB & Auto-Syncing Missing Items / Recipes ===")
    cursor = conn.cursor()

    # 1. アイテムテーブルの存在確認とメタデータ確認
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='items'")
    if not cursor.fetchone():
        get_items_metadata(conn)

    cursor.execute("SELECT id, name_ja FROM items")
    existing_items = {r[0]: r[1] for r in cursor.fetchall()}

    # 未登録または仮名前(Item #xxx)のアイテムを抽出
    missing_ids = [
        iid for iid in marketable_ids
        if iid not in existing_items or (isinstance(existing_items[iid], str) and existing_items[iid].startswith("Item #"))
    ]

    if missing_ids:
        print(f"🔍 Detected {len(missing_ids):,} new/unregistered items in Universalis! Auto-fetching metadata via XIVAPI...")
        sem = asyncio.Semaphore(8)
        headers = {"User-Agent": "FF14-Craft-Market-Checker/2.0"}

        async def fetch_item_meta(client: httpx.AsyncClient, iid: int):
            url = f"https://v2.xivapi.com/api/sheet/Item/{iid}?language=ja&fields=Name,Icon,ItemUICategory.Name,LevelItem,PriceMid"
            async with sem:
                for _ in range(2):
                    try:
                        resp = await client.get(url, timeout=10.0)
                        if resp.status_code == 200:
                            data = resp.json()
                            fields = data.get("fields", {})
                            name = fields.get("Name") or f"Item #{iid}"

                            cat_obj = fields.get("ItemUICategory")
                            cat_name = "その他"
                            if isinstance(cat_obj, dict):
                                cat_name = cat_obj.get("fields", {}).get("Name") or "その他"

                            icon_obj = fields.get("Icon")
                            icon_path = ""
                            if isinstance(icon_obj, dict):
                                icon_path = icon_obj.get("path_hr1") or icon_obj.get("path") or ""
                            if icon_path:
                                icon_url = f"https://v2.xivapi.com/api/asset?path={icon_path}&format=png"
                            else:
                                icon_url = f"https://universalis-ffxiv.github.io/universalis-assets/icon2x/{iid}.png"

                            price_mid = fields.get("PriceMid", 0) or 0
                            ilvl_obj = fields.get("LevelItem")
                            ilvl = 1
                            if isinstance(ilvl_obj, dict):
                                ilvl = ilvl_obj.get("value", 1) or ilvl_obj.get("row_id", 1) or 1
                            elif isinstance(ilvl_obj, int):
                                ilvl = ilvl_obj

                            return (iid, name, None, icon_url, cat_name, ilvl, 1, price_mid, False, True)
                    except Exception:
                        await asyncio.sleep(0.5)

            # Fallback
            return (
                iid,
                f"Item #{iid}",
                None,
                f"https://universalis-ffxiv.github.io/universalis-assets/icon2x/{iid}.png",
                "その他",
                1, 1, 0, False, True
            )

        async with httpx.AsyncClient(headers=headers, timeout=12.0) as client:
            tasks = [fetch_item_meta(client, iid) for iid in missing_ids]
            new_items_data = await asyncio.gather(*tasks)

        cursor.executemany("""
            INSERT INTO items (id, name_ja, name_en, icon_url, item_ui_category, level_item, level_equip, price_mid, can_be_crafted, is_marketable)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                name_ja = excluded.name_ja,
                icon_url = excluded.icon_url,
                item_ui_category = excluded.item_ui_category,
                level_item = excluded.level_item,
                price_mid = excluded.price_mid
        """, new_items_data)
        conn.commit()
        print(f"✨ Successfully added/updated {len(new_items_data):,} items in SQLite database.")

        # items_metadata.json.gz も同期
        candidate_meta_paths = [
            "data/items_metadata.json.gz",
            os.path.join(os.path.dirname(__file__), "../../../data/items_metadata.json.gz")
        ]
        for p in candidate_meta_paths:
            norm_p = os.path.normpath(p)
            if os.path.exists(norm_p):
                try:
                    with gzip.open(norm_p, "rt", encoding="utf-8") as f:
                        m_dict = json.load(f)
                    for row in new_items_data:
                        m_dict[str(row[0])] = {
                            "name": row[1],
                            "category": row[4],
                            "icon": sanitize_icon_url(row[3]),
                            "shop_price": row[7],
                            "ilvl": row[5]
                        }
                    with gzip.open(norm_p, "wt", encoding="utf-8") as f:
                        json.dump(m_dict, f, ensure_ascii=False)
                    print(f"📦 Synchronized updated item metadata into {norm_p}")
                    break
                except Exception as e:
                    print(f"⚠️ Warning: Could not update {norm_p}: {e}")
    else:
        print(f"✨ Item metadata is fully up to date ({len(existing_items):,} items registered).")

    # 2. Teamcraft レシピの最新差分確認 & 自動インポート
    print("🍳 Checking recipe catalog for new patch recipes...")
    recipes_url = "https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/staging/libs/data/src/lib/json/recipes.json"
    try:
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='recipes'")
        if cursor.fetchone():
            cursor.execute("SELECT COUNT(*) FROM recipes")
            current_recipe_count = cursor.fetchone()[0]

            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(recipes_url)
                if resp.status_code == 200:
                    recipes_data = resp.json()
                    if len(recipes_data) > current_recipe_count:
                        print(f"🍳 Detected new recipes ({current_recipe_count:,} -> {len(recipes_data):,})! Auto-syncing...")
                        cursor.execute("SELECT id FROM recipes")
                        existing_recipe_ids = {str(r[0]) for r in cursor.fetchall()}

                        job_map = {
                            8: {"craft_type": 0, "job_name": "木工師"},
                            9: {"craft_type": 1, "job_name": "鍛冶師"},
                            10: {"craft_type": 2, "job_name": "甲冑師"},
                            11: {"craft_type": 3, "job_name": "彫金師"},
                            12: {"craft_type": 4, "job_name": "革細工師"},
                            13: {"craft_type": 5, "job_name": "裁縫師"},
                            14: {"craft_type": 6, "job_name": "錬金術師"},
                            15: {"craft_type": 7, "job_name": "調理師"},
                        }

                        new_recipes = []
                        new_ingredients = []
                        crafted_item_ids = []

                        for r in recipes_data:
                            r_id = str(r.get("id"))
                            if r_id in existing_recipe_ids:
                                continue
                            result_id = r.get("result")
                            if not isinstance(result_id, int):
                                continue
                            job_id = r.get("job", 8)
                            job_info = job_map.get(job_id, {"craft_type": 0, "job_name": "木工師"})

                            new_recipes.append((
                                r_id,
                                result_id,
                                r.get("yields", 1) or 1,
                                job_info["craft_type"],
                                job_info["job_name"],
                                r.get("lvl", 1) or 1,
                                r.get("stars", 0) or 0
                            ))
                            crafted_item_ids.append(result_id)
                            for ing in r.get("ingredients", []):
                                ing_id = ing.get("id")
                                amt = ing.get("amount", 1)
                                if isinstance(ing_id, int) and amt > 0:
                                    new_ingredients.append((r_id, ing_id, amt))

                        if new_recipes:
                            cursor.executemany("""
                                INSERT OR IGNORE INTO recipes (id, item_result_id, amount_result, craft_type, job_name, recipe_level, stars)
                                VALUES (?, ?, ?, ?, ?, ?, ?)
                            """, new_recipes)
                            cursor.executemany("""
                                INSERT OR IGNORE INTO recipe_ingredients (recipe_id, item_id, amount)
                                VALUES (?, ?, ?)
                            """, new_ingredients)
                            for cid in set(crafted_item_ids):
                                cursor.execute("UPDATE items SET can_be_crafted = 1 WHERE id = ?", (cid,))
                            conn.commit()
                            print(f"✨ Successfully added {len(new_recipes):,} new recipes to DB.")
                    else:
                        print(f"✨ Recipes are fully up to date ({current_recipe_count:,} recipes in DB).")
    except Exception as e:
        print(f"⚠️ Notice: Recipe check skipped ({e}).")

def aggregate_and_export_clean_data(conn, cursor, meta_dict):
    jst = timezone(timedelta(hours=9))
    now_jst = datetime.now(jst)
    today_date_jst = now_jst.date()
    now_str = now_jst.isoformat()
    day_boundaries = []
    for d in range(6, -1, -1):
        d_day = today_date_jst - timedelta(days=d)
        d_start = datetime(d_day.year, d_day.month, d_day.day, tzinfo=jst)
        d_end = d_start + timedelta(days=1)
        d_lbl = d_start.strftime("%m/%d")
        day_boundaries.append((d_lbl, int(d_start.timestamp()), int(d_end.timestamp())))

    min_7d_ts = day_boundaries[0][1]
    cursor.execute("""
    SELECT item_id, world_name, hq, price_per_unit, quantity, timestamp, buyer_name
    FROM sales_history
    WHERE timestamp >= ?
    ORDER BY timestamp DESC
    """, (min_7d_ts,))
    all_rows = cursor.fetchall()
    print(f"📊 Analyzing {len(all_rows):,} records for clean noise filtering & aggregation...")

    # Step 1: Pre-calculate Median Anchor for General Items
    raw_prices_by_key = defaultdict(list)
    for r in all_rows:
        iid, wname, hq, ppu, qty, ts, buyer = r
        sp = meta_dict.get(iid, {}).get("shop_price", 0)
        if sp == 0:
            k = (iid, wname, 1 if hq else 0)
            if len(raw_prices_by_key[k]) < 60:
                raw_prices_by_key[k].append(ppu)

    anchors = {}
    for k, plist in raw_prices_by_key.items():
        plist.sort()
        anchors[k] = plist[len(plist) // 2]

    # Step 2: Filter noise and aggregate into accumulators
    acc_by_item_world_hq = {}
    world_medians_nq = defaultdict(dict)
    world_medians_hq = defaultdict(dict)
    noise_count = 0

    for row in all_rows:
        iid, wname, hq, ppu, qty, ts, buyer = row
        is_hq = 1 if hq else 0
        key = (iid, wname, is_hq)
        sp = meta_dict.get(iid, {}).get("shop_price", 0)

        # 🛡️ 統一ノイズフィルター判定 (3層アンカー方式)
        is_noise = False
        if sp > 0:
            # A. 店売りアイテムのギル移動排除 (店売り価格の50倍 または 3,000G 超は完全除外)
            npc_ceiling = max(sp * 50, 3000)
            if ppu > npc_ceiling:
                is_noise = True
        else:
            anchor = anchors.get(key, 0)
            # B. 下限ノイズガード: 
            # - 高額品 (50万G以上): 相場の 55% 未満 (半額投げ売り・桁ミス) を除外
            # - 中額品 (5,000G以上): 相場の 35% 未満を除外
            # - 低額品 (200G以上): 相場の 30% 未満を除外
            # - 50G以上の品で 10G 以下の投げ売り・捨て売りを除外
            if anchor >= 500000 and ppu < anchor * 0.55:
                is_noise = True
            elif anchor >= 5000 and ppu < anchor * 0.35:
                is_noise = True
            elif anchor >= 200 and ppu < anchor * 0.30:
                is_noise = True
            elif anchor >= 50 and ppu <= 10:
                is_noise = True
            # C. 上限ノイズガード: 基準相場の 3.0倍を超え、かつ差額が 10,000G 以上のギル移動取引を除外
            elif anchor > 0 and ppu > anchor * 3.0 and (ppu - anchor) >= 10000:
                is_noise = True
            # D. 極端な高額品 (100万G以上) の異常暴騰 (1.8倍超) を除外
            elif anchor >= 1000000 and ppu > anchor * 1.8:
                is_noise = True

        if is_noise:
            noise_count += 1
            continue

        if key not in acc_by_item_world_hq:
            acc_by_item_world_hq[key] = {
                "min_p": ppu,
                "max_p": ppu,
                "total_qty": 0,
                "total_trades": 0,
                "prices_sample": [],
                "day_buckets": {lbl: {"qty": 0, "rev": 0} for lbl, _, _ in day_boundaries},
                "history": []
            }
        acc = acc_by_item_world_hq[key]
        if ppu < acc["min_p"]: acc["min_p"] = ppu
        if ppu > acc["max_p"]: acc["max_p"] = ppu
        acc["total_qty"] += qty
        acc["total_trades"] += 1
        if len(acc["prices_sample"]) < 100:
            acc["prices_sample"].append(ppu)

        for d_lbl, s_ts, e_ts in day_boundaries:
            if s_ts <= ts < e_ts:
                acc["day_buckets"][d_lbl]["qty"] += qty
                acc["day_buckets"][d_lbl]["rev"] += (ppu * qty)
                break

        if len(acc["history"]) < 20:
            acc["history"].append({
                "price": ppu,
                "qty": qty,
                "hq": bool(hq),
                "ts": ts,
                "buyer": buyer or ""
            })

    print(f"🛡️ Clean Filter applied: {len(all_rows) - noise_count:,} kept, {noise_count:,} noise records eliminated")

    data_by_world = {}
    actual_days = 7.0

    for (iid, wname, is_hq), acc in acc_by_item_world_hq.items():
        if acc["total_trades"] == 0:
            continue

        real_vel = round(acc["total_qty"] / actual_days, 1)
        sp = sorted(acc["prices_sample"])
        avg_p = sp[len(sp) // 2] if sp else acc["min_p"]
        daily_revenue = round(avg_p * real_vel)

        med_entry = {
            'median': avg_p,
            'velocity': real_vel,
            'min_price': acc["min_p"]
        }
        if is_hq:
            world_medians_hq[wname][iid] = med_entry
        else:
            world_medians_nq[wname][iid] = med_entry

        daily_trend = []
        valid_avgs = []
        for d_lbl, _, _ in day_boundaries:
            b = acc["day_buckets"][d_lbl]
            d_qty = b["qty"]
            d_rev = b["rev"]
            d_wavg = round(d_rev / float(d_qty)) if d_qty > 0 else 0
            daily_trend.append({"date": d_lbl, "weighted_avg": d_wavg, "volume": d_qty})
            if d_wavg > 0:
                valid_avgs.append(d_wavg)

        trend_pct = 0.0
        if len(valid_avgs) >= 2 and valid_avgs[0] > 0:
            latest_p = valid_avgs[-1]
            oldest_p = valid_avgs[0]
            trend_pct = round(((latest_p - oldest_p) / float(oldest_p)) * 100.0, 1)
        elif valid_avgs and avg_p > 0:
            latest_p = valid_avgs[-1]
            trend_pct = round(((latest_p - avg_p) / float(avg_p)) * 100.0, 1)

        item_obj = {
            "item_id": iid,
            "hq": bool(is_hq),
            "min_price": acc["min_p"],
            "avg_price": avg_p,
            "max_price": acc["max_p"],
            "sale_velocity": real_vel,
            "sale_trades": acc["total_trades"],
            "daily_revenue": daily_revenue,
            "daily_trend": daily_trend,
            "trend_pct": trend_pct,
            "history": acc["history"],
            "updated_at": now_str
        }
        data_by_world.setdefault(wname, []).append(item_obj)

    for wname in data_by_world:
        data_by_world[wname].sort(key=lambda x: x["sale_velocity"], reverse=True)

    items_catalog = {}
    for iid, m in meta_dict.items():
        entry = {
            "name": m.get("name", f"Item #{iid}"),
            "icon": m.get("icon", ""),
            "category": m.get("category", "その他")
        }
        sp = m.get("shop_price", 0)
        if sp > 0:
            entry["shop_price"] = sp
        ilvl = m.get("ilvl", 1)
        if ilvl > 1:
            entry["ilvl"] = ilvl
        items_catalog[str(iid)] = entry

    web_data = {
        "last_updated": now_str,
        "datacenters": JAPAN_DCS,
        "dc_worlds": DC_WORLDS,
        "items": items_catalog,
        "data": data_by_world
    }

    json_bytes = json.dumps(web_data, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    gz_bytes = gzip.compress(json_bytes, compresslevel=6)
    
    for gz_target in [OUTPUT_GZ_PATH, OUTPUT_DATA_DIR_GZ, "frontend/dist/data.json.gz"]:
        os.makedirs(os.path.dirname(gz_target), exist_ok=True)
        with open(gz_target, "wb") as f:
            f.write(gz_bytes)

    export_recipes_json(conn)

    gz_size_mb = len(gz_bytes) / (1024 * 1024)
    raw_size_mb = len(json_bytes) / (1024 * 1024)
    print(f"📄 Output Clean data.json.gz Size: {gz_size_mb:.2f} MB (raw: {raw_size_mb:.1f} MB)")
    return len(json_bytes), len(gz_bytes)

async def run_full_scan_and_export(sample_limit: int = None, concurrency: int = 4):
    start_time = time.time()
    print("=" * 65)
    print("  🚀 FF14 Ultra-Fast Parallel Market Pipeline")
    print(f"  ⚡ Concurrency: {concurrency} Parallel Streams | Rolling 7-Day Merge")
    print("=" * 65)

    marketable_file = "data/marketable_item_ids.txt"
    print("🌐 Checking latest marketable items list from Universalis...")
    online_marketable_ids = []
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get("https://universalis.app/api/v2/marketable")
            if resp.status_code == 200:
                online_marketable_ids = sorted(resp.json())
    except Exception as e:
        print(f"⚠️ Could not fetch latest marketable items from Universalis ({e}).")

    if online_marketable_ids:
        marketable_ids = online_marketable_ids
        try:
            with open(marketable_file, "w", encoding="utf-8") as f:
                f.write("\n".join(str(x) for x in marketable_ids))
            print(f"✨ Universalis marketable items verified: {len(marketable_ids):,} items.")
        except Exception:
            pass
    elif os.path.exists(marketable_file):
        with open(marketable_file, "r", encoding="utf-8") as f:
            marketable_ids = [int(line.strip()) for line in f if line.strip()]
        print(f"📦 Loaded {len(marketable_ids):,} items from local cache.")
    else:
        raise RuntimeError("Failed to obtain marketable item IDs")

    if sample_limit:
        marketable_ids = marketable_ids[:sample_limit]
        print(f"🧪 [TEST MODE] Processing subset of {len(marketable_ids):,} items")
    else:
        print(f"📦 [FULL MODE] Processing ALL {len(marketable_ids):,} marketable items")

    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA synchronous = NORMAL;")
    conn.execute("PRAGMA cache_size = -64000;")
    conn.execute("PRAGMA temp_store = MEMORY;")
    cursor = conn.cursor()

    # === [0/4] Automatic DB & Master Catalog Sync (New Items & Recipes) ===
    await auto_sync_new_items_and_recipes(conn, marketable_ids)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS sales_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_id INTEGER NOT NULL,
        dc_name TEXT NOT NULL,
        world_name TEXT NOT NULL,
        hq INTEGER NOT NULL,
        price_per_unit INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        timestamp INTEGER NOT NULL,
        buyer_name TEXT
    );
    """)
    cursor.execute("""
    CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_unique 
    ON sales_history (item_id, world_name, timestamp, price_per_unit, quantity, buyer_name);
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_sales_history_ts_item ON sales_history (timestamp, item_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_sales_world_item_hq ON sales_history (world_name, item_id, hq, timestamp DESC);")
    conn.commit()

    cursor.execute("SELECT COUNT(*) FROM sales_history")
    initial_count = cursor.fetchone()[0]
    print(f"📊 Current DB Records before scan: {initial_count:,} records")

    # DB内のレコードが0件（または非常に少ない）場合、既存の data.json.gz からフォールバック復元
    if initial_count < 10000:
        restored_cnt = restore_from_existing_data_json(conn)
        if restored_cnt > 0:
            cursor.execute("SELECT COUNT(*) FROM sales_history")
            initial_count = cursor.fetchone()[0]
            print(f"📊 Current DB Records after fallback restore: {initial_count:,} records")

    cursor.execute("DROP TABLE IF EXISTS temp_raw_sales;")
    cursor.execute("""
    CREATE TABLE temp_raw_sales (
        item_id INTEGER,
        dc_name TEXT,
        world_name TEXT,
        hq INTEGER,
        price_per_unit INTEGER,
        quantity INTEGER,
        timestamp INTEGER,
        buyer_name TEXT
    );
    """)
    conn.commit()

    CHUNK_SIZE = 100
    chunks = [marketable_ids[i:i + CHUNK_SIZE] for i in range(0, len(marketable_ids), CHUNK_SIZE)]
    
    task_specs = []
    for c_idx in range(len(chunks)):
        for dc_name in JAPAN_DCS:
            task_specs.append((dc_name, chunks[c_idx]))

    total_tasks = len(task_specs)
    print(f"🌐 Scheduled {total_tasks:,} interleaved async requests (Round-Robin across 4 DCs)")

    headers = {"User-Agent": "FF14-AsyncFast-Sync/2.0"}
    limits = httpx.Limits(max_keepalive_connections=20, max_connections=concurrency * 4)
    sem = asyncio.Semaphore(concurrency)

    completed_tasks = 0
    failed_tasks = 0
    total_fetched_entries = 0
    fetch_start_time = time.time()
    buffered_records = []

    print("\n=== [1/4] Executing Parallel Streaming Fetch ===")
    SUB_BATCH = 20
    async with httpx.AsyncClient(timeout=18.0, headers=headers, limits=limits) as client:
        for i in range(0, total_tasks, SUB_BATCH):
            batch_specs = task_specs[i:i + SUB_BATCH]
            tasks = [fetch_chunk(client, dc_name, chunk, sem) for dc_name, chunk in batch_specs]
            results = await asyncio.gather(*tasks)

            for res, is_success in results:
                if is_success:
                    if res:
                        buffered_records.extend(res)
                        total_fetched_entries += len(res)
                else:
                    failed_tasks += 1

            completed_tasks += len(batch_specs)

            if len(buffered_records) >= 50000 or completed_tasks == total_tasks:
                if buffered_records:
                    cursor.executemany("""
                    INSERT INTO temp_raw_sales (item_id, dc_name, world_name, hq, price_per_unit, quantity, timestamp, buyer_name)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """, buffered_records)
                    conn.commit()
                    buffered_records.clear()

            if completed_tasks % 20 == 0 or completed_tasks == total_tasks:
                elapsed = time.time() - fetch_start_time
                pct = (completed_tasks / float(total_tasks)) * 100.0
                rate = completed_tasks / elapsed if elapsed > 0 else 0
                failure_info = f" | Failures: {failed_tasks}" if failed_tasks > 0 else ""
                print(f"  ⚡ Progress: {completed_tasks}/{total_tasks} ({pct:.1f}%) | Speed: {rate:.1f} req/s | Fetched: {total_fetched_entries:,} entries{failure_info} | Elapsed: {elapsed:.1f}s")

    print(f"\n✅ Parallel API Fetch Finished in {time.time() - fetch_start_time:.2f}s ({(time.time() - fetch_start_time)/60:.2f} min)!")
    if failed_tasks > 0:
        print(f"⚠️ [API Notice] {failed_tasks}/{total_tasks} chunks encountered errors/timeouts. Missing data was safely preserved from prior 7-day database records.")
    else:
        print(f"✨ [API Notice] 100% of chunks ({total_tasks:,}/{total_tasks:,}) fetched successfully without errors.")

    print("\n=== [2/4] Executing High-Speed DB Merge ===")
    merge_start = time.time()
    cursor.execute("""
    INSERT OR IGNORE INTO sales_history (item_id, dc_name, world_name, hq, price_per_unit, quantity, timestamp, buyer_name)
    SELECT item_id, dc_name, world_name, hq, price_per_unit, quantity, timestamp, buyer_name
    FROM temp_raw_sales;
    """)
    conn.commit()
    cursor.execute("DROP TABLE temp_raw_sales;")
    conn.commit()
    print(f"✨ Batch Merge Completed in {time.time() - merge_start:.2f}s!")

    print("\n=== [3/4] Executing 7-Day Rolling Purge ===")
    now_utc = datetime.now(timezone.utc)
    seven_days_ago_ts = int((now_utc - timedelta(days=7)).timestamp())
    cursor.execute("SELECT COUNT(*) FROM sales_history WHERE timestamp < ?", (seven_days_ago_ts,))
    purged_count = cursor.fetchone()[0]
    cursor.execute("DELETE FROM sales_history WHERE timestamp < ?", (seven_days_ago_ts,))
    conn.commit()
    print(f"🗑️  Purged {purged_count:,} records older than 7 days.")

    cursor.execute("SELECT COUNT(*) FROM sales_history")
    final_count = cursor.fetchone()[0]
    net_change = final_count - initial_count
    print(f"🌟 Final DB Records: {final_count:,} (Net change: {'+' if net_change >= 0 else ''}{net_change:,} newly accumulated)")

    print("\n=== [4/4] Aggregating Analytics & Exporting data.json.gz ===")
    meta_dict = get_items_metadata(conn)

    raw_bytes_len, gz_bytes_len = aggregate_and_export_clean_data(conn, cursor, meta_dict)
    raw_size_mb = raw_bytes_len / (1024 * 1024)
    gz_size_mb = gz_bytes_len / (1024 * 1024)

    export_recipes_json(conn, meta_dict)

    conn.execute("VACUUM;")
    conn.close()

    total_time = time.time() - start_time
    db_size_mb = os.path.getsize(DB_PATH) / (1024 * 1024)

    print("\n" + "=" * 65)
    print(f"🎉 Fully Automated Unified Pipeline Finished in {total_time:.2f}s ({total_time/60:.2f} min)")
    print(f"📦 SQLite DB Size: {db_size_mb:.1f} MB ({final_count:,} total records)")
    if os.path.exists("frontend/public/recipes.json"):
        print(f"📄 Output recipes.json Size: {os.path.getsize('frontend/public/recipes.json')/1024:.1f} KB")
    print("=" * 65)

async def run_export_only():
    start_time = time.time()
    print("=" * 65)
    print("  🚀 FF14 Export Only Pipeline (From existing DB)")
    print("=" * 65)
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA synchronous = NORMAL;")
    conn.execute("PRAGMA cache_size = -64000;")
    conn.execute("PRAGMA temp_store = MEMORY;")
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) FROM sales_history")
    final_count = cursor.fetchone()[0]
    print(f"📊 Current DB Records: {final_count:,} records")

    now_utc = datetime.now(timezone.utc)
    print("\n=== [4/4] Aggregating Analytics & Exporting data.json.gz (NQ & HQ Separated) ===")
    meta_dict = get_items_metadata(conn)

    raw_bytes_len, gz_bytes_len = aggregate_and_export_clean_data(conn, cursor, meta_dict)
    raw_size_mb = raw_bytes_len / (1024 * 1024)
    gz_size_mb = gz_bytes_len / (1024 * 1024)

    export_recipes_json(conn, meta_dict)

    conn.close()

    total_time = time.time() - start_time
    db_size_mb = os.path.getsize(DB_PATH) / (1024 * 1024)

    print("\n" + "=" * 65)
    print(f"🎉 Export Only Finished in {total_time:.2f}s")
    print(f"📦 SQLite DB Size: {db_size_mb:.1f} MB ({final_count:,} total records)")
    print(f"📄 Output data.json.gz Size: {gz_size_mb:.2f} MB (raw: {raw_size_mb:.1f} MB)")
    if os.path.exists("frontend/public/recipes.json"):
        print(f"📄 Output recipes.json Size: {os.path.getsize('frontend/public/recipes.json')/1024:.1f} KB")
    print("=" * 65)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="FF14 Async Fast Unified Pipeline")
    parser.add_argument("--sample", type=int, default=None, help="Process first N items")
    parser.add_argument("--concurrency", type=int, default=8, help="Parallel streams (Default 8 for 4-min run)")
    parser.add_argument("--export-only", action="store_true", help="Only run export without fetching")
    args = parser.parse_args()
    if args.export_only:
        asyncio.run(run_export_only())
    else:
        asyncio.run(run_full_scan_and_export(sample_limit=args.sample, concurrency=args.concurrency))
