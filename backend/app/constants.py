"""
Centralized constants for FF14 Craft Market Checker.
Defines Data Centers, Worlds, and Crafting Job mappings.
"""

from typing import Dict, List

JAPAN_DCS: Dict[str, List[str]] = {
    "Elemental": ["Carbuncle", "Gungnir", "Kujata", "Typhon", "Atomos", "Tonberry", "Aegis", "Garuda"],
    "Gaia": ["Alexander", "Bahamut", "Durandal", "Fenrir", "Ifrit", "Ridill", "Tiamat", "Ultima"],
    "Mana": ["Anima", "Asura", "Chocobo", "Hades", "Ixion", "Masamune", "Pandaemonium", "Titan"],
    "Meteor": ["Belias", "Mandragora", "Ramuh", "Shinryu", "Unicorn", "Valefor", "Yojimbo", "Zeromus"]
}

JAPAN_DC_NAMES: List[str] = ["Elemental", "Gaia", "Mana", "Meteor"]

DC_WORLDS: Dict[str, List[str]] = JAPAN_DCS

WORLD_TO_DC: Dict[str, str] = {
    world: dc
    for dc, worlds in JAPAN_DCS.items()
    for world in worlds
}

ALL_JAPAN_WORLDS: List[str] = [
    world
    for worlds in JAPAN_DCS.values()
    for world in worlds
]

ALL_WORLDS: List[str] = ALL_JAPAN_WORLDS

JOB_SHORT: Dict[str, str] = {
    "木工師": "木工",
    "鍛冶師": "鍛冶",
    "甲冑師": "甲冑",
    "彫金師": "彫金",
    "革細工師": "革細",
    "裁縫師": "裁縫",
    "錬金術師": "錬金",
    "調理師": "調理"
}
