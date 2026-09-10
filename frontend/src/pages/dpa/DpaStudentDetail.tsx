import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowLeft, FileDown, FileSignature, Flame, Loader2, Smile, StickyNote, TrendingUp, User } from 'lucide-react';
import ReferralModal, { referralTypeLabel, type ReferralRecord } from './ReferralModal';
import ChartShell from '../../components/ChartShell';
import api from '../../api';
import {
  BURNOUT_COLOR,
  burnoutCategoryMeta,
  categoryMeta,
  HAPPINESS_COLOR,
  interpretationMeta,
} from '../userDashboard/happinessShared';

interface StudentProfile {
  id: number;
  nama: string;
  username: string;
  nim: string;
  prodi: string;
  angkatan: string;
  semester: number;
  ipk: number;
  ips: number;
  sks: number;
  kehadiran: number;
  bio: string;
}

interface BurnoutData {
  score: number;
  category: string;
  risk: string;
  psychosomatic: number;
  model: string;
  timestamp: string;
  trend: { date: string; burnout: number }[];
}

interface HappinessData {
  index: number;
  category: string;
  timestamp: string;
  dimensions: { key: string; label: string; score: number }[];
  factors: { key: string; label: string; score: number }[];
  trend: { date: string; happiness_index: number }[];
}

interface CombinedData {
  burnout_cat: string;
  happiness_cat: string;
  label: string;
  priority: number;
  insight: string;
  recommendation: string;
}

interface Note {
  ID: number;
  Note: string;
  Status: string;
  Timestamp: string;
  CreatedAt: string;
}

interface DetailResponse {
  student: StudentProfile;
  burnout: BurnoutData | null;
  happiness: HappinessData | null;
  combined?: CombinedData;
  notes: Note[];
}

const NOTE_STATUS: { value: string; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'monitoring', label: 'Monitoring' },
  { value: 'perlu_tindak_lanjut', label: 'Perlu Tindak Lanjut' },
];

const priorityChip: Record<string, string> = {
  sedang: 'border-slate-300/25 bg-slate-500/15 text-slate-100',
  penting: 'border-amber-300/30 bg-amber-500/15 text-amber-100',
  mendesak: 'border-rose-300/30 bg-rose-500/15 text-rose-100',
};

const statusChip: Record<string, string> = {
  diproses: 'border-amber-300/30 bg-amber-500/10 text-amber-100',
  selesai: 'border-emerald-300/30 bg-emerald-500/10 text-emerald-100',
};

const noteStatusChip: Record<string, string> = {
  normal: 'border-emerald-300/30 bg-emerald-500/10 text-emerald-100',
  monitoring: 'border-amber-300/30 bg-amber-500/10 text-amber-100',
  perlu_tindak_lanjut: 'border-rose-300/30 bg-rose-500/10 text-rose-100',
};

