import httpx
import json
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional, Any
from sqlalchemy.orm import Session
from backend.app.models.schema import MarketCache, Item

JAPAN_DCS: Dict[str, List[str]] = {
    "Meteor": ["Belias", "Mandragora", "Ramuh", "Shinryu", "Unicorn", "Valefor", "Yojimbo", "Zeromus"],
    "Gaia": ["Alexander", "Bahamut", "Durandal", "Fenrir", "Ifrit", "Ridill", "Tiamat", "Ultima"],
    "Mana": ["Anima", "Asura", "Chocobo", "Hades", "Ixion", "Masamune", "Pandaemonium", "Titan"],
    "Elemental": ["Aegis", "Atomos", "Carbuncle", "Garuda", "Gungnir", "Kujata", "Tonberry", "Typhon"],
}

ALL_JAPAN_WORLDS = [world for worlds in JAPAN_DCS.values() for world in worlds]

UNIVERSALIS_BASE = "https://universalis.app/api/v2"
CACHE_TTL_MINUTES = 5

class UniversalisService:
    @staticmethod
    def get_dc_for_world(world_name: str) -> Optional[str]:
        for dc, worlds in JAPAN_DCS.items():
            if world_name.lower() in [w.lower() for w in worlds]:
                return dc
        return None

    @staticmethod
    async def fetch_market_data(
        db: Session,
        item_ids: List[int],
        world_or_dc: str = "Japan",
        force_refresh: bool = False
    ) -> Dict[int, Dict[str, Any]]:
        """
        Fetch market data from Universalis API with DB cache.
        `world_or_dc` can be a World name ("Chocobo"), a DC ("Mana"), or "Japan".
        """
        if not item_ids:
            return {}

        results: Dict[int, Dict[str, Any]] = {}
        missing_or_expired_ids: List[int] = []
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        cache_threshold = now - timedelta(minutes=CACHE_TTL_MINUTES)

        if not force_refresh:
            cached_entries = db.query(MarketCache).filter(
                MarketCache.item_id.in_(item_ids),
                MarketCache.world_or_dc == world_or_dc,
                MarketCache.updated_at >= cache_threshold
            ).all()

            for entry in cached_entries:
                if entry.raw_data_json:
                    try:
                        results[entry.item_id] = json.loads(entry.raw_data_json)
                    except Exception:
                        missing_or_expired_ids.append(entry.item_id)
                else:
                    missing_or_expired_ids.append(entry.item_id)

            found_ids = set(results.keys())
            missing_or_expired_ids = [iid for iid in item_ids if iid not in found_ids]
        else:
            missing_or_expired_ids = item_ids

        if missing_or_expired_ids:
            chunk_size = 50
            # Reuse single AsyncClient across all chunk requests to leverage HTTP connection pooling
            async with httpx.AsyncClient(timeout=15.0) as client:
                for i in range(0, len(missing_or_expired_ids), chunk_size):
                    chunk = missing_or_expired_ids[i:i + chunk_size]
                    ids_str = ",".join(str(x) for x in chunk)
                    url = f"{UNIVERSALIS_BASE}/{world_or_dc}/{ids_str}?listings=10&entries=10"

                    try:
                        resp = await client.get(url)
                        if resp.status_code == 200:
                            data = resp.json()
                            if "items" in data:
                                items_data = data["items"]
                            else:
                                items_data = {str(data.get("itemID", chunk[0])): data}

                            for iid_str, item_info in items_data.items():
                                try:
                                    iid = int(iid_str)
                                except ValueError:
                                    continue

                                min_price_nq = item_info.get("minPriceNQ", 0) or 0
                                min_price_hq = item_info.get("minPriceHQ", 0) or 0
                                min_price = item_info.get("minPrice", 0) or 0
                                avg_price = item_info.get("averagePrice", 0.0) or 0.0
                                velocity = item_info.get("regularSaleVelocity", 0.0) or 0.0

                                listings = item_info.get("listings", [])
                                min_world = ""
                                if listings:
                                    sorted_listings = sorted(listings, key=lambda x: x.get("pricePerUnit", 999999999))
                                    min_world = sorted_listings[0].get("worldName", "")

                                cache_obj = db.query(MarketCache).filter(
                                    MarketCache.item_id == iid,
                                    MarketCache.world_or_dc == world_or_dc
                                ).first()

                                raw_json = json.dumps(item_info, ensure_ascii=False)
                                if cache_obj:
                                    cache_obj.min_price_nq = min_price_nq
                                    cache_obj.min_price_hq = min_price_hq
                                    cache_obj.min_price_overall = min_price
                                    cache_obj.min_price_world = min_world
                                    cache_obj.avg_sale_price = avg_price
                                    cache_obj.sale_velocity = velocity
                                    cache_obj.raw_data_json = raw_json
                                    cache_obj.updated_at = now
                                else:
                                    cache_obj = MarketCache(
                                        item_id=iid,
                                        world_or_dc=world_or_dc,
                                        min_price_nq=min_price_nq,
                                        min_price_hq=min_price_hq,
                                        min_price_overall=min_price,
                                        min_price_world=min_world,
                                        avg_sale_price=avg_price,
                                        sale_velocity=velocity,
                                        raw_data_json=raw_json,
                                        updated_at=now
                                    )
                                    db.add(cache_obj)

                                results[iid] = item_info
                            db.commit()
                    except Exception as e:
                        print(f"Error fetching from Universalis for chunk {chunk}: {e}")

        return results
