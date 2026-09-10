import { useEffect, useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  ClipboardList,
  Flame,
  GraduationCap,
  Heart,
  Loader2,
  Stethoscope,
  TrendingUp,
  TriangleAlert,
  UserRound,
  X,
} from 'lucide-react';
import StarRating from '../../components/StarRating';
import { burnoutCategoryMeta, categoryMeta } from '../userDashboard/happinessShared';
import api from '../../api';

interface ReferralSnapshot {
  nim?: string;
  prodi?: string;
  semester?: number;
  ipk?: number;
  ips?: number;
  sks?: number;
  kehadiran?: number;
  burnout_score?: number;
  burnout_category?: string;
  burnout_risk?: string;
  psychosomatic?: number;
  happiness_index?: number;
  happiness_category?: string;
  weakest_dimension?: string;
  weakest_score?: number;
  interpretation?: string;
}

export interface ReferralRecord {
  id: number;
  referral_type: string;
  type_label?: string;
  destination?: string;
  priority: string;
  reason: string;
  recommendation?: string;
  status: string;
  follow_up_date?: string | null;
  timestamp: string;
  burnout_score?: number;
  happiness_index?: number;
}

const REFERRAL_TYPES = [
  { value: 'konsultasi_akademik', label: 'Konsultasi Akademik', description: 'Evaluasi beban studi dan hambatan akademik bersama DPA.', Icon: GraduationCap },
  { value: 'unit_konseling', label: 'Unit Konseling', description: 'Dampingan profesional pendamping mahasiswa di kampus.', Icon: Stethoscope },
  { value: 'pembimbingan_khusus', label: 'Pembimbingan Khusus', description: 'Pendampingan belajar intensif untuk faktor akademik terlemah.', Icon: ClipboardList },
  { value: 'kaprodi', label: 'Kaprodi', description: 'Eskalasi ke ketua program studi untuk kebijakan akademik.', Icon: UserRound },
];

