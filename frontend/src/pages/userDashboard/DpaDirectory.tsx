import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GraduationCap, Loader2, MessageSquareText, Phone, ShieldCheck, Users } from 'lucide-react';
import DpaPageHeader from '../../components/DpaPageHeader';
import StarRating from '../../components/StarRating';
import api from '../../api';

interface DpaCard {
  id: number;
  nama: string;
  username: string;
  bio: string;
  profile_pic: string;
  nip: string;
  phone: string;
  advisee_count: number;
  prodi_list: string[];
  is_my_dpa: boolean;
  my_stars: number;
}

function initials(nama?: string): string {
  if (!nama) return '?';
  return nama
    .split(' ')
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

export default function DpaDirectory() {
  const navigate = useNavigate();
  const [dpas, setDpas] = useState<DpaCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [joiningId, setJoiningId] = useState<number | null>(null);
  const [rateTarget, setRateTarget] = useState<{ id: number; stars: number } | null>(null);
  const [savingStars, setSavingStars] = useState(false);
  const [notice, setNotice] = useState('');

  const fetchDirectory = useCallback(async () => {
    try {
      const res = await api.get('/dpa/directory');
      setDpas(res.data.dpa_list ?? []);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Daftar dosen pembimbing tidak dapat dimuat.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDirectory();
  }, [fetchDirectory]);

  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(timeout);
  }, [notice]);

  const joinGroup = async (dpa: DpaCard) => {
    setJoiningId(dpa.id);
    try {
      const res = await api.post(`/student/join-dpa/${dpa.id}`);
      setNotice(res.data.message || 'Anda tergabung di grup bimbingan.');
      await fetchDirectory();
      navigate('/user/grup-bimbingan');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Gagal bergabung ke grup bimbingan.');
    } finally {
      setJoiningId(null);
    }
  };

  const saveStars = async (dpaId: number, stars: number) => {
    setSavingStars(true);
    try {
      await api.post(`/dpa/ratings/${dpaId}`, { stars });
      setRateTarget({ id: dpaId, stars });
      setDpas((prev) => prev.map((card) => (card.id === dpaId ? { ...card, my_stars: stars } : card)));
      setNotice('Penilaian terkirim. Hanya Kaprodi yang dapat melihat rekapnya — dosen tidak dapat melihatnya.');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Penilaian gagal tersimpan.');
    } finally {
      setSavingStars(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#090b12] px-4 py-5 text-slate-100 sm:px-6 lg:px-8">
      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-5">
        <DpaPageHeader
          eyebrow="Dosen Pembimbing Akademik"
          title="DPA Pembimbing Saya"
          description="Kenali dosen pembimbing akademik (DPA) di UMCI, bergabung ke grup bimbingan, dan beri penilaian bintang atas performa pembimbingan."
          icon={GraduationCap}
        />

        {notice && (
          <div className="flex items-start gap-2 rounded-lg border border-emerald-300/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            {notice}
          </div>
        )}
        {error && (
          <div className="rounded-lg border border-rose-300/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</div>
        )}

        {loading ? (
          <div className="flex h-56 items-center justify-center text-sm text-slate-400">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Memuat daftar dosen pembimbing...
          </div>
        ) : dpas.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-10 text-center shadow-xl shadow-black/10">
            <GraduationCap className="mx-auto h-10 w-10 text-slate-600" />
            <p className="mt-3 text-sm font-semibold text-slate-300">Belum ada akun DPA terdaftar</p>
            <p className="mt-1 text-xs text-slate-500">Kaprodi akan menambahkan dosen pembimbing lewat Manajemen User.</p>
          </div>
        ) : (
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {dpas.map((dpa) => {
              const currentStars = rateTarget?.id === dpa.id ? rateTarget.stars : dpa.my_stars;
              return (
                <article
                  key={dpa.id}
                  className={`flex flex-col rounded-2xl border bg-slate-950/70 p-5 shadow-xl shadow-black/10 transition ${dpa.is_my_dpa ? 'border-indigo-300/40 ring-1 ring-indigo-300/20' : 'border-white/10'}`}
                >
                  <div className="flex items-start gap-4">
                    {dpa.profile_pic ? (
                      <img src={dpa.profile_pic} alt={dpa.nama} className="h-16 w-16 shrink-0 rounded-2xl border border-white/10 object-cover" />
                    ) : (
                      <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-400 text-xl font-bold text-white">
                        {initials(dpa.nama)}
                      </span>
                    )}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate text-base font-semibold text-white">{dpa.nama}</h2>
                        {dpa.is_my_dpa && (
                          <span className="rounded-full border border-indigo-300/30 bg-indigo-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-100">
                            DPA Saya
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-slate-500">{dpa.username}</p>
                      {dpa.nip && <p className="mt-1 text-xs text-slate-400">NIP/NIDN: {dpa.nip}</p>}
                      {dpa.phone && (
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
                          <Phone className="h-3 w-3" /> {dpa.phone}
                        </p>
                      )}
                      <p className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-400">
                        <Users className="h-3 w-3" /> {dpa.advisee_count} mahasiswa bimbingan
                      </p>
                    </div>
                  </div>

                  {dpa.bio && <p className="mt-3 line-clamp-3 text-xs leading-5 text-slate-400">{dpa.bio}</p>}

                  <div className="mt-4 flex-1" />

                  {dpa.is_my_dpa && (
                    <div className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/5 px-4 py-3">
                      <p className="text-xs font-semibold text-amber-100">Nilai performa pembimbingan</p>
                      <div className="mt-2 flex items-center gap-3">
                        <StarRating
                          value={currentStars}
                          disabled={savingStars}
                          onChange={(stars) => saveStars(dpa.id, stars)}
                        />
                        {savingStars && <Loader2 className="h-4 w-4 animate-spin text-amber-200" />}
                        {currentStars > 0 && !savingStars && (
                          <span className="text-xs text-amber-200/80">{currentStars}/5</span>
                        )}
                      </div>
                      <p className="mt-2 text-[10px] leading-4 text-slate-500">
                        Penilaian Anda anonim dan tidak pernah ditampilkan kepada dosen — rekapnya hanya untuk evaluasi Kaprodi.
                      </p>
                    </div>
                  )}

                  <div className="mt-4">
                    {dpa.is_my_dpa ? (
                      <button
                        onClick={() => navigate('/user/grup-bimbingan')}
                        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-indigo-400 px-4 text-sm font-semibold text-slate-950 transition hover:bg-indigo-300"
                      >
                        <MessageSquareText className="h-4 w-4" />
                        Buka Grup Bimbingan
                      </button>
                    ) : (
                      <button
                        onClick={() => joinGroup(dpa)}
                        disabled={joiningId !== null}
                        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-indigo-300/30 bg-indigo-400/10 px-4 text-sm font-semibold text-indigo-100 transition hover:bg-indigo-400/20 disabled:opacity-60"
                      >
                        {joiningId === dpa.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquareText className="h-4 w-4" />}
                        Gabung Grup Bimbingan
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </section>
        )}

        <p className="text-center text-[11px] leading-5 text-slate-600">
          Satu mahasiswa tergabung pada satu grup bimbingan. Bergabung ke dosen lain berarti berpindah grup bimbingan, dan Kaprodi tetap dapat melihat pemetaannya.
        </p>
      </div>
    </main>
  );
}
