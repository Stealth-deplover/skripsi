import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Edit3,
  FileText,
  Loader2,
  Mail,
  PieChart as PieIcon,
  Plus,
  RefreshCw,
  Save,
  Search,
  Shield,
  Trash2,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { Cell, Pie, PieChart, Tooltip } from 'recharts';
import ChartShell from '../components/ChartShell';
import api from '../api';

type AccountFilter = 'all' | 'kaprodi' | 'dpa' | 'staff' | 'mahasiswa';
type ModalMode = 'create' | 'edit';

interface ManagedUser {
  id: number;
  username: string;
  nama: string;
  role: string;
  bio: string;
  profile_pic: string;
  nim: string;
  prodi: string;
  angkatan: string;
  semester: number;
  ipk: number;
  ips: number;
  sks: number;
  kehadiran: number;
  dpa_id: number;
  dpa_name: string;
  created_at: string;
  updated_at: string;
}

const emptyForm = {
  nama: '',
  username: '',
  role: 'student',
  password: '',
  bio: '',
  nim: '',
  prodi: '',
  angkatan: '',
  semester: '',
  ipk: '',
  ips: '',
  sks: '',
  kehadiran: '',
  dpa_id: '',
};

const accountMeta = {
  kaprodi: {
    label: 'Kaprodi',
    icon: Shield,
    chip: 'border-violet-300/25 bg-violet-500/10 text-violet-100',
    accent: '#a78bfa',
  },
  dpa: {
    label: 'DPA',
    icon: Users,
    chip: 'border-indigo-300/25 bg-indigo-500/10 text-indigo-100',
    accent: '#818cf8',
  },
  staff: {
    label: 'Staf Kampus',
    icon: FileText,
    chip: 'border-amber-300/25 bg-amber-500/10 text-amber-100',
    accent: '#fbbf24',
  },
  mahasiswa: {
    label: 'Mahasiswa',
    icon: UserCheck,
    chip: 'border-cyan-300/25 bg-cyan-500/10 text-cyan-100',
    accent: '#67e8f9',
  },
};

type AccountType = keyof typeof accountMeta;

const getAccountType = (user: Pick<ManagedUser, 'role'>): AccountType => {
  const role = (user.role || '').toLowerCase();
  if (role === 'superadmin' || role === 'admin' || role === 'kaprodi') return 'kaprodi';
  if (role === 'dpa') return 'dpa';
  if (role === 'staff' || role === 'staf') return 'staff';
  return 'mahasiswa';
};

const formatDate = (date: string) => {
  if (!date || date.startsWith('0001')) return '-';
  return new Date(date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
};

const passwordValid = (value: string) => {
  if (!value) return false;
  return value.length >= 8 && /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value);
};

