import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, ArrowRight, Flame, Smile } from 'lucide-react';
import api from '../../api';
import { burnoutCategoryMeta, categoryMeta, HAPPINESS_COLOR } from './happinessShared';

interface WellBeingResponse {
  status: string;
  burnout?: { score: number; category: string };
  happiness?: { index: number; category: string };
  matrix?: { label: string };
  combined_trend: { date: string; happiness_index: number | null }[];
}

export default function WellBeingSummaryCards() {
  const [data, setData] = useState<WellBeingResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get('/well-being')
      .then((res) => setData(res.data))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  const burnoutMeta = burnoutCategoryMeta(data?.burnout?.category);
  const happinessMeta = categoryMeta(data?.happiness?.category);
  const happinessTrend = (data?.combined_trend ?? [])
    .filter((point) => point.happiness_index !== null)
    .map((point) => ({ date: point.date, index: point.happiness_index as number }));

  return (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-5 shadow-xl shadow-black/10">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-indigo-200">Burnout Score</p>
            {loading ? (
              <div className="mt-3 h-10 w-24 animate-pulse rounded-lg bg-slate-700/40" />
            ) : data?.burnout ? (
              <>
                <p className="mt-2 text-4xl font-bold text-white">
                  {data.burnout.score.toFixed(1)}
                  <span className="ml-1.5 text-sm font-medium text-slate-500">/10</span>
                </p>
                <span className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${burnoutMeta.chip}`}>
                  {data.burnout.category}
                </span>
              </>
            ) : (
              <>
                <p className="mt-2 text-2xl font-bold text-slate-500">-</p>
                <Link to="/user/kuisioner" className="mt-2 inline-flex text-xs font-semibold text-indigo-200 hover:text-indigo-100">
                  Isi kuisioner burnout →
                </Link>
              </>
            )}
          </div>
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-400/10 text-indigo-200">
            <Flame className="h-5 w-5" />
          </span>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-5 shadow-xl shadow-black/10">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-amber-200">Happiness Index</p>
            {loading ? (
              <div className="mt-3 h-10 w-24 animate-pulse rounded-lg bg-slate-700/40" />
            ) : data?.happiness ? (
              <>
                <p className="mt-2 text-4xl font-bold text-white">
                  {Math.round(data.happiness.index)}
                  <span className="ml-1.5 text-sm font-medium text-slate-500">/100</span>
                </p>
                <span className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${happinessMeta.chip}`}>
                  {data.happiness.category}
                </span>
              </>
            ) : (
              <>
                <p className="mt-2 text-2xl font-bold text-slate-500">-</p>
                <Link to="/user/happiness/assessment" className="mt-2 inline-flex text-xs font-semibold text-amber-200 hover:text-amber-100">
                  Isi assessment happiness →
                </Link>
              </>
            )}
          </div>
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-amber-400/10 text-amber-200">
            <Smile className="h-5 w-5" />
          </span>
        </div>
        {happinessTrend.length > 1 && (
          <div className="mt-3 flex items-end gap-1" aria-hidden>
            {happinessTrend.slice(-14).map((point, i) => {
              const max = Math.max(...happinessTrend.map((p) => p.index), 100);
              return (
                <div
                  key={`${point.date}-${i}`}
                  className="flex-1 rounded-t"
                  style={{ height: `${Math.max(4, (point.index / max) * 36)}px`, background: HAPPINESS_COLOR, opacity: 0.35 + (i / happinessTrend.length) * 0.65 }}
                />
              );
            })}
          </div>
        )}
      </div>

      {data?.matrix && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 shadow-xl shadow-black/10 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <Activity className="h-4 w-4 text-cyan-200" />
              Status well-being gabungan:
              <span className="font-semibold text-white">{data.matrix.label}</span>
            </div>
            <Link
              to="/user/well-being"
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-cyan-300/40 hover:text-cyan-100"
            >
              Lihat Burnout vs Happiness <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}
