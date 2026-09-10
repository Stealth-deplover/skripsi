import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock3,
  Download,
  FileText,
  Filter,
  Loader2,
  RefreshCcw,
  Scale,
  Search,
  ShieldAlert,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import api from '../api';

interface WarningItem {
  id: string;
  user_id: number;
  user_name: string;
  username: string;
  signal: string;
  severity: 'urgent' | 'high' | 'medium' | string;
  score: number;
  summary: string;
  action: string;
  created_at: string;
  source_id: number;
  source_type: string;
  status: string;
  explanation: string[];
}

interface CaseSummary {
  user?: { id: number; nama: string; username: string };
  risk_level: string;
  summary: string;
  key_factors: string[];
  recommended_actions: string[];
  model_explainability: Record<string, number | string>;
  pending_treatments: number;
  unread_replies: number;
  privacy_note: string;
}

const severityStyle: Record<string, string> = {
  urgent: 'border-rose-400/35 bg-rose-500/10 text-rose-200',
  high: 'border-orange-400/35 bg-orange-500/10 text-orange-200',
  medium: 'border-amber-400/35 bg-amber-500/10 text-amber-200',
};

const riskStyle: Record<string, string> = {
  Crisis: 'border-rose-400/35 bg-rose-500/10 text-rose-200',
  High: 'border-orange-400/35 bg-orange-500/10 text-orange-200',
  Medium: 'border-amber-400/35 bg-amber-500/10 text-amber-200',
  Low: 'border-emerald-400/35 bg-emerald-500/10 text-emerald-200',
};

