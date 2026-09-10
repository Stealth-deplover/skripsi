// Helper bersama untuk modul Happiness / Well-Being mahasiswa.

export interface HappinessDimension {
  key: string;
  label: string;
  score: number;
  weight?: number;
}

export interface HappinessData {
  id: number;
  happiness_index: number;
  category: string;
  level: string;
  timestamp: string;
  dimensions: HappinessDimension[];
  factors: HappinessDimension[];
}

export const HAPPINESS_COLOR = '#fbbf24';
export const BURNOUT_COLOR = '#818cf8';

export const categoryTone: Record<string, { chip: string; color: string }> = {
  'Sangat Tinggi': { chip: 'border-emerald-300/30 bg-emerald-500/10 text-emerald-100', color: '#34d399' },
  Tinggi: { chip: 'border-teal-300/30 bg-teal-500/10 text-teal-100', color: '#2dd4bf' },
  Sedang: { chip: 'border-amber-300/30 bg-amber-500/10 text-amber-100', color: '#fbbf24' },
  Rendah: { chip: 'border-orange-300/30 bg-orange-500/10 text-orange-100', color: '#fb923c' },
  'Sangat Rendah': { chip: 'border-rose-300/30 bg-rose-500/10 text-rose-100', color: '#fb7185' },
};

export function categoryMeta(category?: string | null) {
  if (!category) {
    return { chip: 'border-white/10 bg-white/[0.04] text-slate-300', color: '#94a3b8' };
  }
  return categoryTone[category] || { chip: 'border-white/10 bg-white/[0.04] text-slate-300', color: '#94a3b8' };
}

export const burnoutCatTone: Record<string, { chip: string; color: string }> = {
  Rendah: { chip: 'border-emerald-300/30 bg-emerald-500/10 text-emerald-100', color: '#34d399' },
  Sedang: { chip: 'border-amber-300/30 bg-amber-500/10 text-amber-100', color: '#fbbf24' },
  Tinggi: { chip: 'border-rose-300/30 bg-rose-500/10 text-rose-100', color: '#fb7185' },
};

export function burnoutCategoryMeta(category?: string | null) {
  if (!category) return { chip: 'border-white/10 bg-white/[0.04] text-slate-300', color: '#94a3b8' };
  return burnoutCatTone[category] || { chip: 'border-white/10 bg-white/[0.04] text-slate-300', color: '#94a3b8' };
}

export function interpretationMeta(label?: string | null): { chip: string } {
  switch (label) {
    case 'Kondisi relatif baik':
    case 'Relatif baik':
      return { chip: 'border-emerald-300/30 bg-emerald-500/10 text-emerald-100' };
    case 'Perlu observasi':
      return { chip: 'border-amber-300/30 bg-amber-500/10 text-amber-100' };
    case 'Perlu monitoring':
      return { chip: 'border-orange-300/30 bg-orange-500/10 text-orange-100' };
    case 'Prioritas Monitoring Akademik':
      return { chip: 'border-rose-300/30 bg-rose-500/10 text-rose-100' };
    default:
      return { chip: 'border-white/10 bg-white/[0.04] text-slate-300' };
  }
}

export function formatDateTime(value?: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
