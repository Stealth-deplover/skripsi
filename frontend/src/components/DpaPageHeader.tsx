import type { ElementType } from 'react';

// Header halaman portal DPA — satu pola untuk semua halaman:
// eyebrow role (indigo), judul, deskripsi satu kalimat, slot aksi kanan.
export default function DpaPageHeader({
  eyebrow,
  title,
  description,
  icon: Icon,
  actions,
  aside,
}: {
  eyebrow: string;
  title: string;
  description: string;
  icon: ElementType;
  actions?: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <header className="rounded-lg border border-white/10 bg-slate-950 p-5 shadow-xl shadow-black/20">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <div className="mb-3 inline-flex items-center gap-2 rounded-md border border-indigo-300/20 bg-indigo-300/10 px-3 py-1 text-xs font-semibold text-indigo-100">
            <Icon className="h-3.5 w-3.5" />
            {eyebrow}
          </div>
          <h1 className="text-2xl font-semibold tracking-normal text-white sm:text-3xl">{title}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">{description}</p>
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {aside}
    </header>
  );
}
