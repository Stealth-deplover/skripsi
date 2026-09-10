import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, RefreshCw, Users } from 'lucide-react';
import DpaPageHeader from '../../components/DpaPageHeader';
import api from '../../api';
import { burnoutCategoryMeta, categoryMeta, interpretationMeta } from '../userDashboard/happinessShared';

interface StudentRow {
  id: number;
  nama: string;
  username: string;
  nim: string;
  prodi: string;
  angkatan: string;
  semester: number;
  ipk: number;
  burnout: number;
  burnout_category: string;
  happiness: number;
  happiness_category: string;
  status: string;
  status_priority: number;
}

export default function DpaStudentList() {
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const fetchStudents = async () => {
    setLoading(true);
    try {
      const res = await api.get('/dpa/students');
      setStudents(res.data.students ?? []);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Gagal memuat daftar mahasiswa');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudents();
  }, []);

  const keyword = search.trim().toLowerCase();
  const filtered = students.filter((student) =>
    !keyword || `${student.nama} ${student.nim} ${student.prodi} ${student.username}`.toLowerCase().includes(keyword),
  );

  return (
    <div className="flex flex-col gap-5">
      <DpaPageHeader
        eyebrow="Mahasiswa Bimbingan"
        title="Daftar Mahasiswa Bimbingan"
        description="Ringkasan burnout, Happiness Index, dan status monitoring setiap mahasiswa bimbingan Anda."
        icon={Users}
        actions={
          <>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari nama, NIM, prodi..."
              className="h-10 w-full rounded-md border border-white/10 bg-white/[0.04] px-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-indigo-300/50 xl:w-72"
            />
            <button
              onClick={fetchStudents}
              disabled={loading}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.07] disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </>
        }
      />

      {error && <div className="rounded-lg border border-rose-300/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</div>}

      <section className="rounded-lg border border-white/10 bg-slate-950 p-5 shadow-xl shadow-black/10">
        <div className="overflow-hidden rounded-lg border border-white/10">
          {loading ? (
            <div className="flex h-40 items-center justify-center text-sm text-slate-400">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Memuat daftar mahasiswa...
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center text-center">
              <Users className="h-9 w-9 text-slate-600" />
              <p className="mt-2 text-sm font-semibold text-slate-300">Tidak ada mahasiswa ditemukan</p>
              <p className="mt-1 text-xs text-slate-500">Belum ada mahasiswa yang dipetakan ke Anda, atau ubah kata kunci pencarian.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[1080px] w-full table-fixed border-collapse text-sm">
                <thead className="bg-white/[0.03]">
                  <tr className="border-b border-white/10 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    <th className="px-4 py-3">Nama</th>
                    <th className="px-4 py-3">NIM</th>
                    <th className="px-4 py-3">Semester</th>
                    <th className="px-4 py-3">Burnout</th>
                    <th className="px-4 py-3">Happiness</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {filtered.map((student) => {
                    const burnoutMeta = burnoutCategoryMeta(student.burnout_category);
                    const happinessMeta = categoryMeta(student.happiness_category);
                    const statusMeta = interpretationMeta(student.status);
                    return (
                      <tr key={student.id} className="transition hover:bg-white/[0.03]">
                        <td className="px-4 py-4">
                          <p className="truncate font-semibold text-slate-100">{student.nama}</p>
                          <p className="mt-0.5 truncate text-xs text-slate-500">{student.prodi || student.username}{student.angkatan ? ` · ${student.angkatan}` : ''}</p>
                        </td>
                        <td className="px-4 py-4 text-slate-300">{student.nim || '-'}</td>
                        <td className="px-4 py-4 text-slate-300">{student.semester || '-'}</td>
                        <td className="px-4 py-4">
                          {student.burnout_category ? (
                            <div>
                              <p className="font-semibold text-white">{student.burnout > 0 ? student.burnout.toFixed(1) : '-'}</p>
                              <span className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${burnoutMeta.chip}`}>{student.burnout_category}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-600">belum ada</span>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          {student.happiness_category ? (
                            <div>
                              <p className="font-semibold text-white">{student.happiness > 0 ? Math.round(student.happiness) : '-'}</p>
                              <span className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${happinessMeta.chip}`}>{student.happiness_category}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-600">belum ada</span>
                          )}
                        </td>
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
