import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Loader2,
  NotebookPen,
  Plus,
  Send,
  Users,
  X,
} from 'lucide-react';
import DpaPageHeader from '../../components/DpaPageHeader';
import api from '../../api';

interface BimbinganSession {
  id: number;
  student_id: number;
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
  student_id: number;
  semester: string;
  exam_type: string; // UTS | UAS
  session_count: number;
  threshold: number;
  status: string; // diproses | selesai | ditolak
  note: string;
  staff_note: string;
  submitted_at: string;
  processed_at: string | null;
}

interface StudentBimbingan {
  id: number;
  nama: string;
  nim: string;
  prodi: string;
  verified_count: number;
  pending_count: number;
  rejected_count: number;
  uts_eligible: boolean;
  uas_eligible: boolean;
  sessions: BimbinganSession[];
  reports: BimbinganReport[];
}

interface BimbinganResponse {
  semester: string;
  min_uts: number;
  min_uas: number;
  students: StudentBimbingan[];
}

interface SentReport {
  id: number;
  student_name: string;
  student_nim: string;
  semester: string;
  exam_type: string;
  session_count: number;
  threshold: number;
  status: string;
  note: string;
  staff_note: string;
  submitted_at: string;
  processed_at: string | null;
}

const INDIGO = '#818cf8';

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function sessionChip(status: string): string {
  switch (status) {
    case 'verified':
      return 'border-emerald-300/30 bg-emerald-400/10 text-emerald-200';
    case 'rejected':
      return 'border-rose-300/30 bg-rose-400/10 text-rose-200';
    default:
      return 'border-amber-300/30 bg-amber-400/10 text-amber-100';
  }
}

function reportChip(status: string): string {
  switch (status) {
    case 'selesai':
      return 'border-emerald-300/30 bg-emerald-400/10 text-emerald-200';
    case 'ditolak':
      return 'border-rose-300/30 bg-rose-400/10 text-rose-200';
    default:
      return 'border-sky-300/30 bg-sky-400/10 text-sky-100';
  }
}

