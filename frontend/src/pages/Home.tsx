import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  BarChart3,
  BellRing,
  BookOpen,
  Bot,
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Clock3,
  FileText,
  Gauge,
  HeartPulse,
  LockKeyhole,
  MessageCircle,
  PlayCircle,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';
import api from '../api';
import { normalizeRole } from '../components/RequireRole';

interface PublicOverview {
  total_users: number;
  total_assessments: number;
  total_predictions: number;
  total_curhats: number;
  model_accuracy: number;
  active_model: string;
}

type DemoMode = 'Mahasiswa' | 'DPA' | 'Kaprodi';

const demoModes: Record<
  DemoMode,
  {
    score: number;
    risk: string;
    category: string;
    trend: string;
    headline: string;
    body: string;
    indicators: Array<{ label: string; value: number; status: string }>;
    points: number[];
  }
> = {
  Mahasiswa: {
    score: 76,
    risk: 'Tinggi',
    category: 'Academic overload',
    trend: '+9% dari kemarin',
    headline: 'Sinyal akademik terbaca lebih awal',
    body: 'Gabungkan asesmen, MBTI, curhat, dan pola kelelahan agar mahasiswa tidak menunggu sampai benar-benar tumbang.',
    indicators: [
      { label: 'Stres Level', value: 75, status: 'Tinggi' },
      { label: 'Kelelahan', value: 68, status: 'Tinggi' },
      { label: 'Beban Tugas', value: 80, status: 'Tinggi' },
      { label: 'Kualitas Tidur', value: 45, status: 'Rendah' },
    ],
    points: [12, 24, 18, 36, 42, 58, 54, 66, 49, 74, 82, 91],
  },
  DPA: {
    score: 82,
    risk: 'Tinggi',
    category: 'Prioritas monitoring',
    trend: '+12% dari kemarin',
    headline: 'Mahasiswa yang perlu diperhatikan naik prioritas',
    body: 'DPA melihat burnout dan Happiness Index tiap mahasiswa bimbingan, lengkap dengan early warning dan catatan monitoring akademik.',
    indicators: [
      { label: 'Burnout Tinggi', value: 84, status: 'Tinggi' },
      { label: 'Happiness Rendah', value: 41, status: 'Turun' },
      { label: 'Bimbingan Aktif', value: 58, status: 'Sedang' },
      { label: 'Warning Baru', value: 37, status: 'Rendah' },
    ],
    points: [18, 22, 31, 39, 35, 52, 58, 61, 47, 72, 79, 88],
  },
  Kaprodi: {
    score: 64,
    risk: 'Sedang',
    category: 'Operational watch',
    trend: '-4% dari kemarin',
    headline: 'Admin mendapat urutan tindakan',
    body: 'NexusMind mengubah data responden, balasan terapi, model, dan laporan menjadi peta kerja yang bisa langsung dieksekusi.',
    indicators: [
      { label: 'Responden Aktif', value: 72, status: 'Stabil' },
      { label: 'Balasan Terapi', value: 61, status: 'Perlu cek' },
      { label: 'Model Signal', value: 88, status: 'Akurat' },
      { label: 'Follow Up', value: 54, status: 'Menunggu' },
    ],
    points: [31, 34, 44, 41, 55, 57, 62, 58, 65, 69, 64, 61],
  },
};

const featureStack = [
  {
    icon: ClipboardCheck,
    title: 'Asesmen adaptif',
    body: 'Kuisioner burnout, psikosomatis, MBTI, dan riwayat harian disatukan dalam satu alur.',
  },
  {
    icon: BrainCircuit,
    title: 'Model prediksi',
    body: 'Machine learning membaca risiko dari skor, pola jawaban, dan sinyal psikologis yang tersedia.',
  },
  {
    icon: MessageCircle,
    title: 'Curhat dan terapi',
    body: 'User bisa curhat, admin memberi saran terapi, lalu balasan masuk ke notifikasi tindak lanjut.',
  },
  {
    icon: Bot,
    title: 'Nexus AI',
    body: 'Asisten membaca konteks sistem, menyusun prioritas, dan membantu user maupun admin mengambil langkah berikutnya.',
  },
];

