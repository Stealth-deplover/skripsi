import { useCallback, useEffect, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Activity, Flame, Heart, Loader2, RefreshCw, Smile, TrendingUp } from 'lucide-react';
import ChartShell from '../components/ChartShell';
import api from '../api';
import { BURNOUT_COLOR, HAPPINESS_COLOR } from './userDashboard/happinessShared';

interface AnalyticsResponse {
  overview: {
    total_students: number;
    avg_burnout: number;
    avg_happiness: number;
    burnout_tinggi: number;
    happiness_rendah: number;
    priority_monitoring: number;
    students_with_burnout: number;
    students_with_happiness: number;
  };
  filters: { prodi: string; angkatan: string; semester: string; days: number };
  prodi_options: string[];
  burnout_dist: Record<string, number>;
  happiness_dist: Record<string, number>;
  trend: { date: string; burnout: number; happiness: number }[];
  by_semester: { semester: number; burnout: number; happiness: number; count: number }[];
  happiness_factors: { key: string; label: string; score: number }[];
  burnout_factors: { key: string; label: string; score: number }[];
  matrix: { burnout: string; happiness: string; count: number }[];
  model_status: { mode: string; ready_for_ml: boolean; min_samples: number };
  weights: Record<string, number>;
}

const BURNOUT_CATS = ['Rendah', 'Sedang', 'Tinggi'];
const HAPPINESS_CATS = ['Sangat Rendah', 'Rendah', 'Sedang', 'Tinggi', 'Sangat Tinggi'];

