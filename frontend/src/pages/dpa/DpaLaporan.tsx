import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileDown, FileText, Loader2, RefreshCw, Users } from 'lucide-react';
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
}

export default function DpaLaporan() {
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  const fetchStudents = async () => {
    setLoading(true);
    try {
      const res = await api.get('/dpa/students');
      setStudents(res.data.students ?? []);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Gagal memuat data laporan');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudents();
  }, []);

  const download = async (student: StudentRow, format: 'pdf' | 'txt') => {
    setDownloadingId(student.id);
    try {
      const res = await api.get(`/dpa/students/${student.id}/report?format=${format}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `wellbeing-report-${student.id}.${format}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      setError('Gagal mengunduh laporan');
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <DpaPageHeader
        eyebrow="Laporan"
        title="Student Well-being Report"
        description="Unduh laporan per mahasiswa bimbingan: profil akademik, burnout, happiness, faktor, interpretasi gabungan, dan catatan monitoring."
        icon={FileText}
        actions={
          <button
            onClick={fetchStudents}
            disabled={loading}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.07] disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        }
      />

      {error && <div className="rounded-lg border border-rose-300/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</div>}

      <section className="rounded-lg border border-white/10 bg-slate-950 p-5 shadow-xl shadow-black/10">
        <div className="overflow-hidden rounded-lg border border-white/10">
          {loading ? (
            <div className="flex h-40 items-center justify-center text-sm text-slate-400">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Memuat data...
            </div>
          ) : students.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center text-center">
              <Users className="h-9 w-9 text-slate-600" />
              <p className="mt-2 text-sm font-semibold text-slate-300">Belum ada mahasiswa bimbingan</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[980px] w-full table-fixed border-collapse text-sm">
                <thead className="bg-white/[0.03]">
                  <tr className="border-b border-white/10 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    <th className="px-4 py-3">Nama</th>
                    <th className="px-4 py-3">NIM</th>
                    <th className="px-4 py-3">Burnout</th>
                    <th className="px-4 py-3">Happiness</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Unduh Laporan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {students.map((student) => {
                    const burnoutMeta = burnoutCategoryMeta(student.burnout_category);
                    const happinessMeta = categoryMeta(student.happiness_category);
                    const statusMeta = interpretationMeta(student.status);
                    return (
                      <tr key={student.id} className="transition hover:bg-white/[0.03]">
                        <td className="px-4 py-4">
                          <Link to={`/dpa/mahasiswa/${student.id}`} className="font-semibold text-slate-100 hover:text-indigo-200">{student.nama}</Link>
                          <p className="mt-0.5 text-xs text-slate-500">{student.prodi || '-'}</p>
                        </td>
                        <td className="px-4 py-4 text-slate-300">{student.nim || '-'}</td>
                        <td className="px-4 py-4">
                          {student.burnout_category ? (
                            <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${burnoutMeta.chip}`}>
                              {student.burnout > 0 ? student.burnout.toFixed(1) : '-'} · {student.burnout_category}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-600">belum ada</span>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          {student.happiness_category ? (
                            <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${happinessMeta.chip}`}>
                              {student.happiness > 0 ? Math.round(student.happiness) : '-'} · {student.happiness_category}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-600">belum ada</span>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusMeta.chip}`}>{student.status}</span>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex gap-2">
                            <button
                              onClick={() => download(student, 'pdf')}
                              disabled={downloadingId !== null}
                              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-slate-200 transition hover:border-indigo-300/40 hover:text-indigo-100 disabled:opacity-60"
                            >
                              {downloadingId === student.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
                              PDF
                            </button>
                            <button
                              onClick={() => download(student, 'txt')}
                              disabled={downloadingId !== null}
                              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-slate-200 transition hover:border-indigo-300/40 hover:text-indigo-100 disabled:opacity-60"
                            >
                              <FileDown className="h-3.5 w-3.5" />
                              TXT
                            </button>
                          </div>
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