const platformFlow = [
  ['01', 'Isi asesmen', 'User mengisi kuisioner, MBTI, atau check-in ringan dari dashboard.'],
  ['02', 'Baca risiko', 'Model menghasilkan skor burnout, psikosomatis, dan indikator utama.'],
  ['03', 'Tindak lanjut', 'Admin melihat prioritas, memberi saran terapi, dan memantau balasan.'],
  ['04', 'Pantau progres', 'Laporan, analitik, dan notifikasi menjaga keputusan tetap bergerak.'],
];

const audiences = [
  ['Mahasiswa', 'Mendeteksi kelelahan akademik sebelum tugas, organisasi, dan tekanan sosial menumpuk.'],
  ['DPA', 'Memantau burnout dan kebahagiaan mahasiswa bimbingan, lengkap dengan early warning dan catatan monitoring.'],
  ['Kaprodi', 'Mengelola akun dan melihat analytics burnout vs happiness tingkat program studi dari satu tempat.'],
];

const faqs = [
  ['Apakah ini diagnosis medis?', 'Tidak. NexusMind membaca risiko dan membantu tindak lanjut, bukan menggantikan profesional kesehatan.'],
  ['Apakah data curhat terbuka untuk semua orang?', 'Tidak. Sistem dirancang untuk menjaga konteks dukungan dan membatasi akses berdasarkan role.'],
  ['Apakah AI membuat keputusan sendiri?', 'Tidak. AI memberi ringkasan, saran, dan prioritas. Keputusan tetap ada pada user dan admin.'],
];

function readSessionTarget() {
  try {
    const token = localStorage.getItem('token');
    const role = JSON.parse(localStorage.getItem('user') || '{}')?.role;
    if (!token) return '/register';
    const normalized = normalizeRole(role);
    if (normalized === 'superadmin') return '/dashboard';
    if (normalized === 'dpa') return '/dpa/dashboard';
    return '/user/kuisioner';
  } catch {
    return '/register';
  }
}

