import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BellRing,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Gauge,
  ListChecks,
  Loader2,
  MessageCircle,
  Plus,
  SendHorizontal,
  Sparkles,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../api';

type AssistantRole = 'admin' | 'dpa' | 'staff' | 'user';
type AssistantTab = 'chat' | 'prioritas' | 'jadwal';
type InsightTone = 'urgent' | 'warning' | 'info' | 'success';

interface AssistantAction {
  label: string;
  path: string;
  description: string;
}

interface AssistantMessage {
  id: string;
  role: 'assistant' | 'user';
  text: string;
  mood?: 'supportive' | 'focused' | 'celebrate';
  title?: string;
  keyPoints?: string[];
  nextSteps?: string[];
  source?: string;
  actions?: AssistantAction[];
}

interface AssistantInsight {
  id: string;
  title: string;
  body: string;
  tone: InsightTone;
  priority: number;
  action?: AssistantAction;
  metric_label?: string;
  metric_value?: string;
}

interface AssistantTask {
  id: string;
  title: string;
  duration_minutes: number;
  priority: 'urgent' | 'high' | 'medium' | 'low';
  due_at?: string;
  category?: string;
}

interface AssistantContext {
  role: AssistantRole;
  name: string;
  generated_at: string;
  summary: string;
  stats: Record<string, string | number | boolean | null>;
  needs: AssistantInsight[];
  actions: AssistantAction[];
  seed_tasks: AssistantTask[];
}

interface AssistantScheduleBlock {
  task_id: string;
  title: string;
  start: string;
  end: string;
  priority: string;
  reason: string;
}

interface AssistantSchedulePlan {
  date: string;
  summary: string;
  blocks: AssistantScheduleBlock[];
  unscheduled: AssistantTask[];
  total_minutes: number;
  available_minutes: number;
  source: string;
  generated_at: string;
  workday_start: string;
  workday_end: string;
  recommended_by: string;
  assistant_notes: string[];
}

interface AIAssistantProps {
  role: AssistantRole;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const actionSets: Record<AssistantRole, AssistantAction[]> = {
  admin: [
    { label: 'Dashboard', path: '/dashboard', description: 'Ringkasan operasional admin' },
    { label: 'Data Responden', path: '/responden', description: 'Pantau risiko dan balasan terapi' },
    { label: 'Analitik', path: '/analitik', description: 'Lihat insight data' },
    { label: 'Laporan', path: '/laporan', description: 'Buka laporan dan ekspor' },
  ],
  dpa: [
    { label: 'Dashboard DPA', path: '/dpa/dashboard', description: 'Pantau mahasiswa bimbingan' },
    { label: 'Mahasiswa Bimbingan', path: '/dpa/mahasiswa', description: 'Detail dan catatan mahasiswa' },
    { label: 'Bimbingan Akademik', path: '/dpa/bimbingan', description: 'Sesi bimbingan dan syarat ujian' },
    { label: 'Grup Chat', path: '/dpa/chat', description: 'Diskusi antar anggota bimbingan' },
  ],
  staff: [
    { label: 'Dashboard Staf', path: '/staff/dashboard', description: 'Antrean laporan bimbingan' },
    { label: 'Proses Laporan', path: '/staff/dashboard', description: 'Selesaikan atau tolak laporan DPA' },
  ],
  user: [
    { label: 'Dashboard', path: '/user/dashboard', description: 'Lihat kondisi hari ini' },
    { label: 'Kuisioner', path: '/user/kuisioner', description: 'Isi asesmen dan MBTI' },
    { label: 'Curhat', path: '/user/curhat', description: 'Ngobrol dan lihat saran' },
    { label: 'Riwayat', path: '/user/asesmen', description: 'Pantau perkembangan' },
  ],
};

const quickPrompts: Record<AssistantRole, string[]> = {
  admin: [
    'Apa yang harus saya cek lebih dulu hari ini?',
    'Baca semua data penting sistem sekarang.',
    'Buatkan rencana kerja prioritas hari ini.',
  ],
  dpa: [
    'Mahasiswa bimbingan mana yang paling perlu saya pantau?',
    'Baca kondisi bimbingan saya sekarang.',
    'Buatkan rencana bimbingan minggu ini.',
  ],
  staff: [
    'Laporan bimbingan apa yang paling mendesak untuk diproses?',
    'Rangkum status antrean laporan saya.',
    'Buat rencana kerja memproses laporan hari ini.',
  ],
  user: [
    'Apa yang paling saya perlukan sekarang?',
    'Baca kondisi saya dari data terbaru.',
    'Buat jadwal seimbang untuk hari ini.',
  ],
};

const storageKey = (role: AssistantRole) => `nexus_assistant_history_${role}`;
const seenInsightKey = (role: AssistantRole) => `nexus_assistant_seen_insight_${role}`;

function buildGreeting(role: AssistantRole): AssistantMessage {
  const isAdmin = role === 'admin';
  const isDpa = role === 'dpa';
  return {
    id: 'welcome',
    role: 'assistant',
    mood: isAdmin || isDpa ? 'focused' : 'supportive',
    title: isAdmin ? 'Pusat bantu admin' : isDpa ? 'Pusat bantu DPA' : 'Teman bantu harian',
    text:
      isAdmin
        ? 'Halo. Aku membaca keadaan sistem dan siap membantu memprioritaskan tindak lanjut, membuka fitur, atau merapikan jadwal kerja.'
        : isDpa
          ? 'Halo. Aku membaca kabar mahasiswa bimbinganmu dan siap membantu memantau prioritas bimbingan.'
          : 'Halo. Aku bisa membaca kondisi terbaru, menemani ngobrol, memberi saran, dan menyusun ritme hari ini supaya lebih masuk akal.',
    keyPoints:
      isAdmin
        ? ['Membaca prioritas operasional.', 'Mengarahkan ke fitur yang paling relevan.', 'Menyusun jadwal kerja berbasis konteks.']
        : isDpa
          ? ['Membaca kabar mahasiswa bimbingan.', 'Mengarahkan ke fitur bimbingan yang relevan.', 'Menemukan mahasiswa yang perlu dipantau.']
          : ['Membaca kondisi terbaru.', 'Menemani obrolan dan memberi saran praktis.', 'Membantu menyusun jadwal harian.'],
    nextSteps:
      isAdmin
        ? ['Pilih prompt cepat atau minta ringkasan prioritas hari ini.']
        : isDpa
          ? ['Mulai dari prompt cepat atau tanya kabar mahasiswa bimbinganmu.']
          : ['Mulai dari prompt cepat atau tulis yang sedang kamu perlukan.'],
    actions: actionSets[role].slice(0, 3),
  };
}

function readStoredMessages(role: AssistantRole): AssistantMessage[] {
  try {
    const raw = localStorage.getItem(storageKey(role));
    if (!raw) return [buildGreeting(role)];
    const parsed = JSON.parse(raw) as AssistantMessage[];
    if (!parsed.length) return [buildGreeting(role)];
    if (parsed[0]?.id === 'welcome' && (!parsed[0].title || !parsed[0].keyPoints?.length)) {
      return [buildGreeting(role), ...parsed.slice(1)];
    }
    return parsed;
  } catch {
    return [buildGreeting(role)];
  }
}

function AssistantMascot({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`assistant-avatar ${compact ? 'assistant-avatar-compact' : 'assistant-avatar-large'}`} aria-hidden="true">
      <span className="assistant-avatar-art" />
      <span className="assistant-blink-eye assistant-blink-eye-left" />
      <span className="assistant-blink-eye assistant-blink-eye-right" />
    </span>
  );
}