const formatDate = (value?: string) => {
  if (!value || value.startsWith('0001')) return '-';
  return new Date(value).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const percent = (value?: number) => `${Math.round(Math.max(0, Math.min(value || 0, 1)) * 100)}%`;

type SourceFilter = 'all' | 'prediction' | 'curhat' | 'checkin' | 'reply';

const sourceFilters: Array<{ key: SourceFilter; label: string }> = [
  { key: 'all', label: 'Semua sumber' },
  { key: 'curhat', label: 'Curhat AI' },
  { key: 'prediction', label: 'Prediksi' },
  { key: 'checkin', label: 'Check-in' },
  { key: 'reply', label: 'Balasan' },
];

const sourceLabel: Record<string, string> = {
  prediction: 'Prediksi ML',
  curhat: 'Curhat AI',
  checkin: 'Check-in',
  reply: 'Balasan terapi',
  treatment: 'Terapi',
};

const dataQuality = (selected?: WarningItem | null, summary?: CaseSummary | null) => {
  const points = [
    Boolean(selected?.summary),
    Boolean(selected?.explanation?.length),
    Boolean(summary?.key_factors?.length),
    Boolean(summary?.recommended_actions?.length),
    Boolean(Object.keys(summary?.model_explainability || {}).length),
    Boolean((summary?.pending_treatments ?? 0) > 0 || (summary?.unread_replies ?? 0) > 0),
  ].filter(Boolean).length;

  if (points >= 5) return { label: 'Kuat', desc: 'Bukti lintas sumber cukup untuk triage cepat.', className: 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200' };
  if (points >= 3) return { label: 'Cukup', desc: 'Bukti memadai, tetap cek riwayat sebelum eskalasi.', className: 'border-cyan-400/25 bg-cyan-500/10 text-cyan-200' };
  return { label: 'Perlu data', desc: 'Butuh asesmen, check-in, atau curhat tambahan.', className: 'border-amber-400/25 bg-amber-500/10 text-amber-200' };
};

export default function RiskCenter() {
  const [warnings, setWarnings] = useState<WarningItem[]>([]);
  const [selected, setSelected] = useState<WarningItem | null>(null);
  const [summary, setSummary] = useState<CaseSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'open' | 'urgent' | 'all'>('open');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [toast, setToast] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const response = await api.get('/admin/risk-center');
      const items = response.data.warnings || [];
      setWarnings(items);
      if (!selected && items.length > 0) setSelected(items[0]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!selected) return;
    setSummaryLoading(true);
    api
      .get(`/admin/users/${selected.user_id}/case-summary`)
      .then((response) => setSummary(response.data))
      .catch(() => setSummary(null))
      .finally(() => setSummaryLoading(false));
  }, [selected]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const filtered = useMemo(() => {
    const keyword = query.toLowerCase();
    return warnings.filter((item) => {
      const matchQuery =
        item.user_name.toLowerCase().includes(keyword) ||
        item.username.toLowerCase().includes(keyword) ||
        item.signal.toLowerCase().includes(keyword);
      const matchFilter =
        filter === 'all' ||
        (filter === 'urgent' && (item.severity === 'urgent' || item.severity === 'high')) ||
        (filter === 'open' && item.status !== 'resolved' && item.status !== 'completed');
      const matchSource = sourceFilter === 'all' || item.source_type === sourceFilter;
      return matchQuery && matchFilter && matchSource;
    });
  }, [filter, query, sourceFilter, warnings]);

  const stats = useMemo(
    () => ({
      total: warnings.length,
      urgent: warnings.filter((item) => item.severity === 'urgent').length,
      high: warnings.filter((item) => item.severity === 'high').length,
      open: warnings.filter((item) => item.status !== 'resolved' && item.status !== 'completed').length,
      unread: warnings.filter((item) => item.source_type === 'reply').length,
      averageScore: warnings.length ? warnings.reduce((sum, item) => sum + item.score, 0) / warnings.length : 0,
    }),
    [warnings],
  );

  const sourceCounts = useMemo(
    () =>
      warnings.reduce<Record<string, number>>((acc, item) => {
        acc[item.source_type] = (acc[item.source_type] || 0) + 1;
        return acc;
      }, {}),
    [warnings],
  );

  const triageColumns = useMemo(
    () => [
      {
        key: 'urgent',
        title: 'Krisis cepat',
        subtitle: 'Butuh keputusan hari ini',
        tone: 'border-rose-400/25 bg-rose-500/10 text-rose-100',
        items: filtered.filter((item) => item.severity === 'urgent').slice(0, 3),
      },
      {
        key: 'high',
        title: 'Observasi ketat',
        subtitle: 'Pantau dan follow-up aktif',
        tone: 'border-orange-400/25 bg-orange-500/10 text-orange-100',
        items: filtered.filter((item) => item.severity === 'high').slice(0, 3),
      },
      {
        key: 'medium',
        title: 'Stabil dipantau',
        subtitle: 'Masuk ritme monitoring',
        tone: 'border-amber-400/25 bg-amber-500/10 text-amber-100',
        items: filtered.filter((item) => item.severity !== 'urgent' && item.severity !== 'high').slice(0, 3),
      },
    ],
    [filtered],
  );

  const updateStatus = async (item: WarningItem, status: string) => {
    try {
      await api.patch(`/admin/triage/${item.source_type}/${item.source_id}/status`, { status });
      const nextWarnings = warnings.filter((entry) => entry.id !== item.id);
      setWarnings(nextWarnings);
      setSelected((prev) => (prev?.id === item.id ? nextWarnings[0] || null : prev));
      setToast('Sinyal ditandai selesai dan dicatat di audit triage.');
    } catch (error: any) {
      setToast(error.response?.data?.error || 'Status triage gagal diperbarui.');
    }
  };

  const exportReport = async () => {
    if (!selected) return;
    const response = await api.get(`/admin/users/${selected.user_id}/report`, { responseType: 'blob' });
    const blob = response.data instanceof Blob ? response.data : new Blob([response.data], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `nexusmind-case-report-${selected.user_id}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="min-h-screen bg-[#0b0d14] px-5 py-6 text-slate-100 md:px-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="rounded-xl border border-slate-800 bg-slate-950/80 p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-400/25 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-200">
                <ShieldAlert className="h-3.5 w-3.5" />
                Early Warning Center
              </div>
              <h1 className="text-2xl font-semibold tracking-normal text-white">Pusat Risiko</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                Triage sinyal burnout, psikosomatis, curhat AI, check-in, balasan terapi, dan case summary dalam satu ruang kerja admin.
              </p>
            </div>
            <button
              onClick={load}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-4 text-sm font-semibold text-slate-200 transition hover:border-cyan-400/40 hover:text-cyan-200"
            >
              <RefreshCcw className="h-4 w-4" />
              Muat ulang
            </button>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            {[
              { label: 'Total sinyal', value: stats.total, color: 'text-cyan-200' },
              { label: 'Masih aktif', value: stats.open, color: 'text-slate-100' },
              { label: 'Urgent', value: stats.urgent, color: 'text-rose-200' },
              { label: 'Tinggi', value: stats.high, color: 'text-orange-200' },
              { label: 'Balasan user', value: stats.unread, color: 'text-amber-200' },
              { label: 'Skor rata-rata', value: percent(stats.averageScore), color: 'text-emerald-200' },
            ].map((item) => (
              <div key={item.label} className="rounded-lg border border-slate-800 bg-slate-900/70 p-4">
                <p className="text-xs text-slate-500">{item.label}</p>
                <p className={`mt-2 text-2xl font-semibold ${item.color}`}>{item.value}</p>
              </div>
            ))}
          </div>
        </header>

        {toast && (
          <div className="rounded-lg border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-200">
            {toast}
          </div>
        )}

        <section className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_430px]">
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 flex-1 items-center gap-3 rounded-lg border border-slate-800 bg-slate-950 px-4 py-3 focus-within:border-cyan-400/50">
                <Search className="h-4 w-4 text-slate-500" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Cari responden, username, atau sinyal..."
                  className="min-w-0 flex-1 bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-600"
                />
              </div>
              <div className="flex w-fit rounded-lg border border-slate-800 bg-slate-950 p-1">
                {[
                  { key: 'open' as const, label: 'Aktif' },
                  { key: 'urgent' as const, label: 'Prioritas' },
                  { key: 'all' as const, label: 'Semua' },
                ].map((item) => (
                  <button
                    key={item.key}
                    onClick={() => setFilter(item.key)}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                      filter === item.key ? 'bg-cyan-500/15 text-cyan-200' : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/70 p-2">
              <div className="mr-1 inline-flex items-center gap-2 px-2 text-xs font-semibold uppercase text-slate-500">
                <Filter className="h-3.5 w-3.5" />
                Sumber
              </div>
              {sourceFilters.map((item) => (
                <button
                  key={item.key}
                  onClick={() => setSourceFilter(item.key)}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                    sourceFilter === item.key ? 'bg-slate-100 text-slate-950' : 'text-slate-500 hover:bg-slate-900 hover:text-slate-300'
                  }`}
                >
                  {item.label}
                  <span className="ml-2 text-[10px] opacity-70">
                    {item.key === 'all' ? warnings.length : sourceCounts[item.key] || 0}
                  </span>
                </button>
              ))}
            </div>

            <div className="mb-4 grid gap-3 lg:grid-cols-3">
              {triageColumns.map((column) => (
                <div key={column.key} className={`rounded-xl border p-4 ${column.tone}`}>
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">{column.title}</p>
                      <p className="mt-1 text-xs opacity-70">{column.subtitle}</p>
                    </div>
                    <span className="rounded-full border border-current/20 px-2 py-0.5 text-xs font-semibold">{column.items.length}</span>
                  </div>
                  {column.items.length === 0 ? (
                    <p className="rounded-lg border border-current/10 bg-slate-950/40 px-3 py-2 text-xs opacity-70">Tidak ada item pada jalur ini.</p>
                  ) : (
                    <div className="space-y-2">
                      {column.items.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => setSelected(item)}
                          className="w-full rounded-lg border border-current/10 bg-slate-950/50 px-3 py-2 text-left transition hover:bg-slate-950/80"
                        >
                          <span className="block truncate text-xs font-semibold">{item.user_name || 'User'}</span>
                          <span className="mt-0.5 block truncate text-[11px] opacity-70">{item.signal}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {loading ? (
              <div className="space-y-3">
                {[0, 1, 2, 3].map((item) => (
                  <div key={item} className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                    <div className="mb-3 flex items-center justify-between gap-4">
                      <div className="h-5 w-40 animate-pulse rounded bg-slate-800" />
                      <div className="h-7 w-16 animate-pulse rounded bg-slate-800" />
                    </div>
                    <div className="h-4 w-full animate-pulse rounded bg-slate-800" />
                    <div className="mt-2 h-4 w-2/3 animate-pulse rounded bg-slate-800" />
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-12 text-center">
                <ShieldCheck className="mx-auto h-10 w-10 text-emerald-300" />
                <h3 className="mt-4 text-base font-semibold text-white">Tidak ada sinyal pada filter ini</h3>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
                  Sistem tetap memantau curhat, asesmen, check-in, dan balasan terapi secara berkala.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setSelected(item)}
                    className={`w-full rounded-xl border p-4 text-left transition ${
                      selected?.id === item.id ? 'border-cyan-400/40 bg-cyan-500/10' : 'border-slate-800 bg-slate-950/70 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${severityStyle[item.severity] || severityStyle.medium}`}>
                            {item.severity}
                          </span>
                          <span className="rounded-full border border-slate-800 bg-slate-900 px-2.5 py-1 text-[11px] text-slate-400">
                            {sourceLabel[item.source_type] || item.source_type}
                          </span>
                          <span className="text-xs text-slate-500">{formatDate(item.created_at)}</span>
                        </div>
                        <h2 className="text-sm font-semibold text-white">{item.signal}</h2>
                        <p className="mt-1 text-xs text-slate-500">{item.user_name || 'User'} | @{item.username}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-semibold text-white">{percent(item.score)}</p>
                        <p className="text-[11px] text-slate-500">risk score</p>
                      </div>
                    </div>
                    <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-300">{item.summary}</p>
                    <p className="mt-2 text-xs font-medium text-cyan-200">{item.action}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <aside className="space-y-5">
            <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
              {!selected ? (
                <div className="p-8 text-center text-sm text-slate-500">Pilih sinyal untuk membuka case summary.</div>
              ) : summaryLoading ? (
                <div className="flex h-60 items-center justify-center">
                  <Loader2 className="h-7 w-7 animate-spin text-slate-500" />
                </div>
              ) : (
                <div>
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <div className="mb-2 flex items-center gap-2">
                        <UserRound className="h-4 w-4 text-cyan-200" />
                        <h2 className="text-base font-semibold text-white">{summary?.user?.nama || selected.user_name}</h2>
                      </div>
                      <p className="text-xs text-slate-500">@{summary?.user?.username || selected.username}</p>
                    </div>
                    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${riskStyle[summary?.risk_level || 'Medium'] || riskStyle.Medium}`}>
                      {summary?.risk_level || '-'}
                    </span>
                  </div>

                  <p className="rounded-lg border border-slate-800 bg-slate-950/70 p-4 text-sm leading-6 text-slate-300">
                    {summary?.summary || selected.summary}
                  </p>

                  <div className="mt-4 rounded-lg border border-cyan-400/20 bg-cyan-500/10 p-4">
                    <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase text-cyan-200">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Dossier dokumen
                    </div>
                    <div className="grid gap-2 text-xs text-slate-300">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-500">Nomor dokumen</span>
                        <span className="font-semibold text-slate-100">NX-CASE-{selected.user_id}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-500">Klasifikasi</span>
                        <span className="font-semibold text-amber-200">Rahasia internal</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-500">Export</span>
                        <span className="font-semibold text-cyan-200">PDF resmi</span>
                      </div>
                    </div>
                  </div>

                  {(() => {
                    const quality = dataQuality(selected, summary);
                    return (
                      <div className={`mt-4 rounded-lg border p-4 ${quality.className}`}>
                        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase">
                          <ShieldCheck className="h-3.5 w-3.5" />
                          Kualitas data: {quality.label}
                        </div>
                        <p className="text-sm leading-6 opacity-80">{quality.desc}</p>
                      </div>
                    );
                  })()}

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                      <p className="text-xs text-slate-500">Terapi pending</p>
                      <p className="mt-1 text-xl font-semibold text-white">{summary?.pending_treatments ?? 0}</p>
                    </div>
                    <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                      <p className="text-xs text-slate-500">Balasan baru</p>
                      <p className="mt-1 text-xl font-semibold text-white">{summary?.unread_replies ?? 0}</p>
                    </div>
                  </div>

                  <div className="mt-4">
                    <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Faktor utama</p>
                    <div className="space-y-2">
                      {(summary?.key_factors || selected.explanation || []).slice(0, 5).map((item) => (
                        <div key={item} className="flex gap-2 rounded-lg border border-slate-800 bg-slate-950/70 p-3 text-xs leading-5 text-slate-300">
                          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-4">
                    <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Tindakan disarankan</p>
                    <div className="space-y-2">
                      {(summary?.recommended_actions || [selected.action]).slice(0, 4).map((item) => (
                        <div key={item} className="flex gap-2 rounded-lg border border-slate-800 bg-slate-950/70 p-3 text-xs leading-5 text-slate-300">
                          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-300" />
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-4 rounded-lg border border-cyan-400/20 bg-cyan-500/10 p-3">
                    <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-cyan-200">
                      <Activity className="h-3.5 w-3.5" />
                      Model explainability
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs text-slate-400">
                      {Object.entries(summary?.model_explainability || {}).slice(0, 6).map(([key, value]) => (
                        <div key={key} className="rounded-md border border-slate-800 bg-slate-950/60 p-2">
                          <span className="block text-slate-500">{key.replaceAll('_', ' ')}</span>
                          <span className="font-semibold text-slate-200">{typeof value === 'number' ? value.toFixed(2) : value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-slate-500">
                        <Clock3 className="h-3.5 w-3.5" />
                        SLA tindakan
                      </div>
                      <p className="text-sm font-semibold text-white">
                        {selected.severity === 'urgent' ? 'Hari ini' : selected.severity === 'high' ? '24 jam' : '72 jam'}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">Batas aman follow-up berdasarkan tingkat risiko.</p>
                    </div>
                    <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-slate-500">
                        <Scale className="h-3.5 w-3.5" />
                        Prioritas
                      </div>
                      <p className="text-sm font-semibold text-white">{percent(selected.score)} confidence</p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">Dipakai untuk urutan kerja, bukan diagnosis medis.</p>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button
                      onClick={() => selected && updateStatus(selected, selected.source_type === 'curhat' ? 'resolved' : 'completed')}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-500 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Selesai
                    </button>
                    <button
                      onClick={exportReport}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-950 text-sm font-semibold text-slate-300 transition hover:border-cyan-400/40 hover:text-cyan-200"
                    >
                      <Download className="h-4 w-4" />
                      Export PDF
                    </button>
                  </div>
                </div>
              )}
            </section>

            <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
              <div className="mb-3 flex items-center gap-2">
                <FileText className="h-4 w-4 text-slate-400" />
                <h2 className="text-sm font-semibold text-white">Privacy & consent</h2>
              </div>
              <p className="text-sm leading-6 text-slate-400">
                Ringkasan ini untuk monitoring internal, penanganan risiko, dan follow-up admin. Sistem tidak menggantikan diagnosis medis.
              </p>
            </section>
          </aside>
        </section>
      </div>
    </main>
  );
}