function MiniTrend({ points }: { points: number[] }) {
  const path = points
    .map((point, index) => {
      const x = (index / (points.length - 1)) * 100;
      const y = 100 - point;
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="trendFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#7c5cff" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#7c5cff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${path} L 100 100 L 0 100 Z`} fill="url(#trendFill)" />
      <path className="landing-trend-line" d={path} fill="none" stroke="#8b6cff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle className="landing-trend-dot" cx="100" cy={(100 - points[points.length - 1]).toFixed(1)} r="3.2" fill="#d9d2ff" stroke="#6b4cff" strokeWidth="2" />
    </svg>
  );
}

export default function Home() {
  const [overview, setOverview] = useState<PublicOverview | null>(null);
  const [activeMode, setActiveMode] = useState<DemoMode>('Mahasiswa');
  const active = demoModes[activeMode];
  const primaryTarget = readSessionTarget();

  useEffect(() => {
    api
      .get('/public/overview')
      .then((response) => setOverview(response.data))
      .catch(() => undefined);
  }, []);

  const metrics = useMemo(
    () => [
      {
        icon: ShieldCheck,
        label: 'AI Accuracy',
        value: overview ? `${Math.max(0, overview.model_accuracy * 100).toFixed(1)}%` : '98%',
        body: 'Akurasi model aktif',
      },
      {
        icon: Users,
        label: 'Pengguna',
        value: overview ? overview.total_users.toLocaleString('id-ID') : '50K+',
        body: 'Akun dan responden',
      },
      {
        icon: TrendingUp,
        label: 'Asesmen',
        value: overview ? overview.total_assessments.toLocaleString('id-ID') : '100K+',
        body: 'Check-in terselesaikan',
      },
      {
        icon: BellRing,
        label: 'Monitoring',
        value: overview ? overview.total_curhats.toLocaleString('id-ID') : '24/7',
        body: 'Curhat dan follow-up',
      },
    ],
    [overview],
  );

  const scrollToDemo = () => document.getElementById('platform')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="landing-page min-h-screen overflow-hidden bg-[#050816] text-slate-100">
      <section className="landing-hero-shell relative min-h-[calc(100vh-5rem)] px-4 pb-12 pt-24 sm:px-6 lg:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_16%,rgba(88,80,236,0.30),transparent_30%),radial-gradient(circle_at_84%_18%,rgba(34,211,238,0.13),transparent_24%),linear-gradient(180deg,#060a18_0%,#050816_58%,#060914_100%)]" />
        <div className="landing-grid-flow absolute inset-0 opacity-[0.12] [background-image:linear-gradient(rgba(148,163,184,0.18)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.18)_1px,transparent_1px)] [background-size:48px_48px]" />
        <div className="landing-scanline absolute inset-x-0 top-20 h-px bg-cyan-200/30" />

        <div className="relative mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[0.82fr_1.18fr]">
          <div className="landing-reveal max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-300/20 bg-slate-100/[0.04] px-4 py-2 text-sm font-semibold text-violet-200 shadow-[0_0_40px_rgba(124,92,255,0.16)]">
              <Zap className="h-4 w-4 text-violet-300" aria-hidden="true" />
              AI-Powered Burnout Detection
            </div>

            <h1 className="mt-10 max-w-3xl text-5xl font-black leading-[1.02] text-slate-50 sm:text-6xl lg:text-7xl">
              Stop Guessing.
              <span className="mt-2 block text-violet-300">Start Understanding.</span>
            </h1>

            <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-300">
              NexusMind mengubah asesmen, curhat, MBTI, terapi, dan analitik admin menjadi satu sistem cerdas untuk
              mendeteksi dan mencegah burnout sejak dini.
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link
                to={primaryTarget}
                className="inline-flex h-14 items-center justify-center gap-2 rounded-xl bg-violet-500 px-6 text-sm font-bold text-slate-50 shadow-[0_22px_60px_rgba(99,102,241,0.36)] transition hover:-translate-y-0.5 hover:bg-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200/50"
              >
                Mulai Asesmen Sekarang
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <button
                type="button"
                onClick={scrollToDemo}
                className="inline-flex h-14 items-center justify-center gap-2 rounded-xl border border-violet-200/20 bg-slate-950/40 px-6 text-sm font-bold text-slate-100 transition hover:-translate-y-0.5 hover:border-violet-200/45 hover:bg-slate-100/[0.06] focus:outline-none focus:ring-2 focus:ring-violet-200/40"
              >
                Lihat Demo
                <PlayCircle className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {metrics.map((item) => {
                const Icon = item.icon;
                return (
                  <article key={item.label} className="landing-card rounded-xl border border-slate-700/60 bg-slate-900/52 p-4 shadow-[0_18px_60px_rgba(2,6,23,0.25)]">
                    <Icon className="h-5 w-5 text-violet-300" aria-hidden="true" />
                    <p className="mt-4 text-3xl font-black text-violet-300">{item.value}</p>
                    <p className="mt-2 text-sm font-semibold text-slate-200">{item.label}</p>
                    <p className="mt-2 text-xs leading-5 text-slate-500">{item.body}</p>
                  </article>
                );
              })}
            </div>
          </div>

          <div id="demo" className="landing-console relative">
            <div className="absolute -inset-5 rounded-[2rem] bg-violet-500/12 blur-3xl" />
            <div className="relative overflow-hidden rounded-[2rem] border border-violet-300/35 bg-[#0a0d1c] p-4 shadow-[0_30px_120px_rgba(39,36,120,0.45)]">
              <div className="rounded-[1.55rem] border border-slate-700/70 bg-[#0f1324] p-4 md:p-5">
                <div className="grid gap-5 md:grid-cols-[64px_minmax(0,1fr)]">
                  <aside className="hidden rounded-2xl border border-slate-800 bg-[#090d1b] p-3 md:block">
                    <div className="mb-7 flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500 text-sm font-black">N</div>
                    <div className="space-y-4">
                      {[Activity, BarChart3, MessageCircle, Users, Gauge].map((Icon, index) => (
                        <div
                          key={index}
                          className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                            index === 0 ? 'bg-violet-500 text-slate-50' : 'text-slate-500'
                          }`}
                        >
                          <Icon className="h-4 w-4" aria-hidden="true" />
                        </div>
                      ))}
                    </div>
                  </aside>

                  <div className="min-w-0">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h2 className="text-xl font-bold text-slate-50">Risk Console</h2>
                        <p className="mt-1 text-sm text-slate-500">Live overview</p>
                      </div>
                      <div className="flex h-11 items-center gap-3 rounded-lg border border-slate-700 bg-[#0b0f1e] px-4 text-sm text-slate-300">
                        <Clock3 className="h-4 w-4 text-slate-500" aria-hidden="true" />
                        Hari ini
                        <ChevronDown className="h-4 w-4 text-slate-500" aria-hidden="true" />
                      </div>
                    </div>

                    <div className="mt-5 flex flex-wrap gap-2">
                      {(Object.keys(demoModes) as DemoMode[]).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setActiveMode(mode)}
                          className={`landing-mode-button h-9 rounded-lg px-4 text-xs font-bold transition ${
                            activeMode === mode
                              ? 'bg-violet-500 text-slate-50'
                              : 'border border-slate-700 bg-[#0b0f1e] text-slate-400 hover:border-violet-300/40 hover:text-slate-100'
                          }`}
                        >
                          {mode}
                        </button>
                      ))}
                    </div>

                    <div className="mt-5 grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
                      <section className="landing-panel rounded-xl border border-slate-700/70 bg-slate-950/35 p-5">
                        <p className="text-sm font-semibold text-slate-300">Risk Score</p>
                        <div className="mt-5 grid items-center gap-5 sm:grid-cols-[150px_minmax(0,1fr)]">
                          <div
                            className="grid aspect-square place-items-center rounded-full"
                            style={{
                              background: `conic-gradient(#8b5cf6 ${active.score * 3.6}deg, rgba(51,65,85,0.8) 0deg)`,
                            }}
                          >
                            <div className="grid h-[72%] w-[72%] place-items-center rounded-full bg-[#11162a] text-center">
                              <div>
                                <p className="text-5xl font-black text-slate-50">{active.score}</p>
                                <p className="text-xs text-slate-400">/100</p>
                              </div>
                            </div>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500">Tingkat Risiko</p>
                            <p className="mt-1 text-lg font-bold text-amber-300">{active.risk}</p>
                            <p className="mt-4 text-xs text-slate-500">Kategori</p>
                            <p className="mt-1 text-sm font-semibold text-slate-100">{active.category}</p>
                            <p className="mt-4 text-xs text-slate-500">Trend</p>
                            <p className="mt-1 text-sm font-semibold text-orange-300">{active.trend}</p>
                          </div>
                        </div>
                      </section>

                      <section className="landing-panel rounded-xl border border-slate-700/70 bg-slate-950/35 p-5">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold text-slate-300">Risk Trend</p>
                          <span className="rounded-lg border border-slate-700 px-3 py-1 text-xs text-slate-400">7 Hari</span>
                        </div>
                        <div className="mt-4 h-48 border-y border-slate-800 py-3">
                          <MiniTrend points={active.points} />
                        </div>
                      </section>
                    </div>

                    <section className="landing-panel mt-4 rounded-xl border border-slate-700/70 bg-slate-950/35 p-5">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-slate-300">Indikator Utama</p>
                          <h3 className="mt-2 text-xl font-bold text-slate-50">{active.headline}</h3>
                        </div>
                        <p className="max-w-sm text-sm leading-6 text-slate-500">{active.body}</p>
                      </div>

                      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        {active.indicators.map((indicator) => (
                          <article key={indicator.label} className="landing-card rounded-xl border border-slate-800 bg-[#11162a] p-4">
                            <p className="text-xs text-slate-400">{indicator.label}</p>
                            <p className="mt-3 text-3xl font-black text-slate-100">{indicator.value}</p>
                            <p className="mt-1 text-xs text-slate-500">{indicator.status}</p>
                            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-800">
                              <div className="h-full rounded-full bg-violet-500" style={{ width: `${indicator.value}%` }} />
                            </div>
                          </article>
                        ))}
                      </div>
                    </section>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="relative mx-auto mt-12 max-w-7xl border-t border-slate-800 pt-8">
          <div className="grid gap-5 text-sm text-slate-500 md:grid-cols-[1.4fr_repeat(4,1fr)_1.1fr] md:items-center">
            <p>Dipercaya untuk kebutuhan organisasi dan institusi</p>
            {['Kampus', 'HR Team', 'Konselor', 'Admin Institusi'].map((item) => (
              <p key={item} className="font-semibold text-slate-400">{item}</p>
            ))}
            <p>dan banyak lainnya</p>
          </div>
        </div>
      </section>

      <section id="fitur" className="relative px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-10 lg:grid-cols-[0.72fr_1.28fr]">
            <div>
              <p className="text-sm font-bold text-cyan-300">Fitur utama</p>
              <h2 className="mt-4 text-4xl font-black leading-tight text-slate-50 md:text-5xl">
                Semua sinyal penting masuk ke satu alur.
              </h2>
              <p className="mt-5 max-w-xl text-base leading-8 text-slate-400">
                Landing ini menjual fungsi yang sudah hidup di sistem, bukan janji kosong. Pengunjung bisa melihat
                bagaimana user dan admin bergerak dari data ke tindakan.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {featureStack.map((feature) => {
                const Icon = feature.icon;
                return (
                  <article key={feature.title} className="landing-card rounded-2xl border border-slate-800 bg-[#0d1224] p-6">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-500/16 text-violet-300">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <h3 className="mt-5 text-xl font-bold text-slate-50">{feature.title}</h3>
                    <p className="mt-3 text-sm leading-7 text-slate-400">{feature.body}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section id="platform" className="bg-[#080c1a] px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-10 lg:grid-cols-[1fr_0.82fr]">
            <div className="landing-panel rounded-[2rem] border border-slate-800 bg-[#0d1224] p-6 md:p-8">
              <div className="flex items-start justify-between gap-6">
                <div>
                  <p className="text-sm font-bold text-violet-300">Platform flow</p>
                  <h2 className="mt-3 text-4xl font-black leading-tight text-slate-50 md:text-5xl">
                    Dari check-in ke keputusan.
                  </h2>
                </div>
                <Sparkles className="h-7 w-7 text-cyan-300" aria-hidden="true" />
              </div>

              <div className="mt-8 grid gap-4">
                {platformFlow.map(([step, title, body]) => (
                  <article key={step} className="landing-card grid gap-4 rounded-2xl border border-slate-800 bg-slate-950/32 p-5 sm:grid-cols-[72px_minmax(0,1fr)]">
                    <p className="text-3xl font-black text-violet-300">{step}</p>
                    <div>
                      <h3 className="text-xl font-bold text-slate-50">{title}</h3>
                      <p className="mt-2 text-sm leading-7 text-slate-400">{body}</p>
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <div id="untuk-siapa" className="landing-accent-panel rounded-[2rem] border border-violet-300/20 bg-violet-500 p-6 text-[#090b17] md:p-8">
              <p className="text-sm font-bold text-[#211545]">Untuk siapa</p>
              <h2 className="mt-4 text-4xl font-black leading-tight md:text-5xl">Satu sistem untuk tiga peran.</h2>
              <div className="mt-8 space-y-3">
                {audiences.map(([title, body]) => (
                  <article key={title} className="landing-accent-item rounded-2xl bg-slate-950/12 p-5">
                    <h3 className="text-xl font-black">{title}</h3>
                    <p className="mt-2 text-sm leading-7 text-[#211545]">{body}</p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="tentang" className="px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="text-sm font-bold text-cyan-300">AI dan model intelligence</p>
            <h2 className="mt-4 text-4xl font-black leading-tight text-slate-50 md:text-5xl">
              Data keras, bahasa manusia.
            </h2>
            <p className="mt-5 max-w-xl text-base leading-8 text-slate-400">
              NexusMind menjaga hasil tetap bisa dipahami. Model membaca angka, AI membantu merangkum, lalu admin dan
              user tetap memegang keputusan.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {[
              [Gauge, 'Risk scoring', 'Skor risiko dibuat dari asesmen dan sinyal yang relevan.'],
              [HeartPulse, 'Tindak lanjut sehat', 'Saran terapi dan follow-up menjaga dukungan tetap bergerak.'],
              [LockKeyhole, 'Kontrol akses', 'Role user dan admin memisahkan area kerja dan data sensitif.'],
              [FileText, 'Laporan siap pakai', 'Analitik dan laporan membantu kebutuhan monitoring serta sidang.'],
            ].map(([Icon, title, body]) => {
              const TypedIcon = Icon as typeof Gauge;
              return (
                <article key={title as string} className="landing-card rounded-2xl border border-slate-800 bg-[#0d1224] p-6">
                  <TypedIcon className="h-6 w-6 text-violet-300" aria-hidden="true" />
                  <h3 className="mt-5 text-xl font-bold text-slate-50">{title as string}</h3>
                  <p className="mt-3 text-sm leading-7 text-slate-400">{body as string}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section id="dokumentasi" className="bg-[#080c1a] px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr]">
            <div>
              <p className="text-sm font-bold text-violet-300">Dokumentasi dan trust</p>
              <h2 className="mt-4 text-4xl font-black leading-tight text-slate-50 md:text-5xl">
                Diposisikan sebagai sistem dukungan, bukan diagnosis.
              </h2>
              <Link
                to="/login"
                className="mt-8 inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-slate-700 px-5 text-sm font-bold text-slate-100 transition hover:border-violet-300/50 hover:bg-slate-100/[0.05]"
              >
                Buka dokumentasi sistem
                <BookOpen className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>

            <div className="space-y-3">
              {faqs.map(([question, answer]) => (
                <article key={question} className="landing-card rounded-2xl border border-slate-800 bg-[#0d1224] p-5">
                  <div className="flex gap-3">
                    <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-cyan-300" aria-hidden="true" />
                    <div>
                      <h3 className="text-lg font-bold text-slate-50">{question}</h3>
                      <p className="mt-2 text-sm leading-7 text-slate-400">{answer}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 py-20 sm:px-6 lg:px-8">
        <div className="landing-final-cta mx-auto max-w-7xl overflow-hidden rounded-[2rem] border border-violet-300/25 bg-violet-500 p-8 text-[#090b17] md:p-12">
          <div className="grid gap-8 lg:grid-cols-[1fr_0.72fr] lg:items-end">
            <div>
              <p className="text-sm font-bold text-[#211545]">Final call</p>
              <h2 className="mt-4 text-5xl font-black leading-tight md:text-6xl">
                Jangan tunggu sinyalnya jadi terlambat.
              </h2>
            </div>
            <div>
              <p className="text-base leading-8 text-[#211545]">
                Mulai dari asesmen, lihat risiko, lalu gunakan dashboard untuk menentukan langkah berikutnya dengan
                lebih jelas.
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row lg:flex-col">
                <Link
                  to={primaryTarget}
                  className="inline-flex h-13 items-center justify-center gap-2 rounded-xl bg-[#090b17] px-6 py-4 text-sm font-black text-slate-50 transition hover:-translate-y-0.5"
                >
                  Mulai asesmen
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <Link
                  to="/login"
                  className="inline-flex h-13 items-center justify-center gap-2 rounded-xl border border-[#090b17]/20 px-6 py-4 text-sm font-black text-[#090b17] transition hover:-translate-y-0.5 hover:bg-[#090b17]/8"
                >
                  Masuk dashboard
                  <Activity className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
