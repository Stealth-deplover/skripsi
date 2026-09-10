import { useMemo, useState } from 'react';
import { Line, LineChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import ChartShell from '../../components/ChartShell';
import { Activity, LineChart as LineChartIcon } from 'lucide-react';
import { tooltipStyle } from './styles';

function toWeeklyData(data: any[]) {
  const grouped: any[] = [];
  for (let index = 0; index < data.length; index += 7) {
    const slice = data.slice(index, index + 7);
    const avg = (key: string) => slice.reduce((sum, item) => sum + Number(item[key] || 0), 0) / Math.max(slice.length, 1);
    grouped.push({
      date: slice.length > 1 ? `${slice[0].date}-${slice[slice.length - 1].date}` : slice[0]?.date,
      semua: Number(avg('semua').toFixed(1)),
      mahasiswa: Number(avg('mahasiswa').toFixed(1)),
    });
  }
  return grouped;
}

export default function TrendChart({ data, loading }: { data: any[]; loading: boolean }) {
  const [mode, setMode] = useState<'daily' | 'weekly'>('daily');
  const chartData = useMemo(() => {
    const base = data && data.length > 0 ? data : [];
    return mode === 'weekly' ? toWeeklyData(base) : base;
  }, [data, mode]);

  return (
    <div className="flex h-full min-h-[390px] flex-col rounded-lg border border-white/10 bg-slate-950 p-5 shadow-xl shadow-black/10">
      <div className="flex flex-col gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <LineChartIcon className="h-4 w-4 shrink-0 text-cyan-200" />
            <span className="truncate">Tren Burnout</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">Rata-rata skor berdasarkan periode</p>
        </div>
        <div className="grid w-full grid-cols-2 rounded-md border border-white/10 bg-white/[0.03] p-1">
          {[
            ['daily', 'Harian'],
            ['weekly', 'Mingguan'],
          ].map(([value, label]) => (
            <button
              key={value}
              onClick={() => setMode(value as 'daily' | 'weekly')}
              className={`h-8 min-w-0 rounded px-2 text-xs font-semibold transition ${
                mode === value ? 'bg-cyan-300 text-slate-950' : 'text-slate-400 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-[11px] text-slate-400">
        {[
          ['Semua', 'bg-violet-300'],
          ['Mahasiswa', 'bg-emerald-300'],
        ].map(([label, color]) => (
          <span key={label} className="inline-flex min-w-0 items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-2 py-1">
            <span className={`h-2 w-2 shrink-0 rounded-full ${color}`} />
            <span className="truncate">{label}</span>
          </span>
        ))}
      </div>

      {loading ? (
        <div className="mt-4 flex h-[240px] items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-sm text-slate-400">
          Memuat data...
        </div>
      ) : chartData.length === 0 ? (
        <div className="mt-4 flex h-[240px] flex-col items-center justify-center rounded-lg border border-dashed border-white/10 bg-white/[0.03] text-center">
          <Activity className="h-8 w-8 text-slate-600" />
          <p className="mt-2 text-sm font-semibold text-slate-300">Belum ada data tren</p>
        </div>
      ) : (
        <ChartShell height={240} className="mt-4 overflow-hidden rounded-lg">
          <LineChart data={chartData} margin={{ top: 8, right: 8, left: -18, bottom: 20 }}>
            <CartesianGrid strokeDasharray="4 4" stroke="rgba(148, 163, 184, 0.12)" />
            <XAxis
              dataKey="date"
              tick={{ fill: '#94a3b8', fontSize: 9 }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={18}
            />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} domain={[0, 100]} />
            <Tooltip contentStyle={tooltipStyle} />
            <Line type="monotone" dataKey="semua" stroke="#a78bfa" strokeWidth={2.5} dot={{ r: 3 }} name="Semua" />
            <Line type="monotone" dataKey="mahasiswa" stroke="#34d399" strokeWidth={2.5} dot={false} name="Mahasiswa" />
          </LineChart>
        </ChartShell>
      )}
    </div>
  );
}
