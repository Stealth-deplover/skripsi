import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  Bell,
  CheckCircle2,
  Clock3,
  Database,
  FileText,
  GraduationCap,
  Loader2,
  MessageSquareText,
  RefreshCcw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
  type LucideIcon,
} from 'lucide-react';
import api from '../api';

interface CommandCase {
  id: string;
  user_id: number;
  user_name: string;
  username: string;
  signal: string;
  severity: string;
  score: number;
  summary: string;
  action: string;
  source_type: string;
  created_at: string;
  sla: string;
}

interface RecommendedMove {
  title: string;
  body: string;
  path: string;
  priority: string;
}

interface ActivityItem {
  id: number;
  username: string;
  role: string;
  action: string;
  method: string;
  path: string;
  status_code: number;
  created_at: string;
}

interface LatestUser {
  id: number;
  nama: string;
  username: string;
  role: string;
  created_at: string;
}

interface CommandCenterData {
  generated_at: string;
  headline: {
    risk_load: number;
    urgent: number;
    high: number;
    pending_treatments: number;
    unread_replies: number;
    unread_notifications: number;
    crisis_curhats: number;
  };
  cohorts: {
    total_users: number;
    admins: number;
    mahasiswa: number;
  };
  throughput: {
    assessments_7d: number;
    predictions_7d: number;
    checkins_24h: number;
    activity_24h: number;
  };
  case_queue: CommandCase[];
  recommended_moves: RecommendedMove[];
  recent_activity: ActivityItem[];
  latest_users: LatestUser[];
  readiness: Record<string, string>;
}

interface LaunchCheck {
  label: string;
  status: 'pass' | 'warning' | 'blocked';
  detail: string;
  path: string;
  severity: string;
}

interface LaunchReadiness {
  score: number;
  status: string;
  pass: number;
  warning: number;
  blocked: number;
  checks: LaunchCheck[];
  next_moves: RecommendedMove[];
  operational_metrics: Record<string, number>;
}

interface DpaReview {
  stars: number;
  comment: string;
  created_at: string;
  label: string;
}

interface DpaRatingRow {
  dpa_id: number;
  nama: string;
  username: string;
  advisees: number;
  rated_by: number;
  average_stars: number;
  response_rate: number;
  distribution: Record<string, number>;
  recommendation: { label: string; detail: string; priority: string; tone: string };
  recent_reviews: DpaReview[];
  follow_up: { id: number; note: string; status: string; updated_at: string } | null;
}

interface DpaRatingsData {
  ratings: DpaRatingRow[];
  total_ratings: number;
  semester_trend: { semester: string; average_stars: number; count: number }[];
  summary: { total_dpa: number; total_advisees: number; total_rated: number; overall_avg: number };
  privacy_note: string;
}

interface HeatmapRow {
  prodi: string;
  angkatan: string;
  mahasiswa_count: number;
  avg_happiness: number;
  avg_burnout: number;
  high_risk_count: number;
}

interface HeatmapData {
  heatmap: HeatmapRow[];
  prodi_list: string[];
  angkatan_list: string[];
  total_cohorts: number;
}

const severityTone: Record<string, string> = {
  urgent: 'border-rose-400/30 bg-rose-500/10 text-rose-100',
  high: 'border-orange-400/30 bg-orange-500/10 text-orange-100',
  medium: 'border-amber-400/30 bg-amber-500/10 text-amber-100',
  low: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100',
};

const priorityTone: Record<string, string> = {
  urgent: 'border-rose-400/30 bg-rose-500/10 text-rose-100',
  high: 'border-orange-400/30 bg-orange-500/10 text-orange-100',
  medium: 'border-cyan-400/30 bg-cyan-500/10 text-cyan-100',
  low: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100',
};

const readinessTone: Record<string, string> = {
  pass: 'border-emerald-400/25 bg-emerald-500/10 text-emerald-100',
  warning: 'border-amber-400/25 bg-amber-500/10 text-amber-100',
  blocked: 'border-rose-400/25 bg-rose-500/10 text-rose-100',
};

