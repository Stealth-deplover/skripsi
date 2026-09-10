import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Area, AreaChart, CartesianGrid, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Activity, Flame, Loader2, TrendingUp } from 'lucide-react';
import ChartShell from '../../components/ChartShell';
import api from '../../api';
import {
  burnoutCategoryMeta,
  BURNOUT_COLOR,
  categoryMeta,
  HAPPINESS_COLOR,
  interpretationMeta,
} from './happinessShared';

interface WellBeingResponse {
  status: string;
  message?: string;
  has_burnout: boolean;
  has_happiness: boolean;
  burnout?: { score: number; category: string; risk: string; timestamp: string };
  happiness?: { index: number; category: string; timestamp: string };
  matrix?: { burnout: string; happiness: string; label: string; priority: number };
  insight?: string;
  recommendation?: string;
  warnings: { type: string; label: string; detail: string }[];
  combined_trend: { date: string; burnout: number | null; happiness_index: number | null }[];
  privacy_note: string;
}

const MATRIX_LABELS = {
  burnout: ['Rendah', 'Sedang', 'Tinggi'],
  happiness: ['Sangat Rendah', 'Rendah', 'Sedang', 'Tinggi', 'Sangat Tinggi'],
};

export default function WellBeingComparison() {
  const [data, setData] = useState<WellBeingResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get('/well-being')
      .then((res) => setData(res.data))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-slate-400">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Memuat analitik well-being...
      </div>
    );
  }

  if (!data || data.status === 'empty') {
    return (
      <div className="rounded-2xl border border-white/10 bg-slate-950 p-8 text-center shadow-xl shadow-black/10">
        <TrendingUp className="mx-auto h-10 w-10 text-amber-300" />
        <h1 className="mt-4 text-lg font-semibold text-white">Belum ada data well-being</h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-400">
          {data?.message || 'Isi assessment burnout dan happiness terlebih dahulu untuk melihat perbandingan.'}
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <Link to="/user/kuisioner" className="inline-flex h-10 items-center rounded-lg bg-indigo-400 px-4 text-sm font-semibold text-slate-950 transition hover:bg-indigo-300">
            Assessment Burnout
          </Link>
          <Link to="/user/happiness/assessment" className="inline-flex h-10 items-center rounded-lg bg-amber-300 px-4 text-sm font-semibold text-slate-950 transition hover:bg-amber-200">
            Assessment Happiness
          </Link>
        </div>
      </div>
    );
  }

  const burnoutMeta = burnoutCategoryMeta(data.burnout?.category);
  const happinessMeta = categoryMeta(data.happiness?.category);
  const labelMeta = interpretationMeta(data.matrix?.label);

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-2xl border border-white/10 bg-slate-950 p-5 shadow-xl shadow-black/10">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-xs font-semibold text-cyan-100">
          <TrendingUp className="h-3.5 w-3.5" />
          Burnout vs Happiness
        </div>
        <h1 className="text-2xl font-semibold text-white">Analitik Well-Being Gabungan</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">{data.privacy_note}</p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className={`rounded-xl border p-5 ${burnoutMeta.chip}`}>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em]">
              <Flame className="h-4 w-4" /> Burnout
            </div>
            {data.burnout ? (
              <>
                <p className="mt-3 text-4xl font-bold">{data.burnout.score.toFixed(1)}<span className="ml-1 text-sm font-medium opacity-70">/10</span></p>
                <p className="mt-1 text-sm font-semibold">{data.burnout.category}</p>
              </>
            ) : (
              <p className="mt-3 text-sm">Belum ada data — <Link to="/user/kuisioner" className="underline">isi kuisioner burnout</Link></p>
            )}
          </div>
          <div className={`rounded-xl border p-5 ${happinessMeta.chip}`}>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em]">
              <Activity className="h-4 w-4" /> Happiness
            </div>
            {data.happiness ? (
              <>
                <p className="mt-3 text-4xl font-bold">{Math.round(data.happiness.index)}<span className="ml-1 text-sm font-medium opacity-70">/100</span></p>
                <p className="mt-1 text-sm font-semibold">{data.happiness.category}</p>
              </>
            ) : (
              <p className="mt-3 text-sm">Belum ada data — <Link to="/user/happiness/assessment" className="underline">isi assessment happiness</Link></p>
            )}
          </div>
        </div>

        {data.matrix && (
          <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Interpretasi</span>
              <span className={`inline-flex rounded-full border px-3 py-1 text-sm font-semibold ${labelMeta.chip}`}>{data.matrix.label}</span>
            </div>
            {data.insight && <p className="mt-3 text-sm leading-6 text-slate-300">{data.insight}</p>}
            {data.recommendation && (
              <div className="mt-3 rounded-lg border border-teal-300/20 bg-teal-300/10 px-4 py-3 text-sm leading-6 text-teal-100">
                <span className="font-semibold">Rekomendasi akademik: </span>
                {data.recommendation}
              </div>
            )}
          </div>
        )}

        {data.warnings?.length > 0 && (
          <div className="mt-4 space-y-2">
            {data.warnings.map((warning) => (
              <div key={warning.type} className="rounded-xl border border-amber-300/30 bg-amber-500/10 px-4 py-3 text-sm leading-6 text-amber-100">
                ⚠️ <span className="font-semibold">{warning.label}</span> — {warning.detail}
              </div>
            ))}
          </div>
        )}
      </section>

      {data.matrix && (
        <section className="rounded-2xl border border-white/10 bg-slate-950 p-5 shadow-xl shadow-black/10">
          <h2 className="text-sm font-semibold text-white">Matrix Interpretasi Burnout × Happiness</h2>
          <p className="mt-1 text-xs text-slate-500">Kombinasi kategori Anda ditandai pada matrix berikut.</p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-xs">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="px-3 py-2 font-semibold uppercase tracking-wider">Burnout \ Happiness</th>
                  {MATRIX_LABELS.happiness.map((h) => (
                    <th key={h} className="px-3 py-2 text-center font-semibold uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MATRIX_LABELS.burnout.map((b) => (
                  <tr key={b} className="border-t border-white/10">
                    <td className="px-3 py-2.5 font-semibold text-slate-300">{b}</td>
                    {MATRIX_LABELS.happiness.map((h) => {
                      const isCurrent = data.matrix?.burnout === b && data.matrix?.happiness === h;
                      return (
                        <td key={h} className={`px-3 py-2.5 text-center ${isCurrent ? 'bg-cyan-400/20 font-bold text-cyan-100 ring-1 ring-inset ring-cyan-300/40' : 'text-slate-500'}`}>
                          {isCurrent ? 'Posisi Anda' : '—'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {data.combined_trend.length > 0 && (
        <section className="rounded-2xl border border-white/10 bg-slate-950 p-5 shadow-xl shadow-black/10">
          <h2 className="text-sm font-semibold text-white">Trend Gabungan Burnout & Happiness</h2>
          <div className="mt-4">
            <ChartShell height={320}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.combined_trend} margin={{ top: 10, right: 10, bottom: 0, left: -18 }}>
                  <CartesianGrid stroke="#1e2130" strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fill: '#8890a4', fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#1e2130' }} />
                  <YAxis tick={{ fill: '#8890a4', fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#1e2130' }} />
                  <Tooltip contentStyle={{ background: '#1a1e2e', border: '1px solid #2a2e42', borderRadius: 8, fontSize: 11, color: '#e2e8f0' }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area type="monotone" dataKey="burnout" name="Burnout (0-10)" stroke={BURNOUT_COLOR} fill={BURNOUT_COLOR} fillOpacity={0.15} strokeWidth={2} connectNulls />
                  <Line type="monotone" dataKey="happiness_index" name="Happiness (0-100)" stroke={HAPPINESS_COLOR} strokeWidth={2} connectNulls dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </ChartShell>
            <p className="mt-2 text-center text-[10px] text-slate-500">
              Catatan: burnout berskala 0-10 dan happiness 0-100 — keduanya ditampilkan sebagai indikator terpisah.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