function formatClock(value: Date) {
  return value.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDate(value: Date) {
  return value.toLocaleDateString('id-ID', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}

function formatPlanTime(value: string) {
  return new Date(value).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

function insightToneClasses(tone: InsightTone) {
  switch (tone) {
    case 'urgent':
      return 'border-rose-400/25 bg-rose-500/10 text-rose-100';
    case 'warning':
      return 'border-amber-400/25 bg-amber-500/10 text-amber-100';
    case 'success':
      return 'border-emerald-400/25 bg-emerald-500/10 text-emerald-100';
    default:
      return 'border-cyan-400/25 bg-cyan-500/10 text-cyan-100';
  }
}

function createTask(index: number): AssistantTask {
  return {
    id: `custom-${Date.now()}-${index}`,
    title: '',
    duration_minutes: 30,
    priority: 'medium',
  };
}

function buildSeedTasks(role: AssistantRole, stats: Record<string, any>): AssistantTask[] {
  if (role === 'admin') {
    const tasks: AssistantTask[] = [];
    if (Number(stats.unseen_replies || 0) > 0) {
      tasks.push({
        id: 'review-replies',
        title: 'Tinjau balasan terapi baru',
        duration_minutes: Math.min(Math.max(Number(stats.unseen_replies) * 8, 20), 60),
        priority: 'urgent',
      });
    }
    if (Number(stats.high_risk_respondents || 0) > 0) {
      tasks.push({
        id: 'review-high-risk',
        title: 'Review responden risiko tinggi',
        duration_minutes: Math.min(Math.max(Number(stats.high_risk_respondents) * 12, 30), 90),
        priority: 'urgent',
      });
    }
    if (Number(stats.pending_treatments || 0) > 0) {
      tasks.push({
        id: 'review-treatment',
        title: 'Periksa rekomendasi terapi pending',
        duration_minutes: Math.min(Math.max(Number(stats.pending_treatments) * 6, 20), 60),
        priority: 'high',
      });
    }
    tasks.push({
      id: 'analytics-check',
      title: 'Tinjau dashboard analitik',
      duration_minutes: 25,
      priority: 'medium',
    });
    return tasks;
  }

  if (role === 'dpa') {
    const tasks: AssistantTask[] = [];
    if (Number(stats.priority_monitoring || 0) > 0) {
      tasks.push({
        id: 'dpa-monitor-priority',
        title: 'Pantau mahasiswa prioritas',
        duration_minutes: Math.min(Math.max(Number(stats.priority_monitoring) * 10, 20), 60),
        priority: 'urgent',
      });
    }
    if (Number(stats.burnout_tinggi || 0) > 0) {
      tasks.push({
        id: 'dpa-review-burnout',
        title: 'Tindak lanjuti burnout tinggi',
        duration_minutes: Math.min(Math.max(Number(stats.burnout_tinggi) * 8, 15), 60),
        priority: 'high',
      });
    }
    if (Number(stats.belum_isi || 0) > 0) {
      tasks.push({
        id: 'dpa-followup-assessment',
        title: 'Ingatkan mahasiswa isi asesmen',
        duration_minutes: Math.min(Math.max(Number(stats.belum_isi) * 6, 15), 45),
        priority: 'high',
      });
    }
    tasks.push({
      id: 'dpa-push',
      title: 'Sapa dan hadir untuk mahasiswa bimbingan',
      duration_minutes: 20,
      priority: 'medium',
    });
    return tasks;
  }

  if (role === 'staff') {
    const tasks: AssistantTask[] = [];
    tasks.push({
      id: 'staff-process-reports',
      title: 'Proses laporan bimbingan yang masuk',
      duration_minutes: 30,
      priority: 'high',
    });
    tasks.push({
      id: 'staff-archive',
      title: 'Arsipkan dokumen laporan selesai',
      duration_minutes: 15,
      priority: 'medium',
    });
    return tasks;
  }

  const tasks: AssistantTask[] = [];
  if (stats.latest_risk === 'High' || stats.latest_risk === 'Crisis') {
    tasks.push({
      id: 'recovery-block',
      title: 'Blok pemulihan tanpa distraksi',
      duration_minutes: 30,
      priority: 'urgent',
    });
  }
  if (Number(stats.pending_treatments || 0) > 0) {
    tasks.push({
      id: 'therapy-follow-up',
      title: 'Tinjau dan balas saran terapi',
      duration_minutes: 20,
      priority: 'high',
    });
  }
  tasks.push({
    id: 'reflection',
    title: 'Refleksi singkat atau journaling',
    duration_minutes: 15,
    priority: 'medium',
  });
  return tasks;
}

function buildFallbackNeeds(role: AssistantRole, stats: Record<string, any>): AssistantInsight[] {
  const needs: AssistantInsight[] = [];

  if (role === 'admin') {
    if (Number(stats.unseen_replies || 0) > 0) {
      needs.push({
        id: 'fallback-admin-replies',
        title: 'Balasan terapi perlu dibaca',
        body: `${stats.unseen_replies} balasan user belum dibaca.`,
        tone: 'urgent',
        priority: 1,
        action: actionSets.admin.find((action) => action.path === '/responden'),
        metric_label: 'Balasan',
        metric_value: String(stats.unseen_replies),
      });
    }
    if (Number(stats.high_risk_respondents || 0) > 0) {
      needs.push({
        id: 'fallback-admin-risk',
        title: 'Ada responden risiko tinggi',
        body: `${stats.high_risk_respondents} responden perlu dipantau lebih dulu.`,
        tone: 'warning',
        priority: 2,
        action: actionSets.admin.find((action) => action.path === '/responden'),
        metric_label: 'Risiko',
        metric_value: String(stats.high_risk_respondents),
      });
    }
    if (Number(stats.pending_treatments || 0) > 0) {
      needs.push({
        id: 'fallback-admin-treatment',
        title: 'Rekomendasi terapi masih pending',
        body: `${stats.pending_treatments} rekomendasi belum selesai.`,
        tone: 'info',
        priority: 3,
        action: actionSets.admin.find((action) => action.path === '/responden'),
        metric_label: 'Pending',
        metric_value: String(stats.pending_treatments),
      });
    }
  } else if (role === 'user') {
    if (stats.latest_risk === 'High' || stats.latest_risk === 'Crisis') {
      needs.push({
        id: 'fallback-user-risk',
        title: 'Kondisi perlu perhatian ekstra',
        body: `Risiko terakhir terbaca ${String(stats.latest_risk).toLowerCase()}.`,
        tone: 'urgent',
        priority: 1,
        action: actionSets.user.find((action) => action.path === '/user/curhat'),
        metric_label: 'Risiko',
        metric_value: String(stats.latest_risk),
      });
    }
    if (Number(stats.pending_treatments || 0) > 0) {
      needs.push({
        id: 'fallback-user-treatment',
        title: 'Saran terapi menunggu tindak lanjut',
        body: `${stats.pending_treatments} saran terapi masih perlu dilihat.`,
        tone: 'info',
        priority: 2,
        action: actionSets.user.find((action) => action.path === '/user/curhat'),
        metric_label: 'Saran',
        metric_value: String(stats.pending_treatments),
      });
    }
    if (Number(stats.unread_notifications || 0) > 0) {
      needs.push({
        id: 'fallback-user-notifications',
        title: 'Ada notifikasi baru',
        body: `${stats.unread_notifications} notifikasi belum dibaca.`,
        tone: 'info',
        priority: 3,
        action: actionSets.user.find((action) => action.path === '/user/dashboard'),
        metric_label: 'Notifikasi',
        metric_value: String(stats.unread_notifications),
      });
    }
  } else if (role === 'staff') {
    if (Number(stats.diproses || 0) > 0) {
      needs.push({
        id: 'fallback-staff-pending-reports',
        title: 'Laporan bimbingan menunggu diproses',
        body: `${stats.diproses} laporan syarat UTS/UAS menunggu tindakan Anda.`,
        tone: 'urgent',
        priority: 1,
        action: actionSets.staff.find((action) => action.path === '/staff/dashboard'),
        metric_label: 'Menunggu',
        metric_value: String(stats.diproses),
      });
    }
    if (Number(stats.total || 0) > 0) {
      needs.push({
        id: 'fallback-staff-total-reports',
        title: 'Arsip laporan bimbingan',
        body: `Total ${stats.total} laporan bimbingan tercatat di sistem.`,
        tone: 'info',
        priority: 2,
        action: actionSets.staff.find((action) => action.path === '/staff/dashboard'),
        metric_label: 'Total',
        metric_value: String(stats.total),
      });
    }
  } else {
    if (Number(stats.priority_monitoring || 0) > 0) {
      needs.push({
        id: 'fallback-dpa-priority',
        title: 'Mahasiswa prioritas butuh pantauan',
        body: `${stats.priority_monitoring} mahasiswa masuk daftar prioritas pantau.`,
        tone: 'urgent',
        priority: 1,
        action: actionSets.dpa.find((action) => action.path === '/dpa/dashboard'),
        metric_label: 'Prioritas',
        metric_value: String(stats.priority_monitoring),
      });
    }
    if (Number(stats.burnout_tinggi || 0) > 0) {
      needs.push({
        id: 'fallback-dpa-burnout',
        title: 'Ada mahasiswa burnout tinggi',
        body: `${stats.burnout_tinggi} mahasiswa terdeteksi burnout tinggi dan perlu ditindak lanjuti.`,
        tone: 'warning',
        priority: 2,
        action: actionSets.dpa.find((action) => action.path === '/dpa/dashboard'),
        metric_label: 'Burnout',
        metric_value: String(stats.burnout_tinggi),
      });
    }
    if (Number(stats.belum_isi || 0) > 0) {
      needs.push({
        id: 'fallback-dpa-pending-assessment',
        title: 'Mahasiswa belum isi asesmen',
        body: `${stats.belum_isi} mahasiswa belum mengisi asesmen terbaru.`,
        tone: 'info',
        priority: 3,
        action: actionSets.dpa.find((action) => action.path === '/dpa/mahasiswa'),
        metric_label: 'Belum isi',
        metric_value: String(stats.belum_isi),
      });
    }
    if (Number(stats.unread_notifications || 0) > 0) {
      needs.push({
        id: 'fallback-dpa-notifications',
        title: 'Ada notifikasi baru',
        body: `${stats.unread_notifications} notifikasi belum dibaca.`,
        tone: 'info',
        priority: 4,
        action: actionSets.dpa.find((action) => action.path === '/dpa/dashboard'),
        metric_label: 'Notifikasi',
        metric_value: String(stats.unread_notifications),
      });
    }
  }

  return needs.length
    ? needs.sort((left, right) => left.priority - right.priority)
    : [
        {
          id: `fallback-${role}-stable`,
          title: role === 'admin' ? 'Sistem relatif tenang' : role === 'dpa' ? 'Bimbingan relatif tenang' : role === 'staff' ? 'Antrean laporan bersih' : 'Kondisi cukup terpantau',
          body:
            role === 'admin'
              ? 'Tidak ada antrean prioritas besar yang terbaca dari data saat ini.'
              : role === 'dpa'
                ? 'Tidak ada kebutuhan mendesak yang terbaca dari data mahasiswa bimbingan saat ini.'
                : role === 'staff'
                  ? 'Tidak ada laporan bimbingan yang menunggu diproses saat ini.'
                  : 'Belum ada kebutuhan mendesak yang terbaca dari data saat ini.',
          tone: 'success',
          priority: 4,
          action: actionSets[role][0],
        },
      ];
}

function buildFallbackContext(role: AssistantRole, stats: Record<string, any>): AssistantContext {
  const needs = buildFallbackNeeds(role, stats);
  const summary =
    role === 'admin'
      ? `${stats.respondents || 0} responden, ${stats.high_risk_respondents || 0} risiko tinggi, ${stats.unseen_replies || 0} balasan baru, dan ${stats.pending_treatments || 0} terapi pending.`
      : role === 'dpa'
        ? `${stats.total_students || 0} mahasiswa bimbingan, ${stats.priority_monitoring || 0} prioritas pantau, ${stats.burnout_tinggi || 0} burnout tinggi, dan ${stats.belum_isi || 0} belum mengisi asesmen.`
        : role === 'staff'
          ? `${stats.diproses || 0} laporan menunggu diproses dari total ${stats.total || 0} laporan bimbingan.`
          : `Risiko terakhir ${String(stats.latest_risk || '-').toLowerCase()}, ${stats.unread_notifications || 0} notifikasi belum dibaca, dan ${stats.pending_treatments || 0} saran terapi pending.`;

  return {
    role,
    name: '',
    generated_at: new Date().toISOString(),
    summary,
    stats,
    needs,
    actions: actionSets[role],
    seed_tasks: buildSeedTasks(role, stats),
  };
}

function buildLocalSchedulePlan(
  date: string,
  workdayStart: string,
  workdayEnd: string,
  tasks: AssistantTask[],
): AssistantSchedulePlan {
  const priorityWeight = { urgent: 0, high: 1, medium: 2, low: 3 } as const;
  const start = new Date(`${date}T${workdayStart || '08:00'}:00`);
  const end = new Date(`${date}T${workdayEnd || '17:00'}:00`);
  const safeEnd = end > start ? end : new Date(start.getTime() + 9 * 60 * 60 * 1000);
  const sorted = [...tasks]
    .filter((task) => task.title.trim())
    .sort((left, right) => {
      const weight = priorityWeight[left.priority] - priorityWeight[right.priority];
      if (weight !== 0) return weight;
      if (left.due_at && right.due_at) return new Date(left.due_at).getTime() - new Date(right.due_at).getTime();
      if (left.due_at) return -1;
      if (right.due_at) return 1;
      return right.duration_minutes - left.duration_minutes;
    });

  let cursor = new Date(start);
  const blocks: AssistantScheduleBlock[] = [];
  const unscheduled: AssistantTask[] = [];
  let totalMinutes = 0;

  sorted.forEach((task) => {
    const durationMs = task.duration_minutes * 60 * 1000;
    const taskEnd = new Date(cursor.getTime() + durationMs);
    if (taskEnd > safeEnd) {
      unscheduled.push(task);
      return;
    }
    blocks.push({
      task_id: task.id,
      title: task.title,
      start: cursor.toISOString(),
      end: taskEnd.toISOString(),
      priority: task.priority,
      reason:
        task.priority === 'urgent'
          ? 'Ditempatkan paling awal karena membutuhkan respons segera.'
          : task.priority === 'high'
            ? 'Dijadwalkan awal agar tindak lanjut penting tidak tertunda.'
            : task.priority === 'low'
              ? 'Diletakkan setelah tugas inti selesai.'
              : 'Dimasukkan setelah prioritas yang lebih mendesak.',
    });
    totalMinutes += task.duration_minutes;
    cursor = new Date(taskEnd.getTime() + 10 * 60 * 1000);
  });

  return {
    date,
    summary: `${blocks.length} tugas terjadwal dalam ${totalMinutes} menit.${unscheduled.length ? ` ${unscheduled.length} tugas belum tertampung karena kapasitas hari ini tidak cukup.` : ''}`,
    blocks,
    unscheduled,
    total_minutes: totalMinutes,
    available_minutes: Math.round((safeEnd.getTime() - start.getTime()) / 60000),
    source: 'local-optimizer',
    generated_at: new Date().toISOString(),
    workday_start: workdayStart,
    workday_end: workdayEnd,
    recommended_by: 'Nexus',
    assistant_notes: [
      'Mulai dari blok pertama agar prioritas tertinggi selesai saat energi masih baik.',
      'Sisakan jeda singkat di antara blok supaya jadwal tetap realistis.',
    ],
  };
}

export default function AIAssistant({ role, open, onOpenChange }: AIAssistantProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [messages, setMessages] = useState<AssistantMessage[]>(() => readStoredMessages(role));
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<AssistantTab>('chat');
  const [context, setContext] = useState<AssistantContext | null>(null);
  const [contextLoading, setContextLoading] = useState(true);
  const [insightPopup, setInsightPopup] = useState<AssistantInsight | null>(null);
  const [clockOpen, setClockOpen] = useState(false);
  const [now, setNow] = useState(new Date());
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [tasks, setTasks] = useState<AssistantTask[]>([]);
  const [scheduleDate, setScheduleDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [workdayStart, setWorkdayStart] = useState('08:00');
  const [workdayEnd, setWorkdayEnd] = useState('17:00');
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [schedulePlan, setSchedulePlan] = useState<AssistantSchedulePlan | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages(readStoredMessages(role));
  }, [role]);

  useEffect(() => {
    localStorage.setItem(storageKey(role), JSON.stringify(messages.slice(-18)));
  }, [messages, role]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (open) {
      scrollRef.current?.scrollTo({
        top: messages.length > 1 ? scrollRef.current.scrollHeight : 0,
        behavior: messages.length > 1 ? 'smooth' : 'auto',
      });
    }
  }, [messages, open]);

  useEffect(() => {
    fetchContext(true);
    const interval = window.setInterval(() => fetchContext(false), 60000);
    return () => window.clearInterval(interval);
  }, [role]);

  useEffect(() => {
    if (context?.seed_tasks?.length && tasks.length === 0) {
      setTasks(context.seed_tasks);
    }
  }, [context, tasks.length]);

  const topNeed = context?.needs?.[0];
  const headlineStats = useMemo(() => {
    const entries = Object.entries(context?.stats || {}).filter(([key]) => !['role', 'name'].includes(key));
    const preferredKeys =
      role === 'admin'
        ? ['high_risk_respondents', 'unseen_replies', 'pending_treatments']
        : role === 'dpa'
          ? ['priority_monitoring', 'burnout_tinggi', 'warning_count']
          : role === 'staff'
            ? ['diproses', 'total', 'selesai']
            : ['latest_risk', 'pending_treatments', 'unread_notifications'];
    const preferred = preferredKeys
      .map((key) => entries.find(([entryKey]) => entryKey === key))
      .filter(Boolean) as Array<[string, string | number | boolean | null]>;
    return preferred.length ? preferred : entries.slice(0, 3);
  }, [context?.stats, role]);

  const fetchContext = async (allowPopup: boolean) => {
    try {
      if (!context) setContextLoading(true);
      let nextContext: AssistantContext;
      if (role === 'admin') {
        const response = await api.get('/admin/analytics');
        const operations = response.data.operations || {};
        nextContext = buildFallbackContext('admin', {
          respondents: response.data.totalRespondents || 0,
          high_risk_respondents: response.data.highRiskCount || 0,
          unseen_replies: operations.unseenReplies || 0,
          pending_treatments: operations.pendingTreatments || 0,
          assessments_today: operations.assessmentsToday || 0,
        });
      } else if (role === 'dpa') {
        const [dashboardResponse, unreadResponse] = await Promise.all([
          api.get('/dpa/dashboard'),
          api.get('/notifications/unread'),
        ]);
        const notifications = unreadResponse.data.notifications || [];
        nextContext = buildFallbackContext('dpa', {
          total_students: dashboardResponse.data.total_students || 0,
          priority_monitoring: dashboardResponse.data.priority_monitoring || 0,
          burnout_tinggi: dashboardResponse.data.burnout_tinggi || 0,
          happiness_rendah: dashboardResponse.data.happiness_rendah || 0,
          belum_isi: dashboardResponse.data.belum_isi || 0,
          warning_count: dashboardResponse.data.warning_count || 0,
          unread_notifications: notifications.length,
        });
      } else if (role === 'staff') {
        const [reportsResponse, unreadResponse] = await Promise.all([
          api.get('/staff/bimbingan/reports'),
          api.get('/notifications/unread'),
        ]);
        const reports = reportsResponse.data.reports || [];
        const notifications = unreadResponse.data.notifications || [];
        nextContext = buildFallbackContext('staff', {
          total: reports.length,
          diproses: reports.filter((item: any) => item.status === 'diproses').length,
          selesai: reports.filter((item: any) => item.status === 'selesai').length,
          ditolak: reports.filter((item: any) => item.status === 'ditolak').length,
          unread_notifications: notifications.length,
        });
      } else {
        const [dashboardResponse, unreadResponse, notificationsResponse] = await Promise.all([
          api.get('/dashboard'),
          api.get('/notifications/unread'),
          api.get('/user/notifications'),
        ]);
        const prediction = dashboardResponse.data.prediction;
        const notifications = unreadResponse.data.notifications || [];
        const treatments = notificationsResponse.data.notifications || [];
        nextContext = buildFallbackContext('user', {
          latest_risk: prediction?.RiskLevel || '-',
          latest_burnout: prediction?.BurnoutScore ?? null,
          pending_treatments: treatments.filter((item: any) => item.Status === 'pending' || item.status === 'pending').length,
          unread_notifications: notifications.length,
        });
      }

      setContext(nextContext);
      const topNeed = nextContext.needs?.[0];
      if (allowPopup && topNeed) {
        const lastSeen = sessionStorage.getItem(seenInsightKey(role));
        if (lastSeen !== topNeed.id) {
          setInsightPopup(topNeed);
          sessionStorage.setItem(seenInsightKey(role), topNeed.id);
          window.setTimeout(() => setInsightPopup(null), 9000);
        }
      }
    } catch {
      // Keep the assistant usable even if context cannot refresh.
    } finally {
      setContextLoading(false);
    }
  };

  const speak = (text: string) => {
    if (!voiceEnabled || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'id-ID';
    utterance.rate = 0.98;
    window.speechSynthesis.speak(utterance);
  };

  const sendMessage = async (preset?: string) => {
    const text = (preset ?? input).trim();
    if (!text || sending) return;

    const nextUserMessage: AssistantMessage = {
      id: `${Date.now()}-user`,
      role: 'user',
      text,
    };
    const nextMessages = [...messages, nextUserMessage];
    setMessages(nextMessages);
    setInput('');
    setSending(true);
    setError('');

    try {
      const response = await api.post('/assistant/chat', {
        message: text,
        current_path: location.pathname,
        history: nextMessages.slice(-8).map((message) => ({
          role: message.role,
          text: message.text,
        })),
      });
      const assistantMessage: AssistantMessage = {
        id: `${Date.now()}-assistant`,
        role: 'assistant',
        text: response.data.reply,
        mood: response.data.mood,
        title: response.data.title,
        keyPoints: response.data.key_points || [],
        nextSteps: response.data.next_steps || [],
        source: response.data.source,
        actions: response.data.suggested_actions || [],
      };
      setMessages((current) => [...current, assistantMessage]);
      speak(assistantMessage.text);
      fetchContext(false);
    } catch (requestError: any) {
      setError(requestError.response?.data?.error || 'Asisten belum bisa menjawab. Coba beberapa saat lagi.');
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    sendMessage();
  };

  const resetChat = () => {
    const greeting = buildGreeting(role);
    setMessages([greeting]);
    localStorage.setItem(storageKey(role), JSON.stringify([greeting]));
    setError('');
  };

  const useAssistantTool = (tool: 'summary' | 'priority' | 'schedule') => {
    if (tool === 'summary') {
      sendMessage(role === 'admin' ? 'Ringkas kondisi sistem saat ini.' : role === 'staff' ? 'Ringkas kondisi antrean laporan saat ini.' : 'Ringkas kondisi saya saat ini.');
      return;
    }
    if (tool === 'priority') {
      setActiveTab('prioritas');
      return;
    }
    setTasks(context?.seed_tasks || []);
    setActiveTab('jadwal');
  };

  const openAction = (action: AssistantAction) => {
    navigate(action.path);
    setMessages((current) => [
      ...current,
      {
        id: `${Date.now()}-assistant-action`,
        role: 'assistant',
        mood: 'focused',
        text: `Aku buka ${action.label}.`,
        actions: [action],
      },
    ]);
  };

  const addTask = () => {
    setTasks((current) => [...current, createTask(current.length + 1)]);
  };

  const updateTask = (id: string, updates: Partial<AssistantTask>) => {
    setTasks((current) => current.map((task) => (task.id === id ? { ...task, ...updates } : task)));
  };

  const removeTask = (id: string) => {
    setTasks((current) => current.filter((task) => task.id !== id));
  };

  const optimizeSchedule = async () => {
    setScheduleLoading(true);
    setError('');
    const cleanTasks = tasks
      .filter((task) => task.title.trim())
      .map((task) => ({
        ...task,
        due_at: task.due_at ? new Date(task.due_at).toISOString() : undefined,
      }));
    try {
      if (cleanTasks.length === 0) {
        setError('Tambahkan minimal satu tugas sebelum dioptimalkan.');
        return;
      }
      const plan = buildLocalSchedulePlan(scheduleDate, workdayStart, workdayEnd, cleanTasks);
      setSchedulePlan(plan);
      const text = `Jadwal dioptimalkan. ${plan.summary}`;
      setMessages((current) => [
        ...current,
        {
          id: `${Date.now()}-schedule-local`,
          role: 'assistant',
          mood: 'focused',
          title: 'Jadwal siap',
          text,
          keyPoints: [`${plan.blocks.length} blok berhasil disusun.`, `${plan.unscheduled.length} tugas belum tertampung.`],
          nextSteps: ['Tinjau blok pertama, lalu sesuaikan durasi bila perlu.'],
          source: 'local-fallback',
        },
      ]);
      speak(text);
    } catch {
      setError('Gagal mengoptimalkan jadwal.');
    } finally {
      setScheduleLoading(false);
    }
  };

  return (
    <>
      <AnimatePresence>
        {!open && insightPopup && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            className="ai-assistant-insight fixed bottom-32 right-5 z-[121] w-[min(360px,calc(100vw-32px))] rounded-xl border border-slate-700 bg-slate-950/95 p-4 shadow-2xl shadow-black/40 backdrop-blur"
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-cyan-300" />
                <span className="text-xs font-semibold uppercase text-cyan-200">Yang perlu diperhatikan sekarang</span>
              </div>
              <button onClick={() => setInsightPopup(null)} className="text-slate-500 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className={`rounded-lg border p-3 ${insightToneClasses(insightPopup.tone)}`}>
              <p className="text-sm font-semibold">{insightPopup.title}</p>
              <p className="mt-1 text-xs leading-5 opacity-85">{insightPopup.body}</p>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => {
                  onOpenChange(true);
                  setActiveTab('prioritas');
                  setInsightPopup(null);
                }}
                className="inline-flex h-9 items-center justify-center rounded-lg bg-cyan-400 px-3 text-xs font-semibold text-slate-950"
              >
                Lihat detail
              </button>
              {insightPopup.action && (
                <button
                  onClick={() => openAction(insightPopup.action!)}
                  className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-700 px-3 text-xs font-semibold text-slate-200"
                >
                  {insightPopup.action.label}
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!open && (
        <div className="ai-assistant-launcher fixed bottom-5 right-5 z-[120]">
          <AnimatePresence>
            {clockOpen && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                className="ai-assistant-clock absolute bottom-[92px] right-0 w-64 rounded-xl border border-slate-700 bg-slate-950/95 p-4 shadow-2xl shadow-black/40 backdrop-blur"
              >
                <div className="flex items-center gap-2 text-xs font-semibold uppercase text-cyan-200">
                  <Clock3 className="h-4 w-4" />
                  Jam sekarang
                </div>
                <div className="mt-3 text-3xl font-semibold text-white">{formatClock(now)}</div>
                <p className="mt-1 text-xs leading-5 text-slate-400">{formatDate(now)}</p>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="relative rounded-2xl border border-cyan-300/15 bg-slate-950/90 p-2 shadow-2xl shadow-cyan-950/40 backdrop-blur">
            <button
              onClick={() => onOpenChange(true)}
              className="assistant-mascot-shell flex h-[78px] w-[66px] items-center justify-center rounded-xl border border-cyan-300/15 bg-cyan-500/[0.04] transition hover:border-cyan-200/35 hover:bg-cyan-500/[0.08]"
              aria-label="Buka Nexus AI"
            >
              <AssistantMascot compact />
            </button>
            <button
              onClick={() => setClockOpen((value) => !value)}
              className="absolute -left-3 -top-3 inline-flex h-8 w-8 items-center justify-center rounded-full border border-cyan-300/25 bg-slate-950 text-cyan-200 shadow-lg shadow-black/30"
              aria-label="Tampilkan jam"
            >
              <Clock3 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      <AnimatePresence>
        {open && (
          <motion.aside
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="ai-assistant-panel fixed bottom-5 right-5 z-[130] flex h-[min(790px,calc(100vh-40px))] w-[min(520px,calc(100vw-32px))] flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-950/95 shadow-2xl shadow-black/50 backdrop-blur"
          >
            <header className="border-b border-slate-800 bg-slate-900/80 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="assistant-mascot-shell shrink-0 rounded-xl border border-cyan-300/20 bg-cyan-500/10 p-1">
                    <AssistantMascot compact />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-semibold tracking-normal text-white">Nexus AI</h2>
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-200">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                        Aktif
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-slate-400">
                      Membaca konteks sistem, memberi saran, dan menyusun jadwal
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setVoiceEnabled((value) => !value)}
                    className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-800 hover:text-white"
                    aria-label={voiceEnabled ? 'Matikan suara' : 'Aktifkan suara'}
                  >
                    {voiceEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                  </button>
                  <button
                    onClick={() => onOpenChange(false)}
                    className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-800 hover:text-white"
                    aria-label="Tutup Nexus AI"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 rounded-lg border border-slate-800 bg-slate-950 p-1">
                {[
                  { key: 'chat' as const, label: 'Chat', icon: MessageCircle },
                  { key: 'prioritas' as const, label: 'Prioritas', icon: BellRing },
                  { key: 'jadwal' as const, label: 'Jadwal', icon: CalendarClock },
                ].map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key)}
                      className={`inline-flex h-9 items-center justify-center gap-2 rounded-md text-xs font-semibold transition ${
                        activeTab === tab.key ? 'bg-cyan-400 text-slate-950' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </header>

            {activeTab === 'chat' ? (
              <div className="flex min-h-0 flex-1 flex-col">
                <div ref={scrollRef} className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
                  <div className="grid gap-3 rounded-xl border border-slate-800 bg-slate-900/70 p-3 sm:grid-cols-[1.4fr_1fr]">
                    <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase text-cyan-200">
                        <Sparkles className="h-3.5 w-3.5" />
                        Fokus sekarang
                      </div>
                      <p className="mt-2 text-sm font-semibold text-white">
                        {topNeed?.title || (contextLoading ? 'Membaca konteks...' : 'Belum ada prioritas mendesak')}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-slate-400">
                        {topNeed?.body || context?.summary || 'Nexus siap membaca data terbaru dan memberi saran sesuai kebutuhanmu.'}
                      </p>
                    </div>
                    <div className="grid gap-2">
                      {headlineStats.map(([key, value]) => (
                        <div key={key} className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2">
                          <p className="text-[10px] font-semibold uppercase text-slate-500">{key.replaceAll('_', ' ')}</p>
                          <p className="mt-1 truncate text-sm font-semibold text-white">{String(value ?? '-')}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {messages.map((message) => (
                    <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`w-full ${message.role === 'user' ? 'max-w-[78%]' : 'max-w-full'}`}>
                        <div
                          className={`rounded-xl border px-4 py-3 text-sm leading-6 ${
                            message.role === 'user'
                              ? 'border-cyan-300/25 bg-cyan-500/10 text-cyan-50'
                              : message.mood === 'focused'
                                ? 'border-violet-300/20 bg-violet-500/10 text-slate-100'
                                : message.mood === 'celebrate'
                                  ? 'border-emerald-300/20 bg-emerald-500/10 text-slate-100'
                                : 'border-slate-800 bg-slate-900/80 text-slate-200'
                          }`}
                        >
                          {message.role === 'assistant' ? (
                            <div className="space-y-4">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div>
                                {message.title && <p className="text-sm font-semibold text-white">{message.title}</p>}
                                <p className={`${message.title ? 'mt-1' : ''} whitespace-pre-line text-sm leading-6 text-slate-200`}>
                                  {message.text}
                                </p>
                              </div>
                              {message.source && (
                                <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-400">
                                  {message.source === 'ai' ? 'AI' : 'Lokal'}
                                </span>
                              )}
                            </div>

                            {!!message.keyPoints?.length && (
                              <div className="rounded-lg border border-white/5 bg-black/10 p-3">
                                <p className="mb-2 text-[11px] font-semibold uppercase text-slate-400">Poin penting</p>
                                <div className="space-y-2">
                                  {message.keyPoints.map((point) => (
                                    <div key={point} className="flex gap-2 text-xs leading-5 text-slate-300">
                                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-300" />
                                      <span>{point}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {!!message.nextSteps?.length && (
                              <div>
                                <p className="mb-2 text-[11px] font-semibold uppercase text-slate-400">Langkah berikutnya</p>
                                <div className="flex flex-wrap gap-2">
                                  {message.nextSteps.map((step) => (
                                    <span
                                      key={step}
                                      className="rounded-lg border border-slate-700 bg-slate-950/70 px-2.5 py-1.5 text-[11px] leading-4 text-slate-300"
                                    >
                                      {step}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                            </div>
                          ) : (
                            message.text
                          )}
                        </div>

                        {message.role === 'assistant' && !!message.actions?.length && (
                          <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/65 p-4">
                            <p className="mb-2 text-[11px] font-semibold uppercase text-slate-500">Saran tindakan</p>
                            <div className="grid gap-2 sm:grid-cols-2">
                              {message.actions.slice(0, 4).map((action) => (
                                <button
                                  key={`${message.id}-${action.path}`}
                                  onClick={() => openAction(action)}
                                  className="group rounded-lg border border-slate-800 bg-slate-950 p-3 text-left transition hover:border-violet-300/30"
                                >
                                  <div className="flex items-center justify-between gap-2 text-xs font-semibold text-white">
                                    {action.label}
                                    <ArrowRight className="h-3.5 w-3.5 text-slate-500 transition group-hover:text-violet-200" />
                                  </div>
                                  <p className="mt-1 text-[11px] leading-4 text-slate-500">{action.description}</p>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}

                  {sending && (
                    <div className="flex justify-start">
                      <div className="inline-flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/80 px-4 py-3 text-sm text-slate-400">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Nexus sedang berpikir
                      </div>
                    </div>
                  )}
                </div>

                <div className="shrink-0 border-t border-slate-800 bg-slate-900/70 p-4">
                  {error && (
                    <div className="mb-3 rounded-lg border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                      {error}
                    </div>
                  )}

                  <section className="mb-3">
                    <div className="grid gap-2 sm:grid-cols-4">
                    <button
                      onClick={() => useAssistantTool('summary')}
                      disabled={sending}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 text-xs font-semibold text-slate-200 transition hover:border-cyan-300/35 disabled:opacity-60"
                    >
                      <ClipboardList className="h-3.5 w-3.5 text-cyan-300" />
                      Ringkas
                    </button>
                    <button
                      onClick={() => useAssistantTool('priority')}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 text-xs font-semibold text-slate-200 transition hover:border-cyan-300/35"
                    >
                      <BellRing className="h-3.5 w-3.5 text-amber-300" />
                      Prioritas
                    </button>
                    <button
                      onClick={() => useAssistantTool('schedule')}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 text-xs font-semibold text-slate-200 transition hover:border-cyan-300/35"
                    >
                      <CalendarClock className="h-3.5 w-3.5 text-violet-300" />
                      Jadwal
                    </button>
                    <button
                      onClick={resetChat}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 text-xs font-semibold text-slate-200 transition hover:border-rose-300/35"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-rose-300" />
                      Reset
                    </button>
                    </div>
                  </section>

                  <section className="mb-3 border-t border-slate-800 pt-3">
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {quickPrompts[role].map((prompt) => (
                        <button
                          key={prompt}
                          onClick={() => sendMessage(prompt)}
                          disabled={sending}
                          className="h-9 shrink-0 rounded-lg border border-slate-700 bg-slate-950 px-3 text-left text-xs font-medium text-slate-300 transition hover:border-cyan-300/35 hover:text-white disabled:opacity-60"
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </section>

                  <form onSubmit={handleSubmit} className="flex items-end gap-2">
                    <label className="flex min-h-11 flex-1 items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3 focus-within:border-cyan-300/40">
                      <MessageCircle className="h-4 w-4 shrink-0 text-cyan-300" />
                      <textarea
                        value={input}
                        onChange={(event) => setInput(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' && !event.shiftKey) {
                            event.preventDefault();
                            sendMessage();
                          }
                        }}
                        rows={1}
                        placeholder="Tulis pesan untuk Nexus..."
                        className="max-h-28 min-h-[42px] flex-1 resize-none bg-transparent py-3 text-sm text-slate-100 outline-none placeholder:text-slate-600"
                      />
                    </label>
                    <button
                      type="submit"
                      disabled={!input.trim() || sending}
                      className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-400 text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
                      aria-label="Kirim pesan"
                    >
                      {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
                    </button>
                  </form>
                </div>
              </div>
            ) : activeTab === 'prioritas' ? (
              <div className="flex-1 overflow-y-auto p-4">
                <div className="mb-4 rounded-xl border border-slate-800 bg-slate-900/70 p-4">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase text-cyan-200">
                    <BarChart3 className="h-4 w-4" />
                    Ringkasan sistem
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-300">
                    {contextLoading ? 'Membaca data terbaru...' : context?.summary || 'Belum ada ringkasan.'}
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {Object.entries(context?.stats || {})
                    .filter(([key]) => !['role', 'name'].includes(key))
                    .slice(0, 6)
                    .map(([key, value]) => (
                      <div key={key} className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
                        <p className="text-[11px] font-semibold uppercase text-slate-500">
                          {key.replaceAll('_', ' ')}
                        </p>
                        <p className="mt-2 truncate text-xl font-semibold text-white">{String(value ?? '-')}</p>
                      </div>
                    ))}
                </div>

                <div className="mt-4 space-y-3">
                  {(context?.needs || []).map((need) => (
                    <article key={need.id} className={`rounded-xl border p-4 ${insightToneClasses(need.tone)}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            {need.tone === 'urgent' ? (
                              <AlertTriangle className="h-4 w-4" />
                            ) : need.tone === 'success' ? (
                              <CheckCircle2 className="h-4 w-4" />
                            ) : (
                              <Gauge className="h-4 w-4" />
                            )}
                            <h3 className="text-sm font-semibold">{need.title}</h3>
                          </div>
                          <p className="mt-2 text-xs leading-5 opacity-85">{need.body}</p>
                        </div>
                        {need.metric_value && (
                          <div className="rounded-lg border border-white/10 bg-black/10 px-2.5 py-2 text-right">
                            <div className="text-lg font-semibold">{need.metric_value}</div>
                            <div className="text-[10px] uppercase opacity-70">{need.metric_label}</div>
                          </div>
                        )}
                      </div>
                      {need.action && (
                        <button
                          onClick={() => openAction(need.action!)}
                          className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg border border-white/15 px-3 text-xs font-semibold"
                        >
                          Buka {need.action.label}
                          <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </article>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-4">
                <div className="mb-4 rounded-xl border border-slate-800 bg-slate-900/70 p-4">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase text-violet-200">
                    <CalendarClock className="h-4 w-4" />
                    Optimisasi penjadwalan
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    Tambahkan tugas, lalu Nexus menyusun blok waktu berdasarkan prioritas dan kapasitas harian.
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold uppercase text-slate-500">Tanggal</span>
                    <input
                      type="date"
                      value={scheduleDate}
                      onChange={(event) => setScheduleDate(event.target.value)}
                      className="h-10 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 outline-none"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold uppercase text-slate-500">Mulai</span>
                    <input
                      type="time"
                      value={workdayStart}
                      onChange={(event) => setWorkdayStart(event.target.value)}
                      className="h-10 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 outline-none"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold uppercase text-slate-500">Selesai</span>
                    <input
                      type="time"
                      value={workdayEnd}
                      onChange={(event) => setWorkdayEnd(event.target.value)}
                      className="h-10 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 outline-none"
                    />
                  </label>
                </div>

                <div className="mt-4 space-y-3">
                  {tasks.map((task) => (
                    <div key={task.id} className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                      <div className="flex gap-2">
                        <input
                          value={task.title}
                          onChange={(event) => updateTask(task.id, { title: event.target.value })}
                          placeholder="Nama tugas"
                          className="h-10 min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none"
                        />
                        <button
                          onClick={() => removeTask(task.id)}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-700 text-slate-400 hover:text-rose-200"
                          aria-label="Hapus tugas"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="mt-2 grid grid-cols-[1fr_1fr] gap-2">
                        <input
                          type="number"
                          min={10}
                          max={240}
                          value={task.duration_minutes}
                          onChange={(event) => updateTask(task.id, { duration_minutes: Number(event.target.value) || 10 })}
                          className="h-10 rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none"
                        />
                        <select
                          value={task.priority}
                          onChange={(event) => updateTask(task.id, { priority: event.target.value as AssistantTask['priority'] })}
                          className="h-10 rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none"
                        >
                          <option value="urgent">Urgent</option>
                          <option value="high">High</option>
                          <option value="medium">Medium</option>
                          <option value="low">Low</option>
                        </select>
                      </div>
                      <label className="mt-2 block">
                        <span className="mb-1 block text-[11px] font-semibold uppercase text-slate-500">Deadline opsional</span>
                        <input
                          type="datetime-local"
                          value={task.due_at ? task.due_at.slice(0, 16) : ''}
                          onChange={(event) => updateTask(task.id, { due_at: event.target.value || undefined })}
                          className="h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none"
                        />
                      </label>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => setTasks(context?.seed_tasks || [])}
                    className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-700 px-3 text-sm font-semibold text-slate-200"
                  >
                    <Sparkles className="h-4 w-4" />
                    Muat saran
                  </button>
                  <button
                    onClick={addTask}
                    className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-700 px-3 text-sm font-semibold text-slate-200"
                  >
                    <Plus className="h-4 w-4" />
                    Tambah tugas
                  </button>
                  <button
                    onClick={optimizeSchedule}
                    disabled={scheduleLoading}
                    className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-violet-400 px-3 text-sm font-semibold text-slate-950 disabled:opacity-60"
                  >
                    {scheduleLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ListChecks className="h-4 w-4" />}
                    Optimalkan jadwal
                  </button>
                </div>

                {schedulePlan && (
                  <div className="mt-5 rounded-xl border border-violet-300/20 bg-violet-500/10 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase text-violet-200">Rencana hasil optimisasi</p>
                        <p className="mt-2 text-sm leading-6 text-slate-300">{schedulePlan.summary}</p>
                      </div>
                      <span className="rounded-full border border-violet-300/20 px-2.5 py-1 text-[11px] font-semibold text-violet-100">
                        {schedulePlan.source === 'ai' ? 'AI' : 'Fallback'}
                      </span>
                    </div>

                    <div className="mt-4 space-y-2">
                      {schedulePlan.blocks.map((block) => (
                        <div key={block.task_id} className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-semibold text-white">{block.title}</p>
                            <p className="text-xs font-semibold text-cyan-200">
                              {formatPlanTime(block.start)} - {formatPlanTime(block.end)}
                            </p>
                          </div>
                          <p className="mt-1 text-xs leading-5 text-slate-500">{block.reason}</p>
                        </div>
                      ))}
                    </div>

                    {schedulePlan.assistant_notes.length > 0 && (
                      <div className="mt-4 space-y-2">
                        {schedulePlan.assistant_notes.map((note) => (
                          <div key={note} className="flex gap-2 text-xs leading-5 text-slate-300">
                            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-300" />
                            {note}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}