export default function DpaStudentDetail() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [noteText, setNoteText] = useState('');
  const [noteStatus, setNoteStatus] = useState('monitoring');
  const [savingNote, setSavingNote] = useState(false);
  const [noteMessage, setNoteMessage] = useState('');
  const [downloading, setDownloading] = useState<string | null>(null);
  const [referrals, setReferrals] = useState<ReferralRecord[]>([]);
  const [referralOpen, setReferralOpen] = useState(false);

  const fetchReferrals = useCallback(async () => {
    if (!id) return;
    try {
      const res = await api.get(`/dpa/students/${id}/referrals`);
      setReferrals(res.data.referrals ?? []);
    } catch {
      // Daftar rujukan kosong tidak menggagalkan halaman.
    }
  }, [id]);

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/dpa/students/${id}`);
      setData(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Gagal memuat detail mahasiswa');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) {
      fetchDetail();
      fetchReferrals();
    }
  }, [id, fetchDetail, fetchReferrals]);

  const submitNote = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!noteText.trim()) return;
    setSavingNote(true);
    setNoteMessage('');
    try {
      await api.post(`/dpa/students/${id}/notes`, { note: noteText.trim(), status: noteStatus });
      setNoteText('');
      setNoteMessage('Catatan tersimpan.');
      fetchDetail();
    } catch (err: any) {
      setNoteMessage(err.response?.data?.error || 'Gagal menyimpan catatan');
    } finally {
      setSavingNote(false);
    }
  };

  const downloadReport = async (format: 'pdf' | 'txt') => {
    setDownloading(format);
    try {
      const res = await api.get(`/dpa/students/${id}/report?format=${format}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `wellbeing-report-${id}.${format}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      setNoteMessage('Gagal mengunduh laporan');
    } finally {
      setDownloading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-slate-400">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Memuat detail mahasiswa...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-lg border border-rose-300/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
        {error || 'Data tidak ditemukan.'}
        <Link to="/dpa/mahasiswa" className="ml-3 underline">Kembali ke daftar</Link>
      </div>
    );
  }

  const { student, burnout, happiness, combined, notes } = data;
  const burnoutMeta = burnoutCategoryMeta(burnout?.category);
  const happinessMeta = categoryMeta(happiness?.category);
  const statusMeta = interpretationMeta(combined?.label);
  const tooltipStyle = { background: '#1a1e2e', border: '1px solid #2a2e42', borderRadius: 8, fontSize: 11, color: '#e2e8f0' };

  const academicRows: [string, string][] = [
    ['NIM', student.nim || '-'],
    ['Program Studi', student.prodi || '-'],
    ['Angkatan', student.angkatan || '-'],
    ['Semester', student.semester ? String(student.semester) : '-'],
    ['IPK', student.ipk ? student.ipk.toFixed(2) : '-'],
    ['IPS', student.ips ? student.ips.toFixed(2) : '-'],
    ['SKS', student.sks ? String(student.sks) : '-'],
    ['Kehadiran', student.kehadiran ? `${student.kehadiran.toFixed(1)}%` : '-'],
  ];

  return (
    <div className="flex flex-col gap-5">
      <header className="rounded-lg border border-white/10 bg-slate-950 p-5 shadow-xl shadow-black/20">
        <Link to="/dpa/mahasiswa" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 transition hover:text-slate-200">
          <ArrowLeft className="h-3.5 w-3.5" /> Kembali ke daftar mahasiswa
        </Link>
        <div className="mt-3 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-4">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-indigo-400/10 text-xl font-bold text-indigo-100">
              {(student.nama || 'M').charAt(0).toUpperCase()}
            </span>
            <div>
              <h1 className="text-2xl font-semibold text-white">{student.nama}</h1>
              <p className="mt-1 text-sm text-slate-400">
                {student.nim || student.username} · {student.prodi || 'Prodi belum diisi'}{student.semester ? ` · Semester ${student.semester}` : ''}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {combined && (
              <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${statusMeta.chip}`}>
                <TrendingUp className="h-3.5 w-3.5" /> {combined.label}
              </span>
            )}
            <button
              onClick={() => setReferralOpen(true)}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-indigo-400 px-4 text-sm font-semibold text-slate-950 transition hover:bg-indigo-300"
            >
              <FileSignature className="h-4 w-4" />
              Buat Rujukan
            </button>
            <button
              onClick={() => downloadReport('pdf')}
              disabled={downloading !== null}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.07] disabled:opacity-60"
            >
              {downloading === 'pdf' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
              Laporan PDF
            </button>
            <button
              onClick={() => downloadReport('txt')}
              disabled={downloading !== null}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.07] disabled:opacity-60"
            >
              {downloading === 'txt' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
              Laporan TXT
            </button>
          </div>
        </div>
      </header>

      {/* Profil Akademik */}
      <section className="rounded-lg border border-white/10 bg-slate-950 p-5 shadow-xl shadow-black/10">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <User className="h-4 w-4 text-cyan-200" />
          Academic Profile
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          {academicRows.map(([label, value]) => (
            <div key={label} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
              <p className="mt-1 text-sm font-semibold text-slate-100">{value}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Burnout + Happiness */}
      <section className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-lg border border-white/10 bg-slate-950 p-5 shadow-xl shadow-black/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <Flame className="h-4 w-4" style={{ color: BURNOUT_COLOR }} /> Burnout
            </div>
            {burnout && <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${burnoutMeta.chip}`}>{burnout.category}</span>}
          </div>
          {burnout ? (
            <>
              <p className="mt-4 text-4xl font-bold text-white">{burnout.score.toFixed(1)}<span className="ml-1.5 text-sm font-medium text-slate-500">/10</span></p>
              <p className="mt-1 text-xs text-slate-500">
                Psikosomatik {burnout.psychosomatic.toFixed(1)}/10 · Model {burnout.model}
              </p>
              {burnout.trend.length > 0 && (
                <div className="mt-4">
                  <ChartShell height={190}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={burnout.trend} margin={{ top: 4, right: 8, bottom: 0, left: -22 }}>
                        <CartesianGrid stroke="#1e2130" strokeDasharray="3 3" />
                        <XAxis dataKey="date" tick={{ fill: '#8890a4', fontSize: 10 }} tickLine={false} axisLine={{ stroke: '#1e2130' }} />
                        <YAxis domain={[0, 10]} tick={{ fill: '#8890a4', fontSize: 10 }} tickLine={false} axisLine={{ stroke: '#1e2130' }} />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Area type="monotone" dataKey="burnout" name="Burnout" stroke={BURNOUT_COLOR} fill={BURNOUT_COLOR} fillOpacity={0.15} strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </ChartShell>
                </div>
              )}
            </>
          ) : (
            <p className="py-10 text-center text-sm text-slate-500">Belum ada assessment burnout.</p>
          )}
        </div>

        <div className="rounded-lg border border-white/10 bg-slate-950 p-5 shadow-xl shadow-black/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <Smile className="h-4 w-4" style={{ color: HAPPINESS_COLOR }} /> Happiness
            </div>
            {happiness && <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${happinessMeta.chip}`}>{happiness.category}</span>}
          </div>
          {happiness ? (
            <>
              <p className="mt-4 text-4xl font-bold text-white">{Math.round(happiness.index)}<span className="ml-1.5 text-sm font-medium text-slate-500">/100</span></p>
              <div className="mt-4 space-y-2">
                {happiness.dimensions.map((dim) => (
                  <div key={dim.key}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-300">{dim.label}</span>
                      <span className="text-slate-400">{Math.round(dim.score)}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-800">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(100, dim.score)}%`, background: HAPPINESS_COLOR }} />
                    </div>
                  </div>
                ))}
              </div>
              {happiness.trend.length > 1 && (
                <div className="mt-4">
                  <ChartShell height={150}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={happiness.trend} margin={{ top: 4, right: 8, bottom: 0, left: -22 }}>
                        <CartesianGrid stroke="#1e2130" strokeDasharray="3 3" />
                        <XAxis dataKey="date" tick={{ fill: '#8890a4', fontSize: 10 }} tickLine={false} axisLine={{ stroke: '#1e2130' }} />
                        <YAxis domain={[0, 100]} tick={{ fill: '#8890a4', fontSize: 10 }} tickLine={false} axisLine={{ stroke: '#1e2130' }} />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Area type="monotone" dataKey="happiness_index" name="Happiness" stroke={HAPPINESS_COLOR} fill={HAPPINESS_COLOR} fillOpacity={0.15} strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </ChartShell>
                </div>
              )}
            </>
          ) : (
            <p className="py-10 text-center text-sm text-slate-500">Belum ada assessment happiness.</p>
          )}
        </div>
      </section>

      {/* Combined */}
      {combined && (
        <section className="rounded-lg border border-white/10 bg-slate-950 p-5 shadow-xl shadow-black/10">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <TrendingUp className="h-4 w-4 text-cyan-200" /> Combined Analytics — Burnout vs Happiness
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-300">{combined.insight}</p>
          <div className="mt-3 rounded-lg border border-teal-300/20 bg-teal-300/10 px-4 py-3 text-sm leading-6 text-teal-100">
            <span className="font-semibold">Rekomendasi akademik: </span>{combined.recommendation}
          </div>
        </section>
      )}

      {/* Rujukan */}
      <section className="rounded-lg border border-white/10 bg-slate-950 p-5 shadow-xl shadow-black/10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <FileSignature className="h-4 w-4 text-indigo-200" /> Riwayat Rujukan
          </div>
          <button
            onClick={() => setReferralOpen(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-slate-200 transition hover:border-indigo-300/40 hover:text-indigo-100"
          >
            <FileSignature className="h-3.5 w-3.5" />
            Rujukan baru
          </button>
        </div>
        <div className="mt-4 space-y-2">
          {referrals.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-500">Belum ada rujukan untuk mahasiswa ini.</p>
          ) : (
            referrals.map((referral) => (
              <div key={referral.id} className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-slate-100">{referral.type_label || referralTypeLabel(referral.referral_type)}</span>
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${priorityChip[referral.priority] || 'border-white/10 bg-white/[0.04] text-slate-300'}`}>
                      {referral.priority}
                    </span>
                  </div>
                  <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase ${statusChip[referral.status] || 'border-white/10 bg-white/[0.04] text-slate-300'}`}>
                    {referral.status}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-300">{referral.reason}</p>
                {referral.recommendation && (
                  <p className="mt-1.5 text-xs leading-5 text-slate-500">Tindak lanjut: {referral.recommendation}</p>
                )}
                <p className="mt-1.5 text-[10px] text-slate-600">
                  {new Date(referral.timestamp).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  {referral.burnout_score ? ` · snapshot burnout ${referral.burnout_score.toFixed(1)}/10` : ''}
                  {referral.happiness_index ? ` · HI ${Math.round(referral.happiness_index)}` : ''}
                </p>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Monitoring & catatan */}
      <section className="rounded-lg border border-white/10 bg-slate-950 p-5 shadow-xl shadow-black/10">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <StickyNote className="h-4 w-4 text-amber-200" /> Monitoring & Catatan DPA
        </div>

        <form onSubmit={submitNote} className="mt-4 flex flex-col gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-4 sm:flex-row sm:items-start">
          <textarea
            value={noteText}
            onChange={(event) => setNoteText(event.target.value)}
            rows={2}
            placeholder="Tulis catatan monitoring akademik..."
            className="min-h-[44px] flex-1 resize-none rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600 focus:border-indigo-300/50"
          />
          <div className="flex gap-2 sm:flex-col">
            <select
              value={noteStatus}
              onChange={(event) => setNoteStatus(event.target.value)}
              className="h-10 rounded-md border border-white/10 bg-slate-900 px-2 text-xs text-white outline-none focus:border-indigo-300/50"
            >
              {NOTE_STATUS.map((status) => (
                <option key={status.value} value={status.value}>{status.label}</option>
              ))}
            </select>
            <button
              type="submit"
              disabled={savingNote || !noteText.trim()}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-indigo-400 px-4 text-sm font-semibold text-slate-950 transition hover:bg-indigo-300 disabled:opacity-60"
            >
              {savingNote ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Simpan
            </button>
          </div>
        </form>
        {noteMessage && <p className="mt-2 text-xs text-slate-400">{noteMessage}</p>}

        <div className="mt-4 space-y-2">
          {notes.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-500">Belum ada catatan untuk mahasiswa ini.</p>
          ) : (
            notes.map((note) => (
              <div key={note.ID} className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase ${noteStatusChip[note.Status] || 'border-white/10 bg-white/[0.04] text-slate-300'}`}>
                    {(note.Status || 'normal').replace(/_/g, ' ')}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {new Date(note.CreatedAt || note.Timestamp).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-300">{note.Note}</p>
              </div>
            ))
          )}
        </div>
      </section>

      {referralOpen && (
        <ReferralModal
          studentId={id!}
          studentName={student.nama}
          onClose={() => setReferralOpen(false)}
          onCreated={() => {
            setReferralOpen(false);
            fetchReferrals();
          }}
        />
      )}
    </div>
  );
}
