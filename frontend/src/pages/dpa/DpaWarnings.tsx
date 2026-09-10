import { useEffect, useState } from 'react';
import { Loader2, RefreshCw, ShieldAlert } from 'lucide-react';
import DpaPageHeader from '../../components/DpaPageHeader';
import api from '../../api';

interface Warning {
  type: string;
  label: string;
  detail: string;
  priority: number;
}

const priorityChip: Record<number, string> = {
  3: 'border-rose-300/30 bg-rose-500/10 text-rose-100',
  2: 'border-amber-300/30 bg-amber-500/10 text-amber-100',
  1: 'border-slate-300/20 bg-slate-500/10 text-slate-200',
};

export default function DpaWarnings() {
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchWarnings = async () => {
    setLoading(true);
    try {
      const res = await api.get('/dpa/warnings');
      setWarnings(res.data.warnings ?? []);
      setTotal(res.data.total_students ?? 0);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Gagal memuat early warning');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWarnings();
  }, []);

  return (
    <div className="flex flex-col gap-5">
      <DpaPageHeader
        eyebrow="Early Warning"
        title="Early Warning Well-Being"
        description={`Sinyal burnout meningkat, Happiness menurun, atau kombinasi keduanya (Prioritas Monitoring Akademik) untuk ${total} mahasiswa bimbingan Anda. Sinyal ini bukan diagnosis.`}
        icon={ShieldAlert}
        actions={
          <button
            onClick={fetchWarnings}
            disabled={loading}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.07] disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        }
      />

      {error && <div className="rounded-lg border border-rose-300/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</div>}

      <section className="space-y-3">
        {loading ? (
          <div className="flex h-40 items-center justify-center text-sm text-slate-400">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Memuat warning...
          </div>
        ) : warnings.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center rounded-lg border border-white/10 bg-slate-950 text-center shadow-xl shadow-black/10">
            <ShieldAlert className="h-9 w-9 text-emerald-400/70" />
            <p className="mt-2 text-sm font-semibold text-slate-300">Tidak ada warning aktif</p>
            <p className="mt-1 text-xs text-slate-500">Kondisi well-being mahasiswa bimbingan Anda relatif stabil.</p>
          </div>
        ) : (
          warnings.map((warning, index) => (
            <div
              key={`${warning.type}-${index}`}
              className={`rounded-lg border p-4 shadow-xl shadow-black/10 ${warning.priority >= 3 ? 'border-rose-300/30 bg-rose-500/10' : 'border-amber-300/25 bg-amber-500/10'}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${priorityChip[warning.priority] || priorityChip[1]}`}>
                  {warning.priority >= 3 ? 'Prioritas Monitoring Akademik' : warning.type === 'burnout_risk' ? 'Risiko Burnout' : 'Perlu Perhatian'}
                </span>
                <span className="text-sm font-semibold text-white">{warning.label}</span>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-200">{warning.detail}</p>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
