import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  BrainCircuit,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock,
  Filter,
  HeartPulse,
  LineChart as LineChartIcon,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Zap,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import ChartShell from '../components/ChartShell';
import api from '../api';

interface Prediction {
  ID: number;
  Timestamp: string;
  BurnoutScore: number;
  PsychosomaticScore: number;
  RiskLevel: string;
}

interface Assessment {
  ID: number;
  Timestamp: string;
  OrderType: string;
  FatigueScore: number;
  CynicismScore: number;
  EfficacyScore: number;
  InterferenceScore: number;
}

type RiskFilter = 'all' | 'low' | 'medium' | 'high';
type RangeFilter = '7' | '30' | 'all';

const riskStyles: Record<string, {
  label: string;
  text: string;
  chip: string;
  border: string;
  dot: string;
  icon: typeof Activity;
}> = {
  low: {
    label: 'Rendah',
    text: 'text-emerald-200',
    chip: 'bg-emerald-500/12',
    border: 'border-emerald-400/30',
    dot: 'bg-emerald-300',
    icon: CheckCircle2,
  },
  medium: {
    label: 'Sedang',
    text: 'text-amber-200',
    chip: 'bg-amber-500/12',
    border: 'border-amber-400/30',
    dot: 'bg-amber-300',
    icon: AlertTriangle,
  },
  high: {
    label: 'Tinggi',
    text: 'text-rose-200',
    chip: 'bg-rose-500/12',
    border: 'border-rose-400/30',
    dot: 'bg-rose-300',
    icon: ShieldAlert,
  },
};

const rangeLabels: Record<RangeFilter, string> = {
  '7': '7 hari',
  '30': '30 hari',
  all: 'Semua',
};

const emptyRisk = {
  label: 'Belum ada',
  text: 'text-slate-300',
  chip: 'bg-slate-700/50',
  border: 'border-slate-600',
  dot: 'bg-slate-400',
  icon: Activity,
};

const formatNumber = (value?: number) => Number(value || 0).toFixed(2);

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatShortDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
};

const getRiskKey = (risk?: string) => (risk || '').toLowerCase();

const getRiskMeta = (risk?: string) => riskStyles[getRiskKey(risk)] || emptyRisk;

const average = (items: Prediction[], key: 'BurnoutScore' | 'PsychosomaticScore') => {
  if (!items.length) return 0;
  return items.reduce((sum, item) => sum + Number(item[key] || 0), 0) / items.length;
};

const scorePercent = (value?: number) => Math.min(100, Math.max(0, Number(value || 0) * 20));

