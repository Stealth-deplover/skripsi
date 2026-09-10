import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Check, ChevronDown, Download, RefreshCw, SlidersHorizontal, Users } from 'lucide-react';

const datePeriods = [
  { label: '7 Hari Terakhir', value: '7d' },
  { label: '30 Hari Terakhir', value: '30d' },
  { label: '90 Hari Terakhir', value: '90d' },
  { label: 'Bulan Ini', value: 'this-month' },
  { label: 'Bulan Lalu', value: 'last-month' },
  { label: 'Semua Waktu', value: 'all' },
];

const groupOptions = [
  { label: 'Semua Kelompok', value: 'all' },
  { label: 'Mahasiswa', value: 'mahasiswa' },
];

interface Props {
  dateFilter: string;
  groupFilter: string;
  onDateChange: (value: string) => void;
  onGroupChange: (value: string) => void;
  onRefresh: () => void;
  loading: boolean;
  lastUpdated: Date | null;
}

interface FilterButtonProps {
  icon: React.ElementType;
  label: string;
  open: boolean;
  setOpen: (value: boolean) => void;
  children: React.ReactNode;
}

function FilterButton({ icon: Icon, label, open, setOpen, children }: FilterButtonProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [setOpen]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex h-10 items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 text-sm font-semibold text-slate-200 transition hover:border-cyan-300/40 hover:bg-white/[0.07]"
      >
        <Icon className="h-4 w-4 text-cyan-200" />
        <span className="max-w-[150px] truncate">{label}</span>
        <ChevronDown className={`h-4 w-4 text-slate-500 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-56 rounded-lg border border-white/10 bg-slate-950 p-1.5 shadow-2xl shadow-black/40">
          {children}
        </div>
      )}
    </div>
  );
}

export default function DashboardHeader({
  dateFilter,
  groupFilter,
  onDateChange,
  onGroupChange,
  onRefresh,
  loading,
  lastUpdated,
}: Props) {
  const navigate = useNavigate();
  const [dateOpen, setDateOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);

  const selectedDate = datePeriods.find((item) => item.value === dateFilter)?.label || 'Pilih Periode';
  const selectedGroup = groupOptions.find((item) => item.value === groupFilter)?.label || 'Semua Kelompok';

  const formattedUpdate = lastUpdated
    ? lastUpdated.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
    : 'Belum diperbarui';

  return (
    <header className="rounded-lg border border-white/10 bg-slate-950 p-5 shadow-xl shadow-black/20">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <div className="mb-3 inline-flex items-center gap-2 rounded-md border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-semibold text-cyan-100">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Admin analytics control
          </div>
          <h1 className="text-2xl font-semibold tracking-normal text-white sm:text-3xl">Dashboard</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            Overview analitik prediktif burnout, risiko psikosomatis, performa model, dan responden yang perlu dipantau.
          </p>
          <p className="mt-2 text-xs text-slate-500">Update terakhir: {formattedUpdate}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <FilterButton icon={Calendar} label={selectedDate} open={dateOpen} setOpen={(value) => {
            setDateOpen(value);
            if (value) setGroupOpen(false);
          }}>
            {datePeriods.map((item) => (
              <button
                key={item.value}
                onClick={() => {
                  onDateChange(item.value);
                  setDateOpen(false);
                }}
                className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition ${
                  dateFilter === item.value ? 'bg-cyan-300/15 text-cyan-100' : 'text-slate-300 hover:bg-white/[0.06]'
                }`}
              >
                {item.label}
                {dateFilter === item.value && <Check className="h-4 w-4" />}
              </button>
            ))}
          </FilterButton>

          <FilterButton icon={Users} label={selectedGroup} open={groupOpen} setOpen={(value) => {
            setGroupOpen(value);
            if (value) setDateOpen(false);
          }}>
            {groupOptions.map((item) => (
              <button
                key={item.value}
                onClick={() => {
                  onGroupChange(item.value);
                  setGroupOpen(false);
                }}
                className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition ${
                  groupFilter === item.value ? 'bg-emerald-300/15 text-emerald-100' : 'text-slate-300 hover:bg-white/[0.06]'
                }`}
              >
                {item.label}
                {groupFilter === item.value && <Check className="h-4 w-4" />}
              </button>
            ))}
          </FilterButton>

          <button
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 text-slate-300 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>

          <button
            onClick={() => navigate('/laporan')}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-emerald-400 px-4 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"
          >
            <Download className="h-4 w-4" />
            Export Laporan
          </button>
        </div>
      </div>
    </header>
  );
}
