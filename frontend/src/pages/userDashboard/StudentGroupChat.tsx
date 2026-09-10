import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, GraduationCap, Loader2, ShieldCheck, Users } from 'lucide-react';
import api from '../../api';
import { ChatComposer, MessageBody } from './chatShared';
import type { ChatMessage, ChatSendPayload } from './chatShared';

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

function formatDay(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return 'Hari ini';
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Kemarin';
  return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
}

function initials(nama?: string): string {
  if (!nama) return '?';
  return nama
    .split(' ')
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

export default function StudentGroupChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [dpa, setDpa] = useState<{ id: number; nama: string } | null>(null);
  const [members, setMembers] = useState<Array<{ id: number; nama: string; role: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const lastIdRef = useRef(0);
  const nearBottomRef = useRef(true);

  const fetchChat = useCallback(async (initial = false) => {
    try {
      const params = initial ? {} : { after: String(lastIdRef.current) };
      const res = await api.get('/dpa/chat', { params });
      const incoming: ChatMessage[] = res.data.messages ?? [];
      setDpa(res.data.dpa ?? null);
      setMembers(res.data.members ?? []);
      if (initial) {
        setMessages(incoming);
        lastIdRef.current = incoming.reduce((max, m) => Math.max(max, m.id), 0);
        setLoading(false);
      } else if (incoming.length) {
        setMessages((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          const fresh = incoming.filter((m) => !seen.has(m.id));
          if (!fresh.length) return prev;
          lastIdRef.current = Math.max(lastIdRef.current, ...fresh.map((m) => m.id));
          return [...prev, ...fresh];
        });
      }
      setError('');
    } catch (err: any) {
      if (initial) setLoading(false);
      setError(err.response?.data?.error || 'Percakapan tidak dapat dimuat.');
    }
  }, []);

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
        setMessages((prev) => {
          if (prev.some((m) => m.id === message.id)) return prev;
          lastIdRef.current = Math.max(lastIdRef.current, message.id);
          return [...prev, { ...message, sender_name: message.sender_name ?? '', sender_role: message.sender_role ?? 'dpa' }];
        });
      } catch {
        // Payload rusak diabaikan; polling fallback tetap berjalan bila diperlukan.
      }
    });
    source.addEventListener('refresh', () => {
      fetchChat(true);
    });
    source.addEventListener('error', () => {
      startPolling();
    });

    return () => {
      source.close();
      stopPolling();
    };
  }, [fetchChat]);

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
        lastIdRef.current = Math.max(lastIdRef.current, message.id);
        // SSE juga mengirim balik pesan ini; jangan tambah dua kali.
        setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
        nearBottomRef.current = true;
        if (message.msg_type === 'poll') await fetchChat(true);
        return true;
      } catch (err: any) {
        setError(err.response?.data?.error || 'Pesan gagal terkirim. Coba lagi.');
        return false;
      } finally {
        setSending(false);
      }
    },
    [fetchChat],
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

  // Mahasiswa belum dipetakan ke DPA → arahkan ke Direktori DPA.
  if (!loading && !dpa) {
    return (
      <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-8 text-center shadow-xl shadow-black/10">
        <Users className="mx-auto h-12 w-12 text-slate-600" />
        <h1 className="mt-3 text-lg font-semibold text-white">Anda belum tergabung di grup bimbingan</h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-400">
          Grup chat bimbingan aktif setelah Anda memilih DPA pembimbing. Buka Direktori DPA untuk melihat daftar dosen dan bergabung ke grup bimbingannya.
        </p>
        <Link
          to="/user/dpa"
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"
        >
          Buka Direktori DPA <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  // Kelompokkan pesan berurutan dari pengirim yang sama per hari.
  const grouped: Array<{ day: string; blocks: Array<{ sender: ChatMessage; items: ChatMessage[] }> }> = [];
  let currentDay = '';
  let currentBlock: { sender: ChatMessage; items: ChatMessage[] } | null = null;
  for (const message of messages) {
    const day = formatDay(message.timestamp);
    if (day !== currentDay) {
      grouped.push({ day, blocks: [] });
      currentDay = day;
      currentBlock = null;
    }
    const dayGroup = grouped[grouped.length - 1];
    const isNewBlock = !currentBlock || currentBlock.sender.sender_id !== message.sender_id;
    if (isNewBlock) {
      currentBlock = { sender: message, items: [message] };
      dayGroup.blocks.push(currentBlock);
    } else {
      currentBlock.items.push(message);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="rounded-2xl border border-white/10 bg-slate-950/70 p-5 shadow-xl shadow-black/10">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-indigo-300/25 bg-indigo-300/10 px-3 py-1 text-xs font-semibold text-indigo-100">
          <GraduationCap className="h-3.5 w-3.5" />
          Grup Bimbingan Akademik
        </div>
        <h1 className="text-xl font-semibold text-white sm:text-2xl">
          {dpa ? `Bimbingan dengan ${dpa.nama}` : 'Grup Bimbingan'}
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
          Ruang diskusi bersama DPA pembimbing dan teman seangkatan dalam satu grup bimbingan. Gunakan untuk bertanya tentang rencana studi, beban akademik, atau jadwal konsultasi.
        </p>
        {members.length > 0 && (
          <p className="mt-2 text-xs text-slate-500">{members.length} anggota grup</p>
        )}
      </header>

      {error && (
        <div className="flex items-center justify-between rounded-lg border border-rose-300/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {error}
          <button onClick={() => { setError(''); fetchChat(true); }} className="text-xs font-semibold underline">Coba lagi</button>
        </div>
      )}

      <section className="flex min-h-[520px] flex-col rounded-2xl border border-white/10 bg-slate-950/70 shadow-xl shadow-black/10">
        <div
          ref={scrollRef}
          onScroll={(event) => {
            const el = event.currentTarget;
            nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          }}
          className="flex-1 space-y-1 overflow-y-auto px-5 py-4"
          style={{ maxHeight: 540 }}
        >
          {loading ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-400">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Memuat percakapan...
            </div>
          ) : messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center">
              <GraduationCap className="h-10 w-10 text-slate-600" />
              <p className="mt-3 text-sm font-semibold text-slate-300">Belum ada percakapan</p>
              <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">
                Sapa DPA pembimbing Anda — pesan pertama membuka ruang diskusi grup.
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
                  const own = block.sender.sender_role === 'student';
                  return (
                    <div key={block.sender.id + block.items[0].id} className={`mb-3 flex gap-2.5 ${own ? 'flex-row-reverse' : ''}`}>
                      <span
                        className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white"
                        style={{ background: block.sender.sender_role === 'dpa' ? 'linear-gradient(135deg,#6c63ff,#3ecfcf)' : '#334155' }}
                      >
                        {initials(block.sender.sender_name)}
                      </span>
                      <div className={`max-w-[76%] ${own ? 'items-end text-right' : ''} flex flex-col`}>
                        <div className={`mb-1 flex items-baseline gap-2 ${own ? 'flex-row-reverse' : ''}`}>
                          <span className="text-xs font-semibold" style={{ color: block.sender.sender_role === 'dpa' ? '#a89cff' : '#cbd5e1' }}>
                            {own ? 'Anda' : block.sender.sender_name}{!own && block.sender.sender_role === 'dpa' ? ' · DPA' : ''}
                          </span>
                          <span className="font-mono text-[10px] text-slate-600">{formatTime(block.items[0].timestamp)}</span>
                        </div>
                        <div className="space-y-1">
                          {block.items.map((message) => (
                            <div
                              key={message.id}
                              className={`rounded-2xl px-3.5 py-2 text-sm leading-6 ${own
                                ? 'rounded-tr-sm border border-emerald-300/25 bg-emerald-400/10 text-emerald-50'
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
          accent="emerald"
          sending={sending}
          placeholder="Tulis pesan ke grup bimbingan..."
          onSend={sendPayload}
          onError={setError}
        />
      </section>

      <div className="flex items-start gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
        <p className="text-xs leading-5 text-slate-400">
          Grup ini hanya berisi DPA pembimbing dan mahasiswa bimbingannya. Gunakan bahasa yang santun — pesan tercatat sebagai bagian dari pemantauan bimbingan akademik.
        </p>
      </div>
    </div>
  );
}
