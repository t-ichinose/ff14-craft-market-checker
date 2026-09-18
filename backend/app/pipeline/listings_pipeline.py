import asyncio
import httpx
import sqlite3
import time
import os
import sys
import json
import gzip
from datetime import datetime, timezone, timedelta
from collections import defaultdict
import argparse

sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)

DB_PATH = "data/ff14_craft.db"
OUTPUT_GZ_PATH = "frontend/public/listings.json.gz"
OUTPUT_DATA_DIR_GZ = "data/listings.json.gz"

JAPAN_DCS = ["Elemental", "Gaia", "Mana", "Meteor"]
DC_WORLDS = {
    "Mana": ["Anima", "Asura", "Chocobo", "Hades", "Ixion", "Masamune", "Pandaemonium", "Titan"],
    "Elemental": ["Carbuncle", "Gungnir", "Kujata", "Typhon", "Atomos", "Tonberry", "Aegis", "Garuda"],
    "Gaia": ["Alexander", "Bahamut", "Durandal", "Fenrir", "Ifrit", "Ridill", "Tiamat", "Ultima"],
    "Meteor": ["Belias", "Mandragora", "Ramuh", "Shinryu", "Unicorn", "Valefor", "Yojimbo", "Zeromus"]
}
WORLD_TO_DC = {}
for dc, worlds in DC_WORLDS.items():
    for w in worlds:
        WORLD_TO_DC[w] = dc

CHUNK_SIZE = 100
MAX_LISTINGS_PER_WORLD = 20

def get_marketable_item_ids():
    candidate_paths = [
        "data/marketable_item_ids.txt",
        os.path.join(os.path.dirname(__file__), "../../../data/marketable_item_ids.txt")
    ]
    for p in candidate_paths:
        if os.path.exists(p):
            with open(p, "r", encoding="utf-8") as f:
                ids = [int(line.strip()) for line in f if line.strip()]
                if ids:
                    return ids
    
    # Fallback: Fetch directly from Universalis API if local file doesn't exist
    print("⚠️ data/marketable_item_ids.txt not found locally. Fetching directly from Universalis API...")
    try:
        with httpx.Client(timeout=20.0) as client:
            resp = client.get("https://universalis.app/api/v2/marketable")
            if resp.status_code == 200:
                ids = sorted(resp.json())
                os.makedirs("data", exist_ok=True)
                with open("data/marketable_item_ids.txt", "w", encoding="utf-8") as f:
                    f.write("\n".join(str(x) for x in ids))
                print(f"✨ Fetched {len(ids):,} marketable items from Universalis and cached to data/marketable_item_ids.txt")
                return ids
    except Exception as e:
        print(f"❌ Failed to fetch marketable items from Universalis: {e}")

    raise FileNotFoundError("marketable_item_ids.txt not found and failed to fetch from Universalis API!")

