import math
from typing import Dict, List, Optional, Any
from sqlalchemy.orm import Session
from backend.app.services.recipe_service import RecipeService
from backend.app.services.universalis_service import UniversalisService, JAPAN_DCS

class CalcService:
    @staticmethod
    async def evaluate_craft_tree(
        db: Session,
        root_item_id: int,
        amount: int = 1,
        selected_dc: str = "Japan",
        home_world: Optional[str] = None,
        force_craft_overrides: Optional[Dict[int, bool]] = None
    ) -> Dict[str, Any]:
        """
        Evaluate full crafting tree with real-time market prices, optimal cost path, and shopping list.
        """
        if force_craft_overrides is None:
            force_craft_overrides = {}

        # 1. Build raw recipe tree
        raw_tree = RecipeService.get_recipe_tree(db, root_item_id, multiplier=amount)
        if not raw_tree:
            return {"error": "Item or recipe not found"}

        # 2. Collect all item IDs needed
        all_item_ids = list(RecipeService.collect_all_item_ids_in_tree(raw_tree))

        # 3. Fetch market data for DC/World
        market_data = await UniversalisService.fetch_market_data(
            db=db,
            item_ids=all_item_ids,
            world_or_dc=selected_dc
        )

        # If home world is specified and different from DC, fetch home world data as well
        home_world_data: Dict[int, Dict[str, Any]] = {}
        if home_world and home_world.lower() != selected_dc.lower():
            home_world_data = await UniversalisService.fetch_market_data(
                db=db,
                item_ids=all_item_ids,
                world_or_dc=home_world
            )

        shopping_list: List[Dict[str, Any]] = []

        # Recursive evaluation helper
        def evaluate_node(node: Dict[str, Any]) -> Dict[str, Any]:
            item_id = node["item_id"]
            needed_amount = node["amount"]
            m_info = market_data.get(item_id, {})
            hw_info = home_world_data.get(item_id, {}) if home_world_data else m_info

            # Market price on DC (lowest)
            dc_min_price = m_info.get("minPrice", 0) or m_info.get("minPriceNQ", 0) or 0
            dc_min_world = ""
            listings = m_info.get("listings", [])
            if listings:
                sorted_listings = sorted(listings, key=lambda x: x.get("pricePerUnit", 999999999))
                dc_min_world = sorted_listings[0].get("worldName", "")
                dc_min_price = sorted_listings[0].get("pricePerUnit", dc_min_price)

            # Home world price
            hw_min_price = hw_info.get("minPrice", 0) or hw_info.get("minPriceNQ", 0) or dc_min_price

            # NPC buy price
            npc_price = node.get("price_mid", 0) or 0

            # Unit market buy price
            market_unit_price = dc_min_price if dc_min_price > 0 else 0

            # Evaluate children if craftable
            children_evaluated = []
            craft_subtotal = 0
            is_craftable = node.get("is_craftable", False)

            if is_craftable and node.get("children"):
                for child in node["children"]:
                    child_eval = evaluate_node(child)
                    children_evaluated.append(child_eval)
                    craft_subtotal += child_eval["optimal_total_cost"]

            yield_amount = node.get("recipe", {}).get("yield_amount", 1) if is_craftable else 1
            crafts_count = math.ceil(needed_amount / yield_amount)
            craft_unit_cost = math.ceil(craft_subtotal / needed_amount) if needed_amount > 0 and is_craftable else 0

            # Determine optimal decision
            # Options: "NPC", "MARKET", "CRAFT"
            options = []
            if npc_price > 0:
                options.append(("NPC", npc_price))
            if market_unit_price > 0:
                options.append(("MARKET", market_unit_price))
            if is_craftable and craft_unit_cost > 0:
                options.append(("CRAFT", craft_unit_cost))

            # Default decision logic
            decision = "MARKET"
            if item_id in force_craft_overrides:
                override = force_craft_overrides[item_id]
                if override and is_craftable:
                    decision = "CRAFT"
                else:
                    decision = "NPC" if (npc_price > 0 and (market_unit_price == 0 or npc_price < market_unit_price)) else "MARKET"
            else:
                if options:
                    # Pick cheapest option
                    sorted_options = sorted(options, key=lambda x: x[1])
                    decision = sorted_options[0][0]
                elif is_craftable:
                    decision = "CRAFT"
                elif npc_price > 0:
                    decision = "NPC"

            # Calculate optimal cost
            if decision == "CRAFT" and is_craftable:
                optimal_unit_cost = craft_unit_cost
                optimal_total_cost = craft_subtotal
            elif decision == "NPC" and npc_price > 0:
                optimal_unit_cost = npc_price
                optimal_total_cost = npc_price * needed_amount
                shopping_list.append({
                    "item_id": item_id,
                    "name_ja": node["name_ja"],
                    "icon_url": node["icon_url"],
                    "amount": needed_amount,
                    "source": "NPC",
                    "unit_price": npc_price,
                    "total_price": optimal_total_cost,
                    "world": "ショップ購入"
                })
            else: # MARKET
                optimal_unit_cost = market_unit_price
                optimal_total_cost = market_unit_price * needed_amount
                shopping_list.append({
                    "item_id": item_id,
                    "name_ja": node["name_ja"],
                    "icon_url": node["icon_url"],
                    "amount": needed_amount,
                    "source": "MARKET",
                    "unit_price": market_unit_price,
                    "total_price": optimal_total_cost,
                    "world": dc_min_world or (home_world if home_world else "最安ワールド")
                })

            return {
                "item_id": item_id,
                "name_ja": node["name_ja"],
                "name_en": node["name_en"],
                "icon_url": node["icon_url"],
                "category": node.get("category"),
                "amount": needed_amount,
                "is_craftable": is_craftable,
                "recipe": node.get("recipe"),
                "price_mid": npc_price,
                "market_dc_min": dc_min_price,
                "market_dc_world": dc_min_world,
                "market_hw_min": hw_min_price,
                "craft_unit_cost": craft_unit_cost,
                "craft_subtotal": craft_subtotal,
                "decision": decision,
                "optimal_unit_cost": optimal_unit_cost,
                "optimal_total_cost": optimal_total_cost,
                "velocity": m_info.get("regularSaleVelocity", 0.0) or 0.0,
                "children": children_evaluated
            }

        evaluated_tree = evaluate_node(raw_tree)

        # Root market metrics
        root_market = market_data.get(root_item_id, {})
        root_hw_market = home_world_data.get(root_item_id, {}) if home_world_data else root_market

        # Completed item sell price (home world min or DC min)
        target_sell_price_hq = root_hw_market.get("minPriceHQ", 0) or root_market.get("minPriceHQ", 0) or 0
        target_sell_price_nq = root_hw_market.get("minPriceNQ", 0) or root_market.get("minPriceNQ", 0) or 0
        target_sell_price = target_sell_price_hq if target_sell_price_hq > 0 else (target_sell_price_nq or root_market.get("minPrice", 0) or 0)

        # Velocity & average price
        velocity = root_market.get("regularSaleVelocity", 0.0) or 0.0
        avg_price = root_market.get("averagePrice", 0.0) or 0.0

        total_cost = evaluated_tree["optimal_total_cost"]
        profit = (target_sell_price * amount) - total_cost
        profit_margin = ((profit / (target_sell_price * amount)) * 100) if (target_sell_price * amount) > 0 else 0
        roi = ((profit / total_cost) * 100) if total_cost > 0 else 0

        # Consolidate shopping list (group by item_id & world)
        consolidated_shopping: Dict[str, Dict[str, Any]] = {}
        for entry in shopping_list:
            key = f"{entry['item_id']}_{entry['source']}_{entry['world']}"
            if key not in consolidated_shopping:
                consolidated_shopping[key] = {
                    "item_id": entry["item_id"],
                    "name_ja": entry["name_ja"],
                    "icon_url": entry["icon_url"],
                    "amount": 0,
                    "source": entry["source"],
                    "unit_price": entry["unit_price"],
                    "total_price": 0,
                    "world": entry["world"]
                }
            consolidated_shopping[key]["amount"] += entry["amount"]
            consolidated_shopping[key]["total_price"] += entry["total_price"]

        return {
            "root_item": {
                "item_id": root_item_id,
                "name_ja": evaluated_tree["name_ja"],
                "name_en": evaluated_tree["name_en"],
                "icon_url": evaluated_tree["icon_url"],
                "amount": amount,
                "sell_price": target_sell_price,
                "sell_price_hq": target_sell_price_hq,
                "sell_price_nq": target_sell_price_nq,
                "total_sell_revenue": target_sell_price * amount,
                "total_cost": total_cost,
                "profit": profit,
                "profit_margin": round(profit_margin, 1),
                "roi": round(roi, 1),
                "velocity": round(velocity, 2),
                "avg_price": round(avg_price, 0),
                "listings_count": len(root_market.get("listings", [])),
                "listings": root_market.get("listings", [])[:15],
                "recent_history": root_market.get("recentHistory", [])[:10],
            },
            "tree": evaluated_tree,
            "shopping_list": list(consolidated_shopping.values()),
            "selected_dc": selected_dc,
            "home_world": home_world
        }