export default function ManajemenUser() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<AccountFilter>('all');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [modalMode, setModalMode] = useState<ModalMode | null>(null);
  const [selected, setSelected] = useState<ManagedUser | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<ManagedUser | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const response = await api.get('/admin/users');
      setUsers(response.data.users || []);
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.error || 'Gagal memuat data user' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    if (!message) return;
    const timeout = setTimeout(() => setMessage(null), 3500);
    return () => clearTimeout(timeout);
  }, [message]);

  const stats = useMemo(() => {
    const kaprodi = users.filter((user) => getAccountType(user) === 'kaprodi').length;
    const dpa = users.filter((user) => getAccountType(user) === 'dpa').length;
    const staff = users.filter((user) => getAccountType(user) === 'staff').length;
    const mahasiswa = users.filter((user) => getAccountType(user) === 'mahasiswa').length;
    return { total: users.length, kaprodi, dpa, staff, mahasiswa };
  }, [users]);

  const filteredUsers = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return users.filter((user) => {
      const type = getAccountType(user);
      if (filter !== 'all' && type !== filter) return false;
      if (!keyword) return true;
      return `${user.nama} ${user.username} ${type} ${user.nim || ''} ${user.prodi || ''} ${user.bio || ''}`.toLowerCase().includes(keyword);
    });
  }, [filter, search, users]);

  const dpaOptions = useMemo(
    () => users.filter((user) => getAccountType(user) === 'dpa'),
    [users],
  );

  const pieData = [
    { name: 'Kaprodi', value: stats.kaprodi, color: accountMeta.kaprodi.accent },
    { name: 'DPA', value: stats.dpa, color: accountMeta.dpa.accent },
    { name: 'Staf Kampus', value: stats.staff, color: accountMeta.staff.accent },
    { name: 'Mahasiswa', value: stats.mahasiswa, color: accountMeta.mahasiswa.accent },
  ];

  const openCreate = () => {
    setSelected(null);
    setForm(emptyForm);
    setModalMode('create');
  };

  const openEdit = (user: ManagedUser) => {
    const type = getAccountType(user);
    setSelected(user);
    setForm({
      nama: user.nama,
      username: user.username,
      role: type === 'kaprodi' ? 'superadmin' : type === 'dpa' ? 'dpa' : 'student',
      password: '',
      bio: user.bio || '',
      nim: user.nim || '',
      prodi: user.prodi || '',
      angkatan: user.angkatan || '',
      semester: user.semester ? String(user.semester) : '',
      ipk: user.ipk ? String(user.ipk) : '',
      ips: user.ips ? String(user.ips) : '',
      sks: user.sks ? String(user.sks) : '',
      kehadiran: user.kehadiran ? String(user.kehadiran) : '',
      dpa_id: user.dpa_id ? String(user.dpa_id) : '',
    });
    setModalMode('edit');
  };

  const closeModal = () => {
    setModalMode(null);
    setSelected(null);
    setForm(emptyForm);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const cleanForm: Record<string, unknown> = {
      nama: form.nama.trim(),
      username: form.username.trim().toLowerCase(),
      role: form.role,
      bio: form.bio,
    };

    if (form.role === 'student') {
      cleanForm.nim = form.nim.trim();
      cleanForm.prodi = form.prodi.trim();
      cleanForm.angkatan = form.angkatan.trim();
      cleanForm.semester = form.semester === '' ? 0 : Number(form.semester);
      cleanForm.ipk = form.ipk === '' ? 0 : Number(form.ipk);
      cleanForm.ips = form.ips === '' ? 0 : Number(form.ips);
      cleanForm.sks = form.sks === '' ? 0 : Number(form.sks);
      cleanForm.kehadiran = form.kehadiran === '' ? 0 : Number(form.kehadiran);
      cleanForm.dpa_id = form.dpa_id === '' ? 0 : Number(form.dpa_id);
    }

    if (cleanForm.nama.length < 3) {
      setMessage({ type: 'error', text: 'Nama minimal 3 karakter' });
      return;
    }
    if (!/^[a-zA-Z0-9._@-]{3,80}$/.test(cleanForm.username)) {
      setMessage({ type: 'error', text: 'Username hanya boleh huruf, angka, titik, underscore, strip, atau email' });
      return;
    }
    if (modalMode === 'create' && !passwordValid(cleanForm.password)) {
      setMessage({ type: 'error', text: 'Password minimal 8 karakter dan wajib ada huruf besar, huruf kecil, dan angka' });
      return;
    }
    if (modalMode === 'edit' && cleanForm.password && !passwordValid(cleanForm.password)) {
      setMessage({ type: 'error', text: 'Password baru belum memenuhi aturan keamanan' });
      return;
    }

    setActionLoading(true);
    try {
      if (modalMode === 'create') {
        await api.post('/admin/users', cleanForm);
        setMessage({ type: 'success', text: `Akun ${cleanForm.nama} berhasil dibuat` });
      } else if (selected) {
        await api.put(`/admin/users/${selected.id}`, cleanForm);
        setMessage({ type: 'success', text: `Akun ${cleanForm.nama} berhasil diperbarui` });
      }
      closeModal();
      fetchUsers();
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.error || 'Gagal menyimpan user' });
    } finally {
      setActionLoading(false);
    }
  };

  // ---- Mapping massal mahasiswa -> DPA ----
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkDpaId, setBulkDpaId] = useState('');
  const [bulkProdi, setBulkProdi] = useState('');
  const [bulkAngkatan, setBulkAngkatan] = useState('');
  const [bulkSemester, setBulkSemester] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);

  const bulkTargets = useMemo(
    () =>
      users.filter((user) => {
        if (getAccountType(user) !== 'mahasiswa') return false;
        if (bulkProdi.trim() && !(user.prodi || '').toLowerCase().includes(bulkProdi.trim().toLowerCase())) return false;
        if (bulkAngkatan.trim() && (user.angkatan || '') !== bulkAngkatan.trim()) return false;
        if (bulkSemester.trim() && String(user.semester) !== bulkSemester.trim()) return false;
        return true;
      }),
    [users, bulkProdi, bulkAngkatan, bulkSemester],
  );

  const submitBulk = async () => {
    if (!bulkDpaId || bulkTargets.length === 0) return;
    setBulkSaving(true);
    try {
      const res = await api.post('/admin/users/bulk-dpa', {
        dpa_id: Number(bulkDpaId),
        student_ids: bulkTargets.map((user) => user.id),
      });
      setMessage({ type: 'success', text: res.data.message || 'Mapping massal tersimpan' });
      setBulkOpen(false);
      setBulkDpaId('');
      fetchUsers();
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.error || 'Mapping massal gagal' });
    } finally {
      setBulkSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setActionLoading(true);
    try {
      await api.delete(`/admin/users/${deleteTarget.id}`);
      setMessage({ type: 'success', text: `Akun ${deleteTarget.nama} berhasil dihapus` });
      setDeleteTarget(null);
      fetchUsers();
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.error || 'Gagal menghapus user' });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#0b0d14] px-4 py-5 text-slate-100 sm:px-6 lg:px-7">
      <div className="mx-auto flex max-w-[1680px] flex-col gap-5">
        <header className="rounded-lg border border-white/10 bg-slate-950 p-5 shadow-xl shadow-black/20">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-md border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-semibold text-cyan-100">
                <Users className="h-3.5 w-3.5" />
                User access control
              </div>
              <h1 className="text-2xl font-semibold tracking-normal text-white sm:text-3xl">Manajemen User</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                Kelola akun kaprodi, DPA, dan mahasiswa dari satu tempat. Tambah akun baru, ubah role, atur profil akademik, petakan mahasiswa ke DPA, atau hapus akun yang tidak digunakan.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={fetchUsers}
                disabled={loading}
                className="inline-flex h-10 items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.07] disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <button
                onClick={() => setBulkOpen(true)}
                className="inline-flex h-10 items-center gap-2 rounded-md border border-indigo-300/30 bg-indigo-400/10 px-3 text-sm font-semibold text-indigo-100 transition hover:bg-indigo-400/20"
              >
                <UserCheck className="h-4 w-4" />
                Mapping Massal
              </button>
              <button
                onClick={openCreate}
                className="inline-flex h-10 items-center gap-2 rounded-md bg-emerald-400 px-4 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"
              >
                <Plus className="h-4 w-4" />
                Tambah User
              </button>
            </div>
          </div>
        </header>

        {message && (
          <div className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm ${
            message.type === 'success'
              ? 'border-emerald-300/25 bg-emerald-500/10 text-emerald-100'
              : 'border-rose-300/25 bg-rose-500/10 text-rose-100'
          }`}>
            {message.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            {message.text}
          </div>
        )}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { key: 'all', label: 'Total Akun', value: stats.total, icon: Users, className: 'text-slate-100 bg-slate-700/30' },
            { key: 'kaprodi', label: 'Kaprodi', value: stats.kaprodi, icon: Shield, className: 'text-violet-100 bg-violet-500/10' },
            { key: 'dpa', label: 'DPA', value: stats.dpa, icon: Users, className: 'text-indigo-100 bg-indigo-500/10' },
            { key: 'mahasiswa', label: 'Mahasiswa', value: stats.mahasiswa, icon: UserCheck, className: 'text-cyan-100 bg-cyan-500/10' },
            { key: 'staff', label: 'Staf Kampus', value: stats.staff, icon: FileText, className: 'text-amber-100 bg-amber-500/10' },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                onClick={() => setFilter(item.key as AccountFilter)}
                className={`rounded-lg border p-4 text-left shadow-xl shadow-black/10 transition ${
                  filter === item.key ? 'border-cyan-300/40 bg-slate-900' : 'border-white/10 bg-slate-950 hover:bg-white/[0.04]'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">{item.label}</p>
                    <p className="mt-2 text-3xl font-semibold text-white">{loading ? '-' : item.value}</p>
                  </div>
                  <span className={`flex h-11 w-11 items-center justify-center rounded-md ${item.className}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                </div>
              </button>
            );
          })}
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="rounded-lg border border-white/10 bg-slate-950 p-5 shadow-xl shadow-black/10">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  <Users className="h-4 w-4 text-cyan-200" />
                  Daftar Akun
                </div>
                <p className="mt-1 text-xs text-slate-500">{filteredUsers.length} akun sesuai filter</p>
              </div>
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Cari nama, username, atau kategori"
                  className="h-10 w-full rounded-md border border-white/10 bg-white/[0.04] pl-9 pr-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-300/50 xl:w-80"
                />
              </label>
            </div>

            <div className="mt-5 overflow-hidden rounded-lg border border-white/10">
              {loading ? (
                <div className="flex h-40 items-center justify-center text-sm text-slate-400">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Memuat data user...
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="flex h-40 flex-col items-center justify-center text-center">
                  <Users className="h-9 w-9 text-slate-600" />
                  <p className="mt-2 text-sm font-semibold text-slate-300">Tidak ada user ditemukan</p>
                  <p className="mt-1 text-xs text-slate-500">Ubah filter atau kata kunci pencarian.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-[1080px] table-fixed border-collapse text-sm">
                    <colgroup>
                      <col className="w-16" />
                      <col className="w-64" />
                      <col className="w-44" />
                      <col className="w-40" />
                      <col className="w-44" />
                      <col className="w-32" />
                      <col className="w-32" />
                      <col className="w-36" />
                    </colgroup>
                    <thead className="bg-white/[0.03]">
                      <tr className="border-b border-white/10 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                        <th className="px-4 py-3">No</th>
                        <th className="px-4 py-3">Nama / Username</th>
                        <th className="px-4 py-3">Role</th>
                        <th className="px-4 py-3">NIM / Prodi</th>
                        <th className="px-4 py-3">Bio</th>
                        <th className="px-4 py-3">Dibuat</th>
                        <th className="px-4 py-3">Update</th>
                        <th className="px-4 py-3">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10">
                      {filteredUsers.map((user, index) => {
                        const type = getAccountType(user);
                        const meta = accountMeta[type];
                        const Icon = meta.icon;
                        return (
                          <tr key={user.id} className="transition hover:bg-white/[0.03]">
                            <td className="px-4 py-4 text-slate-500">{index + 1}</td>
                            <td className="px-4 py-4">
                              <div className="flex min-w-0 items-center gap-3">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-sm font-semibold text-white">
                                  {(user.nama || user.username || 'U').charAt(0).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <p className="truncate font-semibold text-slate-100" title={user.nama}>{user.nama || 'Tanpa nama'}</p>
                                  <p className="mt-1 flex items-center gap-1 truncate text-xs text-slate-500" title={user.username}>
                                    <Mail className="h-3 w-3 shrink-0" />
                                    {user.username}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-4">
                              <span className={`inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs font-semibold ${meta.chip}`}>
                                <Icon className="h-3.5 w-3.5" />
                                {meta.label}
                              </span>
                              {type === 'mahasiswa' && user.dpa_name && (
                                <p className="mt-1.5 truncate text-[10px] text-slate-500" title={`DPA: ${user.dpa_name}`}>
                                  DPA: {user.dpa_name}
                                </p>
                              )}
                            </td>
                            <td className="px-4 py-4">
                              {type === 'mahasiswa' ? (
                                <div className="text-xs">
                                  <p className="font-semibold text-slate-200">{user.nim || '-'}</p>
                                  <p className="mt-1 text-slate-500">{user.prodi || '-'}{user.semester ? ` · Smt ${user.semester}` : ''}</p>
                                </div>
                              ) : (
                                <span className="text-xs text-slate-500">—</span>
                              )}
                            </td>
                            <td className="px-4 py-4">
                              <p className="truncate text-xs text-slate-400" title={user.bio || '-'}>{user.bio || '-'}</p>
                            </td>
                            <td className="px-4 py-4 text-xs text-slate-400">
                              <span className="inline-flex items-center gap-1">
                                <Calendar className="h-3.5 w-3.5" />
                                {formatDate(user.created_at)}
                              </span>
                            </td>
                            <td className="px-4 py-4 text-xs text-slate-400">{formatDate(user.updated_at)}</td>
                            <td className="px-4 py-4">
                              <div className="flex gap-2">
                                <button
                                  onClick={() => openEdit(user)}
                                  className="inline-flex h-9 items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-slate-200 transition hover:border-cyan-300/40 hover:text-cyan-100"
                                >
                                  <Edit3 className="h-3.5 w-3.5" />
                                  Edit
                                </button>
                                <button
                                  onClick={() => setDeleteTarget(user)}
                                  className="inline-flex h-9 items-center gap-1.5 rounded-md border border-rose-300/20 bg-rose-500/10 px-3 text-xs font-semibold text-rose-100 transition hover:bg-rose-500/20"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  Hapus
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
          </div>

          <aside className="flex flex-col gap-5">
            <div className="rounded-lg border border-white/10 bg-slate-950 p-5 shadow-xl shadow-black/10">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <PieIcon className="h-4 w-4 text-violet-200" />
                Distribusi Akun
              </div>
              <ChartShell height={210} className="mt-4 overflow-hidden">
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={58} outerRadius={82} paddingAngle={4} dataKey="value">
                    {pieData.map((entry) => <Cell key={entry.name} fill={entry.color} stroke="transparent" />)}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: '#020617', border: '1px solid rgba(148,163,184,.2)', borderRadius: 8, color: '#fff', fontSize: 12 }}
                  />
                </PieChart>
              </ChartShell>
              <div className="grid grid-cols-3 gap-2">
                {pieData.map((item) => (
                  <div key={item.name} className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-center">
                    <p className="text-lg font-semibold" style={{ color: item.color }}>{item.value}</p>
                    <p className="text-[10px] text-slate-500">{item.name}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-white/10 bg-slate-950 p-5 shadow-xl shadow-black/10">
              <div className="text-sm font-semibold text-white">Akses Sistem</div>
              <div className="mt-4 space-y-3">
                {[
                  ['Kaprodi', 'Akses penuh: kelola mahasiswa, dosen, DPA, mapping bimbingan, analytics prodi, dan konfigurasi sistem.', accountMeta.kaprodi],
                  ['Staf Kampus', 'Memproses laporan bimbingan akademik (syarat UTS/UAS) dan mengunduh dokumen arsip.', accountMeta.staff],
                  ['DPA', 'Memantau burnout & happiness mahasiswa bimbingan, catatan monitoring, early warning, dan laporan.', accountMeta.dpa],
                  ['Mahasiswa', 'Mengisi assessment burnout & happiness, melihat analitik pribadi, curhat, dan jaringan teman.', accountMeta.mahasiswa],
                ].map(([title, desc, meta]) => {
                  const typedMeta = meta as typeof accountMeta.kaprodi;
                  const Icon = typedMeta.icon;
                  return (
                    <div key={title as string} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                      <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                        <Icon className="h-4 w-4" style={{ color: typedMeta.accent }} />
                        {title as string}
                      </div>
                      <p className="mt-2 text-xs leading-5 text-slate-500">{desc as string}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </aside>
        </section>
      </div>

      {modalMode && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm" onClick={closeModal}>
          <div className="w-full max-w-lg rounded-lg border border-white/10 bg-slate-950 p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-white">{modalMode === 'create' ? 'Tambah User' : 'Edit User'}</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {modalMode === 'create' ? 'Buat akun kaprodi, DPA, atau mahasiswa.' : 'Perbarui data akun, profil akademik, dan akses pengguna.'}
                </p>
              </div>
              <button onClick={closeModal} className="flex h-9 w-9 items-center justify-center rounded-md border border-white/10 text-slate-400 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-semibold text-slate-400">Nama lengkap</span>
                  <input
                    value={form.nama}
                    onChange={(event) => setForm({ ...form, nama: event.target.value })}
                    className="mt-1 h-10 w-full rounded-md border border-white/10 bg-white/[0.04] px-3 text-sm text-white outline-none focus:border-cyan-300/50"
                    required
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-slate-400">Username / email</span>
                  <input
                    value={form.username}
                    onChange={(event) => setForm({ ...form, username: event.target.value })}
                    className="mt-1 h-10 w-full rounded-md border border-white/10 bg-white/[0.04] px-3 text-sm text-white outline-none focus:border-cyan-300/50"
                    required
                  />
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-semibold text-slate-400">Role akun</span>
                  <select
                    value={form.role}
                    onChange={(event) => {
                      setForm({ ...form, role: event.target.value });
                    }}
                    className="mt-1 h-10 w-full rounded-md border border-white/10 bg-slate-900 px-3 text-sm text-white outline-none focus:border-cyan-300/50"
                  >
                    <option value="student">Mahasiswa (Student)</option>
                    <option value="dpa">Dosen Pembimbing Akademik (DPA)</option>
                    <option value="staff">Staf Kampus (Staff)</option>
                    <option value="superadmin">Kaprodi (Superadmin)</option>
                  </select>
                </label>
                {form.role !== 'student' && <div />}
                <label className="block">
                  <span className="text-xs font-semibold text-slate-400">
                    {modalMode === 'create' ? 'Password' : 'Password baru'}
                  </span>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(event) => setForm({ ...form, password: event.target.value })}
                    placeholder={modalMode === 'create' ? 'Wajib diisi' : 'Kosongkan jika tidak diubah'}
                    className="mt-1 h-10 w-full rounded-md border border-white/10 bg-white/[0.04] px-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-300/50"
                    required={modalMode === 'create'}
                  />
                </label>
              </div>

              {form.role === 'student' && (
                <>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className="block">
                      <span className="text-xs font-semibold text-slate-400">NIM</span>
                      <input
                        value={form.nim}
                        onChange={(event) => setForm({ ...form, nim: event.target.value })}
                        className="mt-1 h-10 w-full rounded-md border border-white/10 bg-white/[0.04] px-3 text-sm text-white outline-none focus:border-cyan-300/50"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-semibold text-slate-400">Program Studi</span>
                      <input
                        value={form.prodi}
                        onChange={(event) => setForm({ ...form, prodi: event.target.value })}
                        placeholder="cth. Informatika"
                        className="mt-1 h-10 w-full rounded-md border border-white/10 bg-white/[0.04] px-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-300/50"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-semibold text-slate-400">Angkatan</span>
                      <input
                        value={form.angkatan}
                        onChange={(event) => setForm({ ...form, angkatan: event.target.value })}
                        placeholder="cth. 2023"
                        className="mt-1 h-10 w-full rounded-md border border-white/10 bg-white/[0.04] px-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-300/50"
                      />
                    </label>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-4">
                    <label className="block">
                      <span className="text-xs font-semibold text-slate-400">Semester</span>
                      <input
                        type="number" min={0} max={14}
                        value={form.semester}
                        onChange={(event) => setForm({ ...form, semester: event.target.value })}
                        className="mt-1 h-10 w-full rounded-md border border-white/10 bg-white/[0.04] px-3 text-sm text-white outline-none focus:border-cyan-300/50"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-semibold text-slate-400">IPK</span>
                      <input
                        type="number" min={0} max={4} step="0.01"
                        value={form.ipk}
                        onChange={(event) => setForm({ ...form, ipk: event.target.value })}
                        className="mt-1 h-10 w-full rounded-md border border-white/10 bg-white/[0.04] px-3 text-sm text-white outline-none focus:border-cyan-300/50"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-semibold text-slate-400">IPS</span>
                      <input
                        type="number" min={0} max={4} step="0.01"
                        value={form.ips}
                        onChange={(event) => setForm({ ...form, ips: event.target.value })}
                        className="mt-1 h-10 w-full rounded-md border border-white/10 bg-white/[0.04] px-3 text-sm text-white outline-none focus:border-cyan-300/50"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-semibold text-slate-400">SKS</span>
                      <input
                        type="number" min={0} max={160}
                        value={form.sks}
                        onChange={(event) => setForm({ ...form, sks: event.target.value })}
                        className="mt-1 h-10 w-full rounded-md border border-white/10 bg-white/[0.04] px-3 text-sm text-white outline-none focus:border-cyan-300/50"
                      />
                    </label>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="text-xs font-semibold text-slate-400">Kehadiran (%)</span>
                      <input
                        type="number" min={0} max={100} step="0.1"
                        value={form.kehadiran}
                        onChange={(event) => setForm({ ...form, kehadiran: event.target.value })}
                        className="mt-1 h-10 w-full rounded-md border border-white/10 bg-white/[0.04] px-3 text-sm text-white outline-none focus:border-cyan-300/50"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-semibold text-slate-400">DPA Pembimbing</span>
                      <select
                        value={form.dpa_id}
                        onChange={(event) => setForm({ ...form, dpa_id: event.target.value })}
                        className="mt-1 h-10 w-full rounded-md border border-white/10 bg-slate-900 px-3 text-sm text-white outline-none focus:border-cyan-300/50"
                      >
                        <option value="">— Belum dipetakan —</option>
                        {dpaOptions.map((dpa) => (
                          <option key={dpa.id} value={dpa.id}>{dpa.nama} ({dpa.username})</option>
                        ))}
                      </select>
                    </label>
                  </div>
                </>
              )}

              <div className="rounded-md border border-white/10 bg-white/[0.03] p-3 text-xs text-slate-500">
                Password minimal 8 karakter dan wajib mengandung huruf besar, huruf kecil, serta angka.
              </div>

              <label className="block">
                <span className="text-xs font-semibold text-slate-400">Bio</span>
                <textarea
                  value={form.bio}
                  onChange={(event) => setForm({ ...form, bio: event.target.value })}
                  rows={3}
                  className="mt-1 w-full resize-none rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-cyan-300/50"
                />
              </label>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="inline-flex h-10 flex-1 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-sm font-semibold text-slate-300 transition hover:bg-white/[0.07]"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md bg-emerald-400 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Simpan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {bulkOpen && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm" onClick={() => setBulkOpen(false)}>
          <div className="w-full max-w-lg rounded-lg border border-white/10 bg-slate-950 p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-white">Mapping Massal ke DPA</h2>
                <p className="mt-1 text-xs text-slate-500">Terapkan satu DPA ke banyak mahasiswa sekaligus berdasarkan filter.</p>
              </div>
              <button onClick={() => setBulkOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-md border border-white/10 text-slate-400 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="text-xs font-semibold text-slate-400">DPA tujuan</span>
                <select
                  value={bulkDpaId}
                  onChange={(event) => setBulkDpaId(event.target.value)}
                  className="mt-1 h-10 w-full rounded-md border border-white/10 bg-slate-900 px-3 text-sm text-white outline-none focus:border-cyan-300/50"
                >
                  <option value="">— Pilih DPA —</option>
                  {dpaOptions.map((dpa) => (
                    <option key={dpa.id} value={dpa.id}>{dpa.nama} ({dpa.username})</option>
                  ))}
                </select>
              </label>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block">
                  <span className="text-xs font-semibold text-slate-400">Prodi mengandung</span>
                  <input value={bulkProdi} onChange={(e) => setBulkProdi(e.target.value)} placeholder="cth. Informatika" className="mt-1 h-10 w-full rounded-md border border-white/10 bg-white/[0.04] px-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-300/50" />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-slate-400">Angkatan</span>
                  <input value={bulkAngkatan} onChange={(e) => setBulkAngkatan(e.target.value)} placeholder="cth. 2023" className="mt-1 h-10 w-full rounded-md border border-white/10 bg-white/[0.04] px-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-300/50" />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-slate-400">Semester</span>
                  <input type="number" min={1} max={14} value={bulkSemester} onChange={(e) => setBulkSemester(e.target.value)} placeholder="cth. 5" className="mt-1 h-10 w-full rounded-md border border-white/10 bg-white/[0.04] px-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-300/50" />
                </label>
              </div>

              <div className="rounded-md border border-white/10 bg-white/[0.03] p-3 text-xs text-slate-400">
                <span className="font-semibold text-slate-200">{bulkTargets.length}</span> mahasiswa akan dipetakan ke DPA terpilih.
                {bulkTargets.length > 0 && bulkTargets.length <= 12 && (
                  <p className="mt-1 text-slate-500">{bulkTargets.map((u) => u.nama).join(', ')}</p>
                )}
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setBulkOpen(false)}
                  className="inline-flex h-10 flex-1 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-sm font-semibold text-slate-300 transition hover:bg-white/[0.07]"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={submitBulk}
                  disabled={!bulkDpaId || bulkTargets.length === 0 || bulkSaving}
                  className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md bg-indigo-400 text-sm font-semibold text-slate-950 transition hover:bg-indigo-300 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {bulkSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
                  Terapkan Mapping
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm" onClick={() => setDeleteTarget(null)}>
          <div className="w-full max-w-md rounded-lg border border-white/10 bg-slate-950 p-5 text-center shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-rose-300/25 bg-rose-500/10 text-rose-100">
              <Trash2 className="h-5 w-5" />
            </div>
            <h2 className="mt-4 text-lg font-semibold text-white">Hapus User?</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Akun <span className="font-semibold text-white">{deleteTarget.nama}</span> akan dihapus dari sistem. Tindakan ini tidak dapat dibatalkan.
            </p>
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="inline-flex h-10 flex-1 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-sm font-semibold text-slate-300 transition hover:bg-white/[0.07]"
              >
                Batal
              </button>
              <button
                onClick={handleDelete}
                disabled={actionLoading}
                className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md bg-rose-500 text-sm font-semibold text-white transition hover:bg-rose-400 disabled:opacity-60"
              >
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