const PRIORITIES = [
  { value: 'sedang', label: 'Sedang', chip: 'border-slate-300/25 bg-slate-500/15 text-slate-100' },
  { value: 'penting', label: 'Penting', chip: 'border-amber-300/30 bg-amber-500/15 text-amber-100' },
  { value: 'mendesak', label: 'Mendesak', chip: 'border-rose-300/30 bg-rose-500/15 text-rose-100' },
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

export function referralTypeLabel(value: string): string {
  return REFERRAL_TYPES.find((type) => type.value === value)?.label || value;
}

export default function ReferralModal({
  studentId,
  studentName,
  onClose,
  onCreated,
}: {
  studentId: string | number;
  studentName: string;
  onClose: () => void;
  onCreated: (referral: ReferralRecord) => void;
}) {
  const [snapshot, setSnapshot] = useState<ReferralSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [referralType, setReferralType] = useState('konsultasi_akademik');
  const [priority, setPriority] = useState('sedang');
  const [destination, setDestination] = useState('');
  const [reason, setReason] = useState('');
  const [recommendation, setRecommendation] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // Ambil kondisi real-time saat modal dibuka.
    api
      .get(`/dpa/students/${studentId}`)
      .then((res) => {
        const detail = res.data;
        const snap: ReferralSnapshot = {};
        if (detail.student) {
          snap.nim = detail.student.nim;
          snap.prodi = detail.student.prodi;
          snap.semester = detail.student.semester;
          snap.ipk = detail.student.ipk;
          snap.ips = detail.student.ips;
          snap.sks = detail.student.sks;
          snap.kehadiran = detail.student.kehadiran;
        }
        if (detail.burnout) {
          snap.burnout_score = detail.burnout.score;
          snap.burnout_category = detail.burnout.category;
          snap.burnout_risk = detail.burnout.risk;
          snap.psychosomatic = detail.burnout.psychosomatic;
        }
        if (detail.happiness) {
          snap.happiness_index = detail.happiness.index;
          snap.happiness_category = detail.happiness.category;
          const weakest = [...(detail.happiness.dimensions ?? [])].sort((a: any, b: any) => a.score - b.score)[0];
          if (weakest) {
            snap.weakest_dimension = weakest.label;
            snap.weakest_score = weakest.score;
          }
        }
        if (detail.combined) snap.interpretation = detail.combined.label;
        setSnapshot(snap);
      })
      .catch(() => setError('Kondisi real-time mahasiswa tidak dapat dimuat.'))
      .finally(() => setLoading(false));
  }, [studentId]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!reason.trim()) {
      setError('Alasan rujukan wajib diisi.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await api.post(`/dpa/students/${studentId}/referrals`, {
        referral_type: referralType,
        priority,
        destination: destination.trim(),
        reason: reason.trim(),
        recommendation: recommendation.trim(),
        follow_up_date: followUpDate || undefined,
      });
      onCreated(res.data.referral);
      setSuccess(true);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Rujukan gagal disimpan.');
    } finally {
      setSaving(false);
    }
  };

  const burnoutMeta = burnoutCategoryMeta(snapshot?.burnout_category);
  const happinessMeta = categoryMeta(snapshot?.happiness_category);

  return (
    <div className="fixed inset-0 z-[1000] flex items-start justify-center overflow-y-auto bg-black/70 px-4 py-8 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-3xl overflow-hidden rounded-2xl border border-white/10 bg-slate-950 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-white/10 bg-gradient-to-r from-indigo-500/15 to-transparent px-6 py-5">
          <div>
            <div className="mb-1.5 inline-flex items-center gap-2 rounded-full border border-indigo-300/25 bg-indigo-400/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-indigo-100">
              <ClipboardList className="h-3 w-3" />
              Rujukan Akademik
            </div>
            <h2 className="text-xl font-semibold text-white">Rujukan untuk {studentName}</h2>
            <p className="mt-1 text-xs text-slate-400">
              Disusun berdasarkan kondisi terkini mahasiswa — snapshot kondisi ikut tersimpan pada rujukan.
            </p>
          </div>
          <button onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-white/10 text-slate-400 hover:text-white" aria-label="Tutup">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-6 py-5">
          {success ? (
            <div className="flex flex-col items-center py-10 text-center">
              <span className="grid h-16 w-16 place-items-center rounded-full bg-emerald-500/15">
                <CheckCircle2 className="h-8 w-8 text-emerald-300" />
              </span>
              <h3 className="mt-4 text-lg font-semibold text-white">Rujukan terkirim</h3>
              <p className="mt-2 max-w-md text-sm leading-6 text-slate-400">
                Mahasiswa menerima notifikasi rujukan {referralTypeLabel(referralType)}. Snapshot kondisi real-time tersimpan pada arsip rujukan, dan mahasiswa dapat memperbarui statusnya.
              </p>
              <button onClick={onClose} className="mt-6 inline-flex h-10 items-center rounded-lg bg-indigo-400 px-5 text-sm font-semibold text-slate-950 transition hover:bg-indigo-300">
                Selesai
              </button>
            </div>
          ) : loading ? (
            <div className="flex h-48 items-center justify-center text-sm text-slate-400">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Memuat kondisi real-time...
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-5">
              {/* Kondisi real-time */}
              <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
                  <TrendingUp className="h-3.5 w-3.5" />
                  Kondisi real-time
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className={`rounded-lg border p-3 ${burnoutMeta.chip}`}>
                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider">
                      <Flame className="h-3 w-3" /> Burnout
                    </div>
                    <p className="mt-1.5 text-2xl font-bold">{snapshot?.burnout_score !== undefined ? snapshot.burnout_score.toFixed(1) : '-'}</p>
                    <p className="text-[10px] font-semibold">{snapshot?.burnout_category || 'belum ada data'}</p>
                  </div>
                  <div className={`rounded-lg border p-3 ${happinessMeta.chip}`}>
                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider">
                      <Heart className="h-3 w-3" /> Happiness
                    </div>
                    <p className="mt-1.5 text-2xl font-bold">{snapshot?.happiness_index !== undefined ? Math.round(snapshot.happiness_index) : '-'}</p>
                    <p className="text-[10px] font-semibold">{snapshot?.happiness_category || 'belum ada data'}</p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      <GraduationCap className="h-3 w-3" /> Akademik
                    </div>
                    <p className="mt-1.5 text-xs text-slate-200">IPK {snapshot?.ipk ? snapshot.ipk.toFixed(2) : '-'} · Smt {snapshot?.semester || '-'}</p>
                    <p className="mt-0.5 text-[10px] text-slate-500">
                      {snapshot?.weakest_dimension ? `Faktor terlemah: ${snapshot.weakest_dimension} (${Math.round(snapshot.weakest_score ?? 0)})` : 'NIM/Prodi: ' + (snapshot?.nim || '-') + ' / ' + (snapshot?.prodi || '-')}
                    </p>
                  </div>
                </div>
                {snapshot?.interpretation && (
                  <p className="mt-3 flex items-center gap-2 text-xs text-slate-300">
                    <TriangleAlert className="h-3.5 w-3.5 text-amber-300" />
                    Interpretasi gabungan: <span className="font-semibold text-white">{snapshot.interpretation}</span>
                  </p>
                )}
              </section>

              {/* Jenis rujukan */}
              <section>
                <p className="mb-2 text-xs font-semibold text-slate-300">Jenis rujukan</p>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {REFERRAL_TYPES.map((type) => {
                    const active = referralType === type.value;
                    const Icon = type.Icon;
                    return (
                      <button
                        key={type.value}
                        type="button"
                        onClick={() => setReferralType(type.value)}
                        className={`flex items-start gap-3 rounded-xl border p-3.5 text-left transition ${active ? 'border-indigo-300/50 bg-indigo-400/10' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'}`}
                      >
                        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${active ? 'bg-indigo-400/20 text-indigo-100' : 'bg-white/[0.06] text-slate-400'}`}>
                          <Icon className="h-4.5 w-4.5" />
                        </span>
                        <span>
                          <span className={`block text-sm font-semibold ${active ? 'text-indigo-50' : 'text-slate-200'}`}>{type.label}</span>
                          <span className="mt-0.5 block text-[11px] leading-4 text-slate-500">{type.description}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Prioritas */}
              <section className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="mb-2 text-xs font-semibold text-slate-300">Prioritas</p>
                  <div className="flex gap-2">
                    {PRIORITIES.map((item) => (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => setPriority(item.value)}
                        className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold transition ${priority === item.value ? item.chip : 'border-white/10 bg-white/[0.03] text-slate-400 hover:text-slate-200'}`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
                <label className="block">
                  <span className="text-xs font-semibold text-slate-300">Tanggal tindak lanjut (opsional)</span>
                  <div className="relative">
                    <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                    <input
                      type="date"
                      value={followUpDate}
                      onChange={(event) => setFollowUpDate(event.target.value)}
                      className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-white/[0.04] pl-9 pr-3 text-sm text-white outline-none focus:border-indigo-300/50"
                    />
                  </div>
                </label>
              </section>

              <label className="block">
                <span className="text-xs font-semibold text-slate-300">Tujuan rujukan (opsional)</span>
                <input
                  value={destination}
                  onChange={(event) => setDestination(event.target.value)}
                  placeholder="cth. Unit Konseling Gedung B lantai 2 / konselor pendamping"
                  className="mt-1 h-11 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-indigo-300/50"
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-slate-300">Alasan rujukan (berdasarkan kondisi di atas)</span>
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  rows={3}
                  placeholder="cth. Burnout tinggi disertai happiness rendah dua periode berturut-turut; kehadiran menurun ke 68%..."
                  className="mt-1 w-full resize-none rounded-lg border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-indigo-300/50"
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-slate-300">Rekomendasi tindak lanjut (opsional)</span>
                <textarea
                  value={recommendation}
                  onChange={(event) => setRecommendation(event.target.value)}
                  rows={2}
                  placeholder="cth. Konsultasi mingguan selama 4 pekan, evaluasi beban SKS semester depan."
                  className="mt-1 w-full resize-none rounded-lg border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-indigo-300/50"
                />
              </label>

              {error && <div className="rounded-lg border border-rose-300/25 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-100">{error}</div>}

              <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-4">
                <p className="text-[10px] leading-4 text-slate-500">Mahasiswa menerima notifikasi rujukan ini dan dapat memperbarui statusnya.</p>
                <div className="flex gap-2">
                  <button type="button" onClick={onClose} className="inline-flex h-10 items-center rounded-lg border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.07]">
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={saving || !reason.trim()}
                    className="inline-flex h-10 items-center gap-2 rounded-lg bg-indigo-400 px-5 text-sm font-semibold text-slate-950 transition hover:bg-indigo-300 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Kirim Rujukan
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