export default function UserAsesmenHistory() {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<RangeFilter>('30');
  const [riskFilter, setRiskFilter] = useState<RiskFilter>('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      const response = await api.get('/user/history');
      const sortedPredictions = (response.data?.predictions || []).sort((a: Prediction, b: Prediction) =>
        new Date(a.Timestamp).getTime() - new Date(b.Timestamp).getTime(),
      );
      const sortedAssessments = (response.data?.assessments || []).sort((a: Assessment, b: Assessment) =>
        new Date(a.Timestamp).getTime() - new Date(b.Timestamp).getTime(),
      );

      setPredictions(sortedPredictions);
      setAssessments(sortedAssessments);
      setSelectedId(sortedPredictions[sortedPredictions.length - 1]?.ID || null);
    } catch (error) {
      console.error('Failed to fetch history', error);
    } finally {
      setLoading(false);
    }
  };

  const rangedPredictions = useMemo(() => {
    if (range === 'all') return predictions;
    const days = Number(range);
    const start = new Date();
    start.setDate(start.getDate() - days);
    return predictions.filter((item) => new Date(item.Timestamp) >= start);
  }, [predictions, range]);

  const filteredPredictions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return rangedPredictions
      .filter((item) => riskFilter === 'all' || getRiskKey(item.RiskLevel) === riskFilter)
      .filter((item) => {
        if (!normalized) return true;
        return `${formatDate(item.Timestamp)} ${item.RiskLevel} ${item.BurnoutScore} ${item.PsychosomaticScore}`
          .toLowerCase()
          .includes(normalized);
      })
      .slice()
      .reverse();
  }, [query, rangedPredictions, riskFilter]);

  const selectedPrediction = useMemo(() => {
    return predictions.find((item) => item.ID === selectedId) || predictions[predictions.length - 1] || null;
  }, [predictions, selectedId]);

  const latestAssessment = assessments[assessments.length - 1];
  const latestPrediction = predictions[predictions.length - 1];
  const previousPrediction = predictions[predictions.length - 2];
  const latestMeta = getRiskMeta(latestPrediction?.RiskLevel);
  const LatestRiskIcon = latestMeta.icon;

  const burnoutDelta = latestPrediction && previousPrediction
    ? latestPrediction.BurnoutScore - previousPrediction.BurnoutScore
    : 0;
  const psychoDelta = latestPrediction && previousPrediction
    ? latestPrediction.PsychosomaticScore - previousPrediction.PsychosomaticScore
    : 0;

  const chartData = rangedPredictions.map((item) => ({
    date: formatShortDate(item.Timestamp),
    fullDate: formatDate(item.Timestamp),
    Burnout: Number(item.BurnoutScore.toFixed(2)),
    Psikosomatis: Number(item.PsychosomaticScore.toFixed(2)),
    Risiko: getRiskMeta(item.RiskLevel).label,
  }));

  const riskDistribution = (['low', 'medium', 'high'] as const).map((risk) => ({
    name: riskStyles[risk].label,
    value: rangedPredictions.filter((item) => getRiskKey(item.RiskLevel) === risk).length,
    fill: risk === 'low' ? '#34d399' : risk === 'medium' ? '#fbbf24' : '#fb7185',
  }));

  const stats = [
    {
      label: 'Total asesmen',
      value: predictions.length,
      detail: `${rangedPredictions.length} dalam filter`,
      icon: ClipboardList,
      color: 'text-cyan-200',
      bg: 'bg-cyan-500/10',
    },
    {
      label: 'Rata-rata burnout',
      value: formatNumber(average(rangedPredictions, 'BurnoutScore')),
      detail: burnoutDelta <= 0 ? 'Tren membaik' : 'Perlu dipantau',
      icon: burnoutDelta <= 0 ? TrendingDown : TrendingUp,
      color: burnoutDelta <= 0 ? 'text-emerald-200' : 'text-rose-200',
      bg: burnoutDelta <= 0 ? 'bg-emerald-500/10' : 'bg-rose-500/10',
    },
    {
      label: 'Rata-rata psikosomatis',
      value: formatNumber(average(rangedPredictions, 'PsychosomaticScore')),
      detail: psychoDelta <= 0 ? 'Gejala menurun' : 'Butuh perhatian',
      icon: HeartPulse,
      color: psychoDelta <= 0 ? 'text-emerald-200' : 'text-amber-200',
      bg: psychoDelta <= 0 ? 'bg-emerald-500/10' : 'bg-amber-500/10',
    },
    {
      label: 'Risiko terbaru',
      value: latestMeta.label,
      detail: latestPrediction ? formatShortDate(latestPrediction.Timestamp) : 'Belum tersedia',
      icon: LatestRiskIcon,
      color: latestMeta.text,
      bg: latestMeta.chip,
    },
  ];

  const selectedMeta = getRiskMeta(selectedPrediction?.RiskLevel);
  const SelectedRiskIcon = selectedMeta.icon;
  const priorityPlan = getRiskKey(latestPrediction?.RiskLevel) === 'high'
    ? ['Hubungi admin/konselor bila gejala mengganggu aktivitas.', 'Kurangi beban tugas besar hari ini.', 'Catat pemicu utama di ruang curhat.']
    : getRiskKey(latestPrediction?.RiskLevel) === 'medium'
      ? ['Ambil jeda 10 menit setelah blok belajar.', 'Pantau tidur dan makan selama 3 hari.', 'Isi kuisioner lagi besok.']
      : ['Pertahankan rutinitas yang membantu.', 'Gunakan asesmen sebagai baseline mingguan.', 'Tetap cek sinyal tubuh setelah aktivitas padat.'];

  if (loading) {
    return (
      <main className="min-h-screen bg-[#0b0d14] px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
        <div className="mx-auto flex min-h-[70vh] max-w-7xl items-center justify-center">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-cyan-400/30 blur-xl" />
              <Activity className="relative h-9 w-9 animate-spin text-cyan-200" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-100">Memuat riwayat asesmen</p>
              <p className="text-xs text-slate-400">Menyiapkan tren dan insight personal</p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0b0d14] px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="overflow-hidden rounded-lg border border-white/10 bg-slate-950">
          <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[1.2fr_0.8fr] lg:p-8">
            <div className="flex flex-col justify-between gap-8">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-2 rounded-md border border-emerald-300/30 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-100">
                    <Sparkles className="h-3.5 w-3.5" />
                    Personal wellbeing monitor
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-md border border-cyan-300/30 bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-100">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {latestPrediction ? formatDate(latestPrediction.Timestamp) : 'Belum ada asesmen'}
                  </span>
                </div>
                <div>
                  <h1 className="text-3xl font-semibold tracking-normal text-white sm:text-4xl">
                    Riwayat Asesmen
                  </h1>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
                    Pantau perubahan burnout, psikosomatis, dan pola asesmen dari waktu ke waktu dalam satu dashboard personal.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <Link
                  to="/user/kuisioner"
                  className="inline-flex h-10 items-center gap-2 rounded-md bg-emerald-400 px-4 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-950/30 transition hover:bg-emerald-300"
                >
                  <ClipboardList className="h-4 w-4" />
                  Isi kuisioner
                </Link>
                <button
                  onClick={fetchHistory}
                  className="inline-flex h-10 items-center gap-2 rounded-md border border-white/10 bg-white/5 px-4 text-sm font-semibold text-slate-100 transition hover:bg-white/10"
                >
                  <RefreshCw className="h-4 w-4" />
                  Segarkan
                </button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {stats.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-md ${item.bg}`}>
                        <Icon className={`h-5 w-5 ${item.color}`} />
                      </div>
                      <ArrowUpRight className="h-4 w-4 text-slate-500" />
                    </div>
                    <p className="mt-4 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
                    <p className="mt-1 text-2xl font-semibold text-white">{item.value}</p>
                    <p className="mt-1 text-xs text-slate-400">{item.detail}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
          <div className="rounded-lg border border-white/10 bg-slate-950 p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  <LineChartIcon className="h-4 w-4 text-cyan-200" />
                  Tren Burnout & Psikosomatis
                </div>
                <p className="mt-1 text-xs text-slate-400">Rentang data: {rangeLabels[range]}</p>
              </div>
              <div className="grid grid-cols-3 rounded-md border border-white/10 bg-white/[0.03] p-1">
                {(['7', '30', 'all'] as RangeFilter[]).map((item) => (
                  <button
                    key={item}
                    onClick={() => setRange(item)}
                    className={`h-8 rounded px-3 text-xs font-semibold transition ${
                      range === item ? 'bg-cyan-300 text-slate-950' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {rangeLabels[item]}
                  </button>
                ))}
              </div>
            </div>

            {chartData.length > 0 ? (
              <ChartShell height={360} className="mt-5 overflow-hidden rounded-lg">
                <AreaChart data={chartData} margin={{ top: 12, right: 14, bottom: 4, left: -16 }}>
                  <defs>
                    <linearGradient id="burnoutGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#fb7185" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#fb7185" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="psychoGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="4 4" stroke="rgba(148, 163, 184, 0.12)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} width={34} />
                  <Tooltip
                    contentStyle={{
                      background: 'rgba(2, 6, 23, 0.96)',
                      border: '1px solid rgba(148, 163, 184, 0.2)',
                      borderRadius: 8,
                      color: '#fff',
                    }}
                    labelStyle={{ color: '#cbd5e1' }}
                  />
                  <Legend iconType="circle" wrapperStyle={{ paddingTop: 14, color: '#cbd5e1' }} />
                  <Area
                    type="monotone"
                    name="Burnout"
                    dataKey="Burnout"
                    stroke="#fb7185"
                    strokeWidth={3}
                    fill="url(#burnoutGradient)"
                    activeDot={{ r: 6 }}
                  />
                  <Area
                    type="monotone"
                    name="Psikosomatis"
                    dataKey="Psikosomatis"
                    stroke="#22d3ee"
                    strokeWidth={3}
                    fill="url(#psychoGradient)"
                    activeDot={{ r: 6 }}
                  />
                </AreaChart>
              </ChartShell>
            ) : (
              <div className="mt-5 flex h-[360px] flex-col items-center justify-center rounded-lg border border-dashed border-white/10 bg-white/[0.03] text-center">
                <BarChart3 className="h-10 w-10 text-slate-600" />
                <p className="mt-3 text-sm font-semibold text-slate-300">Belum ada data pada rentang ini</p>
                <p className="mt-1 text-xs text-slate-500">Coba pilih rentang lain atau isi kuisioner baru.</p>
              </div>
            )}
          </div>

          <div className="grid gap-6">
            <div className="rounded-lg border border-white/10 bg-slate-950 p-5 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-white">
                    <Target className="h-4 w-4 text-emerald-200" />
                    Kondisi Terbaru
                  </div>
                  <p className="mt-1 text-xs text-slate-400">Snapshot dari asesmen paling akhir</p>
                </div>
                <span className={`inline-flex items-center gap-2 rounded-md border px-3 py-1 text-xs font-semibold ${latestMeta.border} ${latestMeta.chip} ${latestMeta.text}`}>
                  <LatestRiskIcon className="h-3.5 w-3.5" />
                  {latestMeta.label}
                </span>
              </div>

              <div className="mt-5 space-y-4">
                {[
                  { label: 'Burnout', value: latestPrediction?.BurnoutScore, color: 'bg-rose-300' },
                  { label: 'Psikosomatis', value: latestPrediction?.PsychosomaticScore, color: 'bg-cyan-300' },
                  { label: 'Fatigue', value: latestAssessment?.FatigueScore, color: 'bg-amber-300' },
                  { label: 'Efficacy', value: latestAssessment?.EfficacyScore, color: 'bg-emerald-300' },
                ].map((item) => (
                  <div key={item.label}>
                    <div className="mb-2 flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-300">{item.label}</span>
                      <span className="font-semibold text-white">{formatNumber(item.value)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-800">
                      <div className={`h-full rounded-full ${item.color}`} style={{ width: `${scorePercent(item.value)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-white/10 bg-slate-950 p-5 sm:p-6">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <Zap className="h-4 w-4 text-amber-200" />
                Prioritas Hari Ini
              </div>
              <div className="mt-4 space-y-3">
                {priorityPlan.map((item, index) => (
                  <div key={item} className="flex gap-3 rounded-md border border-white/10 bg-white/[0.03] p-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-emerald-300 text-xs font-bold text-slate-950">
                      {index + 1}
                    </span>
                    <p className="text-sm leading-5 text-slate-300">{item}</p>
                  </div>
                ))}
              </div>
            </div>

              <div className="rounded-lg border border-white/10 bg-slate-950 p-5 sm:p-6">
              <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-white">
                <BarChart3 className="h-4 w-4 text-violet-200" />
                Distribusi Risiko
              </div>
              <ChartShell height={190} className="overflow-hidden">
                <BarChart data={riskDistribution} margin={{ top: 8, right: 4, bottom: 0, left: -22 }}>
                  <CartesianGrid strokeDasharray="4 4" stroke="rgba(148, 163, 184, 0.12)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    cursor={{ fill: 'rgba(148, 163, 184, 0.08)' }}
                    contentStyle={{
                      background: 'rgba(2, 6, 23, 0.96)',
                      border: '1px solid rgba(148, 163, 184, 0.2)',
                      borderRadius: 8,
                      color: '#fff',
                    }}
                  />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ChartShell>
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[0.75fr_1.25fr]">
          <div className="rounded-lg border border-white/10 bg-slate-950 p-5 sm:p-6">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <BrainCircuit className="h-4 w-4 text-cyan-200" />
              Detail Terpilih
            </div>

            {selectedPrediction ? (
              <div className="mt-5 space-y-4">
                <div className={`rounded-lg border p-4 ${selectedMeta.border} ${selectedMeta.chip}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Level risiko</p>
                      <p className={`mt-1 text-2xl font-semibold ${selectedMeta.text}`}>{selectedMeta.label}</p>
                    </div>
                    <SelectedRiskIcon className={`h-9 w-9 ${selectedMeta.text}`} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
                    <p className="text-xs text-slate-500">Burnout</p>
                    <p className="mt-1 text-2xl font-semibold text-rose-200">{formatNumber(selectedPrediction.BurnoutScore)}</p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
                    <p className="text-xs text-slate-500">Psikosomatis</p>
                    <p className="mt-1 text-2xl font-semibold text-cyan-200">{formatNumber(selectedPrediction.PsychosomaticScore)}</p>
                  </div>
                </div>

                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    <Clock className="h-3.5 w-3.5" />
                    Waktu asesmen
                  </div>
                  <p className="mt-2 text-sm text-slate-200">{formatDate(selectedPrediction.Timestamp)}</p>
                </div>
              </div>
            ) : (
              <div className="mt-5 rounded-lg border border-dashed border-white/10 bg-white/[0.03] p-6 text-sm text-slate-400">
                Belum ada asesmen yang bisa ditampilkan.
              </div>
            )}
          </div>

          <div className="rounded-lg border border-white/10 bg-slate-950 p-5 sm:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  <Activity className="h-4 w-4 text-emerald-200" />
                  Timeline Asesmen
                </div>
                <p className="mt-1 text-xs text-slate-400">{filteredPredictions.length} catatan ditampilkan</p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Cari tanggal atau skor"
                    className="h-10 w-full rounded-md border border-white/10 bg-white/[0.04] pl-9 pr-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-300/50 sm:w-56"
                  />
                </label>
                <div className="flex rounded-md border border-white/10 bg-white/[0.03] p-1">
                  {(['all', 'low', 'medium', 'high'] as RiskFilter[]).map((item) => {
                    const meta = item === 'all' ? emptyRisk : riskStyles[item];
                    return (
                      <button
                        key={item}
                        onClick={() => setRiskFilter(item)}
                        className={`inline-flex h-8 items-center gap-1.5 rounded px-2.5 text-xs font-semibold transition ${
                          riskFilter === item ? 'bg-white text-slate-950' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {item === 'all' ? <Filter className="h-3.5 w-3.5" /> : <span className={`h-2 w-2 rounded-full ${meta.dot}`} />}
                        {item === 'all' ? 'Semua' : meta.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="mt-5 overflow-hidden rounded-lg border border-white/10">
              <div className="hidden grid-cols-[1.1fr_0.8fr_0.8fr_0.7fr] border-b border-white/10 bg-white/[0.03] px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 md:grid">
                <span>Tanggal</span>
                <span>Burnout</span>
                <span>Psikosomatis</span>
                <span>Risiko</span>
              </div>

              <div className="max-h-[520px] overflow-y-auto">
                {filteredPredictions.map((item) => {
                  const meta = getRiskMeta(item.RiskLevel);
                  const RiskIcon = meta.icon;
                  const active = selectedPrediction?.ID === item.ID;

                  return (
                    <button
                      key={item.ID}
                      onClick={() => setSelectedId(item.ID)}
                      className={`grid w-full gap-3 border-b border-white/10 px-4 py-4 text-left transition last:border-b-0 md:grid-cols-[1.1fr_0.8fr_0.8fr_0.7fr] md:items-center ${
                        active ? 'bg-cyan-300/10' : 'bg-transparent hover:bg-white/[0.04]'
                      }`}
                    >
                      <span className="flex items-center gap-3 text-sm font-medium text-slate-200">
                        <span className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} />
                        {formatDate(item.Timestamp)}
                      </span>
                      <span className="text-sm font-semibold text-rose-200">{formatNumber(item.BurnoutScore)}</span>
                      <span className="text-sm font-semibold text-cyan-200">{formatNumber(item.PsychosomaticScore)}</span>
                      <span className={`inline-flex w-fit items-center gap-2 rounded-md border px-2.5 py-1 text-xs font-semibold ${meta.border} ${meta.chip} ${meta.text}`}>
                        <RiskIcon className="h-3.5 w-3.5" />
                        {meta.label}
                      </span>
                    </button>
                  );
                })}

                {filteredPredictions.length === 0 && (
                  <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
                    <Activity className="h-10 w-10 text-slate-600" />
                    <p className="mt-3 text-sm font-semibold text-slate-300">Tidak ada catatan yang cocok</p>
                    <p className="mt-1 text-xs text-slate-500">Ubah filter atau kata kunci pencarian.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
