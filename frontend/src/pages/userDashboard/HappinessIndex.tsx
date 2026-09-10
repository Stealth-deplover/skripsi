import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Smile } from 'lucide-react';
import api from '../../api';
import { categoryMeta, formatDateTime, HAPPINESS_COLOR, type HappinessData } from './happinessShared';

export default function HappinessIndex() {
  const [happiness, setHappiness] = useState<HappinessData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get('/happiness')
      .then((res) => setHappiness(res.data.happiness ?? null))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-slate-400">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Memuat Happiness Index...
      </div>
    );
  }

  if (!happiness) {
    return (
      <div className="rounded-2xl border border-white/10 bg-slate-950 p-8 text-center shadow-xl shadow-black/10">
        <Smile className="mx-auto h-10 w-10 text-amber-300" />
        <h1 className="mt-4 text-lg font-semibold text-white">Belum ada Happiness Index</h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-400">
          Isi asesmen happiness terlebih dahulu untuk melihat indeks kebahagiaan, kategori, dan faktor yang memengaruhinya.
        </p>
        <Link
          to="/user/happiness/assessment"
          className="mt-5 inline-flex h-10 items-center rounded-lg bg-amber-300 px-4 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
        >
          Isi Assessment Happiness
        </Link>
      </div>
    );
  }

  const meta = categoryMeta(happiness.category);
  const index = Math.round(happiness.happiness_index);

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-2xl border border-white/10 bg-slate-950 p-6 shadow-xl shadow-black/10">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-6">
            <div
              className="relative grid h-36 w-36 place-items-center rounded-full"
              style={{ background: `conic-gradient(${meta.color} ${index * 3.6}deg, rgba(148,163,184,0.15) 0deg)` }}
            >
              <div className="grid h-28 w-28 place-items-center rounded-full bg-slate-950">
                <div className="text-center">
                  <p className="text-3xl font-bold text-white">{index}</p>
                  <p className="text-[10px] uppercase tracking-widest text-slate-500">dari 100</p>
                </div>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-200">Happiness Index</p>
              <span className={`mt-2 inline-flex rounded-full border px-3 py-1 text-sm font-semibold ${meta.chip}`}>
                {happiness.category}
              </span>
              <p className="mt-2 text-xs text-slate-500">Level: {happiness.level}</p>
              <p className="mt-1 text-xs text-slate-500">Terakhir diisi: {formatDateTime(happiness.timestamp)}</p>
            </div>
          </div>
          <div className="grid gap-2 text-xs text-slate-400">
            <p className="font-semibold text-slate-300">Kategori Happiness Index</p>
            {[
              ['0–39', 'Sangat Rendah'],
              ['40–59', 'Rendah'],
              ['60–74', 'Sedang'],
              ['75–89', 'Tinggi'],
              ['90–100', 'Sangat Tinggi'],
            ].map(([range, label]) => (
              <div key={label} className="flex items-center gap-2">
                <span className={`inline-flex w-28 rounded border px-2 py-0.5 ${categoryMeta(label).chip}`}>{label}</span>
                <span className="text-slate-500">{range}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-slate-950 p-5 shadow-xl shadow-black/10">
        <h2 className="text-sm font-semibold text-white">Skor Dimensi Kebahagiaan</h2>
        <p className="mt-1 text-xs text-slate-500">Skor 0-100 per dimensi; bobot menunjukkan kontribusi terhadap Happiness Index.</p>
        <div className="mt-4 space-y-3">
          {happiness.dimensions.map((dim) => (
            <div key={dim.key}>
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-200">
                  {dim.label}
                  {dim.weight !== undefined && <span className="ml-2 font-normal text-slate-500">bobot {Math.round((dim.weight || 0) * 100)}%</span>}
                </span>
                <span className="text-slate-300">{Math.round(dim.score)}</span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-800">
                <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, dim.score)}%`, background: meta.color }} />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
