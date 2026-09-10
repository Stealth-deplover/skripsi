import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BadgeCheck, Camera, Loader2, LogOut, Save, ShieldCheck, UserRound } from 'lucide-react';
import DpaPageHeader from '../../components/DpaPageHeader';
import api from '../../api';

export default function DpaProfil() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ nama: '', username: '', nip: '', phone: '', bio: '', profile_pic: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api
      .get('/user/profile')
      .then((res) => {
        setForm({
          nama: res.data.nama || '',
          username: res.data.username || '',
          nip: res.data.nip || '',
          phone: res.data.phone || '',
          bio: res.data.bio || '',
          profile_pic: res.data.profile_pic || '',
        });
      })
      .catch(() => setMessage({ type: 'error', text: 'Profil tidak dapat dimuat.' }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!message) return;
    const timeout = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(timeout);
  }, [message]);

  const handleAvatarChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setMessage({ type: 'error', text: 'Ukuran foto maksimal 2MB' });
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => setForm((prev) => ({ ...prev, profile_pic: reader.result as string }));
    reader.readAsDataURL(file);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const payload: Record<string, string> = {
        nama: form.nama.trim(),
        nip: form.nip.trim(),
        phone: form.phone.trim(),
        bio: form.bio,
      };
      if (form.profile_pic) payload.profile_pic = form.profile_pic;
      const res = await api.put('/user/profile', payload);
      if (res.data.user) {
        // Sinkronkan nama/foto di sidebar dengan data terbaru.
        localStorage.setItem('user', JSON.stringify({ ...JSON.parse(localStorage.getItem('user') || '{}'), ...res.data.user }));
      }
      setMessage({ type: 'success', text: 'Profil dosen berhasil disimpan.' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Profil gagal disimpan.' });
    } finally {
      setSaving(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const inputClass = 'mt-1 h-11 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-indigo-300/50';

  return (
    <div className="flex flex-col gap-5">
      <DpaPageHeader
        eyebrow="Profil Dosen"
        title="Profil Saya"
        description="Profil ini ditampilkan kepada mahasiswa bimbingan di direktori DPA — lengkapi agar mudah dikenali dan dihubungi."
        icon={UserRound}
      />

      {message && (
        <div className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm ${message.type === 'success' ? 'border-emerald-300/25 bg-emerald-500/10 text-emerald-100' : 'border-rose-300/25 bg-rose-500/10 text-rose-100'}`}>
          {message.type === 'success' ? <BadgeCheck className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
          {message.text}
        </div>
      )}

      {loading ? (
        <div className="flex h-56 items-center justify-center text-sm text-slate-400">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Memuat profil...
        </div>
      ) : (
        <form onSubmit={save} className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
          {/* Kartu identitas */}
          <aside className="flex flex-col items-center rounded-lg border border-white/10 bg-slate-950 p-6 text-center shadow-xl shadow-black/10">
            <div className="relative">
              {form.profile_pic ? (
                <img src={form.profile_pic} alt="Foto profil" className="h-32 w-32 rounded-2xl border border-white/10 object-cover" />
              ) : (
                <span className="grid h-32 w-32 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-400 text-3xl font-bold text-white">
                  {form.nama ? form.nama.split(' ').slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') : '?'}
                </span>
              )}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute -bottom-2 -right-2 grid h-10 w-10 place-items-center rounded-full border border-slate-950 bg-indigo-400 text-slate-950 transition hover:bg-indigo-300"
                aria-label="Ubah foto profil"
              >
                <Camera className="h-4.5 w-4.5" />
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
            </div>
            <h2 className="mt-4 text-lg font-semibold text-white">{form.nama || 'Nama Dosen'}</h2>
            <p className="text-xs text-slate-500">{form.username}</p>
            {form.nip && <p className="mt-1 text-xs text-slate-400">NIP/NIDN: {form.nip}</p>}
            {form.phone && <p className="mt-0.5 text-xs text-slate-400">{form.phone}</p>}

            <div className="mt-5 w-full space-y-2 border-t border-white/10 pt-4 text-left text-[11px] leading-4 text-slate-500">
              <p>• Foto, nama, dan nomor telepon tampil di direktori DPA milik mahasiswa.</p>
              <p>• Penilaian bintang dari mahasiswa tidak pernah tampil di portal DPA.</p>
            </div>
            <button
              type="button"
              onClick={logout}
              className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] text-sm font-semibold text-slate-300 transition hover:bg-white/[0.07]"
            >
              <LogOut className="h-4 w-4" /> Keluar
            </button>
          </aside>

          {/* Form */}
          <section className="rounded-lg border border-white/10 bg-slate-950 p-6 shadow-xl shadow-black/10">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-semibold text-slate-400">Nama lengkap (dengan gelar)</span>
                <input value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} placeholder="cth. Dr. Ahmad Fauzi, M.Kom." className={inputClass} />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-slate-400">NIP / NIDN</span>
                <input value={form.nip} onChange={(e) => setForm({ ...form, nip: e.target.value })} placeholder="cth. 198012312010121001" className={inputClass} />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-slate-400">Nomor telepon / WhatsApp</span>
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="cth. +62 812-3456-7890" className={inputClass} />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-slate-400">Email / username</span>
                <input value={form.username} disabled className={`${inputClass} cursor-not-allowed opacity-60`} />
              </label>
            </div>
            <label className="mt-4 block">
              <span className="text-xs font-semibold text-slate-400">Bio singkat (bidang, jadwal konsultasi, dsb.)</span>
              <textarea
                value={form.bio}
                onChange={(e) => setForm({ ...form, bio: e.target.value })}
                rows={4}
                placeholder="cth. Dosen Pembimbing Akademik prodi Informatika. Konsultasi: Selasa & Kamis 10.00–12.00."
                className="mt-1 w-full resize-none rounded-lg border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-indigo-300/50"
              />
            </label>

            <div className="mt-5 flex items-center justify-end gap-2 border-t border-white/10 pt-4">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-indigo-400 px-5 text-sm font-semibold text-slate-950 transition hover:bg-indigo-300 disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Simpan Profil
              </button>
            </div>
          </section>
        </form>
      )}
    </div>
  );
}
