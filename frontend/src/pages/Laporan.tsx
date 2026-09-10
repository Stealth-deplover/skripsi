import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Download,
  FileSpreadsheet,
  FileText,
  FileType,
  Filter,
  Loader2,
  PieChart,
  Printer,
  RefreshCw,
  Search,
  ShieldCheck,
  TrendingUp,
  Users,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart as RePieChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import ChartShell from '../components/ChartShell';
import api from '../api';

interface Analytics {
  totalRespondents: number;
  avgBurnout: number;
  highRiskCount: number;
  totalPredictions: number;
  burnoutDist: Record<string, number>;
  psychoDist: Record<string, number>;
  scatterData: { x: number; y: number }[];
  trendData: { date: string; semua: number }[];
}

interface Respondent {
  id: number;
  nama: string;
  username: string;
  latest_burnout: number;
  latest_risk: string;
  latest_psychosomatic: number;
  last_activity: string;
}

interface LaporanUser {
  id: number;
  username: string;
  nama: string;
  role: string;
  created_at: string;
  updated_at: string;
}

type ReportKey = 'burnout' | 'psycho' | 'respondent' | 'trend';

const reportTypes: Array<{ key: ReportKey; label: string; subtitle: string; icon: typeof TrendingUp }> = [
  { key: 'burnout', label: 'Ringkasan Burnout', subtitle: 'Distribusi risiko dan ringkasan prediksi', icon: TrendingUp },
  { key: 'psycho', label: 'Risiko Psikosomatis', subtitle: 'Sebaran risiko gejala fisik terkait stres', icon: AlertTriangle },
  { key: 'respondent', label: 'Data Responden', subtitle: 'Tabel operasional responden dan status terakhir', icon: Users },
  { key: 'trend', label: 'Tren & Analitik', subtitle: 'Pergerakan skor dari waktu ke waktu', icon: Activity },
];

const donutColors = ['#34d399', '#fbbf24', '#fb7185'];
const tooltipStyle = {
  background: '#0f172a',
  border: '1px solid rgba(148, 163, 184, 0.22)',
  borderRadius: 12,
  color: '#e2e8f0',
  boxShadow: '0 18px 50px rgba(0,0,0,0.35)',
};

function formatNumber(value: number | undefined, digits = 1) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '-';
  return value.toFixed(digits);
}

function normalizeRisk(risk: string) {
  const value = (risk || '').toLowerCase();
  if (value.includes('high') || value.includes('tinggi')) return 'High';
  if (value.includes('medium') || value.includes('sedang')) return 'Medium';
  if (value.includes('low') || value.includes('rendah')) return 'Low';
  return risk || '-';
}

function riskBadge(riskValue: string) {
  const risk = normalizeRisk(riskValue);
  if (risk === 'High') return { label: 'Tinggi', className: 'border-rose-300/25 bg-rose-400/10 text-rose-200', dot: 'bg-rose-300' };
  if (risk === 'Medium') return { label: 'Sedang', className: 'border-amber-300/25 bg-amber-400/10 text-amber-200', dot: 'bg-amber-300' };
  if (risk === 'Low') return { label: 'Rendah', className: 'border-emerald-300/25 bg-emerald-400/10 text-emerald-200', dot: 'bg-emerald-300' };
  return { label: risk, className: 'border-slate-400/20 bg-slate-400/10 text-slate-300', dot: 'bg-slate-400' };
}

function safePct(part: number, total: number) {
  if (!total) return '0.0';
  return ((part / total) * 100).toFixed(1);
}

