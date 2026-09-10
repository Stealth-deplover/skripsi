import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Loader2, Smile, Sparkles } from 'lucide-react';
import api from '../../api';
import { categoryMeta, formatDateTime, HAPPINESS_COLOR, type HappinessDimension } from './happinessShared';

interface HappinessQuestion {
  id: string;
  text: string;
  dimension: string;
  dimension_label: string;
}

interface DimensionMeta {
  key: string;
  label: string;
  weight: number;
}

interface SubmitResult {
  happiness_index: number;
  category: string;
  level: string;
  dimensions: HappinessDimension[];
  factors: HappinessDimension[];
  warnings: { type: string; label: string; detail: string }[];
}

const LIKERT = ['Sangat Tidak Setuju', 'Tidak Setuju', 'Netral', 'Setuju', 'Sangat Setuju'];

export default function HappinessAssessment() {
  const navigate = useNavigate();
  const [questions, setQuestions] = useState<HappinessQuestion[]>([]);
  const [dimensions, setDimensions] = useState<DimensionMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [activeDim, setActiveDim] = useState(0);

  useEffect(() => {
    api
      .get('/happiness/questions')
      .then((res) => {
        setQuestions(res.data.questions ?? []);
        setDimensions(res.data.dimensions ?? []);
      })
      .catch(() => setError('Gagal memuat pertanyaan happiness. Pastikan backend berjalan.'))
      .finally(() => setLoading(false));
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, HappinessQuestion[]>();
    for (const question of questions) {
      const list = map.get(question.dimension) ?? [];
      list.push(question);
      map.set(question.dimension, list);
    }
    return dimensions.length
      ? dimensions.map((dim) => ({ key: dim.key, label: dim.label, weight: dim.weight, items: map.get(dim.key) ?? [] }))
      : Array.from(map.entries()).map(([key, items]) => ({ key, label: items[0]?.dimension_label ?? key, weight: 0, items }));
  }, [questions, dimensions]);

  const answeredCount = Object.keys(answers).length;
  const totalCount = questions.length;
  const allAnswered = totalCount > 0 && answeredCount === totalCount;

  const handleSubmit = async () => {
    if (!allAnswered) return;
    setSubmitting(true);
    setError('');
    try {
      const responses = Object.entries(answers).map(([id, value]) => ({ id, value }));
      const res = await api.post('/happiness/assessment/submit', { responses });
      setResult(res.data);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      setError(err.response?.data?.error || 'Gagal mengirim asesmen happiness');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-slate-400">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Menyiapkan pertanyaan happiness...
      </div>
    );
  }

  if (result) {
    const meta = categoryMeta(result.category);
    return (
      <div className="flex flex-col gap-5">
        <section className="rounded-2xl border border-white/10 bg-slate-950 p-6 shadow-xl shadow-black/10">
          <div className="flex flex-col items-center gap-4 text-center">
            <span className="grid h-16 w-16 place-items-center rounded-2xl bg-amber-400/10">
              <CheckCircle2 className="h-8 w-8 text-amber-300" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-200">Happiness Index Anda</p>
              <p className="mt-2 text-5xl font-bold text-white">{Math.round(result.happiness_index)}</p>
              <span className={`mt-3 inline-flex rounded-full border px-3 py-1 text-sm font-semibold ${meta.chip}`}>
                {result.category}
              </span>
              <p className="mt-2 text-xs text-slate-500">Level klasifikasi: {result.level} · {formatDateTime(new Date().toISOString())}</p>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {result.dimensions.map((dim) => (
              <div key={dim.key} className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-200">{dim.label}</span>
                  <span className="text-slate-400">{Math.round(dim.score)}</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, dim.score)}%`, background: HAPPINESS_COLOR }} />
                </div>
              </div>
            ))}
          </div>

          {result.warnings?.length > 0 && (
            <div className="mt-5 space-y-2">
              {result.warnings.map((warning) => (
                <div key={warning.type} className="rounded-xl border border-amber-300/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                  ⚠️ {warning.label} — {warning.detail}
                </div>
              ))}
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => navigate('/user/well-being')}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-amber-300 px-4 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
            >
              Lihat Burnout vs Happiness <ArrowRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => navigate('/user/happiness/index')}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.07]"
            >
              Happiness Index Saya
            </button>
            <button
              type="button"
              onClick={() => { setResult(null); setAnswers({}); setActiveDim(0); }}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.07]"
            >
              Isi ulang
            </button>
          </div>
        </section>
      </div>
    );
  }

  const currentGroup = grouped[activeDim];

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-2xl border border-white/10 bg-slate-950 p-5 shadow-xl shadow-black/10">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1 text-xs font-semibold text-amber-100">
          <Smile className="h-3.5 w-3.5" />
          Happiness Assessment
        </div>
        <h1 className="text-2xl font-semibold text-white">Asesmen Kebahagiaan Mahasiswa</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
          Jawab {totalCount} pernyataan menggunakan skala Likert 1-5. Tidak ada jawaban benar atau salah — pilih yang paling menggambarkan kondisi Anda belakangan ini.
        </p>
        <div className="mt-4 flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-amber-300 transition-all"
              style={{ width: `${totalCount ? (answeredCount / totalCount) * 100 : 0}%` }}
            />
          </div>
          <span className="text-xs font-semibold text-slate-300">{answeredCount}/{totalCount}</span>
        </div>
      </section>

      {error && (
        <div className="rounded-lg border border-rose-300/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</div>
      )}

      <section className="rounded-2xl border border-white/10 bg-slate-950 p-5 shadow-xl shadow-black/10">
        <div className="mb-4 flex flex-wrap gap-2">
          {grouped.map((group, index) => {
            const done = group.items.every((q) => answers[q.id] !== undefined);
            return (
              <button
                key={group.key}
                type="button"
                onClick={() => setActiveDim(index)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  index === activeDim
                    ? 'border-amber-300/50 bg-amber-300/15 text-amber-100'
                    : done
                      ? 'border-emerald-300/25 bg-emerald-500/10 text-emerald-100'
                      : 'border-white/10 bg-white/[0.04] text-slate-400'
                }`}
              >
                {group.label} {done && '✓'}
              </button>
            );
          })}
        </div>

        {currentGroup && (
          <>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">
                Dimensi {currentGroup.label}
                {currentGroup.weight > 0 && (
                  <span className="ml-2 text-xs font-normal text-slate-500">bobot {Math.round(currentGroup.weight * 100)}%</span>
                )}
              </h2>
              <Sparkles className="h-4 w-4 text-amber-300" />
            </div>
            <div className="space-y-3">
              {currentGroup.items.map((question) => (
                <div key={question.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-sm text-slate-200">{question.text}</p>
                  <div className="mt-3 grid grid-cols-5 gap-2">
                    {LIKERT.map((label, index) => {
                      const value = index + 1;
                      const selected = answers[question.id] === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setAnswers((prev) => ({ ...prev, [question.id]: value }))}
                          className={`rounded-lg border px-1 py-2 text-center transition ${
                            selected
                              ? 'border-amber-300/60 bg-amber-300/15 text-amber-100'
                              : 'border-white/10 bg-white/[0.02] text-slate-400 hover:border-amber-300/30 hover:text-amber-200'
                          }`}
                        >
                          <span className="block text-sm font-bold">{value}</span>
                          <span className="mt-0.5 block text-[9px] leading-tight">{label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 flex items-center justify-between gap-3">
              <button
                type="button"
                disabled={activeDim === 0}
                onClick={() => setActiveDim((prev) => Math.max(0, prev - 1))}
                className="inline-flex h-10 items-center rounded-lg border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.07] disabled:opacity-40"
              >
                Sebelumnya
              </button>
              {activeDim < grouped.length - 1 ? (
                <button
                  type="button"
                  onClick={() => setActiveDim((prev) => Math.min(grouped.length - 1, prev + 1))}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-amber-300 px-4 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
                >
                  Lanjut <ArrowRight className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!allAnswered || submitting}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-400 px-4 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Kirim asesmen
                </button>
              )}
            </div>
            {!allAnswered && activeDim === grouped.length - 1 && (
              <p className="mt-2 text-right text-xs text-slate-500">Jawab semua pertanyaan untuk mengirim asesmen.</p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