const formatDate = (value?: string) => {
  if (!value || value.startsWith('0001')) return '-';
  return new Date(value).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const pct = (value: number) => `${Math.round(Math.max(0, Math.min(value || 0, 1)) * 100)}%`;

export default function CommandCenter() {
  const [data, setData] = useState<CommandCenterData | null>(null);
  const [launch, setLaunch] = useState<LaunchReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dpaRatings, setDpaRatings] = useState<DpaRatingsData | null>(null);
  const [dpaLoading, setDpaLoading] = useState(true);
  const [dpaError, setDpaError] = useState('');
  const [followDraft, setFollowDraft] = useState<Record<number, string>>({});
  const [followStatus, setFollowStatus] = useState<Record<number, string>>({});
  const [followSaving, setFollowSaving] = useState<number | null>(null);
  const [expandedDpa, setExpandedDpa] = useState<Record<number, boolean>>({});
  const [heatmap, setHeatmap] = useState<HeatmapData | null>(null);
  const [heatmapLoading, setHeatmapLoading] = useState(true);
  const [heatmapError, setHeatmapError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [commandRes, launchRes] = await Promise.all([
        api.get('/admin/command-center'),
        api.get('/admin/launch-readiness'),
      ]);
      setData(commandRes.data);
      setLaunch(launchRes.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Command Center gagal dimuat.');
    } finally {
      setLoading(false);
    }
  };

  const loadDpaRatings = async () => {
    setDpaLoading(true);
    setDpaError('');
    try {
      const res = await api.get('/superadmin/dpa-ratings');
      setDpaRatings(res.data);
      const drafts: Record<number, string> = {};
      const statuses: Record<number, string> = {};
      (res.data.ratings || []).forEach((r: DpaRatingRow) => {
        drafts[r.dpa_id] = r.follow_up?.note || '';
        statuses[r.dpa_id] = r.follow_up?.status || 'diproses';
      });
      setFollowDraft((prev) => ({ ...drafts, ...prev }));
      setFollowStatus((prev) => ({ ...statuses, ...prev }));
    } catch (err: any) {
      setDpaError(err.response?.data?.error || 'Gagal memuat penilaian DPA.');
    } finally {
      setDpaLoading(false);
    }
  };

  const saveFollowUp = async (dpaId: number) => {
    const note = (followDraft[dpaId] || '').trim();
    if (!note) return;
    setFollowSaving(dpaId);
    try {
      await api.post(`/superadmin/dpa-ratings/${dpaId}/followup`, { note, status: followStatus[dpaId] || 'diproses' });
      await loadDpaRatings();
    } catch (err: any) {
      setDpaError(err.response?.data?.error || 'Gagal menyimpan tindak lanjut.');
    } finally {
      setFollowSaving(null);
    }
  };

  const loadHeatmap = async () => {
    setHeatmapLoading(true);
    setHeatmapError('');
    try {
      const res = await api.get('/superadmin/analytics/heatmap');
      setHeatmap(res.data);
    } catch (err: any) {
      setHeatmapError(err.response?.data?.error || 'Gagal memuat heatmap.');
    } finally {
      setHeatmapLoading(false);
    }
  };

  useEffect(() => {
    load();
    loadDpaRatings();
    loadHeatmap();
  }, []);

  const riskPressure = useMemo(() => {
    if (!data) return 0;
    const total = Math.max(data.headline.risk_load, 1);
    return Math.min(1, (data.headline.urgent * 1 + data.headline.high * 0.7) / total);
  }, [data]);

  if (loading && !data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0b0d14] text-slate-400">
        <Loader2 className="h-8 w-8 animate-spin" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0b0d14] px-5 py-6 text-slate-100 md:px-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
          <div className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:p-7">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-400/25 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-200">
                <ShieldCheck className="h-3.5 w-3.5" />
                Admin Command Center
              </div>
              <h1 className="max-w-3xl text-2xl font-semibold tracking-normal text-white sm:text-3xl">
                Satu layar untuk membaca risiko, tindakan, dan kesiapan sistem.
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
                Pusat operasi ini menggabungkan Risk Center, balasan terapi, audit log, readiness, cohort user, dan rekomendasi tindakan agar admin bisa bergerak lebih cepat.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Link to="/risk-center" className="inline-flex h-10 items-center gap-2 rounded-lg bg-cyan-400 px-4 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300">
                  Buka Risk Center
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link to="/laporan" className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-700 px-4 text-sm font-semibold text-slate-300 transition hover:border-cyan-400/40 hover:text-cyan-200">
                  Export laporan
                  <FileText className="h-4 w-4" />
                </Link>
                <button onClick={load} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-700 px-4 text-sm font-semibold text-slate-300 transition hover:border-cyan-400/40 hover:text-cyan-200">
                  <RefreshCcw className="h-4 w-4" />
                  Muat ulang
                </button>
              </div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm font-semibold text-white">Risk pressure</p>
                <span className="rounded-full border border-cyan-400/25 bg-cyan-500/10 px-2.5 py-1 text-xs font-semibold text-cyan-200">{pct(riskPressure)}</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-800">
                <div className="h-full rounded-full bg-cyan-400 transition-all" style={{ width: pct(riskPressure) }} />
              </div>
              <div className="mt-5 grid grid-cols-3 gap-3 text-center">
                <MiniMetric label="Urgent" value={data?.headline.urgent ?? 0} tone="text-rose-200" />
                <MiniMetric label="High" value={data?.headline.high ?? 0} tone="text-orange-200" />
                <MiniMetric label="Queue" value={data?.headline.risk_load ?? 0} tone="text-cyan-200" />
              </div>
              <p className="mt-4 text-xs leading-5 text-slate-500">Terakhir disusun: {formatDate(data?.generated_at)}</p>
            </div>
          </div>
        </header>

        {error && <div className="rounded-lg border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-200">{error}</div>}

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={ShieldAlert} label="Risk load" value={data?.headline.risk_load ?? 0} detail={`${data?.headline.crisis_curhats ?? 0} curhat krisis`} tone="text-cyan-200" />
          <StatCard icon={Bell} label="Balasan & notifikasi" value={(data?.headline.unread_replies ?? 0) + (data?.headline.unread_notifications ?? 0)} detail="Butuh dibaca admin" tone="text-amber-200" />
          <StatCard icon={Users} label="Total pengguna" value={data?.cohorts.total_users ?? 0} detail={`${data?.cohorts.mahasiswa ?? 0} mahasiswa`} tone="text-emerald-200" />
          <StatCard icon={Activity} label="Aktivitas 24 jam" value={data?.throughput.activity_24h ?? 0} detail={`${data?.throughput.checkins_24h ?? 0} check-in hari ini`} tone="text-violet-200" />
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-100">
                <ShieldCheck className="h-3.5 w-3.5" />
                Launch readiness
              </div>
              <h2 className="text-base font-semibold text-white">{launch?.status || 'Memuat kesiapan sistem'}</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
                Checklist ini membaca API, database, admin, audit log, AI, validasi model, monitoring risiko, follow-up, dan laporan.
              </p>
            </div>
            <div className="min-w-[180px] rounded-xl border border-slate-800 bg-slate-950/70 p-4">
              <div className="flex items-end justify-between gap-3">
                <span className="text-xs font-semibold uppercase text-slate-500">Skor siap</span>
                <span className="text-2xl font-semibold text-white">{launch?.score ?? 0}%</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
                <div className="h-full rounded-full bg-emerald-300 transition-all" style={{ width: `${launch?.score ?? 0}%` }} />
              </div>
              <div className="mt-3 flex justify-between text-[11px] text-slate-500">
                <span>{launch?.pass ?? 0} pass</span>
                <span>{launch?.warning ?? 0} warning</span>
                <span>{launch?.blocked ?? 0} blocked</span>
              </div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {(launch?.checks || []).slice(0, 9).map((check) => (
              <Link
                key={check.label}
                to={check.path}
                className={`rounded-xl border p-4 transition hover:bg-white/[0.04] ${readinessTone[check.status] || readinessTone.warning}`}
              >
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-white">{check.label}</span>
                  <span className="rounded-full border border-white/10 bg-black/10 px-2 py-0.5 text-[10px] font-semibold uppercase">{check.status}</span>
                </div>
                <p className="text-xs leading-5 text-slate-300">{check.detail}</p>
              </Link>
            ))}
          </div>
        </section>

        {/* Penilaian DPA ala Gojek — tempel di Command Center */}
        <section className="rounded-xl border border-amber-400/20 bg-slate-900/70 p-5">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-amber-400/25 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-100">
                <Star className="h-3.5 w-3.5 fill-amber-300 text-amber-300" />
                Penilaian DPA — gaya Gojek
              </div>
              <h2 className="text-base font-semibold text-white">Rating mahasiswa untuk DPA pembimbing</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
                Rekap anonim: rata-rata bintang, distribusi 5–1, ulasan tanpa identitas, + rekomendasi otomatis & tindak lanjut manual Kaprodi.
              </p>
              {dpaRatings?.privacy_note && <p className="mt-2 text-[11px] text-slate-500">{dpaRatings.privacy_note}</p>}
            </div>
            <div className="flex gap-2">
              <button onClick={loadDpaRatings} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-700 px-3 text-xs font-semibold text-slate-300 hover:border-amber-400/30 hover:text-amber-200">
                <RefreshCcw className="h-3.5 w-3.5" /> Muat ulang
              </button>
            </div>
          </div>

          {dpaError && <div className="mb-4 rounded-lg border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-200">{dpaError}</div>}

          <div className="mb-4 grid gap-3 md:grid-cols-4">
            <MiniBlock label="Total DPA" value={dpaRatings?.summary.total_dpa ?? 0} />
            <MiniBlock label="Total ulasan" value={dpaRatings?.total_ratings ?? 0} />
            <MiniBlock label="Mahasiswa bimbingan" value={dpaRatings?.summary.total_advisees ?? 0} />
            <div className="rounded-lg border border-amber-400/20 bg-slate-950/70 p-3">
              <p className="text-xs text-slate-500">Rata-rata prodi</p>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-xl font-semibold text-amber-200">{(dpaRatings?.summary.overall_avg ?? 0).toFixed(2)}</span>
                <span className="inline-flex items-center gap-1 text-amber-300">
                  <Star className="h-4 w-4 fill-amber-300 text-amber-300" /> /5
                </span>
              </div>
            </div>
          </div>

          {dpaLoading ? (
            <div className="flex h-24 items-center justify-center text-sm text-slate-400">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Memuat penilaian DPA...
            </div>
          ) : (dpaRatings?.ratings?.length ?? 0) === 0 ? (
            <EmptyState title="Belum ada DPA" body="Tambahkan akun DPA terlebih dahulu." />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {(dpaRatings?.ratings || []).map((row) => {
                const isExpanded = expandedDpa[row.dpa_id];
                const maxDist = Math.max(1, ...[1, 2, 3, 4, 5].map((s) => row.distribution[String(s)] || 0));
                const tone = row.recommendation?.tone || 'slate';
                const toneClass =
                  tone === 'emerald' ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-100' :
                  tone === 'amber' ? 'border-amber-400/25 bg-amber-500/10 text-amber-100' :
                  tone === 'rose' ? 'border-rose-400/25 bg-rose-500/10 text-rose-100' :
                  'border-slate-700 bg-slate-800/50 text-slate-300';
                return (
                  <div key={row.dpa_id} className="flex flex-col rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                    <div className="flex items-start gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-sm font-bold text-white">
                        {row.nama ? row.nama.split(' ').slice(0,2).map(s=>s[0]).join('').toUpperCase() : '?'}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-white">{row.nama}</p>
                        <p className="truncate text-xs text-slate-500">@{row.username}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                          <span className="inline-flex items-center gap-1 text-amber-200">
                            <Star className="h-3.5 w-3.5 fill-amber-300 text-amber-300" /> {row.average_stars ? row.average_stars.toFixed(2) : '-'} /5
                          </span>
                          <span className="text-slate-500">{row.rated_by}/{row.advisees} menilai</span>
                          {row.advisees > 0 && <span className="text-slate-500">{Math.round(row.response_rate * 100)}% respon</span>}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 space-y-1">
                      {[5, 4, 3, 2, 1].map((star) => {
                        const cnt = row.distribution[String(star)] || 0;
                        const pct = Math.round((cnt / maxDist) * 100);
                        return (
                          <div key={star} className="flex items-center gap-2 text-xs">
                            <span className="w-6 text-slate-400">{star}★</span>
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
                              <div className="h-full rounded-full bg-amber-400 transition-all" style={{ width: `${cnt ? Math.max(8, pct) : 0}%` }} />
                            </div>
                            <span className="w-6 text-right text-slate-500">{cnt}</span>
                          </div>
                        );
                      })}
                    </div>

                    <div className={`mt-3 rounded-lg border px-3 py-2 ${toneClass}`}>
                      <p className="text-xs font-semibold">{row.recommendation?.label}</p>
                      <p className="mt-1 text-xs leading-5 opacity-80">{row.recommendation?.detail}</p>
                    </div>

                    <button
                      onClick={() => setExpandedDpa((prev) => ({ ...prev, [row.dpa_id]: !prev[row.dpa_id] }))}
                      className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-amber-200 hover:text-amber-100"
                    >
                      <MessageSquareText className="h-3.5 w-3.5" /> {isExpanded ? 'Sembunyikan ulasan' : `Lihat ulasan (${row.recent_reviews?.length || 0})`}
                    </button>

                    {isExpanded && (
                      <div className="mt-2 space-y-2">
                        {(row.recent_reviews || []).length === 0 ? (
                          <p className="text-xs text-slate-500">Belum ada ulasan.</p>
                        ) : (
                          row.recent_reviews.map((rv, idx) => (
                            <div key={idx} className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-semibold text-amber-200">{rv.label}</span>
                                <span className="inline-flex items-center gap-1 text-xs text-amber-300">
                                  <Star className="h-3 w-3 fill-amber-300 text-amber-300" /> {rv.stars}
                                </span>
                              </div>
                              {rv.comment ? (
                                <p className="mt-1 text-xs leading-5 text-slate-300">“{rv.comment}”</p>
                              ) : (
                                <p className="mt-1 text-xs italic text-slate-500">Tanpa komentar</p>
                              )}
                              <p className="mt-1 text-[10px] text-slate-600">{formatDate(rv.created_at)}</p>
                            </div>
                          ))
                        )}
                      </div>
                    )}

                    <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                      <p className="text-xs font-semibold text-white">Tindak lanjut Kaprodi</p>
                      {row.follow_up && (
                        <div className="mt-2 rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2">
                          <p className="text-xs text-slate-300">{row.follow_up.note}</p>
                          <p className="mt-1 text-[10px] text-slate-500">{row.follow_up.status} • {formatDate(row.follow_up.updated_at)}</p>
                        </div>
                      )}
                      <textarea
                        value={followDraft[row.dpa_id] || ''}
                        onChange={(e) => setFollowDraft((prev) => ({ ...prev, [row.dpa_id]: e.target.value }))}
                        placeholder="Tulis tindak lanjut: jadwal pembinaan, monitoring, apresiasi..."
                        rows={2}
                        maxLength={2000}
                        className="mt-2 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-amber-400/30 focus:outline-none"
                      />
                      <div className="mt-2 flex items-center gap-2">
                        <select
                          value={followStatus[row.dpa_id] || 'diproses'}
                          onChange={(e) => setFollowStatus((prev) => ({ ...prev, [row.dpa_id]: e.target.value }))}
                          className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200"
                        >
                          <option value="diproses">diproses</option>
                          <option value="selesai">selesai</option>
                          <option value="ditunda">ditunda</option>
                        </select>
                        <button
                          onClick={() => saveFollowUp(row.dpa_id)}
                          disabled={followSaving === row.dpa_id || !(followDraft[row.dpa_id] || '').trim()}
                          className="inline-flex items-center gap-1 rounded-md bg-amber-400 px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg-amber-300 disabled:opacity-50"
                        >
                          {followSaving === row.dpa_id ? <Loader2 className="h-3 w-3 animate-spin" /> : <GraduationCap className="h-3 w-3" />}
                          Simpan
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Tren Semester + Heatmap Prodi/Angkatan */}
        <section className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-xl border border-violet-400/20 bg-slate-900/70 p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-white">Tren rating per semester</h3>
              <span className="rounded-full border border-violet-400/20 bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold text-violet-200">{dpaRatings?.semester_trend?.length || 0} semester</span>
            </div>
            {dpaLoading ? (
              <div className="flex h-20 items-center justify-center text-xs text-slate-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Memuat tren...</div>
            ) : (dpaRatings?.semester_trend?.length ?? 0) === 0 ? (
              <p className="text-xs text-slate-500">Belum ada data semester. Rating baru akan masuk ke {new Date().getMonth() >= 7 ? 'Ganjil' : 'Genap'} {new Date().getMonth() >= 7 ? `${new Date().getFullYear()}/${new Date().getFullYear()+1}` : `${new Date().getFullYear()-1}/${new Date().getFullYear()}`}.</p>
            ) : (
              <div className="space-y-2">
                {(dpaRatings?.semester_trend || []).map((t) => {
                  const w = Math.round((t.average_stars / 5) * 100);
                  return (
                    <div key={t.semester} className="flex items-center gap-3">
                      <span className="w-32 truncate text-xs text-slate-400">{t.semester}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
                        <div className="h-full rounded-full bg-violet-400" style={{ width: `${w}%` }} />
                      </div>
                      <span className="w-12 text-right text-xs font-semibold text-violet-200">{t.average_stars.toFixed(2)}</span>
                      <span className="w-10 text-right text-xs text-slate-500">({t.count})</span>
                    </div>
                  );
                })}
              </div>
            )}
            <p className="mt-3 text-[11px] text-slate-500">Sumber: DpaRating.semester (otomatis saat penilaian). Gunakan untuk lihat dampak pembinaan.</p>
          </div>

          <div className="rounded-xl border border-cyan-400/20 bg-slate-900/70 p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-white">Heatmap Prodi × Angkatan</h3>
              <button onClick={loadHeatmap} className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-400 hover:border-cyan-400/30 hover:text-cyan-200"><RefreshCcw className="h-3 w-3" /></button>
            </div>
            {heatmapError && <div className="mb-2 rounded-md border border-rose-400/20 bg-rose-500/10 px-2 py-1 text-xs text-rose-200">{heatmapError}</div>}
            {heatmapLoading ? (
              <div className="flex h-20 items-center justify-center text-xs text-slate-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Memuat heatmap...</div>
            ) : (heatmap?.heatmap?.length ?? 0) === 0 ? (
              <p className="text-xs text-slate-500">Belum ada data prodi/angkatan. Isi NIM/Prodi/Angkatan di Manajemen User.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-slate-500">
                      <th className="px-2 py-1">Prodi</th>
                      <th className="px-2 py-1">Angkatan</th>
                      <th className="px-2 py-1">Mhs</th>
                      <th className="px-2 py-1">HI avg</th>
                      <th className="px-2 py-1">Burnout avg</th>
                      <th className="px-2 py-1">High risk</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(heatmap?.heatmap || []).map((r) => {
                      const hiTone = r.avg_happiness >= 70 ? 'text-emerald-200' : r.avg_happiness >= 50 ? 'text-amber-200' : r.avg_happiness ? 'text-rose-200' : 'text-slate-500';
                      const burnTone = r.avg_burnout >= 6 ? 'text-rose-200' : r.avg_burnout >= 4 ? 'text-amber-200' : r.avg_burnout ? 'text-emerald-200' : 'text-slate-500';
                      return (
                        <tr key={`${r.prodi}-${r.angkatan}`} className="border-t border-slate-800">
                          <td className="px-2 py-1.5 text-slate-300">{r.prodi || '-'}</td>
                          <td className="px-2 py-1.5 text-slate-400">{r.angkatan || '-'}</td>
                          <td className="px-2 py-1.5 text-white">{r.mahasiswa_count}</td>
                          <td className={`px-2 py-1.5 font-semibold ${hiTone}`}>{r.avg_happiness ? r.avg_happiness.toFixed(1) : '-'}</td>
                          <td className={`px-2 py-1.5 font-semibold ${burnTone}`}>{r.avg_burnout ? r.avg_burnout.toFixed(2) : '-'}</td>
                          <td className="px-2 py-1.5 text-amber-200">{r.high_risk_count}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-2 text-[11px] text-slate-500">Sumber: HappinessAssessment & Prediction per cohort. High risk = risk_level high/urgent/critical.</p>
          </div>
        </section>

        <section className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
          <div className="space-y-5">
            <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-white">Case queue prioritas</h2>
                  <p className="mt-1 text-sm text-slate-500">Urutan kerja cepat dari seluruh sinyal sistem.</p>
                </div>
                <Link to="/risk-center" className="text-xs font-semibold text-cyan-200 hover:text-cyan-100">Kelola semua</Link>
              </div>
              <div className="space-y-3">
                {(data?.case_queue || []).length === 0 ? (
                  <EmptyState title="Tidak ada kasus aktif" body="Risk Center sedang bersih. Lanjutkan monitoring berkala." />
                ) : (
                  data?.case_queue.map((item) => (
                    <Link
                      to="/risk-center"
                      key={item.id}
                      className="block rounded-xl border border-slate-800 bg-slate-950/70 p-4 transition hover:border-cyan-400/35 hover:bg-cyan-500/10"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${severityTone[item.severity] || severityTone.medium}`}>{item.severity}</span>
                            <span className="rounded-full border border-slate-800 px-2.5 py-1 text-[11px] text-slate-400">{item.source_type}</span>
                            <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                              <Clock3 className="h-3.5 w-3.5" />
                              SLA {item.sla}
                            </span>
                          </div>
                          <p className="text-sm font-semibold text-white">{item.signal}</p>
                          <p className="mt-1 text-xs text-slate-500">{item.user_name || 'User'} | @{item.username}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-semibold text-white">{pct(item.score)}</p>
                          <p className="text-[11px] text-slate-500">confidence</p>
                        </div>
                      </div>
                      <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-300">{item.summary}</p>
                      <p className="mt-2 text-xs font-semibold text-cyan-200">{item.action}</p>
                    </Link>
                  ))
                )}
              </div>
            </section>

            <section className="grid gap-5 lg:grid-cols-2">
              <Panel title="Readiness sistem" subtitle="Status lapisan penting sebelum operasional">
                <div className="space-y-2">
                  {Object.entries(data?.readiness || {}).slice(0, 6).map(([key, value]) => (
                    <div key={key} className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2">
                      <span className="text-xs capitalize text-slate-500">{key.replaceAll('_', ' ')}</span>
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-200">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {String(value).replaceAll('_', ' ')}
                      </span>
                    </div>
                  ))}
                </div>
              </Panel>
              <Panel title="Throughput" subtitle="Volume data terbaru yang masuk ke sistem">
                <div className="grid grid-cols-2 gap-3">
                  <MiniBlock label="Asesmen 7 hari" value={data?.throughput.assessments_7d ?? 0} />
                  <MiniBlock label="Prediksi 7 hari" value={data?.throughput.predictions_7d ?? 0} />
                  <MiniBlock label="Check-in 24 jam" value={data?.throughput.checkins_24h ?? 0} />
                  <MiniBlock label="Audit 24 jam" value={data?.throughput.activity_24h ?? 0} />
                </div>
              </Panel>
            </section>
          </div>

          <aside className="space-y-5">
            <Panel title="AI recommended moves" subtitle="Saran prioritas otomatis untuk admin">
              <div className="space-y-3">
                {(data?.recommended_moves || []).map((move) => (
                  <Link key={`${move.title}-${move.priority}`} to={move.path} className={`block rounded-xl border p-4 transition hover:bg-slate-950/60 ${priorityTone[move.priority] || priorityTone.medium}`}>
                    <div className="mb-2 flex items-center gap-2">
                      <Sparkles className="h-4 w-4" />
                      <p className="text-sm font-semibold">{move.title}</p>
                    </div>
                    <p className="text-xs leading-5 opacity-75">{move.body}</p>
                  </Link>
                ))}
              </div>
            </Panel>

            <Panel title="User terbaru" subtitle="Akun baru yang masuk sistem">
              <div className="space-y-2">
                {(data?.latest_users || []).map((user) => (
                  <div key={user.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">{user.nama || user.username}</p>
                      <p className="text-xs text-slate-500">@{user.username} | {user.role}</p>
                    </div>
                    <span className="text-[11px] text-slate-500">{formatDate(user.created_at)}</span>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Audit terbaru" subtitle="Jejak aktivitas penting">
              <div className="space-y-2">
                {(data?.recent_activity || []).map((item) => (
                  <div key={item.id} className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-xs font-semibold text-slate-200">{item.action || 'activity'}</p>
                      <span className="text-[11px] text-slate-500">{formatDate(item.created_at)}</span>
                    </div>
                    <p className="mt-1 truncate text-[11px] text-slate-500">{item.method} {item.path}</p>
                  </div>
                ))}
              </div>
            </Panel>
          </aside>
        </section>
      </div>
    </main>
  );
}

function StatCard({ icon: Icon, label, value, detail, tone }: { icon: LucideIcon; label: string; value: number; detail: string; tone: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="rounded-lg border border-slate-800 bg-slate-950 p-2">
          <Icon className={`h-4 w-4 ${tone}`} />
        </div>
        <span className="text-xs text-slate-500">Live</span>
      </div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${tone}`}>{value}</p>
      <p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p>
    </div>
  );
}

function MiniMetric({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
      <p className={`text-lg font-semibold ${tone}`}>{value}</p>
      <p className="mt-1 text-[11px] text-slate-500">{label}</p>
    </div>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-white">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}

function MiniBlock({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-semibold text-white">{value}</p>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/50 p-8 text-center">
      <Database className="mx-auto h-7 w-7 text-slate-600" />
      <p className="mt-3 text-sm font-semibold text-slate-300">{title}</p>
      <p className="mt-1 text-sm text-slate-500">{body}</p>
    </div>
  );
}
