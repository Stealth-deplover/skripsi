import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { LineChart, Loader2, Smile } from 'lucide-react';
import ChartShell from '../../components/ChartShell';
import api from '../../api';
import { categoryMeta, formatDateTime, HAPPINESS_COLOR } from './happinessShared';

interface TrendPoint {
  date: string;
  happiness_index: number;
  academic: number;
  motivation: number;
  social: number;
  lecturer: number;
  environment: number;
  facilities: number;
}

interface HistoryItem {
  id: number;
  happiness_index: number;
  category: string;
  level: string;
  timestamp: string;
}

export default function HappinessHistory() {
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api.get('/happiness/trend'), api.get('/happiness/history')])
      .then(([trendRes, historyRes]) => {
        setTrend(trendRes.data.trend ?? []);
        setHistory(historyRes.data.history ?? []);
      })
      .catch(() => setError('Gagal memuat riwayat happiness.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-slate-400">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Memuat riwayat happiness...
      </div>
    );
  }

  const tooltipStyle = { background: '#1a1e2e', border: '1px solid #2a2e42', borderRadius: 8, fontSize: 11, color: '#e2e8f0' };

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-2xl border border-white/10 bg-slate-950 p-5 shadow-xl shadow-black/10">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1 text-xs font-semibold text-amber-100">
          <LineChart className="h-3.5 w-3.5" />
          Trend Happiness
        </div>
        {trend.length === 0 ? (
          <div className="flex flex-col items-center py-10 text-center">
            <Smile className="h-9 w-9 text-slate-600" />
            <p className="mt-2 text-sm font-semibold text-slate-300">Belum ada data trend</p>
            <p className="mt-1 text-xs text-slate-500">Isi assessment happiness minimal satu kali untuk melihat trend.</p>
            <Link
              to="/user/happiness/assessment"
              className="mt-4 inline-flex h-10 items-center rounded-lg bg-amber-300 px-4 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
            >
              Isi Assessment
            </Link>
          </div>
        ) : (
          <ChartShell height={300}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend} margin={{ top: 10, right: 10, bottom: 0, left: -18 }}>
                <defs>
                  <linearGradient id="hiGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={HAPPINESS_COLOR} stopOpacity={0.5} />
                    <stop offset="100%" stopColor={HAPPINESS_COLOR} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#1e2130" strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fill: '#8890a4', fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#1e2130' }} />
                <YAxis domain={[0, 100]} tick={{ fill: '#8890a4', fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#1e2130' }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Area
                  type="monotone"
                  dataKey="happiness_index"
                  name="Happiness Index"
                  stroke={HAPPINESS_COLOR}
                  strokeWidth={2}
                  fill="url(#hiGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartShell>
        )}
      </section>

      {error && <div className="rounded-lg border border-rose-300/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</div>}

      <section className="rounded-2xl border border-white/10 bg-slate-950 p-5 shadow-xl shadow-black/10">
        <h2 className="text-sm font-semibold text-white">Riwayat Assessment Happiness</h2>
        <div className="mt-4 overflow-x-auto">
          {history.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">Belum ada riwayat assessment.</p>
          ) : (
            <table className="min-w-[560px] w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                  <th className="px-3 py-2.5">Waktu</th>
                  <th className="px-3 py-2.5">Happiness Index</th>
                  <th className="px-3 py-2.5">Kategori</th>
                  <th className="px-3 py-2.5">Level</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {history.map((item) => {
                  const meta = categoryMeta(item.category);
                  return (
                    <tr key={item.id} className="transition hover:bg-white/[0.03]">
                      <td className="px-3 py-3 text-xs text-slate-400">{formatDateTime(item.timestamp)}</td>
                      <td className="px-3 py-3 font-semibold text-white">{Math.round(item.happiness_index)}</td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${meta.chip}`}>{item.category}</span>
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-400">{item.level}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
