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

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from backend.app.constants import (
    JAPAN_DC_NAMES as JAPAN_DCS,
    DC_WORLDS,
    WORLD_TO_DC
)
from backend.app.pipeline.unified_pipeline import (
    get_items_metadata,
    aggregate_and_export_clean_data,
    export_recipes_json,
    auto_sync_new_items_and_recipes
)

DB_PATH = "data/ff14_craft.db"
OUTPUT_LISTINGS_GZ_PATH = "frontend/public/listings.json.gz"
OUTPUT_LISTINGS_DATA_DIR_GZ = "data/listings.json.gz"

CHUNK_SIZE_LISTINGS = 100
CHUNK_SIZE_HISTORY = 20
MAX_LISTINGS_PER_WORLD = 20

# Universalis側でDB破損を起こしている既知の異常アイテムID (HTTP 500回避)
KNOWN_CORRUPTED_ITEM_IDS = {12655}

def get_marketable_item_ids():
    candidate_paths = [
        "data/marketable_item_ids.txt",
        os.path.join(os.path.dirname(__file__), "../../../data/marketable_item_ids.txt")
    ]
    for p in candidate_paths:
        if os.path.exists(p):
            with open(p, "r", encoding="utf-8") as f:
                ids = [int(line.strip()) for line in f if line.strip() and int(line.strip()) not in KNOWN_CORRUPTED_ITEM_IDS]
                if ids:
                    return ids
    
    print("⚠️ data/marketable_item_ids.txt not found locally. Fetching directly from Universalis API...")
    try:
        with httpx.Client(timeout=20.0) as client:
            resp = client.get("https://universalis.app/api/v2/marketable")
            if resp.status_code == 200:
                ids = sorted([x for x in resp.json() if x not in KNOWN_CORRUPTED_ITEM_IDS])
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

                    extracted = defaultdict(lambda: defaultdict(list))
                    upload_times = {}

                    for item_id_str, item_data in items_dict.items():
                        try:
                            iid = int(item_id_str)
                        except (ValueError, TypeError):
                            continue

                        upload_times[iid] = item_data.get("lastUploadTime", 0)
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
                    return extracted, upload_times, True, None
                elif resp.status_code == 429:
                    last_err = "429 Rate Limit"
                    await asyncio.sleep(2.0 * (2 ** attempt))
                else:
                    last_err = f"HTTP {resp.status_code}"
                    await asyncio.sleep(1.0 * (2 ** attempt))
            except Exception as e:
                last_err = f"{type(e).__name__}"
                await asyncio.sleep(1.0 * (2 ** attempt))

    if len(chunk) > 1:
        mid = len(chunk) // 2
        ext1, up1, s1, _ = await fetch_dc_chunk(client, dc_name, chunk[:mid], sem, retry_limit=1)
        ext2, up2, s2, _ = await fetch_dc_chunk(client, dc_name, chunk[mid:], sem, retry_limit=1)

        merged = defaultdict(lambda: defaultdict(list))
        merged_up = {}
        if ext1:
            for w, items in ext1.items():
                for iid, l_list in items.items():
                    merged[w][iid].extend(l_list)
        if ext2:
            for w, items in ext2.items():
                for iid, l_list in items.items():
                    merged[w][iid].extend(l_list)
        if up1:
            merged_up.update(up1)
        if up2:
            merged_up.update(up2)

        return merged, merged_up, True, None
    else:
        print(f"    ⚠️ [API Error] Skipped corrupted item {chunk[0]} on {dc_name} ({last_err})")
        return None, {}, False, last_err

