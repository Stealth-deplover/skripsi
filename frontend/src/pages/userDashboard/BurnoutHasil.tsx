import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Flame, Loader2 } from 'lucide-react';
import ChartShell from '../../components/ChartShell';
import api from '../../api';
import { burnoutCategoryMeta, BURNOUT_COLOR, formatDateTime } from './happinessShared';

interface Prediction {
  ID: number;
  BurnoutScore: number;
  PsychosomaticScore: number;
  RiskLevel: string;
  Timestamp: string;
}

interface Assessment {
  ID: number;
  FatigueScore: number;
  CynicismScore: number;
  EfficacyScore: number;
  InterferenceScore: number;
  NLPStressScore: number;
  Timestamp: string;
}

export default function BurnoutHasil() {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get('/user/history')
      .then((res) => {
        setPredictions(res.data.predictions ?? []);
        setAssessments(res.data.assessments ?? []);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-slate-400">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Memuat hasil burnout...
      </div>
    );
  }

  const latest = predictions[0];
  const latestAssessment = assessments[0];

  if (!latest) {
    return (
      <div className="rounded-2xl border border-white/10 bg-slate-950 p-8 text-center shadow-xl shadow-black/10">
        <Flame className="mx-auto h-10 w-10 text-indigo-300" />
        <h1 className="mt-4 text-lg font-semibold text-white">Belum ada hasil burnout</h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-400">
          Isi kuisioner burnout terlebih dahulu untuk melihat skor, kategori, dan faktor burnout Anda.
        </p>
        <Link
          to="/user/kuisioner"
          className="mt-5 inline-flex h-10 items-center rounded-lg bg-indigo-400 px-4 text-sm font-semibold text-slate-950 transition hover:bg-indigo-300"
        >
          Isi Kuisioner Burnout
        </Link>
      </div>
    );
  }

  const catByScore = (score: number) => (score <= 4 ? 'Rendah' : score <= 6 ? 'Sedang' : 'Tinggi');
  const category = catByScore(latest.BurnoutScore);
  const meta = burnoutCategoryMeta(category);

  const trend = [...predictions]
    .slice(0, 20)
    .reverse()
    .map((p) => ({
      date: new Date(p.Timestamp).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }),
      burnout: Math.round(p.BurnoutScore * 10) / 10,
      psychosomatic: Math.round(p.PsychosomaticScore * 10) / 10,
    }));

  const factors = latestAssessment
    ? [
        { name: 'Academic Load (Fatigue)', value: Math.round(latestAssessment.FatigueScore * 10) / 10 },
        { name: 'Study Pressure (Cynicism)', value: Math.round(latestAssessment.CynicismScore * 10) / 10 },
        { name: 'Motivation (Efficacy)', value: Math.round(latestAssessment.EfficacyScore * 10) / 10 },
        { name: 'Emotional Exhaustion', value: Math.round(latestAssessment.InterferenceScore * 10) / 10 },
        { name: 'NLP Stress (Curhat)', value: Math.round(latestAssessment.NLPStressScore * 10) / 10 },
      ]
    : [];

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-2xl border border-white/10 bg-slate-950 p-6 shadow-xl shadow-black/10">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: meta.color }}>
              <Flame className="h-4 w-4" /> Hasil Burnout Terakhir
            </div>
            <p className="mt-3 text-5xl font-bold text-white">
              {latest.BurnoutScore.toFixed(1)}
              <span className="ml-2 text-base font-medium text-slate-500">/10</span>
            </p>
            <span className={`mt-3 inline-flex rounded-full border px-3 py-1 text-sm font-semibold ${meta.chip}`}>
              {category}
            </span>
            <p className="mt-2 text-xs text-slate-500">
              Risiko model: {latest.RiskLevel} · Psikosomatik: {latest.PsychosomaticScore.toFixed(1)}/10 · {formatDateTime(latest.Timestamp)}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            {factors.slice(0, 3).map((factor) => (
              <div key={factor.name} className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-3">
                <p className="text-lg font-bold text-white">{factor.value}</p>
                <p className="mt-1 leading-tight text-slate-500">{factor.name}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-slate-950 p-5 shadow-xl shadow-black/10">
        <h2 className="text-sm font-semibold text-white">Trend Burnout & Psikosomatik</h2>
        <div className="mt-4">
          <ChartShell height={300}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend} margin={{ top: 10, right: 10, bottom: 0, left: -18 }}>
                <defs>
                  <linearGradient id="burnoutGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={BURNOUT_COLOR} stopOpacity={0.45} />
                    <stop offset="100%" stopColor={BURNOUT_COLOR} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#1e2130" strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fill: '#8890a4', fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#1e2130' }} />
                <YAxis domain={[0, 10]} tick={{ fill: '#8890a4', fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#1e2130' }} />
                <Tooltip contentStyle={{ background: '#1a1e2e', border: '1px solid #2a2e42', borderRadius: 8, fontSize: 11, color: '#e2e8f0' }} />
                <Area type="monotone" dataKey="burnout" name="Burnout" stroke={BURNOUT_COLOR} strokeWidth={2} fill="url(#burnoutGradient)" />
                <Area type="monotone" dataKey="psychosomatic" name="Psikosomatik" stroke="#34d399" strokeWidth={2} fill="transparent" />
              </AreaChart>
            </ResponsiveContainer>
          </ChartShell>
        </div>
      </section>

      {factors.length > 0 && (
        <section className="rounded-2xl border border-white/10 bg-slate-950 p-5 shadow-xl shadow-black/10">
          <h2 className="text-sm font-semibold text-white">Faktor Burnout (Assessment Terakhir)</h2>
          <div className="mt-4 space-y-3">
            {factors.map((factor) => (
              <div key={factor.name}>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-200">{factor.name}</span>
                  <span className="text-slate-300">{factor.value}</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-800">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, (factor.value / 10) * 100)}%`, background: BURNOUT_COLOR }} />
                </div>
              </div>
            ))}
          </div>
          <Link to="/user/asesmen" className="mt-4 inline-flex text-xs font-semibold text-cyan-200 hover:text-cyan-100">
            Lihat riwayat lengkap →
          </Link>
        </section>
      )}
    </div>
  );
}
