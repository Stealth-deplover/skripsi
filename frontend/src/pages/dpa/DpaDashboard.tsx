import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, ArrowRight, ClipboardX, Flame, Loader2, RefreshCw, ShieldAlert, Smile, TriangleAlert, Users } from 'lucide-react';
import DpaPageHeader from '../../components/DpaPageHeader';
import api from '../../api';
import { burnoutCategoryMeta, categoryMeta, interpretationMeta } from '../userDashboard/happinessShared';

interface StudentRow {
  id: number;
  nama: string;
  nim: string;
  prodi: string;
  semester: number;
  burnout: number;
  burnout_category: string;
  happiness: number;
  happiness_category: string;
  status: string;
  status_priority: number;
  burnout_trend: number[];
  happiness_trend: number[];
  has_data: boolean;
}

interface Warning {
  type: string;
  label: string;
  detail: string;
  priority: number;
}

interface DashboardData {
  dpa: { id: number; nama: string; username: string };
  total_students: number;
  avg_burnout: number;
  avg_happiness: number;
  burnout_tinggi: number;
  happiness_rendah: number;
  priority_monitoring: number;
  belum_isi: number;
  active_notes: number;
  warning_count: number;
  onboarding: { id: number; nama: string; missing: string }[];
  onboarding_count: number;
  students: StudentRow[];
  warnings: Warning[];
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (!values || values.length < 2) return <span className="text-xs text-slate-600">—</span>;
  const points = values.slice(-6).reverse();
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const path = points
    .map((value, index) => `${index === 0 ? 'M' : 'L'} ${(index / (points.length - 1)) * 100} ${28 - ((value - min) / range) * 24}`)
    .join(' ');
  return (
    <svg viewBox="0 0 100 30" className="h-7 w-24" preserveAspectRatio="none">
      <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export default function DpaDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchDashboard = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/dpa/dashboard');
      setData(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Gagal memuat dashboard DPA');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  const stats = [
    { label: 'Mahasiswa Bimbingan', value: data?.total_students ?? 0, icon: Users, tone: 'text-cyan-100 bg-cyan-500/10' },
    { label: 'Rata-rata Burnout', value: data ? `${data.avg_burnout.toFixed(1)}/10` : '-', icon: Flame, tone: 'text-indigo-100 bg-indigo-500/10' },
    { label: 'Rata-rata Happiness', value: data ? `${data.avg_happiness.toFixed(0)}/100` : '-', icon: Smile, tone: 'text-amber-100 bg-amber-500/10' },
    { label: 'Burnout Tinggi', value: data?.burnout_tinggi ?? 0, icon: Activity, tone: 'text-rose-100 bg-rose-500/10' },
    { label: 'Happiness Rendah', value: data?.happiness_rendah ?? 0, icon: TriangleAlert, tone: 'text-orange-100 bg-orange-500/10' },
    { label: 'Prioritas Monitoring', value: data?.priority_monitoring ?? 0, icon: ShieldAlert, tone: 'text-rose-100 bg-rose-500/10' },
    { label: 'Assessment Belum Diisi', value: data?.belum_isi ?? 0, icon: ClipboardX, tone: 'text-slate-200 bg-slate-500/10' },
    { label: 'Warning Aktif', value: data?.warning_count ?? 0, icon: ShieldAlert, tone: 'text-violet-100 bg-violet-500/10' },
  ];

  return (
    <div className="flex flex-col gap-5">
      <DpaPageHeader
        eyebrow="Portal DPA"
        title="Dashboard DPA"
        description={`${data?.dpa?.nama ? `Selamat datang, ${data.dpa.nama}. ` : ''}Pantau burnout dan Happiness Index mahasiswa bimbingan Anda dari satu tempat.`}
        icon={Users}
        actions={
          <button
            onClick={fetchDashboard}
            disabled={loading}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.07] disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        }
      />

      {error && <div className="rounded-lg border border-rose-300/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</div>}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="rounded-lg border border-white/10 bg-slate-950 p-4 shadow-xl shadow-black/10">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">{item.label}</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{loading ? '-' : item.value}</p>
                </div>
                <span className={`flex h-11 w-11 items-center justify-center rounded-md ${item.tone}`}>
                  <Icon className="h-5 w-5" />
                </span>
              </div>
            </div>
          );
        })}
      </section>

      {data && data.onboarding_count > 0 && (
        <section className="rounded-lg border border-indigo-300/25 bg-indigo-500/10 p-5 shadow-xl shadow-black/10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-indigo-100">
              <ClipboardX className="h-4 w-4" />
              Onboarding Bimbingan ({data.onboarding_count})
            </div>
            <Link to="/dpa/mahasiswa" className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-200 hover:text-indigo-100">
              Kelengkapan data di daftar mahasiswa <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <p className="mt-1 text-xs text-indigo-200/70">
            Mahasiswa berikut perlu dilengkapi datanya agar analitik dan pemantauan berjalan optimal.
          </p>
          <div className="mt-3 space-y-2">
            {data.onboarding.slice(0, 6).map((item) => (
              <Link
                key={item.id}
                to={`/dpa/mahasiswa/${item.id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-indigo-300/20 bg-slate-950/50 px-4 py-2.5 text-sm transition hover:bg-slate-900"
              >
                <span className="font-semibold text-slate-100">{item.nama}</span>
                <span className="text-xs text-amber-200/90">Belum ada: {item.missing}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {data && data.warnings.length > 0 && (
        <section className="rounded-lg border border-amber-300/25 bg-amber-500/10 p-5 shadow-xl shadow-black/10">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-100">
            <TriangleAlert className="h-4 w-4" />
            Early Warning Well-Being ({data.warnings.length})
          </div>
          <div className="mt-3 space-y-2">
            {data.warnings.slice(0, 5).map((warning, index) => (
              <div key={`${warning.type}-${index}`} className="rounded-lg border border-amber-300/20 bg-slate-950/50 px-4 py-3 text-sm leading-6 text-amber-50">
                <span className="font-semibold">{warning.label}:</span> {warning.detail}
              </div>
            ))}
          </div>
          <Link to="/dpa/warnings" className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-amber-200 hover:text-amber-100">
            Lihat semua warning <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </section>
      )}

      <section className="rounded-lg border border-white/10 bg-slate-950 p-5 shadow-xl shadow-black/10">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <Users className="h-4 w-4 text-indigo-200" />
              Mahasiswa Bimbingan
            </div>
            <p className="mt-1 text-xs text-slate-500">Diurutkan dari status prioritas tertinggi</p>
          </div>
          <Link
            to="/dpa/mahasiswa"
            className="inline-flex h-10 items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.07]"
          >
            Kelola & lihat detail <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="mt-5 overflow-hidden rounded-lg border border-white/10">
          {loading ? (
            <div className="flex h-40 items-center justify-center text-sm text-slate-400">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Memuat data mahasiswa...
            </div>
          ) : !data || data.students.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center text-center">
              <Users className="h-9 w-9 text-slate-600" />
              <p className="mt-2 text-sm font-semibold text-slate-300">Belum ada mahasiswa bimbingan</p>
              <p className="mt-1 text-xs text-slate-500">Kaprodi akan memetakan mahasiswa ke Anda lewat menu Manajemen User.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[1080px] w-full table-fixed border-collapse text-sm">
                <thead className="bg-white/[0.03]">
                  <tr className="border-b border-white/10 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    <th className="px-4 py-3">Nama / NIM</th>
                    <th className="px-4 py-3">Smt</th>
                    <th className="px-4 py-3">Burnout</th>
                    <th className="px-4 py-3">Trend</th>
                    <th className="px-4 py-3">Happiness</th>
                    <th className="px-4 py-3">Trend</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {data.students.map((student) => {
                    const burnoutMeta = burnoutCategoryMeta(student.burnout_category);
                    const happinessMeta = categoryMeta(student.happiness_category);
                    const statusMeta = interpretationMeta(student.status);
                    return (
                      <tr key={student.id} className="transition hover:bg-white/[0.03]">
                        <td className="px-4 py-4">
                          <p className="truncate font-semibold text-slate-100">{student.nama}</p>
                          <p className="mt-0.5 truncate text-xs text-slate-500">{student.nim || student.prodi || '-'}</p>
                        </td>
                        <td className="px-4 py-4 text-slate-300">{student.semester || '-'}</td>
                        <td className="px-4 py-4">
                          {student.has_data && student.burnout > 0 || student.burnout_category ? (
                            <div>
                              <p className="font-semibold text-white">{student.burnout > 0 ? student.burnout.toFixed(1) : '-'}</p>
                              {student.burnout_category && (
                                <span className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${burnoutMeta.chip}`}>{student.burnout_category}</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-600">belum ada</span>
                          )}
                        </td>
                        <td className="px-4 py-4"><Sparkline values={student.burnout_trend ?? []} color="#818cf8" /></td>
                        <td className="px-4 py-4">
                          {student.happiness > 0 || student.happiness_category ? (
                            <div>
                              <p className="font-semibold text-white">{student.happiness > 0 ? Math.round(student.happiness) : '-'}</p>
                              {student.happiness_category && (
                                <span className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${happinessMeta.chip}`}>{student.happiness_category}</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-600">belum ada</span>
                          )}
                        </td>
                        <td className="px-4 py-4"><Sparkline values={student.happiness_trend ?? []} color="#fbbf24" /></td>
                        <td className="px-4 py-4">
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusMeta.chip}`}>{student.status}</span>
                        </td>
                        <td className="px-4 py-4">
                          <Link
                            to={`/dpa/mahasiswa/${student.id}`}
                            className="inline-flex h-9 items-center rounded-md border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-slate-200 transition hover:border-indigo-300/40 hover:text-indigo-100"
                          >
                            Detail
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
