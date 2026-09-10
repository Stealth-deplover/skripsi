import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Eye, Search, Users } from 'lucide-react';

const tabs = ['Semua', 'Mahasiswa'];

const getLevel = (level: string) => {
  switch (level?.toLowerCase()) {
    case 'high':
      return 'Tinggi';
    case 'medium':
      return 'Sedang';
    default:
      return 'Rendah';
  }
};

const getTone = (level: string) => {
  switch (level?.toLowerCase()) {
    case 'high':
      return 'border-rose-300/25 bg-rose-500/10 text-rose-100';
    case 'medium':
      return 'border-amber-300/25 bg-amber-500/10 text-amber-100';
    default:
      return 'border-emerald-300/25 bg-emerald-500/10 text-emerald-100';
  }
};

const getScoreTone = (score: number) => {
  if (score > 66) return 'text-rose-200';
  if (score > 33) return 'text-amber-200';
  return 'text-emerald-200';
};

const getStatus = (risk: string) => {
  switch (risk?.toLowerCase()) {
    case 'high':
      return { text: 'Perlu Intervensi', className: 'border-rose-300/25 bg-rose-500/10 text-rose-100' };
    case 'medium':
      return { text: 'Monitor Ketat', className: 'border-amber-300/25 bg-amber-500/10 text-amber-100' };
    default:
      return { text: 'Monitor', className: 'border-cyan-300/25 bg-cyan-500/10 text-cyan-100' };
  }
};

