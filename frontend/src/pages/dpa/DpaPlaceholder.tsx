export default function DpaPlaceholder({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950 p-8 shadow-xl shadow-black/10">
      <h1 className="text-xl font-semibold text-slate-100">{title}</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">{description}</p>
      <div className="mt-6 flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3 text-xs text-slate-400">
        <span className="h-2 w-2 rounded-full bg-emerald-400" />
        Modul sedang disiapkan — akan tersedia setelah fase implementasi berikutnya.
      </div>
    </div>
  );
}
