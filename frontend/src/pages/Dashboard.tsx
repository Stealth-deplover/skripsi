import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Activity, Flame, RefreshCw, ShieldAlert, Smile } from 'lucide-react';
import { Link } from 'react-router-dom';
import DashboardHeader from './dashboard/DashboardHeader';
import StatCards from './dashboard/StatCards';
import TrendChart from './dashboard/TrendChart';
import DonutCharts from './dashboard/DonutCharts';
import KorelasiChart from './dashboard/KorelasiChart';
import ScatterPlot from './dashboard/ScatterPlot';
import ModelPerformance from './dashboard/ModelPerformance';
import RightPanel from './dashboard/RightPanel';
import RespondentTable from './dashboard/RespondentTable';
import api from '../api';

export default function DashboardPage() {
  const [analytics, setAnalytics] = useState<any>(null);
  const [respondents, setRespondents] = useState<any[]>([]);
  const [happinessOverview, setHappinessOverview] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState('all');
  const [groupFilter, setGroupFilter] = useState('all');
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const [analyticsRes, respondentsRes] = await Promise.all([
        api.get('/admin/analytics'),
        api.get('/responden'),
      ]);
      setAnalytics(analyticsRes.data);
      setRespondents(respondentsRes.data.respondents || []);
      // Happiness overview terpisah; dashboard tetap jalan bila gagal.
      api.get('/admin/happiness?days=90')
        .then((res) => setHappinessOverview(res.data.overview ?? null))
        .catch(() => undefined);
      setLastUpdated(new Date());
    } catch {
      setError('Gagal memuat data dashboard. Pastikan server backend aktif dan akun admin sudah login.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredTrend = useMemo(() => {
    const data = analytics?.trendData || [];
    if (dateFilter === 'all' || !data.length) return data;
    const days: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90, 'this-month': 30, 'last-month': 30 };
    const limit = days[dateFilter] || data.length;
    return data.slice(Math.max(0, data.length - limit));
  }, [analytics, dateFilter]);

  const filteredRespondents = useMemo(() => {
    if (groupFilter === 'all') return respondents;
    return respondents.filter((respondent: any) => {
      const group = 'mahasiswa';
      return group === groupFilter;
    });
  }, [respondents, groupFilter]);

  return (
    <main className="min-h-screen bg-[#0b0d14] px-4 py-5 text-slate-100 sm:px-6 lg:px-7">
      <div className="mx-auto flex max-w-[1680px] flex-col gap-5">
        <DashboardHeader
          dateFilter={dateFilter}
          groupFilter={groupFilter}
          onDateChange={setDateFilter}
          onGroupChange={setGroupFilter}
          onRefresh={fetchData}
          loading={loading}
          lastUpdated={lastUpdated}
        />

        {error && (
          <div className="flex flex-col gap-3 rounded-lg border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-100 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-200" />
              <span>{error}</span>
            </div>
            <button
              onClick={fetchData}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-rose-300/30 bg-rose-300/10 px-3 text-xs font-semibold text-rose-100 transition hover:bg-rose-300/20"
            >
              <RefreshCw className="h-4 w-4" />
              Coba lagi
            </button>
          </div>
        )}

        <StatCards data={analytics} loading={loading} />

        {happinessOverview && (
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'Average Happiness', value: `${happinessOverview.avg_happiness?.toFixed(0) ?? '-'}/100`, icon: Smile, tone: 'text-amber-100 bg-amber-500/10' },
              { label: 'Avg Burnout', value: `${happinessOverview.avg_burnout?.toFixed(1) ?? '-'}/10`, icon: Flame, tone: 'text-indigo-100 bg-indigo-500/10' },
              { label: 'Happiness Rendah', value: happinessOverview.happiness_rendah ?? 0, icon: Activity, tone: 'text-orange-100 bg-orange-500/10' },
              { label: 'Prioritas Monitoring', value: happinessOverview.priority_monitoring ?? 0, icon: ShieldAlert, tone: 'text-rose-100 bg-rose-500/10' },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="rounded-lg border border-white/10 bg-slate-950 p-4 shadow-xl shadow-black/10">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">{item.label}</p>
                      <p className="mt-2 text-2xl font-semibold text-white">{item.value}</p>
                    </div>
                    <span className={`flex h-10 w-10 items-center justify-center rounded-md ${item.tone}`}>
                      <Icon className="h-4.5 w-4.5" />
                    </span>
                  </div>
                </div>
              );
            })}
            <div className="sm:col-span-2 xl:col-span-4 text-right">
              <Link to="/wellbeing-analitik" className="text-xs font-semibold text-amber-200 hover:text-amber-100">
                Buka Analitik Well-Being lengkap →
              </Link>
            </div>
          </section>
        )}

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
          <div className="flex min-w-0 flex-col gap-5">
            <div className="grid min-w-0 gap-5 lg:grid-cols-3">
              <div className="lg:col-span-1">
                <TrendChart data={filteredTrend} loading={loading} />
              </div>
              <div className="lg:col-span-2">
                <DonutCharts data={analytics} loading={loading} />
              </div>
            </div>

            <div className="grid min-w-0 gap-5 lg:grid-cols-3">
              <KorelasiChart data={analytics?.correlationData} loading={loading} />
              <ScatterPlot data={analytics?.scatterData} loading={loading} />
              <ModelPerformance data={analytics} loading={loading} />
            </div>

            <RespondentTable data={filteredRespondents} loading={loading} />
          </div>

          <RightPanel data={analytics} loading={loading} />
        </section>
      </div>
    </main>
  );
}
