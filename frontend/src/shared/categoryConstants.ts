export function getMajorCategory(cat: string): string {
  if (!cat) return 'その他・雑貨';
  if (cat.includes('道具')) return '道具';
  if (cat.includes('防具') || cat === '盾') return '防具';
  if (['調度品', '庭具', '建材', '栽培'].some((k) => cat.includes(k))) return 'ハウジング';
  if (['潜水艦', '飛空艇'].some((k) => cat.includes(k))) return 'カンパニークラフト';
  if (['耳飾り', '首飾り', '腕輪', '指輪'].some((k) => cat.includes(k))) return 'アクセサリ';
  if (['薬品', '調理品'].some((k) => cat.includes(k))) return '薬品・料理';
  if (['材', '食材', '部品', '染料', '触媒', '釣り餌'].some((k) => cat.includes(k))) return '素材';
  if (['剣', '具', '斧', '槍', '鎌', '刀', '儀', '弓', '武器', '銃', '筆', '書', 'ブレード'].some((k) => cat.includes(k))) return '武器';
  return 'その他・雑貨';
}

export const MAJOR_CATEGORY_DEFINITIONS = [
  { name: '武器', icon: 'fa-solid fa-khanda' },
  { name: '防具', icon: 'fa-solid fa-shield-halved' },
  { name: 'アクセサリ', icon: 'fa-solid fa-ring' },
  { name: '道具', icon: 'fa-solid fa-hammer' },
  { name: '薬品・料理', icon: 'fa-solid fa-flask' },
  { name: '素材', icon: 'fa-solid fa-boxes-stacked' },
  { name: 'ハウジング', icon: 'fa-solid fa-house' },
  { name: 'カンパニークラフト', icon: 'fa-solid fa-anchor' },
  { name: 'その他・雑貨', icon: 'fa-solid fa-icons' },
];
