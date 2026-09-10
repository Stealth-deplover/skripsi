import { useRef, useState } from 'react';
import {
  BarChart3,
  CheckCircle2,
  Circle,
  Download,
  FileText,
  Loader2,
  Paperclip,
  Plus,
  SendHorizonal,
  Trash2,
  X,
} from 'lucide-react';
import api from '../../api';

// ============================================================
// Modul bersama grup chat bimbingan (dipakai halaman student & DPA):
// tipe pesan generik (teks/foto/berkas/polling), renderer bubble,
// dan composer dengan lampiran base64 + modal polling.
// ============================================================

export interface ChatPollOption {
  id: number;
  label: string;
  votes: number;
  has_voted: boolean;
}

export interface ChatPoll {
  id: number;
  question: string;
  multi: boolean;
  options: ChatPollOption[];
}

export interface ChatMessage {
  id: number;
  sender_id: number;
  sender_name: string;
  sender_role: string;
  msg_type?: string; // text | image | file | poll
  body: string;
  attachment_name?: string;
  attachment_type?: string;
  attachment_url?: string;
  poll?: ChatPoll | null;
  timestamp: string;
}

export interface ChatSendPayload {
  body: string;
  msg_type?: string;
  attachment_name?: string;
  attachment_type?: string;
  attachment_data?: string;
  poll_question?: string;
  poll_options?: string[];
  poll_multi?: boolean;
}

const MAX_ATTACHMENT_BYTES = 6 * 1024 * 1024;

// Lampiran disajikan lewat endpoint khusus dengan token query-param
// karena elemen img/a tidak bisa mengirim header Authorization.
export function attachmentSrc(url: string): string {
  const token = localStorage.getItem('token') || '';
  return `${api.defaults.baseURL}${url}?token=${encodeURIComponent(token)}`;
}

