import { useEffect, useState } from 'react';
import { Activity, Calendar, ShieldCheck, UserRound } from 'lucide-react';

type StoredUser = {
  nama?: string;
  username?: string;
  role?: string;
};

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatRole(value?: string) {
  if (!value) return 'Mahasiswa';
  if (value === 'student') return 'Mahasiswa';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default function UserDashboardHeader() {
  const [user, setUser] = useState<StoredUser>({});
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (!userStr) return;

    try {
      setUser(JSON.parse(userStr));
    } catch (e) {
      console.error('Failed to parse user', e);
    }
  }, []);

  const displayName = user.nama || user.username || 'Pengguna';
  const accountType = formatRole(user.role);

  return (
    <header className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] shadow-2xl shadow-black/20 backdrop-blur">
      <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-teal-300/20 bg-teal-300/10 px-3 py-1 text-xs font-semibold text-teal-100">
              <Activity className="h-3.5 w-3.5" />
              Dashboard Personal
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-violet-300/20 bg-violet-300/10 px-3 py-1 text-xs font-semibold text-violet-100">
              <ShieldCheck className="h-3.5 w-3.5" />
              Data terlindungi
            </span>
          </div>

          <h1 className="text-2xl font-bold tracking-normal text-white sm:text-3xl">
            Halo, {displayName}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Pantau kondisi harian, tren asesmen, dan ruang dukungan anonim dalam satu tempat yang lebih rapi.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:min-w-80">
          <div className="rounded-xl border border-white/10 bg-slate-950/50 p-4">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-400">
              <UserRound className="h-3.5 w-3.5" />
              Tipe akun
            </div>
            <div className="text-sm font-semibold text-white">{accountType}</div>
          </div>

          <label className="relative block rounded-xl border border-white/10 bg-slate-950/50 p-4 transition hover:border-teal-300/40">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-400">
              <Calendar className="h-3.5 w-3.5" />
              Tanggal pantau
            </div>
            <div className="text-sm font-semibold text-white">{formatDate(selectedDate)}</div>
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              aria-label="Pilih tanggal dashboard"
            />
          </label>
        </div>
      </div>
    </header>
  );
}