function escapeCSV(value: unknown) {
  const text = String(value ?? '').replace(/"/g, '""');
  return `"${text}"`;
}

function SectionCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-white/10 bg-white/[0.04] shadow-xl shadow-black/10 ${className}`}>
      {children}
    </section>
  );
}

export default function Laporan() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [respondents, setRespondents] = useState<Respondent[]>([]);
  const [users, setUsers] = useState<LaporanUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeReport, setActiveReport] = useState<ReportKey>('burnout');
  const [dateRange, setDateRange] = useState('all');
  const [keyword, setKeyword] = useState('');
  const [riskFilter, setRiskFilter] = useState('all');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState('');
  const printRef = useRef<HTMLDivElement>(null);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const [aRes, rRes, uRes] = await Promise.all([
        api.get('/admin/analytics'),
        api.get('/responden'),
        api.get('/admin/users'),
      ]);
      setAnalytics(aRes.data);
      setRespondents(rRes.data.respondents || []);
      setUsers(uRes.data.users || []);
      setLastUpdated(new Date());
    } catch (e) {
      console.error('Failed to fetch report data', e);
      setError('Gagal memuat data laporan. Pastikan backend aktif dan akun admin masih login.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const formatDateTime = (date: string | Date | null) => {
    if (!date) return '-';
    return new Date(date).toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const withinDateRange = (dateString: string) => {
    if (dateRange === 'all' || !dateString) return true;
    const days = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90;
    const date = new Date(dateString).getTime();
    if (Number.isNaN(date)) return true;
    return Date.now() - date <= days * 86400000;
  };

  const filteredRespondents = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return respondents
      .filter((item) => withinDateRange(item.last_activity))
      .filter((item) => riskFilter === 'all' || normalizeRisk(item.latest_risk) === riskFilter)
      .filter((item) => !q || `${item.nama} ${item.username}`.toLowerCase().includes(q));
  }, [respondents, keyword, riskFilter, dateRange]);

  const trendData = useMemo(() => analytics?.trendData || [], [analytics]);

  const burnoutRows = useMemo(() => {
    const dist = analytics?.burnoutDist || {};
    const total = analytics?.totalRespondents || 0;
    return [
      { label: 'Rendah', value: dist.Rendah || 0, color: '#34d399' },
      { label: 'Sedang', value: dist.Sedang || 0, color: '#fbbf24' },
      { label: 'Tinggi', value: dist.Tinggi || 0, color: '#fb7185' },
    ].map((row) => ({ ...row, pct: safePct(row.value, total) }));
  }, [analytics]);

  const psychoRows = useMemo(() => {
    const dist = analytics?.psychoDist || {};
    const total = Math.max(1, (dist.Rendah || 0) + (dist.Sedang || 0) + (dist.Tinggi || 0));
    return [
      { label: 'Rendah', value: dist.Rendah || 0, color: '#34d399' },
      { label: 'Sedang', value: dist.Sedang || 0, color: '#fbbf24' },
      { label: 'Tinggi', value: dist.Tinggi || 0, color: '#fb7185' },
    ].map((row) => ({ ...row, pct: safePct(row.value, total) }));
  }, [analytics]);

  const executiveStats = useMemo(() => {
    const highRisk = filteredRespondents.filter((item) => normalizeRisk(item.latest_risk) === 'High').length;
    const avgPsycho = filteredRespondents.length
      ? filteredRespondents.reduce((sum, item) => sum + (item.latest_psychosomatic || 0), 0) / filteredRespondents.length
      : 0;
    return {
      totalRespondents: analytics?.totalRespondents || respondents.length,
      visibleRespondents: filteredRespondents.length,
      avgBurnout: analytics?.avgBurnout || 0,
      highRisk,
      avgPsycho,
      predictions: analytics?.totalPredictions || 0,
    };
  }, [analytics, respondents.length, filteredRespondents]);

  const userSegments = useMemo(() => {
    const admins = users.filter((user) => user.role === 'admin').length;
    const mahasiswa = users.filter((user) => user.role === 'student').length;
    const regular = users.filter((user) => user.role !== 'admin').length;
    return { admins, mahasiswa, regular };
  }, [users]);

  const reportTitle = reportTypes.find((report) => report.key === activeReport)?.label || 'Laporan';

  const downloadBlob = (content: string, filename: string, mime: string) => {
    const blob = new Blob(['\uFEFF' + content], { type: mime });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const generateReportHTML = (title: string, subtitle: string, tableHTML: string, summaries: string) => `
    <html><head><meta charset="utf-8"><title>${title}</title>
    <style>
      body{font-family:Arial,sans-serif;color:#1e293b;padding:0;max-width:980px;margin:auto;background:#f8fafc}
      .page{background:#fff;min-height:100vh;padding:34px 40px;border:1px solid #e2e8f0}
      .doc-head{display:flex;justify-content:space-between;gap:24px;border-bottom:3px solid #0f172a;padding-bottom:18px;margin-bottom:22px}
      .brand{font-size:13px;font-weight:800;letter-spacing:.08em;color:#0f172a;text-transform:uppercase}
      .seal{border:1px solid #0f172a;padding:10px 12px;text-align:center;font-size:9px;font-weight:800;letter-spacing:.08em;color:#0f172a;text-transform:uppercase}
      h1{font-size:24px;color:#0f172a;margin:10px 0 6px}
      h2{font-size:13px;color:#475569;font-weight:400;margin:0 0 14px;max-width:620px;line-height:1.6}
      .meta{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:18px 0 20px}
      .meta div{border:1px solid #e2e8f0;background:#f8fafc;padding:8px 10px;font-size:10px}
      .meta b{display:block;color:#0f172a;font-size:9px;text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px}
      .notice{border:1px solid #cbd5e1;background:#f8fafc;padding:12px 14px;font-size:11px;line-height:1.6;margin-bottom:18px;color:#475569}
      .summaries{display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap}
      .sum-box{flex:1;min-width:130px;background:#f8fafc;border:1px solid #cbd5e1;padding:12px 14px;text-align:center}
      .sum-box .v{font-size:23px;font-weight:800;color:#0f172a}
      .sum-box .l{font-size:10px;color:#64748b;margin-top:3px;text-transform:uppercase;letter-spacing:.04em}
      table{width:100%;border-collapse:collapse;font-size:10.5px;border:1px solid #cbd5e1}
      th{background:#0f172a;padding:9px 10px;text-align:left;font-weight:700;color:#f8fafc;border:1px solid #1e293b}
      td{padding:8px 10px;border:1px solid #e2e8f0}
      tr:nth-child(even){background:#fafbfc}
      .badge{padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700}
      .badge-high{background:#fef2f2;color:#dc2626}
      .badge-med{background:#fffbeb;color:#d97706}
      .badge-low{background:#f0fdf4;color:#16a34a}
      .footer{display:flex;justify-content:space-between;border-top:1px solid #cbd5e1;margin-top:24px;padding-top:10px;font-size:9px;color:#64748b}
      @media print{body{background:#fff}.page{border:0;padding:0}@page{margin:1.35cm}}
    </style></head><body>
    <main class="page">
      <div class="doc-head">
        <div>
          <div class="brand">NexusMind Intelligence Report</div>
          <h1>${title}</h1>
          <h2>${subtitle}</h2>
        </div>
        <div class="seal">Dokumen<br/>Internal<br/>Terkendali</div>
      </div>
      <section class="meta">
        <div><b>No Dokumen</b>NX-RPT-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}</div>
        <div><b>Tanggal</b>${new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
        <div><b>Klasifikasi</b>Rahasia Internal</div>
        <div><b>Sumber</b>QC Analytics</div>
      </section>
      <div class="notice">
        Laporan ini menyajikan ringkasan operasional untuk pemantauan burnout dan risiko psikosomatis. Angka dan skor dipakai sebagai alat triage internal, bukan diagnosis medis.
      </div>
      ${summaries}
      ${tableHTML}
      <div class="footer">
        <span>Generated by NexusMind</span>
        <span>Validasi: data sistem, model prediksi, dan activity log</span>
      </div>
    </main>
    </body></html>`;

  const exportCSV = () => {
    const date = new Date().toISOString().slice(0, 10);
    let csv = '';

    if (activeReport === 'burnout') {
      csv = 'Kategori,Jumlah,Persentase\n';
      burnoutRows.forEach((row) => {
        csv += `${row.label},${row.value},${row.pct}%\n`;
      });
      csv += `\nTotal Responden,${executiveStats.totalRespondents}\n`;
      csv += `Rata-rata Burnout,${formatNumber(executiveStats.avgBurnout)}\n`;
      csv += `Risiko Tinggi,${executiveStats.highRisk}\n`;
      downloadBlob(csv, `laporan-burnout-${date}.csv`, 'text/csv');
    } else if (activeReport === 'psycho') {
      csv = 'Kategori,Jumlah,Persentase\n';
      psychoRows.forEach((row) => {
        csv += `${row.label},${row.value},${row.pct}%\n`;
      });
      downloadBlob(csv, `laporan-psikosomatis-${date}.csv`, 'text/csv');
    } else if (activeReport === 'respondent') {
      csv = 'No,Nama,Username,Skor Burnout,Risiko,Skor Psikosomatis,Aktivitas Terakhir\n';
      filteredRespondents.forEach((item, index) => {
        csv += `${index + 1},${escapeCSV(item.nama)},${escapeCSV(item.username)},${formatNumber(item.latest_burnout)},${riskBadge(item.latest_risk).label},${formatNumber(item.latest_psychosomatic)},${escapeCSV(formatDateTime(item.last_activity))}\n`;
      });
      downloadBlob(csv, `laporan-responden-${date}.csv`, 'text/csv');
    } else {
      csv = 'Tanggal,Rata-rata Burnout\n';
      trendData.forEach((item) => {
        csv += `${item.date},${formatNumber(item.semua)}\n`;
      });
      downloadBlob(csv, `laporan-tren-${date}.csv`, 'text/csv');
    }
  };

  const exportExcel = () => {
    const date = new Date().toISOString().slice(0, 10);
    const summaries = `<div class="summaries">
      <div class="sum-box"><div class="v">${executiveStats.totalRespondents}</div><div class="l">Total Responden</div></div>
      <div class="sum-box"><div class="v">${formatNumber(executiveStats.avgBurnout)}%</div><div class="l">Rata-rata Burnout</div></div>
      <div class="sum-box"><div class="v">${executiveStats.highRisk}</div><div class="l">Risiko Tinggi</div></div>
      <div class="sum-box"><div class="v">${executiveStats.predictions}</div><div class="l">Total Prediksi</div></div>
    </div>`;

    let tableHTML = '';
    if (activeReport === 'burnout') {
      tableHTML = `<table><tr><th>Kategori</th><th>Jumlah</th><th>Persentase</th></tr>${burnoutRows.map((row) => `<tr><td>${row.label}</td><td>${row.value}</td><td>${row.pct}%</td></tr>`).join('')}</table>`;
    } else if (activeReport === 'psycho') {
      tableHTML = `<table><tr><th>Kategori</th><th>Jumlah</th><th>Persentase</th></tr>${psychoRows.map((row) => `<tr><td>${row.label}</td><td>${row.value}</td><td>${row.pct}%</td></tr>`).join('')}</table>`;
    } else if (activeReport === 'respondent') {
      tableHTML = '<table><tr><th>No</th><th>Nama</th><th>Username</th><th>Skor Burnout</th><th>Risiko</th><th>Skor Psikosomatis</th><th>Aktivitas Terakhir</th></tr>';
      filteredRespondents.forEach((item, index) => {
        const risk = normalizeRisk(item.latest_risk);
        const klass = risk === 'High' ? 'badge-high' : risk === 'Medium' ? 'badge-med' : 'badge-low';
        tableHTML += `<tr><td>${index + 1}</td><td>${item.nama}</td><td>${item.username}</td><td>${formatNumber(item.latest_burnout)}</td><td><span class="badge ${klass}">${riskBadge(item.latest_risk).label}</span></td><td>${formatNumber(item.latest_psychosomatic)}</td><td>${formatDateTime(item.last_activity)}</td></tr>`;
      });
      tableHTML += '</table>';
    } else {
      tableHTML = `<table><tr><th>Tanggal</th><th>Rata-rata Burnout</th></tr>${trendData.map((item) => `<tr><td>${item.date}</td><td>${formatNumber(item.semua)}%</td></tr>`).join('')}</table>`;
    }

    downloadBlob(
      generateReportHTML(reportTitle, `Rentang: ${dateRange === 'all' ? 'Semua waktu' : dateRange}`, tableHTML, summaries),
      `laporan-${activeReport}-${date}.xls`,
      'application/vnd.ms-excel',
    );
  };

  const exportPDF = () => {
    const summaries = `<div class="summaries">
      <div class="sum-box"><div class="v">${executiveStats.totalRespondents}</div><div class="l">Total Responden</div></div>
      <div class="sum-box"><div class="v">${formatNumber(executiveStats.avgBurnout)}%</div><div class="l">Rata-rata Burnout</div></div>
      <div class="sum-box"><div class="v">${executiveStats.highRisk}</div><div class="l">Risiko Tinggi</div></div>
    </div>`;

    let tableHTML = '<table><tr><th>No</th><th>Nama</th><th>Username</th><th>Burnout</th><th>Risiko</th><th>Psikosomatis</th></tr>';
    filteredRespondents.slice(0, 80).forEach((item, index) => {
      tableHTML += `<tr><td>${index + 1}</td><td>${item.nama}</td><td>${item.username}</td><td>${formatNumber(item.latest_burnout)}</td><td>${riskBadge(item.latest_risk).label}</td><td>${formatNumber(item.latest_psychosomatic)}</td></tr>`;
    });
    tableHTML += '</table>';

    const printWindow = window.open('', '_blank', 'width=980,height=720');
    if (!printWindow) return;
    printWindow.document.write(generateReportHTML(reportTitle, 'Dokumen siap simpan sebagai PDF melalui dialog print browser', tableHTML, summaries));
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 500);
  };

  const handlePrint = () => window.print();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#090b12] text-slate-100">
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-8 text-center shadow-xl shadow-black/20">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-teal-200" />
          <p className="mt-4 text-sm text-slate-400">Memuat pusat laporan...</p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#090b12] px-4 py-5 text-slate-100 sm:px-6 lg:px-8">
      <div className="pointer-events-none fixed inset-0 -z-0 bg-[radial-gradient(circle_at_top_left,rgba(45,212,191,0.14),transparent_30%),radial-gradient(circle_at_88%_0%,rgba(34,197,94,0.12),transparent_26%),linear-gradient(180deg,rgba(15,23,42,0.7),rgba(9,11,18,0.98))]" />

      <div className="relative z-10 mx-auto flex max-w-7xl flex-col gap-5" ref={printRef}>
        <header className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] shadow-2xl shadow-black/20 print:border-slate-300 print:bg-white print:text-slate-950">
          <div className="grid gap-5 p-5 sm:p-6 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
            <div className="min-w-0">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs font-semibold text-emerald-100 print:border-emerald-200 print:text-emerald-700">
                  <FileText className="h-3.5 w-3.5" />
                  Report center
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-teal-300/20 bg-teal-300/10 px-3 py-1 text-xs font-semibold text-teal-100 print:border-teal-200 print:text-teal-700">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Export ready
                </span>
              </div>
              <h1 className="text-2xl font-bold tracking-normal text-white print:text-slate-950 sm:text-3xl">Laporan Analitik</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400 print:text-slate-600">
                Buat, tinjau, filter, dan ekspor laporan burnout, psikosomatis, responden, serta tren prediktif dalam satu ruang kerja.
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 xl:w-[430px]">
              <button onClick={exportCSV} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-sky-300/20 bg-sky-400/10 px-4 text-sm font-semibold text-sky-100 transition hover:bg-sky-400/15 print:hidden">
                <FileType className="h-4 w-4" />
                CSV
              </button>
              <button onClick={exportExcel} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-emerald-300/20 bg-emerald-400/10 px-4 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-400/15 print:hidden">
                <FileSpreadsheet className="h-4 w-4" />
                Excel
              </button>
              <button onClick={exportPDF} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-rose-300/20 bg-rose-400/10 px-4 text-sm font-semibold text-rose-100 transition hover:bg-rose-400/15 print:hidden">
                <Download className="h-4 w-4" />
                PDF
              </button>
              <button onClick={handlePrint} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-amber-300/20 bg-amber-400/10 px-4 text-sm font-semibold text-amber-100 transition hover:bg-amber-400/15 print:hidden">
                <Printer className="h-4 w-4" />
                Cetak
              </button>
            </div>
          </div>
        </header>

        {error && (
          <div className="rounded-xl border border-rose-300/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        )}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {[
            { label: 'Total Responden', value: executiveStats.totalRespondents, icon: Users, className: 'text-violet-200 bg-violet-400/10 ring-violet-300/20' },
            { label: 'Terfilter', value: executiveStats.visibleRespondents, icon: Filter, className: 'text-teal-200 bg-teal-400/10 ring-teal-300/20' },
            { label: 'Rata-rata Burnout', value: `${formatNumber(executiveStats.avgBurnout)}%`, icon: TrendingUp, className: 'text-amber-200 bg-amber-400/10 ring-amber-300/20' },
            { label: 'Risiko Tinggi', value: executiveStats.highRisk, icon: AlertTriangle, className: 'text-rose-200 bg-rose-400/10 ring-rose-300/20' },
            { label: 'Total Prediksi', value: executiveStats.predictions, icon: ClipboardList, className: 'text-emerald-200 bg-emerald-400/10 ring-emerald-300/20' },
          ].map(({ label, value, icon: Icon, className }) => (
            <article key={label} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 shadow-xl shadow-black/10 print:border-slate-200 print:bg-white">
              <div className="flex items-center gap-3">
                <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ring-1 ${className}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-400 print:text-slate-500">{label}</p>
                  <p className="mt-1 text-2xl font-bold leading-tight text-white print:text-slate-950">{value}</p>
                </div>
              </div>
            </article>
          ))}
        </section>

        <SectionCard className="p-3 print:hidden">
          <div className="flex flex-wrap gap-2">
            {reportTypes.map(({ key, label, subtitle, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setActiveReport(key)}
                className={`flex min-w-[220px] flex-1 items-center gap-3 rounded-xl border px-4 py-3 text-left transition ${
                  activeReport === key
                    ? 'border-teal-300/30 bg-teal-400/10 text-teal-100'
                    : 'border-white/10 bg-slate-950/35 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                }`}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{label}</span>
                  <span className="mt-0.5 block truncate text-xs opacity-70">{subtitle}</span>
                </span>
              </button>
            ))}
          </div>
        </SectionCard>

        <SectionCard className="p-4 print:hidden">
          <div className="grid gap-3 xl:grid-cols-[minmax(240px,1fr)_auto_auto_auto] xl:items-center">
            <label className="flex min-w-0 items-center gap-2 rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2.5">
              <Search className="h-4 w-4 shrink-0 text-slate-500" />
              <input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="Cari nama atau username responden..."
                className="min-w-0 flex-1 bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-600"
              />
            </label>

            <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2.5">
              <Calendar className="h-4 w-4 text-slate-500" />
              <select value={dateRange} onChange={(event) => setDateRange(event.target.value)} className="bg-transparent text-sm font-semibold text-slate-200 outline-none">
                <option value="all">Semua waktu</option>
                <option value="7d">7 hari terakhir</option>
                <option value="30d">30 hari terakhir</option>
                <option value="90d">90 hari terakhir</option>
              </select>
            </label>

            <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2.5">
              <AlertTriangle className="h-4 w-4 text-slate-500" />
              <select value={riskFilter} onChange={(event) => setRiskFilter(event.target.value)} className="bg-transparent text-sm font-semibold text-slate-200 outline-none">
                <option value="all">Semua risiko</option>
                <option value="High">Risiko tinggi</option>
                <option value="Medium">Risiko sedang</option>
                <option value="Low">Risiko rendah</option>
              </select>
            </label>

            <button onClick={fetchData} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-slate-950/50 px-4 text-sm font-semibold text-slate-300 transition hover:border-teal-300/30 hover:text-white">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </div>
        </SectionCard>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="grid min-w-0 gap-5">
            {activeReport === 'burnout' && (
              <>
                <div className="grid gap-5 lg:grid-cols-2">
                  <DistributionTable title="Distribusi Burnout" rows={burnoutRows} />
                  <DistributionDonut title="Visualisasi Burnout" rows={burnoutRows} />
                </div>
                <RespondentTable respondents={filteredRespondents.slice(0, 8)} formatDateTime={formatDateTime} compact />
              </>
            )}

            {activeReport === 'psycho' && (
              <>
                <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
                  <DistributionTable title="Distribusi Psikosomatis" rows={psychoRows} />
                  <SectionCard className="min-w-0 p-4 sm:p-5">
                    <h2 className="text-base font-semibold text-white">Bar Risiko Psikosomatis</h2>
                    <p className="mt-1 text-xs text-slate-500">Jumlah responden per tingkat risiko.</p>
                    <ChartShell height={300} className="mt-4">
                      <BarChart data={psychoRows} margin={{ top: 12, right: 16, bottom: 0, left: -20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
                        <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Bar dataKey="value" radius={[8, 8, 0, 0]} barSize={70}>
                          {psychoRows.map((row) => <Cell key={row.label} fill={row.color} />)}
                        </Bar>
                      </BarChart>
                    </ChartShell>
                  </SectionCard>
                </div>
                <RespondentTable respondents={filteredRespondents.slice(0, 8)} formatDateTime={formatDateTime} compact />
              </>
            )}

            {activeReport === 'respondent' && (
              <RespondentTable respondents={filteredRespondents} formatDateTime={formatDateTime} />
            )}

            {activeReport === 'trend' && (
              <>
                <SectionCard className="min-w-0 p-4 sm:p-5">
                  <h2 className="text-base font-semibold text-white">Tren Rata-rata Burnout</h2>
                  <p className="mt-1 text-xs text-slate-500">Pergerakan rata-rata skor burnout berdasarkan periode data.</p>
                  <ChartShell height={340} className="mt-4">
                    <LineChart data={trendData} margin={{ top: 12, right: 18, bottom: 0, left: -18 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
                      <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} domain={[0, 100]} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend wrapperStyle={{ color: '#94a3b8', fontSize: 12 }} />
                      <Line type="monotone" dataKey="semua" stroke="#8b5cf6" strokeWidth={2.8} dot={{ r: 4, fill: '#8b5cf6' }} name="Rata-rata Burnout" />
                    </LineChart>
                  </ChartShell>
                </SectionCard>
                <TrendTable data={trendData} />
              </>
            )}
          </div>

          <aside className="grid gap-5">
            <SectionCard className="p-4 sm:p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-semibold text-white">Ringkasan Eksekutif</h2>
                <CheckCircle2 className="h-5 w-5 text-emerald-300" />
              </div>
              <div className="space-y-3">
                {[
                  ['Laporan aktif', reportTitle],
                  ['Terakhir diperbarui', formatDateTime(lastUpdated)],
                  ['Rata-rata psikosomatis', `${formatNumber(executiveStats.avgPsycho)}%`],
                  ['Akun non-admin', userSegments.regular],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-950/45 px-3 py-2.5">
                    <span className="text-xs text-slate-500">{label}</span>
                    <span className="truncate text-sm font-semibold text-slate-100">{value}</span>
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard className="p-4 sm:p-5">
              <h2 className="text-base font-semibold text-white">Segmentasi User</h2>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {[
                  ['Mahasiswa', userSegments.mahasiswa, 'text-teal-200 bg-teal-400/10'],
                  ['Admin', userSegments.admins, 'text-violet-200 bg-violet-400/10'],
                  ['Total akun', users.length, 'text-sky-200 bg-sky-400/10'],
                ].map(([label, value, className]) => (
                  <div key={label} className={`rounded-xl p-3 ${className}`}>
                    <p className="text-xs opacity-80">{label}</p>
                    <p className="mt-1 text-2xl font-bold">{value}</p>
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard className="p-4 sm:p-5">
              <h2 className="text-base font-semibold text-white">Kesiapan Dokumen</h2>
              <div className="mt-4 space-y-3">
                {[
                  ['Data analitik', Boolean(analytics), 'Sumber ringkasan dan chart'],
                  ['Data responden', respondents.length > 0, `${respondents.length} baris tersedia`],
                  ['Filter aktif', keyword || riskFilter !== 'all' || dateRange !== 'all', 'Mempengaruhi tabel responden'],
                ].map(([label, ok, detail]) => (
                  <div key={String(label)} className="flex items-start gap-3 rounded-xl border border-white/10 bg-slate-950/45 p-3">
                    <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${ok ? 'bg-emerald-300' : 'bg-slate-600'}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-200">{label}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          </aside>
        </section>
      </div>
    </main>
  );
}

function DistributionTable({ title, rows }: { title: string; rows: Array<{ label: string; value: number; pct: string; color: string }> }) {
  return (
    <SectionCard className="p-4 sm:p-5">
      <h2 className="text-base font-semibold text-white">{title}</h2>
      <div className="mt-4 overflow-hidden rounded-xl border border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-slate-950/65 text-left text-xs font-semibold uppercase tracking-normal text-slate-500">
            <tr>
              <th className="px-4 py-3">Kategori</th>
              <th className="px-4 py-3 text-right">Jumlah</th>
              <th className="px-4 py-3">Persentase</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {rows.map((row) => (
              <tr key={row.label}>
                <td className="px-4 py-4">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: row.color }} />
                    <span className="font-semibold text-slate-100">{row.label}</span>
                  </div>
                </td>
                <td className="px-4 py-4 text-right font-bold text-white">{row.value}</td>
                <td className="px-4 py-4">
                  <div className="flex items-center gap-3">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
                      <div className="h-full rounded-full" style={{ width: `${row.pct}%`, backgroundColor: row.color }} />
                    </div>
                    <span className="w-12 text-right text-xs font-semibold text-slate-400">{row.pct}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

function DistributionDonut({ title, rows }: { title: string; rows: Array<{ label: string; value: number; color: string }> }) {
  return (
    <SectionCard className="min-w-0 p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-white">{title}</h2>
        <PieChart className="h-4 w-4 text-teal-200" />
      </div>
      <ChartShell height={250}>
        <RePieChart>
          <Pie data={rows} cx="50%" cy="50%" innerRadius={62} outerRadius={94} paddingAngle={3} dataKey="value" nameKey="label">
            {rows.map((row, index) => <Cell key={row.label} fill={row.color || donutColors[index]} stroke="transparent" />)}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} />
        </RePieChart>
      </ChartShell>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {rows.map((row) => (
          <div key={row.label} className="rounded-lg bg-slate-950/45 px-3 py-2 text-center">
            <p className="text-xs text-slate-500">{row.label}</p>
            <p className="mt-1 text-lg font-bold text-white">{row.value}</p>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function RespondentTable({
  respondents,
  formatDateTime,
  compact = false,
}: {
  respondents: Respondent[];
  formatDateTime: (date: string | Date | null) => string;
  compact?: boolean;
}) {
  return (
    <SectionCard className="min-w-0 overflow-hidden p-4 sm:p-5">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">Data Responden</h2>
          <p className="mt-1 text-xs text-slate-500">{respondents.length} responden tampil pada laporan ini.</p>
        </div>
        {compact && <span className="rounded-full bg-slate-950/60 px-3 py-1 text-xs font-semibold text-slate-400">Preview 8 baris</span>}
      </div>
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full min-w-[920px] table-fixed text-sm">
          <thead className="bg-slate-950/65 text-left text-xs font-semibold uppercase tracking-normal text-slate-500">
            <tr>
              <th className="w-14 px-4 py-3">No</th>
              <th className="w-52 px-4 py-3">Nama</th>
              <th className="w-40 px-4 py-3">Username</th>
              <th className="w-32 px-4 py-3 text-right">Burnout</th>
              <th className="w-32 px-4 py-3 text-center">Risiko</th>
              <th className="w-40 px-4 py-3 text-right">Psikosomatis</th>
              <th className="w-48 px-4 py-3">Aktivitas Terakhir</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {respondents.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">Tidak ada responden sesuai filter.</td>
              </tr>
            ) : respondents.map((item, index) => {
              const risk = riskBadge(item.latest_risk);
              return (
                <tr key={item.id} className="transition hover:bg-white/[0.03]">
                  <td className="px-4 py-4 text-xs font-semibold text-slate-600">{index + 1}</td>
                  <td className="px-4 py-4">
                    <p className="truncate font-semibold text-slate-100" title={item.nama}>{item.nama || 'Tanpa nama'}</p>
                  </td>
                  <td className="px-4 py-4 text-slate-400">@{item.username}</td>
                  <td className="px-4 py-4 text-right font-semibold text-slate-100">{formatNumber(item.latest_burnout)}</td>
                  <td className="px-4 py-4 text-center">
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${risk.className}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${risk.dot}`} />
                      {risk.label}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right font-semibold text-slate-100">{formatNumber(item.latest_psychosomatic)}</td>
                  <td className="px-4 py-4 text-xs text-slate-500">{formatDateTime(item.last_activity)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

function TrendTable({ data }: { data: Array<{ date: string; semua: number }> }) {
  return (
    <SectionCard className="p-4 sm:p-5">
      <h2 className="text-base font-semibold text-white">Data Tren</h2>
      <div className="mt-4 overflow-hidden rounded-xl border border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-slate-950/65 text-left text-xs font-semibold uppercase tracking-normal text-slate-500">
            <tr>
              <th className="px-4 py-3">Tanggal</th>
              <th className="px-4 py-3 text-right">Rata-rata Burnout</th>
              <th className="px-4 py-3 text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {data.map((item, index) => {
              const status = item.semua >= 67 ? 'Tinggi' : item.semua >= 34 ? 'Sedang' : 'Rendah';
              const badge = riskBadge(status);
              return (
                <tr key={`${item.date}-${index}`}>
                  <td className="px-4 py-4 font-semibold text-slate-100">{item.date}</td>
                  <td className="px-4 py-4 text-right font-bold text-white">{formatNumber(item.semua)}%</td>
                  <td className="px-4 py-4 text-center">
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${badge.className}`}>{badge.label}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}
