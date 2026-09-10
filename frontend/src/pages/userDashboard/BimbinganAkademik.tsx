import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock3,
  FileText,
  GraduationCap,
  Loader2,
  NotebookPen,
  Plus,
  X,
} from 'lucide-react';
import api from '../../api';

interface BimbinganSession {
  id: number;
  topic: string;
  notes: string;
  ipk: number;
  ips: number;
  sks: number;
  kehadiran: number;
  keluhan: string;
  status: string; // pending | verified | rejected
  recorded_by: string; // student | dpa
  timestamp: string;
}

interface BimbinganReport {
  id: number;
  semester: string;
  exam_type: string; // UTS | UAS
  session_count: number;
  threshold: number;
  status: string; // diproses | selesai | ditolak
  staff_note: string;
  submitted_at: string;
  processed_at: string | null;
}

interface BimbinganData {
  semester: string;
  min_uts: number;
  min_uas: number;
  dpa: { id: number; nama: string } | null;
  profile: { ipk: number; ips: number; sks: number; kehadiran: number } | null;
  verified_count: number;
  pending_count: number;
  uts_eligible: boolean;
  uas_eligible: boolean;
  sessions: BimbinganSession[];
  reports: BimbinganReport[];
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function statusChip(status: string): string {
  switch (status) {
    case 'verified':
      return 'border-emerald-300/30 bg-emerald-400/10 text-emerald-200';
    case 'rejected':
      return 'border-rose-300/30 bg-rose-400/10 text-rose-200';
    case 'pending':
      return 'border-amber-300/30 bg-amber-400/10 text-amber-100';
    case 'selesai':
      return 'border-emerald-300/30 bg-emerald-400/10 text-emerald-200';
    case 'ditolak':
      return 'border-rose-300/30 bg-rose-400/10 text-rose-200';
    default:
      return 'border-sky-300/30 bg-sky-400/10 text-sky-100';
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'verified':
      return 'Terverifikasi';
    case 'rejected':
      return 'Ditolak';
    case 'pending':
      return 'Menunggu konfirmasi DPA';
    case 'selesai':
      return 'Selesai';
    case 'ditolak':
      return 'Ditolak staf';
    default:
      return 'Diproses';
  }
}

export default function BimbinganAkademik() {
  const [data, setData] = useState<BimbinganData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [topic, setTopic] = useState('');
  const [notes, setNotes] = useState('');
  const [ipk, setIpk] = useState('');
  const [ips, setIps] = useState('');
  const [sks, setSks] = useState('');
  const [kehadiran, setKehadiran] = useState('');
  const [keluhan, setKeluhan] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const openModal = () => {
    // Isi otomatis dari profil akademik terkini; kosongkan catatan sesi.
    const profile = data?.profile;
    setIpk(profile && profile.ipk > 0 ? String(profile.ipk) : '');
    setIps(profile && profile.ips > 0 ? String(profile.ips) : '');
    setSks(profile && profile.sks > 0 ? String(profile.sks) : '');
    setKehadiran(profile && profile.kehadiran > 0 ? String(profile.kehadiran) : '');
    setTopic('');
    setNotes('');
    setKeluhan('');
    setModalOpen(true);
  };

  const fetchData = useCallback(async () => {
    try {
      const res = await api.get('/student/bimbingan');
      setData(res.data);
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Data bimbingan tidak dapat dimuat.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (modalOpen) {
      document.body.style.overflow = 'hidden';
      scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [modalOpen]);

  const progressCards = useMemo(() => {
    if (!data) return [];
    const cards = [
      {
        label: 'Syarat UTS',
        exam: 'UTS',
        min: data.min_uts,
        count: data.verified_count,
        eligible: data.uts_eligible,
        hint: 'Sesi bimbingan terverifikasi',
        icon: BookOpen,
      },
      {
        label: 'Syarat UAS',
        exam: 'UAS',
        min: data.min_uas,
        count: data.verified_count,
        eligible: data.uas_eligible,
        hint: 'Sesi bimbingan terverifikasi',
        icon: FileText,
      },
    ];
    return cards;
  }, [data]);

  const submitSession = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!topic.trim() || submitting) return;
    const ipkValue = ipk.trim() === '' ? 0 : Number(ipk);
    const ipsValue = ips.trim() === '' ? 0 : Number(ips);
    const sksValue = sks.trim() === '' ? 0 : Number(sks);
    const kehadiranValue = kehadiran.trim() === '' ? 0 : Number(kehadiran);
    if (
      Number.isNaN(ipkValue) || ipkValue < 0 || ipkValue > 4 ||
      Number.isNaN(ipsValue) || ipsValue < 0 || ipsValue > 4 ||
      Number.isNaN(sksValue) || sksValue < 0 ||
      Number.isNaN(kehadiranValue) || kehadiranValue < 0 || kehadiranValue > 100
    ) {
      setError('IPK/IPS 0–4, SKS ≥ 0, kehadiran 0–100%.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/student/bimbingan', {
        topic: topic.trim(),
        notes: notes.trim(),
        ipk: ipkValue,
        ips: ipsValue,
        sks: sksValue,
        kehadiran: kehadiranValue,
        keluhan: keluhan.trim(),
      });
      setTopic('');
      setNotes('');
      setIpk('');
      setIps('');
      setSks('');
      setKehadiran('');
      setKeluhan('');
      setModalOpen(false);
      await fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Sesi gagal dicatat. Coba lagi.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center text-sm text-slate-400">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Memuat data bimbingan...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="rounded-2xl border border-white/10 bg-slate-950/70 p-5 shadow-xl shadow-black/10">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-indigo-300/25 bg-indigo-300/10 px-3 py-1 text-xs font-semibold text-indigo-100">
          <NotebookPen className="h-3.5 w-3.5" />
          Bimbingan Akademik · {data?.semester}
        </div>
        <h1 className="text-xl font-semibold text-white sm:text-2xl">Syarat Ujian: Sesi Bimbingan</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
          Catat setiap sesi konsultasi dengan DPA pembimbing Anda. Sesi yang dikonfirmasi DPA dihitung sebagai syarat mengikuti UTS/UAS, dan DPA akan mengirimkan laporan ke staf kampus saat syarat terpenuhi.
        </p>
        {data?.dpa ? (
          <p className="mt-3 flex items-center gap-2 text-xs text-slate-400">
            <GraduationCap className="h-4 w-4 text-indigo-300" />
            DPA pembimbing: <span className="font-semibold text-slate-200">{data.dpa.nama}</span>
            <span className="text-slate-600">·</span>
            {data.pending_count} sesi menunggu konfirmasi
          </p>
        ) : (
          <Link
            to="/user/dpa"
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"
          >
            Pilih DPA pembimbing lebih dulu <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </header>

      {error && (
        <div className="flex items-center justify-between rounded-lg border border-rose-300/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {error}
          <button onClick={() => { setError(''); fetchData(); }} className="text-xs font-semibold underline">Coba lagi</button>
        </div>
      )}

      {/* Kartu progres syarat UTS/UAS */}
      <section className="grid gap-4 sm:grid-cols-2">
        {progressCards.map((card) => {
          const percent = card.min > 0 ? Math.min(Math.round((card.count / card.min) * 100), 100) : 0;
          const Icon = card.icon;
          return (
            <div key={card.exam} className="rounded-2xl border border-white/10 bg-slate-950/70 p-5 shadow-xl shadow-black/10">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  <Icon className="h-4 w-4 text-indigo-300" />
                  {card.label}
                </div>
                {card.eligible ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300/30 bg-emerald-400/10 px-2.5 py-0.5 text-[10px] font-bold text-emerald-200">
                    <CheckCircle2 className="h-3 w-3" /> TERPENUHI
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full border border-slate-300/20 bg-white/[0.04] px-2.5 py-0.5 text-[10px] font-bold text-slate-300">
                    <Clock3 className="h-3 w-3" /> BELUM
                  </span>
                )}
              </div>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-3xl font-bold text-white">{card.count}</span>
                <span className="text-sm text-slate-500">/ {card.min} sesi minimum</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className={`h-full rounded-full transition-all ${card.eligible ? 'bg-emerald-400' : 'bg-indigo-400'}`}
                  style={{ width: `${percent}%` }}
                />
              </div>
              <p className="mt-2 text-[11px] text-slate-500">{card.hint} · {percent}% tercapai</p>
            </div>
          );
        })}
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        {/* Daftar sesi bimbingan */}
        <div className="rounded-2xl border border-white/10 bg-slate-950/70 shadow-xl shadow-black/10">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-white">Riwayat Sesi Bimbingan</h2>
              <p className="mt-0.5 text-xs text-slate-500">Sesi menunggu konfirmasi DPA belum dihitung sebagai syarat.</p>
            </div>
            {data?.dpa && (
              <button
                type="button"
                onClick={openModal}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"
              >
                <Plus className="h-4 w-4" /> Catat Sesi
              </button>
            )}
          </div>
          <div className="divide-y divide-white/[0.06] px-5">
            {!data?.sessions?.length ? (
              <p className="py-8 text-center text-sm text-slate-500">Belum ada sesi bimbingan pada semester ini.</p>
            ) : (
              data.sessions.map((session) => (
                <article key={session.id} className="py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-slate-100">{session.topic}</h3>
                      <p className="mt-1 text-xs text-slate-500">
                        {formatDate(session.timestamp)} · dicatat oleh {session.recorded_by === 'dpa' ? 'DPA' : 'Anda'}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${statusChip(session.status)}`}>
                      {statusLabel(session.status)}
                    </span>
                  </div>
                  {session.notes && <p className="mt-2 text-sm leading-6 text-slate-400">{session.notes}</p>}
                  {session.topic && (session.ipk > 0 || session.sks > 0 || session.keluhan) && (
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      {session.ipk > 0 && (
                        <span className="rounded-md border border-indigo-300/20 bg-indigo-400/10 px-2 py-0.5 text-[10px] font-semibold text-indigo-200">
                          IPK {session.ipk.toFixed(2)}
                        </span>
                      )}
                      {session.ips > 0 && (
                        <span className="rounded-md border border-indigo-300/20 bg-indigo-400/10 px-2 py-0.5 text-[10px] font-semibold text-indigo-200">
                          IPS {session.ips.toFixed(2)}
                        </span>
                      )}
                      {session.sks > 0 && (
                        <span className="rounded-md border border-indigo-300/20 bg-indigo-400/10 px-2 py-0.5 text-[10px] font-semibold text-indigo-200">
                          SKS {session.sks}
                        </span>
                      )}
                      {session.kehadiran > 0 && (
                        <span className="rounded-md border border-indigo-300/20 bg-indigo-400/10 px-2 py-0.5 text-[10px] font-semibold text-indigo-200">
                          Kehadiran {session.kehadiran}%
                        </span>
                      )}
                    </div>
                  )}
                  {session.keluhan && (
                    <p className="mt-2 rounded-lg border border-amber-300/20 bg-amber-400/[0.06] px-3 py-2 text-xs leading-5 text-amber-100/90">
                      <span className="font-semibold text-amber-200">Keluhan:</span> {session.keluhan}
                    </p>
                  )}
                </article>
              ))
            )}
          </div>
        </div>

        {/* Laporan yang dikirim DPA */}
        <div className="rounded-2xl border border-white/10 bg-slate-950/70 shadow-xl shadow-black/10">
          <div className="border-b border-white/10 px-5 py-4">
            <h2 className="text-sm font-semibold text-white">Laporan ke Staf Kampus</h2>
            <p className="mt-0.5 text-xs text-slate-500">Status pemrosesan laporan syarat ujian oleh staf.</p>
          </div>
          <div className="divide-y divide-white/[0.06] px-5">
            {!data?.reports?.length ? (
              <p className="py-8 text-center text-sm text-slate-500">Belum ada laporan yang dikirim DPA.</p>
            ) : (
              data.reports.map((report) => (
                <article key={report.id} className="py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-slate-100">Syarat {report.exam_type} · {report.semester}</h3>
                      <p className="mt-1 text-xs text-slate-500">
                        {report.session_count}/{report.threshold} sesi terverifikasi · dikirim {formatDate(report.submitted_at)}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${statusChip(report.status)}`}>
                      {statusLabel(report.status)}
                    </span>
                  </div>
                  {report.staff_note && (
                    <p className="mt-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs leading-5 text-slate-400">
                      <span className="font-semibold text-slate-300">Catatan staf:</span> {report.staff_note}
                    </p>
                  )}
                </article>
              ))
            )}
          </div>
        </div>
      </section>

      {modalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm" onMouseDown={() => setModalOpen(false)}>
          <div
            ref={scrollRef}
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/10 bg-slate-950 p-5 shadow-2xl shadow-black/50"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                  <NotebookPen className="h-4 w-4" /> Catat Sesi Bimbingan
                </h3>
                <p className="mt-1 text-xs text-slate-500">Sesi akan menunggu konfirmasi DPA sebelum dihitung sebagai syarat ujian.</p>
              </div>
              <button type="button" onClick={() => setModalOpen(false)} className="rounded-lg p-1.5 text-slate-500 hover:bg-white/10 hover:text-slate-200" aria-label="Tutup">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={submitSession} className="mt-4 space-y-3">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-300">Topik Bimbingan *</label>
                <input
                  value={topic}
                  onChange={(event) => setTopic(event.target.value)}
                  placeholder="Mis. Konsultasi tugas akhir / persiapan UTS"
                  maxLength={255}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-emerald-300/50"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-300">Catatan</label>
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={4}
                  placeholder="Ringkasan pembahasan sesi..."
                  className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-emerald-300/50"
                />
              </div>

              <div className="rounded-xl border border-indigo-300/20 bg-indigo-400/[0.06] p-3.5">
                <p className="text-xs font-semibold text-indigo-200">Data akademik terkini</p>
                <p className="mt-0.5 text-[11px] text-slate-500">Diisi otomatis dari profil Anda — perbarui agar DPA melihat angka terbaru.</p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-300">IPK terkini</label>
                    <input
                      value={ipk}
                      onChange={(event) => setIpk(event.target.value)}
                      type="number" min={0} max={4} step={0.01}
                      placeholder="2.75"
                      className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-emerald-300/50"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-300">IPS</label>
                    <input
                      value={ips}
                      onChange={(event) => setIps(event.target.value)}
                      type="number" min={0} max={4} step={0.01}
                      placeholder="2.80"
                      className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-emerald-300/50"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-300">SKS ditempuh</label>
                    <input
                      value={sks}
                      onChange={(event) => setSks(event.target.value)}
                      type="number" min={0} step={1}
                      placeholder="20"
                      className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-emerald-300/50"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-300">Kehadiran (%)</label>
                    <input
                      value={kehadiran}
                      onChange={(event) => setKehadiran(event.target.value)}
                      type="number" min={0} max={100} step={1}
                      placeholder="85"
                      className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-emerald-300/50"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-300">Keluhan / kendala</label>
                <textarea
                  value={keluhan}
                  onChange={(event) => setKeluhan(event.target.value)}
                  rows={3}
                  maxLength={1000}
                  placeholder="Ceritakan keluhan atau kendala belajar yang ingin Anda sampaikan ke DPA..."
                  className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-emerald-300/50"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setModalOpen(false)} className="rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.06]">
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting || !topic.trim()}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  Simpan Sesi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
