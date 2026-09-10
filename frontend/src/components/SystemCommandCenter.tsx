import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  Bell,
  Bot,
  CheckCircle2,
  Command,
  FileText,
  Home,
  Loader2,
  Lock,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import api from '../api';

type Role = 'admin' | 'dpa' | 'staff' | 'user';

type NotificationItem = {
  ID: number;
  Type: string;
  Message: string;
  CreatedAt?: string;
};

type ApiIssue = {
  status?: number;
  message: string;
  url?: string;
  time: string;
};

const adminActions = [
  { label: 'Dashboard', path: '/dashboard', keywords: 'ringkasan admin overview', icon: Home },
  { label: 'Command Center', path: '/command-center', keywords: 'pusat komando prioritas', icon: Command },
  { label: 'Pusat Risiko', path: '/risk-center', keywords: 'triage risiko krisis monitoring', icon: ShieldCheck },
  { label: 'Data Responden', path: '/responden', keywords: 'mahasiswa responden user', icon: Activity },
  { label: 'Laporan', path: '/laporan', keywords: 'export pdf excel dokumen', icon: FileText },
  { label: 'Model Evaluasi', path: '/model', keywords: 'machine learning validasi akurasi', icon: Sparkles },
  { label: 'Pengaturan Sistem', path: '/settings', keywords: 'security konfigurasi dark mode', icon: Lock },
];

const userActions = [
  { label: 'Overview', path: '/user/dashboard', keywords: 'dashboard user ringkasan', icon: Home },
  { label: 'Kuisioner Harian', path: '/user/kuisioner', keywords: 'asesmen burnout mbti pertanyaan', icon: Activity },
  { label: 'Ruang Curhat AI', path: '/user/curhat', keywords: 'curhat chat stress burnout psikosomatis', icon: Bot },
  { label: 'Recovery Plan', path: '/user/recovery', keywords: 'rencana pemulihan check in', icon: ShieldCheck },
  { label: 'Riwayat Asesmen', path: '/user/asesmen', keywords: 'history hasil skor', icon: FileText },
  { label: 'Jaringan Teman', path: '/user/network', keywords: 'post teman musik sosial', icon: Activity },
  { label: 'Ruang Film', path: '/user/film', keywords: 'streaming film rekomendasi ai', icon: Sparkles },
  { label: 'Pengaturan Akun', path: '/user/settings', keywords: 'profil password keamanan', icon: Lock },
];

const dpaActions = [
  { label: 'Dashboard DPA', path: '/dpa/dashboard', keywords: 'dashboard dpa ringkasan bimbingan', icon: Home },
  { label: 'Mahasiswa Bimbingan', path: '/dpa/mahasiswa', keywords: 'mahasiswa bimbingan detail catatan', icon: Activity },
  { label: 'Grup Chat Bimbingan', path: '/dpa/chat', keywords: 'chat grup diskusi pesan', icon: Bot },
  { label: 'Bimbingan Akademik', path: '/dpa/bimbingan', keywords: 'sesi bimbingan syarat uts uas verifikasi', icon: Sparkles },
  { label: 'Early Warning', path: '/dpa/warnings', keywords: 'peringatan dini burnout risiko', icon: ShieldCheck },
  { label: 'Laporan', path: '/dpa/laporan', keywords: 'laporan export pdf dokumen', icon: FileText },
  { label: 'Profil Saya', path: '/dpa/profil', keywords: 'profil akun dosen keamanan', icon: Lock },
];

const staffActions = [
  { label: 'Dashboard Staf', path: '/staff/dashboard', keywords: 'laporan bimbingan antrean uts uas', icon: Home },
  { label: 'Proses Laporan', path: '/staff/dashboard', keywords: 'proses selesaikan tolak dokumen arsip', icon: FileText },
];

function readUser() {
  try {
    return JSON.parse(localStorage.getItem('user') || '{}');
  } catch {
    return {};
  }
}

