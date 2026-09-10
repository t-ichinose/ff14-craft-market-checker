import math
from typing import Dict, List, Optional, Any, Set
from sqlalchemy.orm import Session, joinedload
from backend.app.models.schema import Item, Recipe, RecipeIngredient

class RecipeService:
    @staticmethod
    def get_recipe_tree(
        db: Session,
        item_id: int,
        multiplier: int = 1,
        visited: Optional[Set[int]] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Recursively builds the crafting recipe tree for a given item_id.
        Optimized with joinedload to eliminate N+1 queries.
        """
        if visited is None:
            visited = set()

        item = db.query(Item).filter(Item.id == item_id).first()
        if not item:
            return None

        # Check for circular dependency
        if item_id in visited:
            return {
                "item_id": item.id,
                "name_ja": item.name_ja,
                "name_en": item.name_en,
                "icon_url": item.icon_url,
                "amount": multiplier,
                "is_craftable": False,
                "price_mid": item.price_mid,
                "circular": True,
            }

        visited.add(item_id)

        node: Dict[str, Any] = {
            "item_id": item.id,
            "name_ja": item.name_ja,
            "name_en": item.name_en,
            "icon_url": item.icon_url,
            "category": item.item_ui_category,
            "amount": multiplier,
            "is_craftable": False,
            "price_mid": item.price_mid,
            "recipe": None,
            "children": [],
        }

        # Find primary recipe for this item with eager loaded ingredients
        recipe = (
            db.query(Recipe)
            .options(joinedload(Recipe.ingredients))
            .filter(Recipe.item_result_id == item_id)
            .first()
        )

        if recipe:
            node["is_craftable"] = True
            node["recipe"] = {
                "recipe_id": recipe.id,
                "craft_type": recipe.craft_type,
                "job_name": recipe.job_name,
                "recipe_level": recipe.recipe_level,
                "stars": recipe.stars,
                "yield_amount": recipe.amount_result or 1,
            }

            yield_amount = recipe.amount_result or 1
            crafts_needed = math.ceil(multiplier / yield_amount)

            children = []
            for ing in recipe.ingredients:
                ing_needed = ing.amount * crafts_needed
                child_tree = RecipeService.get_recipe_tree(
                    db, ing.item_id, multiplier=ing_needed, visited=visited.copy()
                )
                if child_tree:
                    children.append(child_tree)
            node["children"] = children

        return node

    @staticmethod
    def collect_all_item_ids_in_tree(tree: Dict[str, Any]) -> Set[int]:
        """Collect all distinct item IDs present in the recipe tree."""
        ids = {tree["item_id"]}
        for child in tree.get("children", []):
            ids.update(RecipeService.collect_all_item_ids_in_tree(child))
        return ids
