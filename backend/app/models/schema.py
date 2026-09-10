from sqlalchemy import Column, Integer, String, Boolean, Float, ForeignKey, DateTime, Index
from sqlalchemy.orm import relationship
from datetime import datetime
from backend.app.database import Base

class Item(Base):
    __tablename__ = "items"

    id = Column(Integer, primary_key=True, index=True)
    name_ja = Column(String(255), index=True, nullable=False)
    name_en = Column(String(255), nullable=True)
    icon_url = Column(String(512), nullable=True)
    item_ui_category = Column(String(100), nullable=True)
    level_item = Column(Integer, default=1)
    level_equip = Column(Integer, default=1)
    price_mid = Column(Integer, default=0) # NPC buy price
    can_be_crafted = Column(Boolean, default=False, index=True)
    is_marketable = Column(Boolean, default=True)

    recipes = relationship("Recipe", back_populates="item_result", foreign_keys="Recipe.item_result_id")

class Recipe(Base):
    __tablename__ = "recipes"

    id = Column(String(50), primary_key=True, index=True)
    item_result_id = Column(Integer, ForeignKey("items.id"), nullable=False, index=True)
    amount_result = Column(Integer, default=1)
    craft_type = Column(Integer, default=0) # 0:木工(CRP) ~ 7:調理(CUL)
    job_name = Column(String(20), default="木工師")
    recipe_level = Column(Integer, default=1)
    stars = Column(Integer, default=0)

    item_result = relationship("Item", foreign_keys=[item_result_id], back_populates="recipes")
    ingredients = relationship("RecipeIngredient", back_populates="recipe", cascade="all, delete-orphan")

class RecipeIngredient(Base):
    __tablename__ = "recipe_ingredients"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    recipe_id = Column(String(50), ForeignKey("recipes.id"), nullable=False, index=True)
    item_id = Column(Integer, ForeignKey("items.id"), nullable=False, index=True)
    amount = Column(Integer, default=1)

    recipe = relationship("Recipe", back_populates="ingredients")
    item = relationship("Item", foreign_keys=[item_id])

class MarketCache(Base):
    __tablename__ = "market_cache"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    item_id = Column(Integer, ForeignKey("items.id"), nullable=False, index=True)
    world_or_dc = Column(String(50), nullable=False, index=True)
    min_price_nq = Column(Integer, default=0)
    min_price_hq = Column(Integer, default=0)
    min_price_overall = Column(Integer, default=0)
    min_price_world = Column(String(50), default="")
    avg_sale_price = Column(Float, default=0.0)
    sale_velocity = Column(Float, default=0.0)
    raw_data_json = Column(String, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index("idx_item_world", "item_id", "world_or_dc", unique=True),
    )