export default function DpaBimbingan() {
  const [data, setData] = useState<BimbinganResponse | null>(null);
  const [sentReports, setSentReports] = useState<SentReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'sesi' | 'laporan'>('sesi');
  const [sessionModal, setSessionModal] = useState(false);
  const [sessionTopic, setSessionTopic] = useState('');
  const [sessionNotes, setSessionNotes] = useState('');
  const [reportModal, setReportModal] = useState(false);
  const [reportExam, setReportExam] = useState<'UTS' | 'UAS'>('UTS');
  const [reportNote, setReportNote] = useState('');
  const [busy, setBusy] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await api.get('/dpa/bimbingan');
      setData(res.data);
      setSelectedId((current) => current ?? res.data.students?.[0]?.id ?? null);
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Data bimbingan tidak dapat dimuat.');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchReports = useCallback(async () => {
    try {
      const res = await api.get('/dpa/bimbingan/reports');
      setSentReports(res.data.reports ?? []);
    } catch {
      // Daftar laporan gagal dimuat — tab tetap bisa dibuka dengan data kosong.
    }
  }, []);

  useEffect(() => {
    fetchData();
    fetchReports();
  }, [fetchData, fetchReports]);

  const selected = useMemo(
    () => data?.students?.find((student) => student.id === selectedId) ?? null,
    [data, selectedId],
  );

  const setSessionStatus = async (session: BimbinganSession, status: string) => {
    try {
      await api.patch(`/dpa/bimbingan/${session.id}/status`, { status });
      await fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Gagal memperbarui status sesi.');
    }
  };

  const submitSession = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected || !sessionTopic.trim() || busy) return;
    setBusy(true);
    try {
      await api.post('/dpa/bimbingan', {
        student_id: selected.id,
        topic: sessionTopic.trim(),
        notes: sessionNotes.trim(),
      });
      setSessionTopic('');
      setSessionNotes('');
      setSessionModal(false);
      await fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Sesi gagal dicatat.');
    } finally {
      setBusy(false);
    }
  };

  const submitReport = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected || busy) return;
    setBusy(true);
    try {
      await api.post('/dpa/bimbingan/report', {
        student_id: selected.id,
        exam_type: reportExam,
        note: reportNote.trim(),
      });
      setReportNote('');
      setReportModal(false);
      setActiveTab('laporan');
      await fetchData();
      await fetchReports();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Laporan gagal dikirim ke staf.');
    } finally {
      setBusy(false);
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
      <DpaPageHeader
        eyebrow="Bimbingan Akademik"
        title="Kontrol Syarat UTS/UAS"
        description="Verifikasi sesi bimbingan mahasiswa, pantau progres pemenuhan syarat ujian, dan kirim laporan ke staf kampus saat syarat terpenuhi."
        icon={ClipboardCheck}
        actions={
          selected ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSessionModal(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-indigo-300"
              >
                <Plus className="h-4 w-4" /> Catat Sesi
              </button>
              <button
                type="button"
                onClick={() => setReportModal(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-indigo-300/30 bg-indigo-400/10 px-4 py-2.5 text-sm font-semibold text-indigo-100 transition hover:bg-indigo-400/20"
              >
                <Send className="h-4 w-4" /> Kirim Laporan ke Staf
              </button>
            </div>
          ) : undefined
        }
      />

      {error && (
        <div className="flex items-center justify-between rounded-lg border border-rose-300/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {error}
          <button onClick={() => { setError(''); fetchData(); }} className="text-xs font-semibold underline">Coba lagi</button>
        </div>
      )}

      {!data?.students?.length ? (
        <div className="rounded-lg border border-white/10 bg-slate-950 p-10 text-center text-sm text-slate-400 shadow-xl shadow-black/10">
          Belum ada mahasiswa yang dipetakan ke Anda. Buka Mahasiswa Bimbingan untuk memetakan mahasiswa.
        </div>
      ) : (
        <>
          {/* Pemilih mahasiswa */}
          <section className="rounded-lg border border-white/10 bg-slate-950 p-4 shadow-xl shadow-black/10">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <Users className="h-4 w-4" style={{ color: INDIGO }} />
              Pilih Mahasiswa Bimbingan
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {data.students.map((student) => {
                const active = student.id === selectedId;
                const attended = student.uts_eligible || student.uas_eligible;
                return (
                  <button
                    key={student.id}
                    type="button"
                    onClick={() => setSelectedId(student.id)}
                    className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition ${active ? 'border-indigo-300/50 bg-indigo-400/15 text-white' : 'border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.06]'}`}
                  >
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-slate-700 text-[9px] font-bold text-white">
                      {student.nama?.charAt(0)?.toUpperCase() || '?'}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{student.nama}</span>
                      <span className="block text-[10px] text-slate-500">
                        {student.verified_count} sesi {attended ? '· syarat terpenuhi' : `· ${student.pending_count} menunggu`}
                      </span>
                    </span>
                    {attended && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-300" />}
                  </button>
                );
              })}
            </div>
          </section>

          <div className="flex items-center gap-2 border-b border-white/10">
            <button
              type="button"
              onClick={() => setActiveTab('sesi')}
              className={`inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition ${activeTab === 'sesi' ? 'border-indigo-400 text-white' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
            >
              <NotebookPen className="h-3.5 w-3.5" /> Sesi & Progres
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('laporan')}
              className={`inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition ${activeTab === 'laporan' ? 'border-indigo-400 text-white' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
            >
              <FileText className="h-3.5 w-3.5" /> Laporan Terkirim
              {sentReports.length > 0 && (
                <span className="rounded-full bg-indigo-400/20 px-1.5 py-0.5 text-[10px] font-bold text-indigo-200">{sentReports.length}</span>
              )}
            </button>
          </div>

          {activeTab === 'sesi' && selected ? (
            <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
              {/* Daftar sesi mahasiswa terpilih */}
              <div className="rounded-lg border border-white/10 bg-slate-950 shadow-xl shadow-black/10">
                <div className="border-b border-white/10 px-5 py-4">
                  <h2 className="text-sm font-semibold text-white">{selected.nama} — Sesi Bimbingan</h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Sesi dicatat mahasiswa menunggu konfirmasi Anda; hanya sesi terverifikasi yang memenuhi syarat ujian.
                  </p>
                </div>
                <div className="divide-y divide-white/[0.06] px-5">
                  {!selected.sessions?.length ? (
                    <p className="py-8 text-center text-sm text-slate-500">Belum ada sesi bimbingan semester ini.</p>
                  ) : (
                    selected.sessions.map((session) => (
                      <article key={session.id} className="py-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="text-sm font-semibold text-slate-100">{session.topic}</h3>
                            <p className="mt-1 text-xs text-slate-500">
                              {formatDate(session.timestamp)} · dicatat oleh {session.recorded_by === 'dpa' ? 'Anda' : 'mahasiswa'}
                            </p>
                          </div>
                          <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${sessionChip(session.status)}`}>
                            {session.status === 'verified' ? 'Terverifikasi' : session.status === 'rejected' ? 'Ditolak' : 'Menunggu'}
                          </span>
                        </div>
                        {session.notes && <p className="mt-2 text-sm leading-6 text-slate-400">{session.notes}</p>}
                        {session.recorded_by === 'student' && (
                          session.ipk > 0 || session.sks > 0 || session.keluhan ? (
                            <div className="mt-3 space-y-2">
                              <div className="flex flex-wrap items-center gap-1.5">
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
                                <span className="rounded-md border border-emerald-300/20 bg-emerald-400/[0.07] px-2 py-0.5 text-[10px] font-semibold text-emerald-200">
                                  Data terkini tersedia
                                </span>
                              </div>
                              {session.keluhan && (
                                <p className="rounded-lg border border-amber-300/20 bg-amber-400/[0.06] px-3 py-2 text-xs leading-5 text-amber-100/90">
                                  <span className="font-semibold text-amber-200">Keluhan mahasiswa:</span> {session.keluhan}
                                </p>
                              )}
                            </div>
                          ) : (
                            <p className="mt-2 rounded-lg border border-slate-300/15 bg-white/[0.03] px-3 py-2 text-[11px] leading-4 text-slate-500">
                              Mahasiswa belum mengisi data akademik (IPK/keluhan) bersama sesi ini.
                            </p>
                          )
                        )}
                        {session.status === 'pending' && (
                          <div className="mt-3 flex gap-2">
                            <button
                              type="button"
                              onClick={() => setSessionStatus(session, 'verified')}
                              disabled={busy}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-400 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:opacity-50"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" /> Setujui
                            </button>
                            <button
                              type="button"
                              onClick={() => setSessionStatus(session, 'rejected')}
                              disabled={busy}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300/30 bg-rose-400/10 px-3 py-1.5 text-xs font-semibold text-rose-200 transition hover:bg-rose-400/20 disabled:opacity-50"
                            >
                              <X className="h-3.5 w-3.5" /> Tolak
                            </button>
                          </div>
                        )}
                      </article>
                    ))
                  )}
                </div>
              </div>

              {/* Kartu progres syarat */}
              <aside className="rounded-lg border border-white/10 bg-slate-950 p-4 shadow-xl shadow-black/10">
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  <BarChart3 className="h-4 w-4" style={{ color: INDIGO }} />
                  Progres Syarat — {data.semester}
                </div>
                <div className="mt-4 space-y-4">
                  {[
                    { label: 'UTS', min: data.min_uts, count: selected.verified_count, eligible: selected.uts_eligible },
                    { label: 'UAS', min: data.min_uas, count: selected.verified_count, eligible: selected.uas_eligible },
                  ].map((progress) => {
                    const percent = progress.min > 0 ? Math.min(Math.round((progress.count / progress.min) * 100), 100) : 0;
                    return (
                      <div key={progress.label} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-200">Syarat {progress.label}</span>
                          {progress.eligible ? (
                            <span className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-2 py-0.5 text-[9px] font-bold text-emerald-200">TERPENUHI</span>
                          ) : (
                            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[9px] font-bold text-slate-400">BELUM</span>
                          )}
                        </div>
                        <div className="mt-2.5 flex items-baseline gap-1">
                          <span className="text-2xl font-bold text-white">{progress.count}</span>
                          <span className="text-xs text-slate-500">/ {progress.min} sesi</span>
                        </div>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                          <div className={`h-full rounded-full ${progress.eligible ? 'bg-emerald-400' : 'bg-indigo-400'}`} style={{ width: `${percent}%` }} />
                        </div>
                        <p className="mt-2 text-[10px] text-slate-500">{selected.verified_count} sesi terverifikasi · {selected.pending_count} menunggu · {selected.rejected_count} ditolak</p>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-4 text-[10px] leading-4 text-slate-500">
                  Kirim laporan ke staf saat syarat terpenuhi; laporan akan diproses staf kampus sebagai izin mengikuti ujian.
                </p>
              </aside>
            </section>
          ) : (
            <section className="rounded-lg border border-white/10 bg-slate-950 shadow-xl shadow-black/10">
              <div className="border-b border-white/10 px-5 py-4">
                <h2 className="text-sm font-semibold text-white">Laporan yang Dikirim ke Staf</h2>
                <p className="mt-0.5 text-xs text-slate-500">Status pemrosesan laporan syarat UTS/UAS oleh staf kampus.</p>
              </div>
              <div className="divide-y divide-white/[0.06] px-5">
                {!sentReports.length ? (
                  <p className="py-8 text-center text-sm text-slate-500">Belum ada laporan yang dikirim.</p>
                ) : (
                  sentReports.map((report) => (
                    <article key={report.id} className="py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold text-slate-100">
                            {report.student_name} — {report.exam_type} · {report.semester}
                          </h3>
                          <p className="mt-1 text-xs text-slate-500">
                            {report.session_count}/{report.threshold} sesi terverifikasi · dikirim {formatDate(report.submitted_at)}
                          </p>
                        </div>
                        <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${reportChip(report.status)}`}>
                          {report.status === 'selesai' ? 'Selesai' : report.status === 'ditolak' ? 'Ditolak' : 'Diproses'}
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
            </section>
          )}
        </>
      )}

      {sessionModal && selected && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm" onMouseDown={() => setSessionModal(false)}>
          <div
            className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-950 p-5 shadow-2xl shadow-black/50"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                  <NotebookPen className="h-4 w-4" /> Catat Sesi — {selected.nama}
                </h3>
                <p className="mt-1 text-xs text-slate-500">Sesi yang dicatat langsung terverifikasi dan dihitung sebagai syarat ujian.</p>
              </div>
              <button type="button" onClick={() => setSessionModal(false)} className="rounded-lg p-1.5 text-slate-500 hover:bg-white/10 hover:text-slate-200" aria-label="Tutup">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={submitSession} className="mt-4 space-y-3">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-300">Topik Bimbingan *</label>
                <input
                  value={sessionTopic}
                  onChange={(event) => setSessionTopic(event.target.value)}
                  placeholder="Mis. Evaluasi bimbingan UTS"
                  maxLength={255}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-indigo-300/50"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-300">Catatan</label>
                <textarea
                  value={sessionNotes}
                  onChange={(event) => setSessionNotes(event.target.value)}
                  rows={4}
                  placeholder="Ringkasan pembahasan sesi..."
                  className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-indigo-300/50"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setSessionModal(false)} className="rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.06]">
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={busy || !sessionTopic.trim()}
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-indigo-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  Simpan Sesi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {reportModal && selected && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm" onMouseDown={() => setReportModal(false)}>
          <div
            className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-950 p-5 shadow-2xl shadow-black/50"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                  <Send className="h-4 w-4" /> Laporan ke Staf — {selected.nama}
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Laporan memuat {selected.verified_count} sesi terverifikasi dan masuk antrean pemrosesan staf kampus.
                </p>
              </div>
              <button type="button" onClick={() => setReportModal(false)} className="rounded-lg p-1.5 text-slate-500 hover:bg-white/10 hover:text-slate-200" aria-label="Tutup">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={submitReport} className="mt-4 space-y-3">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-300">Jenis Ujian *</label>
                <div className="flex gap-2">
                  {(['UTS', 'UAS'] as const).map((exam) => (
                    <button
                      key={exam}
                      type="button"
                      onClick={() => setReportExam(exam)}
                      className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${reportExam === exam ? 'border-indigo-300/50 bg-indigo-400/15 text-white' : 'border-white/10 bg-white/[0.03] text-slate-400 hover:bg-white/[0.06]'}`}
                    >
                      {exam}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-[11px] text-slate-500">
                  Syarat {reportExam}: {selected.verified_count}/{reportExam === 'UTS' ? data!.min_uts : data!.min_uas} sesi terverifikasi
                </p>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-300">Catatan untuk Staf</label>
                <textarea
                  value={reportNote}
                  onChange={(event) => setReportNote(event.target.value)}
                  rows={3}
                  placeholder="Keterangan tambahan bila diperlukan..."
                  className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-indigo-300/50"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setReportModal(false)} className="rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.06]">
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  Kirim Laporan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