async def fetch_dc_chunk(client: httpx.AsyncClient, dc_name: str, chunk: list, sem: asyncio.Semaphore, retry_limit: int = 3):
    chunk_str = ",".join(str(x) for x in chunk)
    url = f"https://universalis.app/api/v2/{dc_name}/{chunk_str}?entries=0"
    last_err = None
    target_worlds = set(DC_WORLDS.get(dc_name, []))

    async with sem:
        for attempt in range(retry_limit):
            try:
                resp = await client.get(url, timeout=25.0)
                if resp.status_code == 200:
                    data = resp.json()
                    items_dict = data.get("items", {})
                    if not items_dict and "listings" in data:
                        items_dict = {str(data.get("itemID")): data}

                    # world_name -> item_id -> list of [price, qty, hq, retainer, ts]
                    extracted = defaultdict(lambda: defaultdict(list))
                    for item_id_str, item_data in items_dict.items():
                        try:
                            iid = int(item_id_str)
                        except ValueError:
                            continue

                        raw_listings = item_data.get("listings", [])
                        for l in raw_listings:
                            w = l.get("worldName")
                            if w in target_worlds:
                                if len(extracted[w][iid]) < MAX_LISTINGS_PER_WORLD:
                                    extracted[w][iid].append((
                                        l.get("pricePerUnit", 0),
                                        l.get("quantity", 1),
                                        1 if l.get("hq") else 0,
                                        l.get("retainerName", ""),
                                        l.get("lastReviewTime", 0)
                                    ))
                    return extracted, True, None
                elif resp.status_code == 429:
                    last_err = "429 Rate Limit"
                    await asyncio.sleep(2.0 * (2 ** attempt))
                else:
                    last_err = f"HTTP {resp.status_code}"
                    await asyncio.sleep(1.0 * (2 ** attempt))
            except Exception as e:
                last_err = f"{type(e).__name__}"
                await asyncio.sleep(1.0 * (2 ** attempt))

    # チャンク全体がエラー（HTTP 500等）になった場合、半分ずつ再帰分割して正常アイテムを全救済する
    if len(chunk) > 1:
        mid = len(chunk) // 2
        ext1, s1, _ = await fetch_dc_chunk(client, dc_name, chunk[:mid], sem, retry_limit=1)
        ext2, s2, _ = await fetch_dc_chunk(client, dc_name, chunk[mid:], sem, retry_limit=1)

        merged = defaultdict(lambda: defaultdict(list))
        if ext1:
            for w, items in ext1.items():
                for iid, l_list in items.items():
                    merged[w][iid].extend(l_list)
        if ext2:
            for w, items in ext2.items():
                for iid, l_list in items.items():
                    merged[w][iid].extend(l_list)

        return merged, True, None
    else:
        # 単一アイテムがUniversalisのAPIバグや破損で500になる場合は安全にスキップ
        print(f"    ⚠️ [API Error] Skipped corrupted item {chunk[0]} on {dc_name} ({last_err})")
        return None, False, last_err

def init_db(conn: sqlite3.Connection):
    cursor = conn.cursor()
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS current_listings (
        item_id INTEGER NOT NULL,
        world_name VARCHAR(32) NOT NULL,
        dc_name VARCHAR(32) NOT NULL,
        price_per_unit INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        hq BOOLEAN NOT NULL,
        retainer_name VARCHAR(64),
        last_review_time INTEGER
    );
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_listings_item_world ON current_listings (item_id, world_name);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_listings_item_dc ON current_listings (item_id, dc_name);")
    conn.commit()