function formatDate(isoStr: string) {
  if (!isoStr || isoStr.startsWith('0001')) return 'Belum isi';
  const date = new Date(isoStr);
  return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' +
    date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

export default function RespondentTable({ data, loading }: { data: any[]; loading: boolean }) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const itemsPerPage = 6;

  const filteredData = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return (data || [])
      .map((row) => ({
        ...row,
        kelompok: 'Mahasiswa',
      }))
      .filter((row) => {
        if (activeTab === 1 && row.kelompok !== 'Mahasiswa') return false;
        if (!keyword) return true;
        return `${row.nama || ''} ${row.username || ''} ${row.id} ${row.kelompok}`.toLowerCase().includes(keyword);
      });
  }, [activeTab, data, query]);

  const totalPages = Math.max(1, Math.ceil(filteredData.length / itemsPerPage));
  const displayData = filteredData.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  const goPage = (nextPage: number) => {
    setPage(Math.min(totalPages, Math.max(1, nextPage)));
  };

  return (
    <section className="rounded-lg border border-white/10 bg-slate-950 p-5 shadow-xl shadow-black/10">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <Users className="h-4 w-4 text-cyan-200" />
            Responden Terbaru
          </div>
          <p className="mt-1 text-xs text-slate-500">{filteredData.length} responden sesuai filter</p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder="Cari responden"
              className="h-10 w-full rounded-md border border-white/10 bg-white/[0.04] pl-9 pr-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-300/50 sm:w-56"
            />
          </label>

          <div className="flex rounded-md border border-white/10 bg-white/[0.03] p-1">
            {tabs.map((tab, index) => (
              <button
                key={tab}
                onClick={() => {
                  setActiveTab(index);
                  setPage(1);
                }}
                className={`h-8 rounded px-3 text-xs font-semibold transition ${
                  activeTab === index ? 'bg-cyan-300 text-slate-950' : 'text-slate-400 hover:text-white'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-5 overflow-hidden rounded-lg border border-white/10">
        {loading ? (
          <div className="flex h-32 items-center justify-center text-sm text-slate-400">Memuat data responden...</div>
        ) : displayData.length === 0 ? (
          <div className="flex h-32 flex-col items-center justify-center text-center">
            <Users className="h-8 w-8 text-slate-600" />
            <p className="mt-2 text-sm font-semibold text-slate-300">Belum ada data responden</p>
            <p className="mt-1 text-xs text-slate-500">Ubah filter atau pastikan responden sudah mengisi kuisioner.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[1320px] table-fixed border-collapse text-sm">
              <colgroup>
                <col className="w-16" />
                <col className="w-64" />
                <col className="w-36" />
                <col className="w-36" />
                <col className="w-36" />
                <col className="w-28" />
                <col className="w-32" />
                <col className="w-48" />
                <col className="w-44" />
                <col className="w-16" />
              </colgroup>
              <thead className="bg-white/[0.03]">
                <tr className="border-b border-white/10 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  <th className="px-4 py-3">No</th>
                  <th className="px-4 py-3">Nama / ID</th>
                  <th className="px-4 py-3">Kelompok</th>
                  <th className="px-4 py-3">Burnout</th>
                  <th className="px-4 py-3">Psikosomatis</th>
                  <th className="px-4 py-3">MBTI</th>
                  <th className="px-4 py-3">Stres</th>
                  <th className="px-4 py-3">Prediksi Terakhir</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {displayData.map((row, index) => {
                  const number = (page - 1) * itemsPerPage + index + 1;
                  const burnout = Number(row.latest_burnout || 0);
                  const psycho = Number(row.latest_psychosomatic || 0);
                  const stress = burnout * 0.95;
                  const risk = row.latest_risk || 'low';
                  const status = getStatus(risk);

                  return (
                    <tr key={row.id} className="transition hover:bg-white/[0.03]">
                      <td className="px-4 py-4 align-middle text-slate-500">{number}</td>
                      <td className="px-4 py-4 align-middle">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-100" title={row.nama || row.username || 'Tanpa nama'}>
                            {row.nama || row.username || 'Tanpa nama'}
                          </p>
                          <p className="mt-1 truncate text-xs text-slate-500">ID: {row.id}</p>
                        </div>
                      </td>
                      <td className="px-4 py-4 align-middle">
                        <span className={`inline-flex max-w-full items-center rounded-md border px-2.5 py-1 text-xs font-semibold ${
                          row.kelompok === 'Mahasiswa'
                            ? 'border-violet-300/25 bg-violet-500/10 text-violet-100'
                            : 'border-cyan-300/25 bg-cyan-500/10 text-cyan-100'
                        }`}>
                          {row.kelompok}
                        </span>
                      </td>
                      <td className="px-4 py-4 align-middle">
                        <div className="flex flex-col items-start gap-1.5">
                          <span className={`text-base font-semibold leading-none ${getScoreTone(burnout)}`}>
                            {burnout ? burnout.toFixed(1) : '-'}
                          </span>
                          {burnout > 0 && (
                            <span className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${getTone(risk)}`}>
                              {getLevel(risk)}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 align-middle">
                        <span className={`text-base font-semibold ${getScoreTone(psycho)}`}>
                          {psycho ? psycho.toFixed(1) : '-'}
                        </span>
                      </td>
                      <td className="px-4 py-4 align-middle">
                        {row.latest_mbti_type ? (
                          <span className="inline-flex rounded-md border border-violet-300/25 bg-violet-500/10 px-2.5 py-1 text-xs font-semibold text-violet-100">
                            {row.latest_mbti_type}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-600">-</span>
                        )}
                      </td>
                      <td className="px-4 py-4 align-middle">
                        <span className={`text-base font-semibold ${getScoreTone(stress)}`}>
                          {burnout ? stress.toFixed(1) : '-'}
                        </span>
                      </td>
                      <td className="px-4 py-4 align-middle">
                        <span className="block whitespace-normal text-xs leading-5 text-slate-400">
                          {burnout ? formatDate(row.last_activity) : 'Belum isi'}
                        </span>
                      </td>
                      <td className="px-4 py-4 align-middle">
                        <span className={`inline-flex max-w-full items-center rounded-md border px-2.5 py-1 text-xs font-semibold ${burnout ? status.className : 'border-slate-600 bg-slate-800 text-slate-400'}`}>
                          <span className="truncate">{burnout ? status.text : 'Belum aktif'}</span>
                        </span>
                      </td>
                      <td className="px-4 py-4 align-middle">
                        <button
                          onClick={() => navigate('/prediksi')}
                          className="mx-auto flex h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-slate-300 transition hover:border-cyan-300/40 hover:text-cyan-100"
                          title="Lihat prediksi"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!loading && (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">Halaman {page} dari {totalPages}</p>
          <div className="flex gap-2">
            <button
              disabled={page === 1}
              onClick={() => goPage(page - 1)}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-slate-300 transition hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
              Sebelumnya
            </button>
            <button
              disabled={page === totalPages}
              onClick={() => goPage(page + 1)}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-slate-300 transition hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Berikutnya
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
