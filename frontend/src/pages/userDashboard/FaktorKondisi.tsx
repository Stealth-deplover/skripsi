import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Flame, Loader2, Smile } from 'lucide-react';
import ChartShell from '../../components/ChartShell';
import api from '../../api';
import { BURNOUT_COLOR, HAPPINESS_COLOR, type HappinessData } from './happinessShared';

interface BurnoutAssessment {
  FatigueScore: number;
  CynicismScore: number;
  EfficacyScore: number;
  InterferenceScore: number;
  OrderEffectScore: number;
  CognitiveDissonanceScore: number;
  NLPStressScore: number;
}

export default function FaktorKondisi() {
  const [happiness, setHappiness] = useState<HappinessData | null>(null);
  const [assessment, setAssessment] = useState<BurnoutAssessment | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/happiness').catch(() => ({ data: { happiness: null } })),
      api.get('/user/history').catch(() => ({ data: { assessments: [] } })),
    ])
      .then(([happinessRes, historyRes]) => {
        setHappiness(happinessRes.data.happiness ?? null);
        const assessments: BurnoutAssessment[] = historyRes.data.assessments ?? [];
        setAssessment(assessments.length > 0 ? assessments[0] : null);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-slate-400">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Memuat faktor kondisi...
      </div>
    );
  }

  const tooltipStyle = { background: '#1a1e2e', border: '1px solid #2a2e42', borderRadius: 8, fontSize: 11, color: '#e2e8f0' };

  const happinessData = (happiness?.dimensions ?? []).map((dim) => ({ name: dim.label, score: Math.round(dim.score * 10) / 10 }));

  const burnoutData = assessment
    ? [
        { name: 'Academic Load (Fatigue)', score: Math.round(assessment.FatigueScore * 10) / 10 },
        { name: 'Study Pressure (Cynicism)', score: Math.round(assessment.CynicismScore * 10) / 10 },
        { name: 'Motivation (Efficacy)', score: Math.round(assessment.EfficacyScore * 10) / 10 },
        { name: 'Emotional Exhaustion', score: Math.round(assessment.InterferenceScore * 10) / 10 },
        { name: 'Order Effect', score: Math.round(assessment.OrderEffectScore * 10) / 10 },
        { name: 'Cognitive Dissonance', score: Math.round(assessment.CognitiveDissonanceScore * 10) / 10 },
        { name: 'NLP Stress (Curhat)', score: Math.round(assessment.NLPStressScore * 10) / 10 },
      ]
    : [];

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-2xl border border-white/10 bg-slate-950 p-5 shadow-xl shadow-black/10">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-xs font-semibold text-cyan-100">
          <Flame className="h-3.5 w-3.5" /> Faktor Kondisi
        </div>
        <h1 className="text-2xl font-semibold text-white">Analisis Faktor Burnout & Kebahagiaan</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
          Dua kelompok faktor ditampilkan berdampingan: faktor burnout (dari kuisioner burnout) dan faktor kebahagiaan (dari assessment happiness).
        </p>
      </section>

      <section className="rounded-2xl border border-white/10 bg-slate-950 p-5 shadow-xl shadow-black/10">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <Flame className="h-4 w-4" style={{ color: BURNOUT_COLOR }} />
          Faktor Burnout <span className="text-xs font-normal text-slate-500">(skala 0-10, dari assessment terakhir)</span>
        </div>
        {burnoutData.length > 0 ? (
          <div className="mt-4">
            <ChartShell height={300}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={burnoutData} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 80 }}>
                  <CartesianGrid stroke="#1e2130" strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" domain={[0, 10]} tick={{ fill: '#8890a4', fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#1e2130' }} />
                  <YAxis type="category" dataKey="name" width={190} tick={{ fill: '#8890a4', fontSize: 10 }} tickLine={false} axisLine={{ stroke: '#1e2130' }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="score" name="Skor" fill={BURNOUT_COLOR} radius={[0, 6, 6, 0]} barSize={16} />
                </BarChart>
              </ResponsiveContainer>
            </ChartShell>
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-slate-500">
            Belum ada assessment burnout. <span className="text-slate-400">Isi kuisioner burnout terlebih dahulu.</span>
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-white/10 bg-slate-950 p-5 shadow-xl shadow-black/10">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <Smile className="h-4 w-4" style={{ color: HAPPINESS_COLOR }} />
          Faktor Kebahagiaan <span className="text-xs font-normal text-slate-500">(skala 0-100, dari assessment happiness terakhir)</span>
        </div>
        {happinessData.length > 0 ? (
          <div className="mt-4">
            <ChartShell height={240}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={happinessData} margin={{ top: 4, right: 24, bottom: 4, left: -18 }}>
                  <CartesianGrid stroke="#1e2130" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: '#8890a4', fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#1e2130' }} />
                  <YAxis domain={[0, 100]} tick={{ fill: '#8890a4', fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#1e2130' }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="score" name="Skor dimensi" fill={HAPPINESS_COLOR} radius={[6, 6, 0, 0]} barSize={36} />
                </BarChart>
              </ResponsiveContainer>
            </ChartShell>
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-slate-500">
            Belum ada assessment happiness. <span className="text-slate-400">Isi assessment happiness terlebih dahulu.</span>
          </p>
        )}
      </section>
    </div>
  );
}