async def fetch_history_chunk(client: httpx.AsyncClient, dc_name: str, chunk: list, sem: asyncio.Semaphore, retry_limit: int = 2, is_sub_split: bool = False):
    chunk_str = ",".join(str(x) for x in chunk)
    url = f"https://universalis.app/api/v2/history/{dc_name}/{chunk_str}?entriesWithin=604800&entriesToReturn=500"
    last_err = None

    async with sem:
        for attempt in range(retry_limit):
            try:
                resp = await client.get(url, timeout=12.0)
                if resp.status_code == 200:
                    data = resp.json()
                    items_dict = data.get("items", {})
                    if not items_dict and "entries" in data:
                        items_dict = {str(data.get("itemID")): data}

                    records = []
                    for item_id_str, item_data in items_dict.items():
                        try:
                            iid = int(item_id_str)
                        except (ValueError, TypeError):
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
                    return records, True, None
                elif resp.status_code == 429:
                    last_err = "HTTP 429 (Rate Limit)"
                    await asyncio.sleep(2.0 * (attempt + 1))
                elif resp.status_code in (502, 503, 504):
                    last_err = f"HTTP {resp.status_code} (Server Busy)"
                    await asyncio.sleep(2.5 * (attempt + 1))
                else:
                    last_err = f"HTTP {resp.status_code}"
                    await asyncio.sleep(1.0 * (attempt + 1))
            except Exception as e:
                last_err = f"{type(e).__name__}"
                await asyncio.sleep(1.0 * (attempt + 1))

        # 複数品目で失敗した場合: 半分に分割して正常品目を100%救出 (深追いは1品目まで)
        if len(chunk) > 1:
            mid = len(chunk) // 2
            rec1, s1, _ = await fetch_history_chunk(client, dc_name, chunk[:mid], sem, retry_limit=1, is_sub_split=True)
            rec2, s2, _ = await fetch_history_chunk(client, dc_name, chunk[mid:], sem, retry_limit=1, is_sub_split=True)
            merged = []
            if rec1:
                merged.extend(rec1)
            if rec2:
                merged.extend(rec2)
            if s1 or s2:
                return merged, True, None
            return merged, False, last_err

    # 1品目単体まで絞り込んでも失敗したモンスターアイテム、または親タスクのみ警告を出力 (二重ログ防止)
    if not is_sub_split or len(chunk) == 1:
        print(f"    ⚠️ [History Warning] Skipped {len(chunk)} item(s) on {dc_name} ({last_err})")
    return [], False, last_err

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

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS sales_history (
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
    cursor.execute("""
    CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_unique 
    ON sales_history (item_id, world_name, timestamp, price_per_unit, quantity, buyer_name);
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_sales_history_ts_item ON sales_history (timestamp, item_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_sales_world_item_hq ON sales_history (world_name, item_id, hq, timestamp DESC);")

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS item_sync_state (
        item_id INTEGER NOT NULL,
        dc_name VARCHAR(32) NOT NULL,
        last_upload_time INTEGER NOT NULL DEFAULT 0,
        last_history_sync INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (item_id, dc_name)
    );
    """)
    conn.commit()

async def run_pipeline(sample_limit=None, concurrency=6):
    start_total_time = time.time()
    print("=" * 65)
    print("  🚀 FF14 High-Speed Unified Market Pipeline")
    print(f"  ⚡ Target: All 4 Japan DCs (32 Worlds) | Concurrency: {concurrency}")
    print("  ✨ Integrated: Realtime Listings + Smart Incremental 7-Day History")
    print("=" * 65)

    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=30.0)
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA busy_timeout = 10000;")
    conn.execute("PRAGMA synchronous = NORMAL;")
    init_db(conn)

    marketable_ids = get_marketable_item_ids()
    if sample_limit:
        marketable_ids = marketable_ids[:sample_limit]
        print(f"🔬 Sample Mode: limited to {len(marketable_ids)} items.")
    else:
        print(f"📦 Full Scan: {len(marketable_ids):,} marketable items.")

    # Sync missing item and recipe metadata
    await auto_sync_new_items_and_recipes(conn, marketable_ids)

    cursor = conn.cursor()
    cursor.execute("SELECT item_id, dc_name, last_upload_time FROM item_sync_state")
    known_sync_state = {(row[0], row[1]): row[2] for row in cursor.fetchall()}

    chunks = [marketable_ids[i:i + CHUNK_SIZE_LISTINGS] for i in range(0, len(marketable_ids), CHUNK_SIZE_LISTINGS)]
    total_chunks = len(chunks)

    all_listings_by_item = defaultdict(lambda: defaultdict(list))
    total_listings_count = 0
    total_new_trades_count = 0
    sync_state_updates = []

    headers = {"User-Agent": "FF14-Listings-Pipeline/2.0"}
    limits = httpx.Limits(max_keepalive_connections=20, max_connections=concurrency * 4)
    sem = asyncio.Semaphore(concurrency)
    sub_batch_size = 15

    print("\n=== [1/4] Executing Realtime Listings Scan & Incremental History Sync ===")
    async with httpx.AsyncClient(headers=headers, limits=limits) as client:
        for dc_idx, dc_name in enumerate(JAPAN_DCS, 1):
            dc_start = time.time()
            dc_worlds = DC_WORLDS[dc_name]
            print(f"\n--- [{dc_idx}/4] {dc_name} DC ({len(dc_worlds)} worlds) ---")

            # Step 1: Listings fetch + extract lastUploadTime
            completed = 0
            failed = 0
            dc_listings_count = 0
            dc_upload_times = {}

            for i in range(0, total_chunks, sub_batch_size):
                batch = chunks[i:i + sub_batch_size]
                tasks = [fetch_dc_chunk(client, dc_name, ch, sem) for ch in batch]
                results = await asyncio.gather(*tasks)

                for extracted, up_times, success, err in results:
                    if success and extracted:
                        for w, items in extracted.items():
                            for iid, l_list in items.items():
                                all_listings_by_item[iid][w] = l_list
                                dc_listings_count += len(l_list)
                    if up_times:
                        dc_upload_times.update(up_times)
                    if not success:
                        failed += 1

                completed += len(batch)
                elapsed = time.time() - dc_start
                rate = completed / elapsed if elapsed > 0 else 0
                pct = (completed / total_chunks) * 100
                print(f"  ⚡ {dc_name} Listings: {completed}/{total_chunks} ({pct:.0f}%) | {rate:.1f} req/s | Listings: {dc_listings_count:,} | Elapsed: {elapsed:.1f}s")

            total_listings_count += dc_listings_count

            # Step 2: Diff Detection for Sale History
            items_needing_history = []
            now_ms = int(time.time() * 1000)
            six_hours_ago_ms = now_ms - (6 * 3600 * 1000)

            for iid, cur_time in dc_upload_times.items():
                prev_time = known_sync_state.get((iid, dc_name), 0)
                if prev_time > 0:
                    if cur_time > prev_time:
                        items_needing_history.append(iid)
                else:
                    # Initial seed: items active in last 6 hours
                    if cur_time >= six_hours_ago_ms:
                        items_needing_history.append(iid)

                sync_state_updates.append((iid, dc_name, cur_time, int(time.time())))

            pct_diff = (len(items_needing_history) / len(marketable_ids)) * 100.0 if marketable_ids else 0
            print(f"  🔍 Diff Detected: {len(items_needing_history):,}/{len(marketable_ids):,} items had new uploads ({pct_diff:.1f}%)")

            # Step 3: Incremental 7-Day History Fetch for diff items
            if items_needing_history:
                hist_chunks = [items_needing_history[i:i + CHUNK_SIZE_HISTORY] for i in range(0, len(items_needing_history), CHUNK_SIZE_HISTORY)]
                total_hist_chunks = len(hist_chunks)
                t_hist_start = time.time()
                dc_sales_records = []
                hist_failed = 0
                completed_hist = 0
                sub_hist_batch = 12

                for i in range(0, total_hist_chunks, sub_hist_batch):
                    batch = hist_chunks[i:i + sub_hist_batch]
                    tasks = [fetch_history_chunk(client, dc_name, ch, sem) for ch in batch]
                    results = await asyncio.gather(*tasks)

                    for recs, success, err in results:
                        if success and recs:
                            dc_sales_records.extend(recs)
                        elif not success:
                            hist_failed += 1

                    completed_hist += len(batch)
                    t_hist_now = time.time() - t_hist_start
                    pct_h = (completed_hist / total_hist_chunks) * 100
                    h_rate = completed_hist / t_hist_now if t_hist_now > 0 else 0
                    print(f"  📥 {dc_name} History: {completed_hist}/{total_hist_chunks} ({pct_h:.0f}%) | {h_rate:.1f} req/s | Trades: {len(dc_sales_records):,} | Elapsed: {t_hist_now:.1f}s")

                t_hist_elapsed = time.time() - t_hist_start
                total_new_trades_count += len(dc_sales_records)

                if dc_sales_records:
                    cursor.executemany("""
                    INSERT OR IGNORE INTO sales_history (item_id, dc_name, world_name, hq, price_per_unit, quantity, timestamp, buyer_name)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """, dc_sales_records)
                    conn.commit()

                print(f"  ✨ {dc_name} History Merged: {len(hist_chunks)} chunks in {t_hist_elapsed:.1f}s ({len(dc_sales_records):,} trades, Failures: {hist_failed})")
            else:
                print("  ✨ History Sync: No new uploads detected (Skipped).")

            print(f"✨ {dc_name} finished in {time.time() - dc_start:.1f}s")

    # Step 4: Save sync state to DB
    if sync_state_updates:
        cursor.executemany("""
        INSERT OR REPLACE INTO item_sync_state (item_id, dc_name, last_upload_time, last_history_sync)
        VALUES (?, ?, ?, ?)
        """, sync_state_updates)
        conn.commit()

    # Step 5: Update current_listings in DB
    print("\n=== [2/4] Merging Listings into SQLite DB ===")
    cursor.execute("CREATE TEMP TABLE temp_listings AS SELECT * FROM current_listings WHERE 0;")
    def iter_db_rows():
        for iid, worlds_map in all_listings_by_item.items():
            for w, l_list in worlds_map.items():
                dc = WORLD_TO_DC.get(w, "")
                for price, qty, hq, retainer, ts in l_list:
                    yield (iid, w, dc, price, qty, hq, retainer, ts)

    cursor.executemany("""
    INSERT INTO temp_listings (item_id, world_name, dc_name, price_per_unit, quantity, hq, retainer_name, last_review_time)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, iter_db_rows())

    cursor.execute("DELETE FROM current_listings;")
    cursor.execute("""
    INSERT INTO current_listings (item_id, world_name, dc_name, price_per_unit, quantity, hq, retainer_name, last_review_time)
    SELECT item_id, world_name, dc_name, price_per_unit, quantity, hq, retainer_name, last_review_time FROM temp_listings;
    """)
    cursor.execute("DROP TABLE temp_listings;")
    conn.commit()

    cursor.execute("SELECT COUNT(*) FROM current_listings;")
    final_db_count = cursor.fetchone()[0]
    print(f"📦 Successfully updated `current_listings` in SQLite with {final_db_count:,} rows.")

    # Step 6: 7-Day Rolling Purge for Sales History
    print("\n=== [3/4] 7-Day Rolling Purge for Sales History ===")
    now_utc = datetime.now(timezone.utc)
    seven_days_ago_ts = int((now_utc - timedelta(days=7)).timestamp())
    cursor.execute("DELETE FROM sales_history WHERE timestamp < ?", (seven_days_ago_ts,))
    conn.commit()
    cursor.execute("SELECT COUNT(*) FROM sales_history;")
    total_sales_history_count = cursor.fetchone()[0]
    print(f"🌟 Active 7-Day Sales History in DB: {total_sales_history_count:,} records (Purged older records)")

    # Step 7: Export all artifacts (listings.json.gz, data.json.gz, recipes.json)
    print("\n=== [4/4] Exporting Data Assets (listings.json.gz, data.json.gz, recipes.json) ===")
    jst = timezone(timedelta(hours=9))
    now_jst = datetime.now(jst).isoformat()

    # 7.1 Export listings.json.gz
    export_obj = {
        "last_updated": now_jst,
        "listings": all_listings_by_item
    }
    json_str = json.dumps(export_obj, ensure_ascii=False, separators=(',', ':'))
    json_bytes = json_str.encode('utf-8')
    gz_bytes = gzip.compress(json_bytes, compresslevel=6)

    targets = [OUTPUT_LISTINGS_GZ_PATH, OUTPUT_LISTINGS_DATA_DIR_GZ]
    for p in targets:
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "wb") as f:
            f.write(gz_bytes)
    print(f"✨ listings.json.gz exported ({len(gz_bytes)/(1024*1024):.2f} MB)")

    # 7.2 Export data.json.gz & recipes.json
    meta_dict = get_items_metadata(conn)
    raw_len, gz_len = aggregate_and_export_clean_data(conn, cursor, meta_dict)
    print(f"✨ data.json.gz exported ({gz_len/(1024*1024):.2f} MB)")

    export_recipes_json(conn, meta_dict)
    print("✨ recipes.json & recipes.json.gz exported")

    conn.close()

    total_pipeline_time = time.time() - start_total_time
    print("\n" + "=" * 65)
    print(f"🎉 Unified Pipeline Completed in {total_pipeline_time:.1f}s ({(total_pipeline_time)/60:.2f} min)")
    print(f"📊 Summary:")
    print(f"  ・Current Listings: {final_db_count:,} items")
    print(f"  ・New Trades Merged: {total_new_trades_count:,} records")
    print(f"  ・Total 7-Day History in DB: {total_sales_history_count:,} records")
    print(f"  ・All Assets Exported: listings.json.gz, data.json.gz, recipes.json")
    print("=" * 65)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="FF14 High-Speed Unified Market Pipeline")
    parser.add_argument("--sample", type=int, default=None, help="Process first N items")
    parser.add_argument("--concurrency", type=int, default=6, help="Parallel requests")
    args = parser.parse_args()

    asyncio.run(run_pipeline(sample_limit=args.sample, concurrency=args.concurrency))