export default function HappinessAnalitik() {
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [prodi, setProdi] = useState('');
  const [angkatan, setAngkatan] = useState('');
  const [semester, setSemester] = useState('');
  const [days, setDays] = useState(90);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (prodi) params.set('prodi', prodi);
      if (angkatan) params.set('angkatan', angkatan);
      if (semester) params.set('semester', semester);
      params.set('days', String(days));
      const res = await api.get(`/admin/happiness?${params.toString()}`);
      setData(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Gagal memuat analitik happiness');
    } finally {
      setLoading(false);
    }
  }, [prodi, angkatan, semester, days]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const tooltipStyle = { background: '#1a1e2e', border: '1px solid #2a2e42', borderRadius: 8, fontSize: 11, color: '#e2e8f0' };

  const burnoutDistData = BURNOUT_CATS.map((cat) => ({ name: cat, value: data?.burnout_dist?.[cat] ?? 0 }));
  const happinessDistData = HAPPINESS_CATS.map((cat) => ({ name: cat, value: data?.happiness_dist?.[cat] ?? 0 }));
  const matrixMap = new Map<string, number>((data?.matrix ?? []).map((cell) => [`${cell.burnout}|${cell.happiness}`, cell.count]));

  return (
    <main className="min-h-screen bg-[#0b0d14] px-4 py-5 text-slate-100 sm:px-6 lg:px-7">
      <div className="mx-auto flex max-w-[1680px] flex-col gap-5">
        <header className="rounded-lg border border-white/10 bg-slate-950 p-5 shadow-xl shadow-black/20">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-md border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-xs font-semibold text-amber-100">
                <Heart className="h-3.5 w-3.5" />
                Happiness & Well-Being Analytics
              </div>
              <h1 className="text-2xl font-semibold tracking-normal text-white sm:text-3xl">Analitik Happiness Tingkat Prodi</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                Distribusi, trend, faktor, dan cross-analytics burnout vs Happiness Index mahasiswa pada scope program studi.
              </p>
            </div>
            <button
              onClick={fetchData}
              disabled={loading}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.07] disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block">
              <span className="text-xs font-semibold text-slate-400">Program Studi</span>
              <select value={prodi} onChange={(e) => setProdi(e.target.value)} className="mt-1 h-10 w-full rounded-md border border-white/10 bg-slate-900 px-3 text-sm text-white outline-none focus:border-cyan-300/50">
                <option value="">Semua Prodi</option>
                {(data?.prodi_options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-400">Angkatan</span>
              <input value={angkatan} onChange={(e) => setAngkatan(e.target.value)} placeholder="cth. 2023" className="mt-1 h-10 w-full rounded-md border border-white/10 bg-white/[0.04] px-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-300/50" />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-400">Semester</span>
              <input type="number" min={1} max={14} value={semester} onChange={(e) => setSemester(e.target.value)} placeholder="cth. 5" className="mt-1 h-10 w-full rounded-md border border-white/10 bg-white/[0.04] px-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-300/50" />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-400">Periode</span>
              <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="mt-1 h-10 w-full rounded-md border border-white/10 bg-slate-900 px-3 text-sm text-white outline-none focus:border-cyan-300/50">
                <option value={30}>30 hari terakhir</option>
                <option value={90}>90 hari terakhir</option>
                <option value={180}>180 hari terakhir</option>
                <option value={365}>1 tahun terakhir</option>
              </select>
            </label>
          </div>
        </header>

        {error && <div className="rounded-lg border border-rose-300/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</div>}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          {[
            { label: 'Total Mahasiswa', value: data?.overview.total_students ?? 0, icon: Activity, tone: 'text-cyan-100 bg-cyan-500/10' },
            { label: 'Avg Burnout', value: data ? data.overview.avg_burnout.toFixed(1) : '-', icon: Flame, tone: 'text-indigo-100 bg-indigo-500/10' },
            { label: 'Avg Happiness', value: data ? data.overview.avg_happiness.toFixed(0) : '-', icon: Smile, tone: 'text-amber-100 bg-amber-500/10' },
            { label: 'Burnout Tinggi', value: data?.overview.burnout_tinggi ?? 0, icon: Flame, tone: 'text-rose-100 bg-rose-500/10' },
            { label: 'Happiness Rendah', value: data?.overview.happiness_rendah ?? 0, icon: TrendingUp, tone: 'text-orange-100 bg-orange-500/10' },
            { label: 'Prioritas Monitoring', value: data?.overview.priority_monitoring ?? 0, icon: TrendingUp, tone: 'text-rose-100 bg-rose-500/10' },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="rounded-lg border border-white/10 bg-slate-950 p-4 shadow-xl shadow-black/10">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">{item.label}</p>
                    <p className="mt-2 text-2xl font-semibold text-white">{loading ? '-' : item.value}</p>
                  </div>
                  <span className={`flex h-10 w-10 items-center justify-center rounded-md ${item.tone}`}>
                    <Icon className="h-4.5 w-4.5" />
                  </span>
                </div>
              </div>
            );
          })}
        </section>

        <section className="grid gap-5 xl:grid-cols-2">
          <div className="rounded-lg border border-white/10 bg-slate-950 p-5 shadow-xl shadow-black/10">
            <h2 className="text-sm font-semibold text-white">Burnout Distribution</h2>
            <ChartShell height={240} className="mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={burnoutDistData} margin={{ top: 8, right: 8, bottom: 0, left: -22 }}>
                  <CartesianGrid stroke="#1e2130" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: '#8890a4', fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#1e2130' }} />
                  <YAxis allowDecimals={false} tick={{ fill: '#8890a4', fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#1e2130' }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="value" name="Mahasiswa" fill={BURNOUT_COLOR} radius={[6, 6, 0, 0]} barSize={44} />
                </BarChart>
              </ResponsiveContainer>
            </ChartShell>
          </div>

          <div className="rounded-lg border border-white/10 bg-slate-950 p-5 shadow-xl shadow-black/10">
            <h2 className="text-sm font-semibold text-white">Happiness Distribution</h2>
            <ChartShell height={240} className="mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={happinessDistData} margin={{ top: 8, right: 8, bottom: 0, left: -22 }}>
                  <CartesianGrid stroke="#1e2130" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: '#8890a4', fontSize: 9.5 }} tickLine={false} axisLine={{ stroke: '#1e2130' }} />
                  <YAxis allowDecimals={false} tick={{ fill: '#8890a4', fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#1e2130' }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="value" name="Mahasiswa" fill={HAPPINESS_COLOR} radius={[6, 6, 0, 0]} barSize={30} />
                </BarChart>
              </ResponsiveContainer>
            </ChartShell>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-2">
          <div className="rounded-lg border border-white/10 bg-slate-950 p-5 shadow-xl shadow-black/10">
            <h2 className="text-sm font-semibold text-white">Burnout Trend</h2>
            <ChartShell height={250} className="mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data?.trend ?? []} margin={{ top: 8, right: 8, bottom: 0, left: -22 }}>
                  <CartesianGrid stroke="#1e2130" strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fill: '#8890a4', fontSize: 10 }} tickLine={false} axisLine={{ stroke: '#1e2130' }} />
                  <YAxis domain={[0, 10]} tick={{ fill: '#8890a4', fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#1e2130' }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line type="monotone" dataKey="burnout" name="Avg Burnout" stroke={BURNOUT_COLOR} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </ChartShell>
          </div>

          <div className="rounded-lg border border-white/10 bg-slate-950 p-5 shadow-xl shadow-black/10">
            <h2 className="text-sm font-semibold text-white">Happiness Trend</h2>
            <ChartShell height={250} className="mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data?.trend ?? []} margin={{ top: 8, right: 8, bottom: 0, left: -22 }}>
                  <CartesianGrid stroke="#1e2130" strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fill: '#8890a4', fontSize: 10 }} tickLine={false} axisLine={{ stroke: '#1e2130' }} />
                  <YAxis domain={[0, 100]} tick={{ fill: '#8890a4', fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#1e2130' }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line type="monotone" dataKey="happiness" name="Avg Happiness" stroke={HAPPINESS_COLOR} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </ChartShell>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-2">
          <div className="rounded-lg border border-white/10 bg-slate-950 p-5 shadow-xl shadow-black/10">
            <h2 className="text-sm font-semibold text-white">Burnout by Semester</h2>
            <ChartShell height={240} className="mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={(data?.by_semester ?? []).filter((row) => row.burnout > 0)} margin={{ top: 8, right: 8, bottom: 0, left: -22 }}>
                  <CartesianGrid stroke="#1e2130" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="semester" tickFormatter={(v) => `Smt ${v}`} tick={{ fill: '#8890a4', fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#1e2130' }} />
                  <YAxis domain={[0, 10]} tick={{ fill: '#8890a4', fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#1e2130' }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="burnout" name="Avg Burnout" fill={BURNOUT_COLOR} radius={[6, 6, 0, 0]} barSize={30} />
                </BarChart>
              </ResponsiveContainer>
            </ChartShell>
          </div>

          <div className="rounded-lg border border-white/10 bg-slate-950 p-5 shadow-xl shadow-black/10">
            <h2 className="text-sm font-semibold text-white">Happiness by Semester</h2>
            <ChartShell height={240} className="mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={(data?.by_semester ?? []).filter((row) => row.happiness > 0)} margin={{ top: 8, right: 8, bottom: 0, left: -22 }}>
                  <CartesianGrid stroke="#1e2130" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="semester" tickFormatter={(v) => `Smt ${v}`} tick={{ fill: '#8890a4', fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#1e2130' }} />
                  <YAxis domain={[0, 100]} tick={{ fill: '#8890a4', fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#1e2130' }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="happiness" name="Avg Happiness" fill={HAPPINESS_COLOR} radius={[6, 6, 0, 0]} barSize={30} />
                </BarChart>
              </ResponsiveContainer>
            </ChartShell>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-2">
          <div className="rounded-lg border border-white/10 bg-slate-950 p-5 shadow-xl shadow-black/10">
            <h2 className="text-sm font-semibold text-white">Burnout Factors</h2>
            <p className="mt-1 text-xs text-slate-500">Rata-rata metrik assessment terakhir per mahasiswa (skala 0-10).</p>
            <ChartShell height={280} className="mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data?.burnout_factors ?? []} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 90 }}>
                  <CartesianGrid stroke="#1e2130" strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" domain={[0, 10]} tick={{ fill: '#8890a4', fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#1e2130' }} />
                  <YAxis type="category" dataKey="label" width={200} tick={{ fill: '#8890a4', fontSize: 9.5 }} tickLine={false} axisLine={{ stroke: '#1e2130' }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="score" name="Skor" fill={BURNOUT_COLOR} radius={[0, 6, 6, 0]} barSize={14} />
                </BarChart>
              </ResponsiveContainer>
            </ChartShell>
          </div>

          <div className="rounded-lg border border-white/10 bg-slate-950 p-5 shadow-xl shadow-black/10">
            <h2 className="text-sm font-semibold text-white">Happiness Factors</h2>
            <p className="mt-1 text-xs text-slate-500">Rata-rata dimensi assessment happiness terakhir per mahasiswa (skala 0-100).</p>
            <ChartShell height={280} className="mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data?.happiness_factors ?? []} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 90 }}>
                  <CartesianGrid stroke="#1e2130" strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} tick={{ fill: '#8890a4', fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#1e2130' }} />
                  <YAxis type="category" dataKey="label" width={200} tick={{ fill: '#8890a4', fontSize: 9.5 }} tickLine={false} axisLine={{ stroke: '#1e2130' }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="score" name="Skor" fill={HAPPINESS_COLOR} radius={[0, 6, 6, 0]} barSize={14} />
                </BarChart>
              </ResponsiveContainer>
            </ChartShell>
          </div>
        </section>

        <section className="rounded-lg border border-white/10 bg-slate-950 p-5 shadow-xl shadow-black/10">
          <h2 className="text-sm font-semibold text-white">Burnout vs Happiness — Matrix Mahasiswa</h2>
          <p className="mt-1 text-xs text-slate-500">Jumlah mahasiswa pada tiap kombinasi kategori (assessment terakhir).</p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-xs">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="px-3 py-2 font-semibold uppercase tracking-wider">Burnout \ Happiness</th>
                  {HAPPINESS_CATS.map((cat) => (
                    <th key={cat} className="px-3 py-2 text-center font-semibold uppercase tracking-wider">{cat}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {BURNOUT_CATS.map((b) => (
                  <tr key={b} className="border-t border-white/10">
                    <td className="px-3 py-2.5 font-semibold text-slate-300">{b}</td>
                    {HAPPINESS_CATS.map((h) => {
                      const count = matrixMap.get(`${b}|${h}`) ?? 0;
                      const intensity = data && data.overview.priority_monitoring + data.overview.total_students > 0 ? count / Math.max(1, data.overview.total_students) : 0;
                      return (
                        <td key={h} className="px-3 py-2.5 text-center" style={{ background: count > 0 ? `rgba(34,211,238,${0.05 + intensity * 0.35})` : 'transparent' }}>
                          <span className={count > 0 ? 'font-bold text-cyan-100' : 'text-slate-600'}>{count || '—'}</span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3 text-[11px] text-slate-500">
              <span>
                Mode model happiness: <span className="font-semibold text-slate-300">{data.model_status.mode}</span>
                {data.model_status.ready_for_ml ? ' (dataset siap untuk klasifikasi ML)' : ` (scoring-based; ML siap bila sampel ≥ ${data.model_status.min_samples})`}
              </span>
              <span>Bobot HI: Akademik {Math.round((data.weights.academic ?? 0) * 100)}% · Motivasi {Math.round((data.weights.motivation ?? 0) * 100)}% · Sosial {Math.round((data.weights.social ?? 0) * 100)}% · Lingkungan {Math.round((data.weights.environment ?? 0) * 100)}% · Dosen {Math.round((data.weights.lecturer ?? 0) * 100)}% · Fasilitas {Math.round((data.weights.facilities ?? 0) * 100)}%</span>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
