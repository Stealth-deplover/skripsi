import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Loader2, MessagesSquare, ShieldCheck, UserX, Users, X } from 'lucide-react';
import DpaPageHeader from '../../components/DpaPageHeader';
import api from '../../api';
import { burnoutCategoryMeta, categoryMeta } from '../userDashboard/happinessShared';
import { ChatComposer, MessageBody } from '../userDashboard/chatShared';
import type { ChatMessage, ChatSendPayload } from '../userDashboard/chatShared';

interface Member {
  id: number;
  nama: string;
  nim: string;
  role: string;
}

type WellbeingMap = Record<string, Record<string, number | string>>;

const DPA_ACCENT = '#818cf8';

function initials(nama?: string): string {
  if (!nama) return '?';
  return nama
    .split(' ')
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

function formatDay(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  if (isToday) return 'Hari ini';
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Kemarin';
  return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
}

export default function DpaGroupChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [wellbeing, setWellbeing] = useState<WellbeingMap>({});
  const [dpa, setDpa] = useState<{ id: number; nama: string } | null>(null);
  const [me, setMe] = useState<{ id: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [filter, setFilter] = useState<number | null>(null);
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null);
  const [removing, setRemoving] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const lastIdRef = useRef(0);
  const nearBottomRef = useRef(true);

  const mergeMessages = useCallback((incoming: ChatMessage[]) => {
    if (!incoming.length) return;
    setMessages((prev) => {
      const seen = new Set(prev.map((m) => m.id));
      const fresh = incoming.filter((m) => !seen.has(m.id));
      if (!fresh.length) return prev;
      return [...prev, ...fresh];
    });
    const maxId = incoming.reduce((max, m) => Math.max(max, m.id), 0);
    lastIdRef.current = Math.max(lastIdRef.current, maxId);
  }, []);

  const fetchChat = useCallback(async (initial = false) => {
    try {
      const params = initial ? {} : { after: String(lastIdRef.current) };
      const res = await api.get('/dpa/chat', { params });
      if (initial) {
        setMessages(res.data.messages ?? []);
        lastIdRef.current = (res.data.messages ?? []).reduce((max: number, m: ChatMessage) => Math.max(max, m.id), 0);
        setLoading(false);
      } else {
        mergeMessages(res.data.messages ?? []);
      }
      setMembers(res.data.members ?? []);
      setWellbeing(res.data.wellbeing ?? {});
      setDpa(res.data.dpa ?? null);
      setMe(res.data.me ?? null);
      setError('');
    } catch (err: any) {
      if (initial) setLoading(false);
      setError(err.response?.data?.error || 'Percakapan tidak dapat dimuat. Coba muat ulang.');
    }
  }, [mergeMessages]);

  useEffect(() => {
    fetchChat(true);
  }, [fetchChat]);

  // Realtime via SSE; bila gagal, kembali ke polling 3 detik.
  useEffect(() => {
    let pollInterval: number | null = null;
    const startPolling = () => {
      if (pollInterval !== null) return;
      pollInterval = window.setInterval(() => fetchChat(false), 3000);
    };
    const stopPolling = () => {
      if (pollInterval !== null) {
        window.clearInterval(pollInterval);
        pollInterval = null;
      }
    };

    const token = localStorage.getItem('token');
    if (!token) return;
    const source = new EventSource(`${api.defaults.baseURL}/dpa/chat/stream?token=${encodeURIComponent(token)}`);

    source.addEventListener('open', () => stopPolling());
    source.addEventListener('message', (event) => {
      try {
        const message = JSON.parse((event as MessageEvent).data);
        if (message.msg_type === 'poll') {
          // Polling butuh opsi + hasil lengkap → muat ulang data chat.
          fetchChat(true);
          return;
        }
        mergeMessages([{ ...message, sender_name: message.sender_name ?? '', sender_role: message.sender_role ?? 'student' }]);
      } catch {
        // Payload rusak diabaikan; polling fallback tetap berjalan bila diperlukan.
      }
    });
    source.addEventListener('refresh', () => {
      // Hasil polling berubah → muat ulang untuk hitungan terbaru.
      fetchChat(true);
    });
    source.addEventListener('error', () => {
      startPolling();
    });

    return () => {
      source.close();
      stopPolling();
    };
  }, [fetchChat, mergeMessages]);

  // Auto-scroll hanya bila pengguna memang berada di dasar daftar.
  useEffect(() => {
    const container = scrollRef.current;
    if (!container || !nearBottomRef.current) return;
    container.scrollTop = container.scrollHeight;
  }, [messages]);

  const sendPayload = useCallback(
    async (payload: ChatSendPayload): Promise<boolean> => {
      setSending(true);
      try {
        const res = await api.post('/dpa/chat/send', payload);
        const message: ChatMessage = res.data.message;
        mergeMessages([message]);
        nearBottomRef.current = true;
        requestAnimationFrame(() => {
          const container = scrollRef.current;
          if (container) container.scrollTop = container.scrollHeight;
        });
        if (message.msg_type === 'poll') await fetchChat(true);
        return true;
      } catch (err: any) {
        setError(err.response?.data?.error || 'Pesan gagal terkirim. Coba lagi.');
        return false;
      } finally {
        setSending(false);
      }
    },
    [fetchChat, mergeMessages],
  );

  const votePoll = useCallback(
    async (pollId: number, optionId: number) => {
      try {
        await api.post(`/dpa/chat/polls/${pollId}/vote`, { option_id: optionId });
        await fetchChat(true);
      } catch (err: any) {
        setError(err.response?.data?.error || 'Gagal menyimpan suara polling.');
      }
    },
    [fetchChat],
  );

  const removeStudent = useCallback(
    async (member: Member) => {
      setRemoving(true);
      try {
        await api.post(`/dpa/students/${member.id}/remove-group`);
        setFilter(null);
        setRemoveTarget(null);
        setError('');
        await fetchChat(true);
      } catch (err: any) {
        setError(err.response?.data?.error || 'Gagal mengeluarkan mahasiswa dari grup.');
        setRemoveTarget(null);
      } finally {
        setRemoving(false);
      }
    },
    [fetchChat],
  );

  const roster = useMemo(() => {
    const students = members.filter((member) => member.role === 'student');
    const priority = (member: Member): number => {
      const snap = wellbeing[String(member.id)];
      if (!snap) return 0;
      const burnoutTinggi = snap.burnout_category === 'Tinggi' ? 2 : 0;
      const happinessRendah = ['Rendah', 'Sangat Rendah'].includes(String(snap.happiness_category)) ? 1 : 0;
      return burnoutTinggi + happinessRendah;
    };
    return [...students].sort((a, b) => priority(b) - priority(a) || a.nama.localeCompare(b.nama));
  }, [members, wellbeing]);

  const visible = useMemo(
    () => (filter === null ? messages : messages.filter((m) => m.sender_id === filter)),
    [messages, filter],
  );

  const warnCount = roster.filter((member) => {
    const snap = wellbeing[String(member.id)];
    return snap && (snap.burnout_category === 'Tinggi' || ['Rendah', 'Sangat Rendah'].includes(String(snap.happiness_category)));
  }).length;

  // Kelompokkan pesan berurutan dari pengirim yang sama per hari.
  const grouped: Array<{ day: string; blocks: Array<{ sender: ChatMessage; items: ChatMessage[] }> }> = [];
  let currentDay = '';
  let currentBlock: { sender: ChatMessage; items: ChatMessage[] } | null = null;
  for (const message of visible) {
    const day = formatDay(message.timestamp);
    if (day !== currentDay) {
      grouped.push({ day, blocks: [] });
      currentDay = day;
      currentBlock = null;
    }
    const dayGroup = grouped[grouped.length - 1];
    const isNewBlock = !currentBlock || currentBlock.sender.sender_id !== message.sender_id ||
      new Date(message.timestamp).getTime() - new Date(currentBlock.items[currentBlock.items.length - 1].timestamp).getTime() > 5 * 60 * 1000;
    if (isNewBlock) {
      currentBlock = { sender: message, items: [message] };
      dayGroup.blocks.push(currentBlock);
    } else {
      currentBlock.items.push(message);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <DpaPageHeader
        eyebrow="Grup Chat Bimbingan"
        title="Ruang Bimbingan Bersama"
        description="Percakapan satu grup dengan seluruh mahasiswa bimbingan Anda — tanya kabar, umumkan jadwal, atau beri arahan akademik. Kirim foto, berkas, dan polling untuk diskusi lebih hidup."
        icon={MessagesSquare}
        aside={members.length > 0 ? (
          <div className="mt-4 flex items-center gap-3 border-t border-white/10 pt-4">
            <span className="flex -space-x-2">
              {members.slice(0, 8).map((member) => (
                <span
                  key={member.id}
                  className="grid h-8 w-8 place-items-center rounded-full border border-slate-950 text-[10px] font-bold text-white"
                  style={{ background: member.role === 'dpa' ? 'linear-gradient(135deg,#6c63ff,#3ecfcf)' : '#334155' }}
                >
                  {initials(member.nama)}
                </span>
              ))}
            </span>
            <span className="text-xs text-slate-400">
              {members.length} anggota{warnCount > 0 ? ` · ${warnCount} perlu perhatian` : ''}
            </span>
          </div>
        ) : undefined}
      />

      {error && (
        <div className="flex items-center justify-between rounded-lg border border-rose-300/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {error}
          <button onClick={() => { setError(''); fetchChat(true); }} className="text-xs font-semibold underline">Coba lagi</button>
        </div>
      )}

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        {/* Alur percakapan */}
        <div className="flex min-h-[540px] flex-col rounded-lg border border-white/10 bg-slate-950 shadow-xl shadow-black/10">
          {filter !== null && (
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-2.5 text-xs text-slate-300">
              Memfilter pesan dari{' '}
              <span className="font-semibold text-white">{members.find((m) => m.id === filter)?.nama}</span>
              <button onClick={() => setFilter(null)} className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 font-semibold text-slate-300 hover:text-white">
                <X className="h-3 w-3" /> Tampilkan semua
              </button>
            </div>
          )}

          <div
            ref={scrollRef}
            onScroll={(event) => {
              const el = event.currentTarget;
              nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
            }}
            className="flex-1 space-y-1 overflow-y-auto px-5 py-4"
            style={{ maxHeight: 560 }}
          >
            {loading ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-400">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Memuat percakapan...
              </div>
            ) : visible.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                <MessagesSquare className="h-10 w-10 text-slate-600" />
                <p className="mt-3 text-sm font-semibold text-slate-300">Belum ada percakapan</p>
                <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">
                  {filter !== null
                    ? 'Mahasiswa ini belum mengirim pesan.'
                    : 'Mulai diskusi dengan mahasiswa bimbingan Anda — pesan pertama dari Anda akan terlihat oleh seluruh anggota grup.'}
                </p>
              </div>
            ) : (
              grouped.map((group) => (
                <div key={group.day}>
                  <div className="my-4 flex items-center gap-3">
                    <span className="h-px flex-1 bg-white/10" />
                    <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{group.day}</span>
                    <span className="h-px flex-1 bg-white/10" />
                  </div>
                  {group.blocks.map((block) => {
                    const own = block.sender.sender_role === 'dpa';
                    return (
                      <div key={block.sender.id + block.items[0].id} className={`mb-3 flex gap-2.5 ${own ? 'flex-row-reverse' : ''}`}>
                        <span
                          className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white"
                          style={{ background: own ? 'linear-gradient(135deg,#6c63ff,#3ecfcf)' : '#334155' }}
                        >
                          {initials(block.sender.sender_name)}
                        </span>
                        <div className={`max-w-[76%] ${own ? 'items-end text-right' : ''} flex flex-col`}>
                          <div className={`mb-1 flex items-baseline gap-2 ${own ? 'flex-row-reverse' : ''}`}>
                            <span className="text-xs font-semibold" style={{ color: own ? '#a89cff' : '#cbd5e1' }}>
                              {own ? 'Anda' : block.sender.sender_name}
                            </span>
                            <span className="font-mono text-[10px] text-slate-600">{formatTime(block.items[0].timestamp)}</span>
                          </div>
                          <div className="space-y-1">
                            {block.items.map((message) => (
                              <div
                                key={message.id}
                                className={`rounded-2xl px-3.5 py-2 text-sm leading-6 ${own
                                  ? 'rounded-tr-sm border border-indigo-300/25 bg-indigo-400/10 text-indigo-50'
                                  : 'rounded-tl-sm border border-white/10 bg-white/[0.05] text-slate-200'}`}
                              >
                                <MessageBody message={message} onVote={votePoll} />
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          <ChatComposer
            accent="indigo"
            sending={sending}
            placeholder="Tulis pesan untuk grup bimbingan..."
            onSend={sendPayload}
            onError={setError}
          />
        </div>

        {/* Rail anggota: mahasiswa yang perlu perhatian muncul paling atas */}
        <aside className="rounded-lg border border-white/10 bg-slate-950 p-4 shadow-xl shadow-black/10">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <Users className="h-4 w-4" style={{ color: DPA_ACCENT }} />
            Anggota Grup
          </div>
          <p className="mt-1 text-[10px] leading-4 text-slate-500">Klik untuk memfilter pesannya; ikon keluarkan untuk mengeluarkan mahasiswa dari grup.</p>

          {dpa && me?.id === dpa.id && (
            <button
              onClick={() => setFilter(null)}
              className={`mt-3 flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition ${filter === null ? 'border-indigo-300/40 bg-indigo-400/10' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'}`}
            >
              <span className="grid h-8 w-8 place-items-center rounded-full text-[10px] font-bold text-white" style={{ background: 'linear-gradient(135deg,#6c63ff,#3ecfcf)' }}>
                {initials(dpa.nama)}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-xs font-semibold text-slate-100">{dpa.nama} (Anda)</span>
                <span className="block text-[10px] text-slate-500">DPA Pembimbing</span>
              </span>
            </button>
          )}

          <div className="mt-3 space-y-2">
            {roster.length === 0 ? (
              <p className="py-4 text-center text-xs text-slate-500">Belum ada mahasiswa yang dipetakan ke Anda.</p>
            ) : (
              roster.map((member) => {
                const snap = wellbeing[String(member.id)];
                const burnoutMeta = burnoutCategoryMeta(snap?.burnout_category as string | undefined);
                const happinessMeta = categoryMeta(snap?.happiness_category as string | undefined);
                const needsAttention = snap && (snap.burnout_category === 'Tinggi' || ['Rendah', 'Sangat Rendah'].includes(String(snap.happiness_category)));
                return (
                  <div
                    key={member.id}
                    className={`relative rounded-lg border px-3 py-2.5 transition ${filter === member.id ? 'border-indigo-300/40 bg-indigo-400/10' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'} ${needsAttention ? 'border-l-2 border-l-amber-300/60' : ''}`}
                  >
                    <button type="button" onClick={() => setFilter(filter === member.id ? null : member.id)} className="w-full text-left">
                      <span className="flex items-center gap-2.5 pr-6">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-700 text-[10px] font-bold text-white">
                          {initials(member.nama)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-semibold text-slate-100">{member.nama}</span>
                          <span className="block text-[10px] text-slate-500">{member.nim || 'NIM belum diisi'}</span>
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setRemoveTarget(member)}
                      title="Keluarkan dari grup bimbingan"
                      aria-label={`Keluarkan ${member.nama} dari grup`}
                      className="absolute right-2 top-2 rounded-md p-1 text-slate-600 transition hover:bg-rose-500/15 hover:text-rose-300"
                    >
                      <UserX className="h-3.5 w-3.5" />
                    </button>
                    {snap ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${burnoutMeta.chip}`}>
                          B {Number(snap.burnout ?? 0).toFixed(1)}
                        </span>
                        <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${happinessMeta.chip}`}>
                          HI {Math.round(Number(snap.happiness ?? 0))}
                        </span>
                      </div>
                    ) : (
                      <p className="mt-1.5 text-[9px] text-slate-600">Belum ada data assessment</p>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <div className="mt-4 flex items-start gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-300" />
            <p className="text-[10px] leading-4 text-slate-500">
              Grup ini hanya berisi Anda dan mahasiswa bimbingan. Mahasiswa yang dikeluarkan bisa bergabung kembali lewat Direktori DPA.
            </p>
          </div>
        </aside>
      </section>

      {removeTarget && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm" onMouseDown={() => !removing && setRemoveTarget(null)}>
          <div
            className="w-full max-w-sm rounded-2xl border border-white/10 bg-slate-950 p-5 shadow-2xl shadow-black/50"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-rose-300/25 bg-rose-500/15">
                <AlertTriangle className="h-5 w-5 text-rose-300" />
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-white">Keluarkan dari Grup?</h3>
                <p className="mt-1 text-xs leading-5 text-slate-400">
                  <span className="font-semibold text-slate-200">{removeTarget.nama}</span>{removeTarget.nim ? ` · ${removeTarget.nim}` : ''} akan dikeluarkan dari grup bimbingan ini.
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
              {[
                'Mahasiswa tidak bisa lagi mengirim atau melihat pesan grup.',
                'Riwayat pesan mereka tetap tersimpan dan bisa diarsipkan.',
                'Mereka dapat bergabung kembali lewat Direktori DPA bila dipetakan ulang.',
              ].map((note) => (
                <p key={note} className="flex items-start gap-2 text-[11px] leading-4 text-slate-400">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-500" />
                  {note}
                </p>
              ))}
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={removing}
                onClick={() => setRemoveTarget(null)}
                className="rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.06] disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={removing}
                onClick={() => removeStudent(removeTarget)}
                className="inline-flex items-center gap-2 rounded-xl bg-rose-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {removing && <Loader2 className="h-4 w-4 animate-spin" />}
                Keluarkan dari Grup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
