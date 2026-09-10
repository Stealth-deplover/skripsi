import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileText,
  GraduationCap,
  Inbox,
  Loader2,
  X,
  XCircle,
} from 'lucide-react';
import DpaPageHeader from '../../components/DpaPageHeader';
import api from '../../api';

interface StaffReport {
  id: number;
  dpa_id: number;
  dpa_name: string;
  student_id: number;
  student_name: string;
  student_nim: string;
  student_prodi: string;
  semester: string;
  exam_type: string;
  session_count: number;
  threshold: number;
  status: string; // diproses | selesai | ditolak
  note: string;
  staff_note: string;
  submitted_at: string;
  processed_at: string | null;
}

type StatusFilter = 'semua' | 'diproses' | 'selesai' | 'ditolak';

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function statusChip(status: string): string {
  switch (status) {
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
    case 'selesai':
      return 'Selesai';
    case 'ditolak':
      return 'Ditolak';
    default:
      return 'Diproses';
  }
}

export default function StaffDashboard() {
  const [reports, setReports] = useState<StaffReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('diproses');
  const [selected, setSelected] = useState<StaffReport | null>(null);
  const [staffNote, setStaffNote] = useState('');
  const [busy, setBusy] = useState(false);

  const fetchReports = useCallback(async () => {
    try {
      const res = await api.get('/staff/bimbingan/reports');
      setReports(res.data.reports ?? []);
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Antrean laporan tidak dapat dimuat.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const visible = useMemo(
    () => (filter === 'semua' ? reports : reports.filter((report) => report.status === filter)),
    [reports, filter],
  );

  const counts = useMemo(
    () => ({
      total: reports.length,
      diproses: reports.filter((report) => report.status === 'diproses').length,
      selesai: reports.filter((report) => report.status === 'selesai').length,
      ditolak: reports.filter((report) => report.status === 'ditolak').length,
    }),
    [reports],
  );

  const reportUrl = (reportId: number, format: string) => {
    const token = localStorage.getItem('token') || '';
    return `${api.defaults.baseURL}/staff/bimbingan/reports/${reportId}/report?format=${format}&token=${encodeURIComponent(token)}`;
  };

  const processReport = async (status: string) => {
    if (!selected || busy) return;
    setBusy(true);
    try {
      await api.patch(`/staff/bimbingan/reports/${selected.id}/status`, {
        status,
        staff_note: staffNote.trim(),
      });
      setSelected(null);
      setStaffNote('');
      await fetchReports();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Gagal memperbarui laporan.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <DpaPageHeader
        eyebrow="Portal Staf Kampus"
        title="Proses Laporan Bimbingan"
        description="Verifikasi laporan pemenuhan syarat UTS/UAS yang dikirim DPA, lengkapi catatan pemrosesan, dan unduh dokumen untuk arsip."
        icon={ClipboardCheck}
      />

      {error && (
        <div className="flex items-center justify-between rounded-lg border border-rose-300/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {error}
          <button onClick={() => { setError(''); fetchReports(); }} className="text-xs font-semibold underline">Coba lagi</button>
        </div>
      )}

      {/* Ringkasan antrean */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Total Laporan', value: counts.total, accent: 'text-slate-100', icon: FileText },
          { label: 'Menunggu Diproses', value: counts.diproses, accent: 'text-sky-300', icon: Inbox },
          { label: 'Selesai', value: counts.selesai, accent: 'text-emerald-300', icon: CheckCircle2 },
          { label: 'Ditolak', value: counts.ditolak, accent: 'text-rose-300', icon: XCircle },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="rounded-lg border border-white/10 bg-slate-950 p-4 shadow-xl shadow-black/10">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">{card.label}</span>
                <Icon className="h-4 w-4 text-slate-600" />
              </div>
              <div className={`mt-2 text-2xl font-bold ${card.accent}`}>{card.value}</div>
            </div>
          );
        })}
      </section>

      {/* Filter status */}
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            { key: 'diproses', label: 'Menunggu' },
            { key: 'selesai', label: 'Selesai' },
            { key: 'ditolak', label: 'Ditolak' },
            { key: 'semua', label: 'Semua' },
          ] as Array<{ key: StatusFilter; label: string }>
        ).map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setFilter(tab.key)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${filter === tab.key ? 'border-indigo-300/50 bg-indigo-400/15 text-white' : 'border-white/10 bg-white/[0.03] text-slate-400 hover:bg-white/[0.06]'}`}
          >
            {tab.label}
            <span className="ml-1.5 text-[10px] opacity-70">
              {tab.key === 'semua' ? counts.total : counts[tab.key as 'diproses' | 'selesai' | 'ditolak']}
            </span>
          </button>
        ))}
      </div>

      {/* Daftar laporan */}
      <section className="rounded-lg border border-white/10 bg-slate-950 shadow-xl shadow-black/10">
        <div className="divide-y divide-white/[0.06]">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-sm text-slate-400">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Memuat antrean laporan...
            </div>
          ) : visible.length === 0 ? (
            <p className="py-16 text-center text-sm text-slate-500">Tidak ada laporan pada filter ini.</p>
          ) : (
            visible.map((report) => (
              <div key={report.id} className="flex flex-col gap-3 px-5 py-4 transition hover:bg-white/[0.02] sm:flex-row sm:items-center">
                <button type="button" onClick={() => { setSelected(report); setStaffNote(report.staff_note || ''); }} className="min-w-0 flex-1 text-left">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-100">{report.student_name}</span>
                    <span className="text-xs text-slate-500">{report.student_nim || 'NIM -'}</span>
                    <span className="rounded-full border border-indigo-300/25 bg-indigo-400/10 px-2 py-0.5 text-[10px] font-bold text-indigo-100">
                      {report.exam_type}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {report.semester} · DPA {report.dpa_name} · {report.session_count}/{report.threshold} sesi terverifikasi · diterima {formatDate(report.submitted_at)}
                  </p>
                </button>
                <div className="flex items-center gap-2">
                  <a
                    href={reportUrl(report.id, 'pdf')}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-white/[0.06]"
                    title="Unduh PDF"
                  >
                    <Download className="h-3.5 w-3.5" /> PDF
                  </a>
                  <a
                    href={reportUrl(report.id, 'txt')}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-white/[0.06]"
                    title="Unduh TXT"
                  >
                    <Download className="h-3.5 w-3.5" /> TXT
                  </a>
                  <button
                    type="button"
                    onClick={() => { setSelected(report); setStaffNote(report.staff_note || ''); }}
                    className="rounded-lg border border-indigo-300/30 bg-indigo-400/10 px-3 py-2 text-xs font-semibold text-indigo-100 transition hover:bg-indigo-400/20"
                  >
                    Proses
                  </button>
                  <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${statusChip(report.status)}`}>
                    {statusLabel(report.status)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {selected && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm" onMouseDown={() => setSelected(null)}>
          <div
            className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-white/10 bg-slate-950 p-5 shadow-2xl shadow-black/50"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                  <GraduationCap className="h-4 w-4 text-indigo-300" />
                  Proses Laporan — {selected.student_name}
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  {selected.exam_type} · {selected.semester} · DPA {selected.dpa_name}
                </p>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="rounded-lg p-1.5 text-slate-500 hover:bg-white/10 hover:text-slate-200" aria-label="Tutup">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 grid gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:grid-cols-2">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Mahasiswa</p>
                <p className="mt-0.5 text-sm text-slate-200">{selected.student_name}</p>
                <p className="text-xs text-slate-500">{selected.student_nim || 'NIM -'} · {selected.student_prodi || 'Prodi -'}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Pemenuhan Syarat</p>
                <p className="mt-0.5 text-sm font-semibold text-white">
                  {selected.session_count}/{selected.threshold} sesi terverifikasi
                </p>
                <p className="text-xs text-slate-500">Syarat {selected.exam_type} — {selected.session_count >= selected.threshold ? 'terpenuhi' : 'belum terpenuhi'}</p>
              </div>
              {selected.note && (
                <div className="sm:col-span-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Catatan DPA</p>
                  <p className="mt-0.5 text-sm leading-6 text-slate-400">{selected.note}</p>
                </div>
              )}
              {selected.staff_note && (
                <div className="sm:col-span-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Catatan Staf Saat Ini</p>
                  <p className="mt-0.5 text-sm leading-6 text-slate-400">{selected.staff_note}</p>
                </div>
              )}
            </div>

            <div className="mt-4">
              <label className="mb-1.5 block text-xs font-semibold text-slate-300">Catatan Pemrosesan</label>
              <textarea
                value={staffNote}
                onChange={(event) => setStaffNote(event.target.value)}
                rows={3}
                placeholder="Catatan untuk DPA dan mahasiswa..."
                className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-indigo-300/50"
              />
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <a
                href={reportUrl(selected.id, 'pdf')}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.06]"
              >
                <Download className="h-4 w-4" /> Unduh Dokumen PDF
              </a>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => processReport('ditolak')}
                  disabled={busy}
                  className="inline-flex items-center gap-2 rounded-xl border border-rose-300/30 bg-rose-400/10 px-4 py-2.5 text-sm font-semibold text-rose-200 transition hover:bg-rose-400/20 disabled:opacity-50"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />} Tolak
                </button>
                <button
                  type="button"
                  onClick={() => processReport('selesai')}
                  disabled={busy}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:opacity-50"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Tandai Selesai
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
