export const STORAGE_KEY_WORLD = 'ff14_user_home_world';
export const DEFAULT_WORLD = 'Carbuncle';

export const JAPAN_DCS: Record<string, string[]> = {
  Elemental: ["Carbuncle", "Gungnir", "Kujata", "Typhon", "Atomos", "Tonberry", "Aegis", "Garuda"],
  Gaia: ["Alexander", "Bahamut", "Durandal", "Fenrir", "Ifrit", "Ridill", "Tiamat", "Ultima"],
  Mana: ["Anima", "Asura", "Chocobo", "Hades", "Ixion", "Masamune", "Pandaemonium", "Titan"],
  Meteor: ["Belias", "Mandragora", "Ramuh", "Shinryu", "Unicorn", "Valefor", "Yojimbo", "Zeromus"]
};

export const WORLD_TO_DC: Record<string, string> = {};
Object.entries(JAPAN_DCS).forEach(([dc, worlds]) => {
  worlds.forEach(w => { WORLD_TO_DC[w] = dc; });
});

export const ALL_JAPAN_WORLDS: string[] = Object.values(JAPAN_DCS).flat();

export const JAPAN_SCOPE_OPTIONS = {
  all_dc: Object.keys(JAPAN_DCS),
  dcs: Object.keys(JAPAN_DCS),
  dc_worlds: JAPAN_DCS,
  all_worlds: ALL_JAPAN_WORLDS,
};

export function getSavedSharedWorld(): string {
  try {
    return localStorage.getItem(STORAGE_KEY_WORLD) || localStorage.getItem('ff14_selected_world') || DEFAULT_WORLD;
  } catch {
    return DEFAULT_WORLD;
  }
}

export function saveSharedWorld(world: string): void {
  if (!world) return;
  try {
    localStorage.setItem(STORAGE_KEY_WORLD, world);
    localStorage.setItem('ff14_selected_world', world);
  } catch {}
}

export interface VelocityOption {
  value: number;
  label: string;
}

export const VELOCITY_FILTER_OPTIONS: readonly VelocityOption[] = [
  { value: 0, label: '指定なし' },
  { value: 1, label: '1件以上' },
  { value: 5, label: '5件以上' },
  { value: 10, label: '10件以上' },
  { value: 50, label: '50件以上' },
] as const;

export function formatGil(amount?: number | null): string {
  if (amount === undefined || amount === null || isNaN(amount)) return '-';
  return `${Math.round(amount).toLocaleString()}G`;
}

export function formatJstDateTime(ts?: number | null): string {
  if (!ts) return '-';
  return new Date(ts * 1000).toLocaleDateString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