async def run_pipeline(sample_limit=None, concurrency=6):
    start_total_time = time.time()
    print("=" * 65)
    print("  🚀 FF14 High-Speed Current Listings Pipeline")
    print(f"  ⚡ Target: All 4 Japan DCs (32 Worlds) | Concurrency: {concurrency}")
    print("=" * 65)

    marketable_ids = get_marketable_item_ids()
    if sample_limit:
        marketable_ids = marketable_ids[:sample_limit]
        print(f"🔬 Sample Mode: limited to {len(marketable_ids)} items.")
    else:
        print(f"📦 Full Scan: {len(marketable_ids):,} marketable items.")

    chunks = [marketable_ids[i:i + CHUNK_SIZE] for i in range(0, len(marketable_ids), CHUNK_SIZE)]
    total_chunks = len(chunks)

    # In-memory storage: item_id -> world_name -> list of [price, qty, hq, retainer, ts]
    all_listings_by_item = defaultdict(lambda: defaultdict(list))
    total_db_records = 0

    headers = {"User-Agent": "FF14-Listings-Pipeline/1.0"}
    limits = httpx.Limits(max_keepalive_connections=20, max_connections=concurrency * 4)
    sem = asyncio.Semaphore(concurrency)

    async with httpx.AsyncClient(headers=headers, limits=limits) as client:
        for dc_idx, dc_name in enumerate(JAPAN_DCS, 1):
            dc_start = time.time()
            dc_worlds = DC_WORLDS[dc_name]
            print(f"\n--- [{dc_idx}/4] Fetching {dc_name} DC ({len(dc_worlds)} worlds) ---")

            completed = 0
            failed = 0
            dc_listings_count = 0
            sub_batch_size = 15

            for i in range(0, total_chunks, sub_batch_size):
                batch = chunks[i:i + sub_batch_size]
                tasks = [fetch_dc_chunk(client, dc_name, ch, sem) for ch in batch]
                results = await asyncio.gather(*tasks)

                for extracted, success, err in results:
                    if success and extracted:
                        for w, items in extracted.items():
                            for iid, l_list in items.items():
                                all_listings_by_item[iid][w] = l_list
                                dc_listings_count += len(l_list)
                    else:
                        failed += 1

                completed += len(batch)
                elapsed = time.time() - dc_start
                rate = completed / elapsed if elapsed > 0 else 0
                pct = (completed / total_chunks) * 100
                print(f"  ⚡ {dc_name}: {completed}/{total_chunks} ({pct:.0f}%) | {rate:.1f} req/s | Listings: {dc_listings_count:,} | Elapsed: {elapsed:.1f}s")

            dc_elapsed = time.time() - dc_start
            total_db_records += dc_listings_count
            print(f"✨ {dc_name} finished in {dc_elapsed:.2f}s ({dc_listings_count:,} listings collected, Failures: {failed})")

    # DB Persistence
    print("\n=== [1/2] Merging into SQLite DB ===")
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA synchronous = NORMAL;")
    init_db(conn)

    cursor = conn.cursor()
    cursor.execute("CREATE TEMP TABLE temp_listings AS SELECT * FROM current_listings WHERE 0;")

    db_rows = []
    for iid, worlds_map in all_listings_by_item.items():
        for w, l_list in worlds_map.items():
            dc = WORLD_TO_DC.get(w, "")
            for price, qty, hq, retainer, ts in l_list:
                db_rows.append((iid, w, dc, price, qty, hq, retainer, ts))

    cursor.executemany("""
    INSERT INTO temp_listings (item_id, world_name, dc_name, price_per_unit, quantity, hq, retainer_name, last_review_time)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, db_rows)

    cursor.execute("DELETE FROM current_listings;")
    cursor.execute("""
    INSERT INTO current_listings (item_id, world_name, dc_name, price_per_unit, quantity, hq, retainer_name, last_review_time)
    SELECT item_id, world_name, dc_name, price_per_unit, quantity, hq, retainer_name, last_review_time FROM temp_listings;
    """)
    cursor.execute("DROP TABLE temp_listings;")
    conn.commit()

    cursor.execute("SELECT COUNT(*) FROM current_listings;")
    final_db_count = cursor.fetchone()[0]
    conn.close()
    print(f"📦 Successfully updated `current_listings` in SQLite with {final_db_count:,} rows.")

    # Export to JSON & GZIP
    print("\n=== [2/2] Exporting listings.json.gz ===")
    export_start = time.time()
    jst = timezone(timedelta(hours=9))
    now_jst = datetime.now(jst).isoformat()

    # Structure:
    # {
    #   "last_updated": "...",
    #   "listings": {
    #      "<itemId>": {
    #         "<worldName>": [ [price, qty, hq, retainer, ts], ... ]
    #      }
    #   }
    # }
    export_obj = {
        "last_updated": now_jst,
        "listings": all_listings_by_item
    }

    json_str = json.dumps(export_obj, ensure_ascii=False, separators=(',', ':'))
    json_bytes = json_str.encode('utf-8')
    gz_bytes = gzip.compress(json_bytes, compresslevel=6)

    targets = [OUTPUT_GZ_PATH, OUTPUT_DATA_DIR_GZ]
    for p in targets:
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "wb") as f:
            f.write(gz_bytes)

    export_elapsed = time.time() - export_start
    raw_mb = len(json_bytes) / (1024 * 1024)
    gz_mb = len(gz_bytes) / (1024 * 1024)
    print(f"✨ Export finished in {export_elapsed:.2f}s! Raw: {raw_mb:.1f} MB | Gzip: {gz_mb:.2f} MB")

    total_pipeline_time = time.time() - start_total_time
    print("=" * 65)
    print(f"🎉 Listings Pipeline Completed in {total_pipeline_time:.2f}s ({total_pipeline_time/60:.2f} min)")
    print(f"📊 Items: {len(all_listings_by_item):,} | Listings: {final_db_count:,}")
    print("=" * 65)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="FF14 Listings Pipeline")
    parser.add_argument("--sample", type=int, default=None, help="Process first N items")
    parser.add_argument("--concurrency", type=int, default=6, help="Parallel requests")
    args = parser.parse_args()

    asyncio.run(run_pipeline(sample_limit=args.sample, concurrency=args.concurrency))
