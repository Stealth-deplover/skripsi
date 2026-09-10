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
  Loader2,
  RefreshCcw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
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

  useEffect(() => {
    load();
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
