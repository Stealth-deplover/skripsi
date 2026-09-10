import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, ArrowRight, Bell, ClipboardList, HeartPulse, MessageSquareHeart, RefreshCcw, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import UserDashboardHeader from './userDashboard/UserDashboardHeader';
import UserStatCards, { type Assessment, type Prediction } from './userDashboard/UserStatCards';
import WellBeingSummaryCards from './userDashboard/WellBeingSummaryCards';
import PersonalTrendChart from './userDashboard/PersonalTrendChart';
import DailyQuestionnaire from './userDashboard/DailyQuestionnaire';
import AnonymousVentingFeed from './userDashboard/AnonymousVentingFeed';
import api from '../api';

interface DailyBriefAction {
  title: string;
  body: string;
  path: string;
  priority: string;
}

interface DailyBrief {
  headline: string;
  summary: string;
  risk_level: string;
  data_quality: string;
  evidence: string[];
  next_actions: DailyBriefAction[];
  pending_treatments: number;
  unread_items: number;
  monitoring_disclaimer: string;
}

export default function UserDashboard() {
  const navigate = useNavigate();
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [treatments, setTreatments] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [dailyBrief, setDailyBrief] = useState<DailyBrief | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState('');

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError('');
    try {
      const res = await api.get('/user/history');
      setPredictions(res.data.predictions ?? []);
      setAssessments(res.data.assessments ?? []);
      const [treatmentRes, unreadRes, briefRes] = await Promise.all([
        api.get('/user/notifications'),
        api.get('/notifications/unread'),
        api.get('/user/daily-brief'),
      ]);
      setTreatments(treatmentRes.data.notifications ?? []);
      setUnreadCount((unreadRes.data.notifications ?? []).length);
      setDailyBrief(briefRes.data ?? null);
    } catch (err) {
      console.error('Failed to fetch user history', err);
      setHistoryError('Data dashboard belum bisa dimuat. Periksa koneksi atau coba muat ulang.');
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  useEffect(() => {
    let lastNotifId = 0;

    const fetchNotifications = async () => {
      try {
        const res = await api.get('/notifications/unread');
        const notifs = res.data.notifications;
        if (notifs?.length > 0) {
          const notif = notifs[0];
          if (notif.ID > lastNotifId) {
            lastNotifId = notif.ID;
            setToast({ id: notif.ID, message: notif.Message });
            await api.post(`/notifications/${notif.ID}/read`);
          }
        }
      } catch {
        // Notification polling should stay quiet when the backend is temporarily unavailable.
      }
    };

    fetchNotifications();
    const interval = window.setInterval(fetchNotifications, 3000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  return (
    <main className="min-h-screen bg-[#090b12] px-4 py-5 text-slate-100 sm:px-6 lg:px-8">
      <div className="dashboard-ambient pointer-events-none fixed inset-0 -z-0 bg-[radial-gradient(circle_at_top_left,rgba(45,212,191,0.14),transparent_28%),linear-gradient(180deg,rgba(15,23,42,0.7),rgba(9,11,18,0.98))]" />

      {toast && (
        <div className="fixed bottom-5 right-5 z-50 flex max-w-sm items-start gap-3 rounded-xl border border-teal-300/30 bg-teal-500 px-4 py-3 text-sm font-semibold text-white shadow-2xl shadow-teal-950/40">
          <Bell className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="leading-5">{toast.message}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="-mr-1 rounded-full p-1 text-white/80 transition hover:bg-white/15 hover:text-white"
            aria-label="Tutup notifikasi"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-5">
        <UserDashboardHeader />

        {historyError && (
          <div className="flex flex-col gap-3 rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-100 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
              <span>{historyError}</span>
            </div>
            <button
              type="button"
              onClick={fetchHistory}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-amber-300/30 px-3 py-2 text-xs font-semibold text-amber-50 transition hover:bg-amber-300/10"
            >
              <RefreshCcw className="h-3.5 w-3.5" />
              Muat ulang
            </button>
          </div>
        )}

        <UserStatCards predictions={predictions} assessments={assessments} loading={historyLoading} />

        <WellBeingSummaryCards />

        <section className="rounded-2xl border border-white/10 bg-slate-950/70 p-5 shadow-xl shadow-black/10">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-teal-300/25 bg-teal-300/10 px-3 py-1 text-xs font-semibold text-teal-100">
                <HeartPulse className="h-3.5 w-3.5" />
                Daily Brief AI
              </div>
              <h2 className="text-xl font-semibold text-white">{dailyBrief?.headline || 'Brief harian sedang disiapkan'}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                {dailyBrief?.summary || 'NexusMind membaca asesmen, prediksi, check-in, curhat, dan saran admin untuk menyusun prioritas hari ini.'}
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-slate-300">
                  Risiko {dailyBrief?.risk_level || '-'}
                </span>
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-slate-300">
                  Data {dailyBrief?.data_quality || '-'}
                </span>
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-slate-300">
                  Pending {dailyBrief?.pending_treatments ?? 0}
                </span>
              </div>
            </div>
            <div className="grid w-full gap-2 lg:max-w-md">
              {(dailyBrief?.next_actions || []).slice(0, 3).map((action) => (
                <button
                  key={`${action.title}-${action.path}`}
                  type="button"
                  onClick={() => navigate(action.path)}
                  className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-left transition hover:border-teal-300/30 hover:bg-teal-300/10"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-white">{action.title}</span>
                    <ArrowRight className="h-4 w-4 text-teal-200" />
                  </div>
                  <p className="mt-1 text-xs leading-5 text-slate-400">{action.body}</p>
                </button>
              ))}
              {(!dailyBrief?.next_actions || dailyBrief.next_actions.length === 0) && (
                <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4 text-sm text-slate-400">
                  Tidak ada prioritas besar saat ini.
                </div>
              )}
            </div>
          </div>
          {dailyBrief?.evidence?.length ? (
            <div className="mt-5 grid gap-2 md:grid-cols-2">
              {dailyBrief.evidence.slice(0, 4).map((item) => (
                <div key={item} className="rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-xs leading-5 text-slate-300">
                  {item}
                </div>
              ))}
            </div>
          ) : null}
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 shadow-xl shadow-black/10">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-teal-200">Pusat Tindakan</p>
                <h2 className="mt-2 text-lg font-semibold text-white">Langkah terbaik berikutnya</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                  Dashboard merangkum asesmen, notifikasi, dan rekomendasi terapi agar tindakan berikutnya lebih jelas.
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate('/user/kuisioner')}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-teal-300 px-4 text-sm font-semibold text-slate-950 transition hover:bg-teal-200"
              >
                Isi kuisioner
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              {[
                {
                  label: 'Rekomendasi pending',
                  value: treatments.filter((item) => item.Status === 'pending').length,
                  icon: HeartPulse,
                  tone: 'text-rose-200 bg-rose-400/10',
                  action: () => navigate('/user/curhat'),
                },
                {
                  label: 'Notifikasi belum dibaca',
                  value: unreadCount,
                  icon: Bell,
                  tone: 'text-cyan-200 bg-cyan-400/10',
                  action: () => navigate('/user/curhat'),
                },
                {
                  label: 'Riwayat asesmen',
                  value: assessments.length,
                  icon: ClipboardList,
                  tone: 'text-violet-200 bg-violet-400/10',
                  action: () => navigate('/user/asesmen'),
                },
              ].map(({ label, value, icon: Icon, tone, action }) => (
                <button
                  key={label}
                  type="button"
                  onClick={action}
                  className="rounded-xl border border-white/10 bg-slate-950/50 p-4 text-left transition hover:border-teal-300/30 hover:bg-white/[0.06]"
                >
                  <span className={`grid h-10 w-10 place-items-center rounded-lg ${tone}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="mt-4 block text-2xl font-bold text-white">{historyLoading ? '-' : value}</span>
                  <span className="mt-1 block text-xs text-slate-400">{label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 shadow-xl shadow-black/10">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <MessageSquareHeart className="h-4 w-4 text-emerald-200" />
              Insight Pemulihan
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-300">
              {(() => {
                const latest = predictions[0];
                if (!latest) return 'Belum ada prediksi. Isi kuisioner pertama agar sistem bisa memberi rekomendasi yang lebih personal.';
                if (latest.BurnoutScore > 6) return 'Skor terakhir berada di zona tinggi. Prioritaskan rekomendasi terapi dan cek ulang kondisi hari ini.';
                if (latest.BurnoutScore > 4) return 'Kondisi berada di zona sedang. Pertahankan pemantauan harian dan gunakan ruang curhat bila beban mulai menumpuk.';
                return 'Kondisi terakhir masih rendah. Jaga ritme istirahat dan lanjutkan pemantauan rutin untuk melihat perubahan lebih dini.';
              })()}
            </p>
            <div className="mt-4 rounded-xl border border-white/10 bg-slate-950/50 p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Fokus minggu ini</p>
              <p className="mt-2 text-sm font-semibold text-white">
                {treatments.some((item) => item.Status === 'pending')
                  ? 'Selesaikan rekomendasi terapi yang masih pending'
                  : 'Pertahankan asesmen harian dan catat perubahan'}
              </p>
            </div>
          </div>
        </section>

        <section className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
          <div className="flex min-w-0 flex-col gap-5">
            <PersonalTrendChart
              predictions={predictions}
              assessments={assessments}
              loading={historyLoading}
            />
            <DailyQuestionnaire onSubmitSuccess={fetchHistory} />
          </div>

          <div className="min-w-0">
            <AnonymousVentingFeed />
          </div>
        </section>
      </div>
    </main>
  );
}