function formatTime(date?: string) {
  if (!date) return '';
  return new Date(date).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function SystemCommandCenter({
  role,
  onOpenAssistant,
}: {
  role: Role;
  onOpenAssistant: () => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [health, setHealth] = useState<'checking' | 'ok' | 'down'>('checking');
  const [lastIssue, setLastIssue] = useState<ApiIssue | null>(null);
  const user = readUser();

  const actions = role === 'admin' ? adminActions : role === 'dpa' ? dpaActions : role === 'staff' ? staffActions : userActions;
  const filteredActions = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return actions;
    return actions.filter((item) => `${item.label} ${item.path} ${item.keywords}`.toLowerCase().includes(term));
  }, [actions, query]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((value) => !value);
      }
      if (event.key === 'Escape') {
        setOpen(false);
        setNotificationsOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    const onApiIssue = (event: Event) => setLastIssue((event as CustomEvent<ApiIssue>).detail);
    window.addEventListener('nexusmind:api-issue', onApiIssue);
    return () => window.removeEventListener('nexusmind:api-issue', onApiIssue);
  }, []);

  useEffect(() => {
    const poll = async () => {
      try {
        await api.get('/health');
        setHealth('ok');
      } catch {
        setHealth('down');
      }

      if (localStorage.getItem('token')) {
        try {
          const response = await api.get('/notifications/unread');
          setNotifications(response.data.notifications || []);
        } catch {
          // Error is already surfaced by the global API issue handler.
        }
      }
    };

    poll();
    const interval = setInterval(poll, 15000);
    return () => clearInterval(interval);
  }, [location.pathname]);

  const goTo = (path: string) => {
    setOpen(false);
    setQuery('');
    navigate(path);
  };

  const markAllRead = async () => {
    await Promise.all(notifications.map((item) => api.post(`/notifications/${item.ID}/read`).catch(() => {})));
    setNotifications([]);
  };

  return (
    <>
      <div className="fixed right-4 top-4 z-[80] hidden items-center gap-2 lg:flex">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-700/70 bg-slate-950/90 px-3 text-xs font-semibold text-slate-300 shadow-2xl shadow-black/20 backdrop-blur transition hover:border-cyan-400/40 hover:text-cyan-100"
        >
          <Command className="h-4 w-4" aria-hidden="true" />
          Ctrl K
        </button>
        <button
          type="button"
          onClick={() => setNotificationsOpen((value) => !value)}
          className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700/70 bg-slate-950/90 text-slate-300 shadow-2xl shadow-black/20 backdrop-blur transition hover:border-amber-400/40 hover:text-amber-100"
          aria-label="Buka notifikasi"
        >
          <Bell className="h-4 w-4" aria-hidden="true" />
          {notifications.length > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
              {notifications.length > 9 ? '9+' : notifications.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={onOpenAssistant}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-400/25 bg-cyan-500/10 text-cyan-200 shadow-2xl shadow-black/20 backdrop-blur transition hover:bg-cyan-500/15"
          aria-label="Buka Nexus AI"
        >
          <Bot className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="fixed bottom-4 left-1/2 z-[80] flex -translate-x-1/2 items-center gap-2 rounded-full border border-slate-700/70 bg-slate-950/90 px-3 py-2 text-[11px] font-semibold text-slate-400 shadow-2xl shadow-black/25 backdrop-blur max-lg:hidden">
        {health === 'checking' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : health === 'ok' ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" /> : <AlertTriangle className="h-3.5 w-3.5 text-rose-300" />}
        <span>{health === 'ok' ? 'Backend aktif' : health === 'down' ? 'Backend tidak terhubung' : 'Cek koneksi'}</span>
        <span className="h-1 w-1 rounded-full bg-slate-700" />
        <ShieldCheck className="h-3.5 w-3.5 text-cyan-300" />
        <span>{user?.role === 'admin' ? 'Sesi admin' : user?.role === 'dpa' ? 'Sesi DPA' : user?.role === 'staff' ? 'Sesi staf' : 'Sesi user'}</span>
      </div>

      {lastIssue && (
        <div className="fixed inset-x-4 top-16 z-[85] mx-auto max-w-2xl rounded-xl border border-amber-400/25 bg-amber-500/10 p-4 text-sm text-amber-100 shadow-2xl shadow-black/30 backdrop-blur lg:top-16">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Koneksi sistem perlu dicek</p>
              <p className="mt-1 leading-6 text-amber-100/75">{lastIssue.message}</p>
              <p className="mt-1 truncate text-xs text-amber-100/55">{lastIssue.url || 'request'} • {formatTime(lastIssue.time)}</p>
            </div>
            <button type="button" onClick={() => setLastIssue(null)} className="rounded-lg p-1 text-amber-100/70 hover:bg-amber-100/10" aria-label="Tutup peringatan">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {notificationsOpen && (
        <div className="fixed right-4 top-16 z-[90] w-[360px] max-w-[calc(100vw-32px)] overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 text-slate-100 shadow-2xl shadow-black/40">
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
            <div>
              <p className="text-sm font-semibold">Notifikasi prioritas</p>
              <p className="text-xs text-slate-500">{notifications.length} belum dibaca</p>
            </div>
            <button type="button" onClick={() => setNotificationsOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-900 hover:text-slate-200" aria-label="Tutup notifikasi">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="max-h-[420px] overflow-y-auto p-3">
            {notifications.length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 text-center text-sm text-slate-500">
                Tidak ada notifikasi baru.
              </div>
            ) : (
              <div className="space-y-2">
                {notifications.map((item) => (
                  <article key={item.ID} className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                    <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-cyan-200">
                      <Bell className="h-3.5 w-3.5" />
                      {item.Type || 'notifikasi'}
                    </div>
                    <p className="text-sm leading-6 text-slate-300">{item.Message}</p>
                    <p className="mt-2 text-[11px] text-slate-600">{formatTime(item.CreatedAt)}</p>
                  </article>
                ))}
              </div>
            )}
          </div>
          {notifications.length > 0 && (
            <div className="border-t border-slate-800 p-3">
              <button type="button" onClick={markAllRead} className="h-10 w-full rounded-xl bg-cyan-500 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400">
                Tandai semua dibaca
              </button>
            </div>
          )}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-[110] bg-slate-950/70 p-4 backdrop-blur-sm" onMouseDown={() => setOpen(false)}>
          <div className="mx-auto mt-[8vh] max-w-2xl overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl shadow-black/50" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-center gap-3 border-b border-slate-800 px-4 py-4">
              <Search className="h-5 w-5 text-slate-500" />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Cari halaman, aksi, atau fitur..."
                className="h-10 min-w-0 flex-1 bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-600"
              />
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-900 hover:text-slate-200" aria-label="Tutup command palette">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[440px] overflow-y-auto p-3">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onOpenAssistant();
                }}
                className="mb-3 flex w-full items-center gap-3 rounded-xl border border-cyan-400/20 bg-cyan-500/10 p-3 text-left transition hover:bg-cyan-500/15"
              >
                <Bot className="h-5 w-5 text-cyan-200" />
                <div>
                  <p className="text-sm font-semibold text-cyan-100">Tanya Nexus AI</p>
                  <p className="text-xs text-cyan-100/60">Buka asisten untuk ringkasan, prioritas, atau jadwal.</p>
                </div>
              </button>

              <div className="space-y-1">
                {filteredActions.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.path}
                      type="button"
                      onClick={() => goTo(item.path)}
                      className="flex w-full items-center gap-3 rounded-xl p-3 text-left text-slate-300 transition hover:bg-slate-900 hover:text-white"
                    >
                      <Icon className="h-5 w-5 text-slate-500" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">{item.label}</p>
                        <p className="truncate text-xs text-slate-600">{item.path}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-slate-800 px-4 py-3 text-[11px] text-slate-600">
              <span>Enter untuk buka, Esc untuk tutup</span>
              <Link to={role === 'admin' ? '/settings' : role === 'dpa' ? '/dpa/profil' : role === 'staff' ? '/staff/dashboard' : '/user/settings'} onClick={() => setOpen(false)} className="font-semibold text-slate-400 hover:text-cyan-200">
                Keamanan sesi
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