export function MessageBody({ message, onVote }: { message: ChatMessage; onVote?: (pollId: number, optionId: number) => void }) {
  const type = message.msg_type || 'text';

  if (type === 'image' && message.attachment_url) {
    return (
      <div className="space-y-1.5 text-left">
        <a href={attachmentSrc(message.attachment_url)} target="_blank" rel="noreferrer" className="block">
          <img
            src={attachmentSrc(message.attachment_url)}
            alt={message.attachment_name || 'Foto lampiran'}
            loading="lazy"
            className="max-h-64 w-auto max-w-full rounded-xl border border-white/10"
          />
        </a>
        {message.body && <p className="whitespace-pre-wrap">{message.body}</p>}
      </div>
    );
  }

  if (type === 'file' && message.attachment_url) {
    return (
      <div className="space-y-1.5 text-left">
        <a
          href={attachmentSrc(message.attachment_url)}
          download={message.attachment_name || 'lampiran'}
          className="flex items-center gap-2.5 rounded-xl border border-white/15 bg-white/[0.06] px-3 py-2 transition hover:bg-white/[0.1]"
        >
          <FileText className="h-5 w-5 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-semibold">{message.attachment_name || 'Berkas'}</span>
            <span className="block text-[10px] opacity-70">Klik untuk mengunduh</span>
          </span>
          <Download className="h-4 w-4 shrink-0 opacity-70" />
        </a>
        {message.body && <p className="whitespace-pre-wrap">{message.body}</p>}
      </div>
    );
  }

  if (type === 'poll' && message.poll) {
    const poll = message.poll;
    const total = poll.options.reduce((sum, option) => sum + option.votes, 0);
    const votedAny = poll.options.some((option) => option.has_voted);
    return (
      <div className="min-w-[230px] space-y-2 text-left">
        <p className="flex items-start gap-1.5 text-sm font-semibold">
          <BarChart3 className="mt-0.5 h-4 w-4 shrink-0" />
          {poll.question}
        </p>
        <div className="space-y-1.5">
          {poll.options.map((option) => {
            const percent = total > 0 ? Math.round((option.votes / total) * 100) : 0;
            const locked = option.has_voted || (!poll.multi && votedAny);
            return (
              <button
                key={option.id}
                type="button"
                disabled={locked || !onVote}
                onClick={() => onVote?.(poll.id, option.id)}
                className={`relative w-full overflow-hidden rounded-lg border px-3 py-1.5 text-left text-xs transition ${locked ? 'cursor-default border-white/10' : 'border-white/20 hover:border-white/40'}`}
              >
                <span className="absolute inset-y-0 left-0 bg-white/10" style={{ width: `${percent}%` }} aria-hidden="true" />
                <span className="relative flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-1.5 font-medium">
                    {option.has_voted ? (
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                    ) : (
                      <Circle className={`h-3.5 w-3.5 shrink-0 ${votedAny ? 'opacity-40' : 'opacity-60'}`} />
                    )}
                    <span className="truncate">{option.label}</span>
                  </span>
                  <span className="shrink-0 tabular-nums opacity-80">
                    {option.votes} suara · {percent}%
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <p className="text-[10px] opacity-60">
          {total} suara{poll.multi ? ' · boleh pilih beberapa opsi' : ' · satu pilihan'}
          {votedAny ? ' · pilihan Anda tercatat' : ''}
        </p>
      </div>
    );
  }

  return <p className="whitespace-pre-wrap">{message.body}</p>;
}

const accentClasses = {
  emerald: {
    send: 'bg-emerald-400 hover:bg-emerald-300',
    focus: 'focus:border-emerald-300/50',
    tool: 'hover:border-emerald-300/40 hover:text-emerald-200',
  },
  indigo: {
    send: 'bg-indigo-400 hover:bg-indigo-300',
    focus: 'focus:border-indigo-300/50',
    tool: 'hover:border-indigo-300/40 hover:text-indigo-200',
  },
} as const;

export function ChatComposer({
  accent,
  sending,
  placeholder,
  onSend,
  onError,
}: {
  accent: keyof typeof accentClasses;
  sending: boolean;
  placeholder: string;
  onSend: (payload: ChatSendPayload) => Promise<boolean>;
  onError: (message: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const [attachment, setAttachment] = useState<{ name: string; type: string; data: string } | null>(null);
  const [pollOpen, setPollOpen] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
  const [pollMulti, setPollMulti] = useState(false);
  const [pollSending, setPollSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const accentClass = accentClasses[accent];

  const pickFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > MAX_ATTACHMENT_BYTES) {
      onError('Ukuran file maksimal 6 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setAttachment({ name: file.name, type: file.type || 'application/octet-stream', data: String(reader.result || '') });
    };
    reader.readAsDataURL(file);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const body = draft.trim();
    if (sending || (!body && !attachment)) return;
    const payload: ChatSendPayload = attachment
      ? {
          body,
          msg_type: attachment.type.startsWith('image/') ? 'image' : 'file',
          attachment_name: attachment.name,
          attachment_type: attachment.type,
          attachment_data: attachment.data,
        }
      : { body };
    const ok = await onSend(payload);
    if (ok) {
      setDraft('');
      setAttachment(null);
    }
  };

  const submitPoll = async () => {
    if (pollSending) return;
    const options = pollOptions.map((option) => option.trim()).filter(Boolean);
    if (!pollQuestion.trim() || options.length < 2) {
      onError('Polling butuh pertanyaan dan minimal 2 opsi jawaban.');
      return;
    }
    setPollSending(true);
    const ok = await onSend({
      body: '',
      msg_type: 'poll',
      poll_question: pollQuestion.trim(),
      poll_options: options.slice(0, 8),
      poll_multi: pollMulti,
    });
    setPollSending(false);
    if (ok) {
      setPollOpen(false);
      setPollQuestion('');
      setPollOptions(['', '']);
      setPollMulti(false);
    }
  };

  return (
    <div className="border-t border-white/10 p-4">
      {attachment && (
        <div className="mb-3 flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2">
          {attachment.type.startsWith('image/') ? (
            <img src={attachment.data} alt="Pratinjau lampiran" className="h-10 w-10 rounded-lg object-cover" />
          ) : (
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-white/10">
              <FileText className="h-5 w-5 text-slate-300" />
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-semibold text-slate-100">{attachment.name}</span>
            <span className="block text-[10px] text-slate-500">{attachment.type} · siap dikirim</span>
          </span>
          <button
            type="button"
            onClick={() => setAttachment(null)}
            className="rounded-lg p-1 text-slate-500 hover:bg-rose-500/15 hover:text-rose-300"
            aria-label="Hapus lampiran"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <form onSubmit={submit} className="flex items-end gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip"
          onChange={pickFile}
          className="hidden"
        />
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            title="Kirim foto/berkas"
            className={`grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-slate-400 transition ${accentClass.tool}`}
          >
            <Paperclip className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setPollOpen(true)}
            title="Buat polling"
            className={`grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-slate-400 transition ${accentClass.tool}`}
          >
            <BarChart3 className="h-4 w-4" />
          </button>
        </div>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              submit(event);
            }
          }}
          rows={1}
          placeholder={placeholder}
          className={`max-h-28 min-h-[44px] flex-1 resize-none rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 ${accentClass.focus}`}
        />
        <button
          type="submit"
          disabled={sending || (!draft.trim() && !attachment)}
          className={`inline-flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-slate-950 transition disabled:cursor-not-allowed disabled:opacity-50 ${accentClass.send}`}
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizonal className="h-4 w-4" />}
          Kirim
        </button>
      </form>

      {pollOpen && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
          onMouseDown={() => setPollOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-950 p-5 shadow-2xl shadow-black/50"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                  <BarChart3 className="h-4 w-4" /> Buat polling grup
                </h3>
                <p className="mt-1 text-xs text-slate-500">Anggota grup bisa memilih opsi; hasil tampil langsung.</p>
              </div>
              <button
                type="button"
                onClick={() => setPollOpen(false)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-white/10 hover:text-slate-200"
                aria-label="Tutup modal polling"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <input
              value={pollQuestion}
              onChange={(event) => setPollQuestion(event.target.value)}
              placeholder="Pertanyaan polling..."
              maxLength={255}
              className="mt-4 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-white/30"
            />

            <div className="mt-3 space-y-2">
              {pollOptions.map((option, index) => (
                <div key={index} className="flex items-center gap-2">
                  <span className="w-5 text-center text-xs text-slate-500">{index + 1}.</span>
                  <input
                    value={option}
                    onChange={(event) => {
                      const next = [...pollOptions];
                      next[index] = event.target.value;
                      setPollOptions(next);
                    }}
                    placeholder={`Opsi ${index + 1}`}
                    maxLength={255}
                    className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600 focus:border-white/30"
                  />
                  {pollOptions.length > 2 && (
                    <button
                      type="button"
                      onClick={() => setPollOptions(pollOptions.filter((_, i) => i !== index))}
                      className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-500/15 hover:text-rose-300"
                      aria-label="Hapus opsi"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {pollOptions.length < 8 && (
              <button
                type="button"
                onClick={() => setPollOptions([...pollOptions, ''])}
                className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 transition hover:text-white"
              >
                <Plus className="h-3.5 w-3.5" /> Tambah opsi ({pollOptions.length}/8)
              </button>
            )}

            <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={pollMulti}
                onChange={(event) => setPollMulti(event.target.checked)}
                className="h-3.5 w-3.5 rounded border-white/20 bg-white/10"
              />
              Izinkan memilih lebih dari satu opsi
            </label>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPollOpen(false)}
                className="rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.06]"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={submitPoll}
                disabled={pollSending || !pollQuestion.trim() || pollOptions.filter((o) => o.trim()).length < 2}
                className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pollSending && <Loader2 className="h-4 w-4 animate-spin" />}
                Buat polling
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
