import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  BarChart3,
  Brain,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronLeft,
  ClipboardList,
  Clock,
  Gauge,
  HeartPulse,
  Lightbulb,
  Loader2,
  Minus,
  RotateCcw,
  Shield,
  Sparkles,
  Target,
  TimerReset,
  TrendingDown,
  TrendingUp,
  UsersRound,
  X,
  Zap,
} from 'lucide-react';
import api from '../api';

interface Question {
  id: string;
  text: string;
  construct_type: string;
}

interface Result {
  risk_level: string;
  burnout_score: number;
  psychosomatic_score: number;
  prediction_id: number;
}

interface ResponseItem {
  id: string;
  construct_type: string;
  value: number;
  reaction_time_ms: number;
}

interface MBTIQuestion {
  id: string;
  text: string;
  dimension: string;
  high_pole: string;
  low_pole: string;
  theme?: string;
}

interface MBTIResponseItem {
  id: string;
  value: number;
  reaction_time_ms: number;
}

interface MBTIDimension {
  dimension: string;
  left_pole: string;
  right_pole: string;
  left_score: number;
  right_score: number;
  selected: string;
}

interface MBTIResult {
  id?: number;
  type: string;
  title: string;
  summary: string;
  strengths: string[];
  watchouts: string[];
  dimensions: MBTIDimension[];
  source: string;
  timestamp?: string;
}

interface PreviousPrediction {
  burnout: number;
  psycho: number;
  risk: string;
}

const normalizeMBTIResult = (value: unknown): MBTIResult | null => {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<MBTIResult>;

  return {
    id: typeof raw.id === 'number' ? raw.id : undefined,
    type: typeof raw.type === 'string' ? raw.type : '-',
    title: typeof raw.title === 'string' ? raw.title : 'Profil MBTI',
    summary: typeof raw.summary === 'string' ? raw.summary : 'Belum ada ringkasan hasil.',
    strengths: Array.isArray(raw.strengths) ? raw.strengths.filter((item): item is string => typeof item === 'string') : [],
    watchouts: Array.isArray(raw.watchouts) ? raw.watchouts.filter((item): item is string => typeof item === 'string') : [],
    dimensions: Array.isArray(raw.dimensions)
      ? raw.dimensions.filter((item): item is MBTIDimension => Boolean(item && typeof item === 'object'))
      : [],
    source: typeof raw.source === 'string' ? raw.source : 'unknown',
    timestamp: typeof raw.timestamp === 'string' ? raw.timestamp : undefined,
  };
};

type QuestionProfile = 'balanced' | 'academic' | 'work' | 'recovery';
type MBTISessionMode = 'quick' | 'balanced' | 'deep';
type MBTIFocus = 'general' | 'academic' | 'work' | 'social';

interface MBTIBlueprint {
  dimensions: Record<string, number>;
  themes: Record<string, number>;
}

const questionProfiles: Array<{
  key: QuestionProfile;
  label: string;
  desc: string;
  icon: typeof Brain;
}> = [
  { key: 'balanced', label: 'Seimbang', desc: 'Kondisi umum hari ini', icon: Brain },
  { key: 'academic', label: 'Akademik', desc: 'Tugas, ujian, skripsi', icon: ClipboardList },
  { key: 'work', label: 'Kerja', desc: 'Beban kerja dan relasi', icon: Gauge },
  { key: 'recovery', label: 'Pemulihan', desc: 'Energi dan istirahat', icon: HeartPulse },
];

const mbtiSessionModes: Array<{
  key: MBTISessionMode;
  label: string;
  desc: string;
  questionCount: number;
  duration: string;
}> = [
  { key: 'quick', label: 'Ringkas', desc: 'Cek cepat preferensi utama.', questionCount: 12, duration: '4 menit' },
  { key: 'balanced', label: 'Seimbang', desc: 'Kombinasi paling stabil.', questionCount: 16, duration: '6 menit' },
  { key: 'deep', label: 'Mendalam', desc: 'Lebih banyak konteks.', questionCount: 20, duration: '8 menit' },
];

const mbtiFocusOptions: Array<{
  key: MBTIFocus;
  label: string;
  desc: string;
  icon: typeof Brain;
}> = [
  { key: 'general', label: 'Umum', desc: 'Kebiasaan harian', icon: Brain },
  { key: 'academic', label: 'Akademik', desc: 'Belajar dan tugas', icon: ClipboardList },
  { key: 'work', label: 'Kerja', desc: 'Tim dan target', icon: BriefcaseBusiness },
  { key: 'social', label: 'Relasi', desc: 'Interaksi sosial', icon: UsersRound },
];

const mbtiThemeLabels: Record<string, string> = {
  general: 'Umum',
  academic: 'Akademik',
  work: 'Kerja',
  social: 'Relasi',
};

const answerOptions = [
  { value: 1, label: 'Sangat Tidak Setuju', short: 'STS', tone: 'rose' },
  { value: 2, label: 'Tidak Setuju', short: 'TS', tone: 'orange' },
  { value: 3, label: 'Netral', short: 'N', tone: 'amber' },
  { value: 4, label: 'Setuju', short: 'S', tone: 'emerald' },
  { value: 5, label: 'Sangat Setuju', short: 'SS', tone: 'cyan' },
];

const constructMeta = {
  fatigue: {
    label: 'Kelelahan',
    icon: HeartPulse,
    text: 'text-rose-300',
    bg: 'bg-rose-500/10',
    border: 'border-rose-400/25',
    helper: 'Energi, keletihan, dan kapasitas pemulihan.',
  },
  cynicism: {
    label: 'Sinisme',
    icon: Shield,
    text: 'text-amber-300',
    bg: 'bg-amber-500/10',
    border: 'border-amber-400/25',
    helper: 'Jarak emosional, kejenuhan, dan sikap terhadap aktivitas.',
  },
  efficacy: {
    label: 'Efikasi',
    icon: Target,
    text: 'text-emerald-300',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-400/25',
    helper: 'Keyakinan, performa, dan rasa mampu menyelesaikan tugas.',
  },
  default: {
    label: 'Refleksi',
    icon: Brain,
    text: 'text-indigo-300',
    bg: 'bg-indigo-500/10',
    border: 'border-indigo-400/25',
    helper: 'Respons kognitif untuk membaca pola kondisi hari ini.',
  },
};

const riskMeta = {
  Crisis: {
    label: 'Krisis',
    text: 'text-rose-200',
    bg: 'bg-rose-500/15',
    border: 'border-rose-300/35',
    hex: '#fb7185',
  },
  High: {
    label: 'Tinggi',
    text: 'text-rose-300',
    bg: 'bg-rose-500/10',
    border: 'border-rose-400/30',
    hex: '#fb7185',
  },
  Medium: {
    label: 'Sedang',
    text: 'text-amber-300',
    bg: 'bg-amber-500/10',
    border: 'border-amber-400/30',
    hex: '#f59e0b',
  },
  Low: {
    label: 'Rendah',
    text: 'text-emerald-300',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-400/30',
    hex: '#34d399',
  },
};

const getConstructMeta = (type: string) =>
  constructMeta[type as keyof typeof constructMeta] ?? constructMeta.default;

const getRiskMeta = (risk: string) =>
  riskMeta[risk as keyof typeof riskMeta] ?? riskMeta.Low;

const formatReactionTime = (ms: number) => {
  if (!Number.isFinite(ms)) return '-';
  return `${(ms / 1000).toFixed(1)}s`;
};

const formatDateKey = (value: string) => {
  if (!value) return '-';
  const [date, profile] = value.split(':');
  return [date, profile].filter(Boolean).join(' / ');
};

const buildLocalMBTIBlueprint = (items: MBTIQuestion[]): MBTIBlueprint =>
  items.reduce<MBTIBlueprint>(
    (acc, item) => {
      acc.dimensions[item.dimension] = (acc.dimensions[item.dimension] || 0) + 1;
      const theme = item.theme || 'general';
      acc.themes[theme] = (acc.themes[theme] || 0) + 1;
      return acc;
    },
    { dimensions: {}, themes: {} },
  );

const getMBTIClarity = (dimensions: MBTIDimension[]) => {
  if (dimensions.length === 0) return 0;
  const averageGap =
    dimensions.reduce((total, dimension) => {
      const totalScore = Math.max(dimension.left_score + dimension.right_score, 1);
      return total + Math.abs(dimension.left_score - dimension.right_score) / totalScore;
    }, 0) / dimensions.length;
  return Math.round(averageGap * 100);
};

const getStrongestMBTIDimension = (dimensions: MBTIDimension[]) => {
  if (dimensions.length === 0) return '-';
  const strongest = [...dimensions].sort((left, right) => {
    const leftGap = Math.abs(left.left_score - left.right_score);
    const rightGap = Math.abs(right.left_score - right.right_score);
    return rightGap - leftGap;
  })[0];
  return `${strongest.dimension} / ${strongest.selected}`;
};

export default function UserKuisioner() {
  const nav = useNavigate();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [orderType, setOrderType] = useState('');
  const [currentIdx, setCurrentIdx] = useState(0);
  const [responses, setResponses] = useState<ResponseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [prevPrediction, setPrevPrediction] = useState<PreviousPrediction | null>(null);
  const [selectedVal, setSelectedVal] = useState<number | null>(null);
  const [animating, setAnimating] = useState(false);
  const [questionProfile, setQuestionProfile] = useState<QuestionProfile>('balanced');
  const [questionSource, setQuestionSource] = useState('');
  const [questionDateKey, setQuestionDateKey] = useState('');
  const [refreshingQuestions, setRefreshingQuestions] = useState(false);
  const [questionError, setQuestionError] = useState('');
  const [mbtiQuestions, setMbtiQuestions] = useState<MBTIQuestion[]>([]);
  const [mbtiQuestionSet, setMbtiQuestionSet] = useState('');
  const [mbtiFingerprint, setMbtiFingerprint] = useState('');
  const [mbtiSource, setMbtiSource] = useState('');
  const [mbtiMode, setMbtiMode] = useState<MBTISessionMode>('balanced');
  const [mbtiModeLabel, setMbtiModeLabel] = useState('Seimbang');
  const [mbtiFocus, setMbtiFocus] = useState<MBTIFocus>('general');
  const [mbtiFocusLabel, setMbtiFocusLabel] = useState('Umum');
  const [mbtiEstimatedMinutes, setMbtiEstimatedMinutes] = useState(6);
  const [mbtiBlueprint, setMbtiBlueprint] = useState<MBTIBlueprint>({ dimensions: {}, themes: {} });
  const [mbtiCurrentIdx, setMbtiCurrentIdx] = useState(0);
  const [mbtiResponses, setMbtiResponses] = useState<MBTIResponseItem[]>([]);
  const [mbtiSelectedVal, setMbtiSelectedVal] = useState<number | null>(null);
  const [mbtiLoading, setMbtiLoading] = useState(true);
  const [mbtiRefreshing, setMbtiRefreshing] = useState(false);
  const [mbtiSubmitting, setMbtiSubmitting] = useState(false);
  const [mbtiAnimating, setMbtiAnimating] = useState(false);
  const [mbtiError, setMbtiError] = useState('');
  const [mbtiResult, setMbtiResult] = useState<MBTIResult | null>(null);
  const [latestMbti, setLatestMbti] = useState<MBTIResult | null>(null);
  const [mbtiModalOpen, setMbtiModalOpen] = useState(false);
  const startRef = useRef(Date.now());
  const mbtiStartRef = useRef(Date.now());

  useEffect(() => {
    fetchQuestions({ profile: 'balanced' });
    fetchMBTIQuestions();
    fetchLatestMBTI();
  }, []);

  const resetSession = (clearResult = true) => {
    if (clearResult) setResult(null);
    setCurrentIdx(0);
    setResponses([]);
    setSelectedVal(null);
    setPrevPrediction(null);
    setAnimating(false);
    startRef.current = Date.now();
  };

  const fetchQuestions = async (options?: { profile?: QuestionProfile; refresh?: boolean }) => {
    const nextProfile = options?.profile ?? questionProfile;
    const shouldRefresh = options?.refresh ?? false;
    const firstLoad = questions.length === 0 && !result;

    if (firstLoad) setLoading(true);
    else setRefreshingQuestions(true);
    setQuestionError('');

    try {
      const response = await api.get('/assessment', {
        params: {
          profile: nextProfile,
          refresh: shouldRefresh ? '1' : undefined,
          variant: shouldRefresh ? `${Date.now()}` : undefined,
        },
      });
      setQuestions(response.data.questions || []);
      setOrderType(response.data.order_type || '');
      setQuestionSource(response.data.source || 'api');
      setQuestionDateKey(response.data.date_key || '');
      setQuestionProfile((response.data.profile || nextProfile) as QuestionProfile);
      resetSession(true);
      startRef.current = Date.now();
    } catch (error) {
      console.error(error);
      setQuestionError('Gagal mengambil pertanyaan dari API. Coba refresh atau pilih mode lain.');
    } finally {
      setLoading(false);
      setRefreshingQuestions(false);
    }
  };

  const resetMBTISession = () => {
    setMbtiCurrentIdx(0);
    setMbtiResponses([]);
    setMbtiSelectedVal(null);
    setMbtiAnimating(false);
    mbtiStartRef.current = Date.now();
  };

  const fetchMBTIQuestions = async (
    refresh = false,
    options?: { mode?: MBTISessionMode; focus?: MBTIFocus },
  ) => {
    const nextMode = options?.mode ?? mbtiMode;
    const nextFocus = options?.focus ?? mbtiFocus;
    if (mbtiQuestions.length === 0) setMbtiLoading(true);
    else setMbtiRefreshing(true);
    setMbtiError('');

    try {
      const response = await api.get('/mbti/questions', {
        params: {
          mode: nextMode,
          focus: nextFocus,
          refresh: refresh ? '1' : undefined,
          variant: refresh ? `${Date.now()}` : undefined,
        },
      });
      const nextQuestions = response.data.questions || [];
      const fallbackMode = mbtiSessionModes.find((item) => item.key === nextMode);
      const fallbackFocus = mbtiFocusOptions.find((item) => item.key === nextFocus);
      setMbtiQuestions(nextQuestions);
      setMbtiQuestionSet(response.data.question_set || '');
      setMbtiFingerprint((response.data.fingerprint || '').slice(0, 10).toUpperCase());
      setMbtiSource(response.data.source || 'api');
      setMbtiMode((response.data.mode || nextMode) as MBTISessionMode);
      setMbtiModeLabel(response.data.mode_label || fallbackMode?.label || 'Seimbang');
      setMbtiFocus((response.data.focus || nextFocus) as MBTIFocus);
      setMbtiFocusLabel(response.data.focus_label || fallbackFocus?.label || 'Umum');
      setMbtiEstimatedMinutes(response.data.estimated_minutes || (nextMode === 'quick' ? 4 : nextMode === 'deep' ? 8 : 6));
      setMbtiBlueprint(response.data.blueprint || buildLocalMBTIBlueprint(nextQuestions));
      resetMBTISession();
    } catch (error) {
      console.error(error);
      setMbtiError('Gagal mengambil pertanyaan MBTI dari API.');
    } finally {
      setMbtiLoading(false);
      setMbtiRefreshing(false);
    }
  };

  const fetchLatestMBTI = async () => {
    try {
      const response = await api.get('/user/mbti/latest');
      setLatestMbti(normalizeMBTIResult(response.data?.result));
    } catch {
      setLatestMbti(null);
    }
  };

  const submitAssessment = async (finalResponses: ResponseItem[]) => {
    setSubmitting(true);

    try {
      let previous: PreviousPrediction | null = null;

      try {
        const historyResponse = await api.get('/user/history');
        const predictions = historyResponse.data.predictions || [];

        if (predictions.length > 0) {
          previous = {
            burnout: predictions[0].BurnoutScore,
            psycho: predictions[0].PsychosomaticScore,
            risk: predictions[0].RiskLevel,
          };
        }
      } catch {
        previous = null;
      }

      const response = await api.post('/assessment/submit', {
        order_type: orderType,
        responses: finalResponses,
      });

      setPrevPrediction(previous);
      setResult(response.data);
    } catch (error) {
      console.error(error);
      alert('Gagal mengirim hasil kuisioner. Silakan coba lagi.');
      setAnimating(false);
    } finally {
      setSubmitting(false);
    }
  };

  const submitMBTI = async (finalResponses: MBTIResponseItem[]) => {
    setMbtiSubmitting(true);
    setMbtiError('');

    try {
      const response = await api.post('/mbti/submit', {
        question_set: mbtiQuestionSet,
        responses: finalResponses,
      });
      const nextResult = normalizeMBTIResult(response.data);
      setMbtiResult(nextResult);
      setLatestMbti(nextResult);
      setMbtiModalOpen(Boolean(nextResult));
    } catch (error: any) {
      console.error(error);
      setMbtiError(error.response?.data?.error || 'Gagal mengirim hasil MBTI. Silakan coba lagi.');
      setMbtiAnimating(false);
    } finally {
      setMbtiSubmitting(false);
    }
  };

  const handleAnswer = (value: number) => {
    if (animating || questions.length === 0) return;

    setSelectedVal(value);
    setAnimating(true);

    const reactionTime = Date.now() - startRef.current;
    const question = questions[currentIdx];
    const nextResponses = [
      ...responses,
      {
        id: question.id,
        construct_type: question.construct_type,
        value,
        reaction_time_ms: reactionTime,
      },
    ];

    setResponses(nextResponses);

    setTimeout(() => {
      if (currentIdx < questions.length - 1) {
        setCurrentIdx((index) => index + 1);
        setSelectedVal(null);
        setAnimating(false);
        startRef.current = Date.now();
      } else {
        submitAssessment(nextResponses);
      }
    }, 340);
  };

  const handleMBTIAnswer = (value: number) => {
    if (mbtiAnimating || mbtiQuestions.length === 0) return;

    setMbtiSelectedVal(value);
    setMbtiAnimating(true);

    const reactionTime = Date.now() - mbtiStartRef.current;
    const question = mbtiQuestions[mbtiCurrentIdx];
    const nextResponses = [
      ...mbtiResponses,
      {
        id: question.id,
        value,
        reaction_time_ms: reactionTime,
      },
    ];
    setMbtiResponses(nextResponses);

    setTimeout(() => {
      if (mbtiCurrentIdx < mbtiQuestions.length - 1) {
        setMbtiCurrentIdx((index) => index + 1);
        setMbtiSelectedVal(null);
        setMbtiAnimating(false);
        mbtiStartRef.current = Date.now();
      } else {
        submitMBTI(nextResponses);
      }
    }, 280);
  };

  const goBack = () => {
    if (currentIdx === 0 || animating) return;

    setResponses((items) => items.slice(0, -1));
    setCurrentIdx((index) => index - 1);
    setSelectedVal(null);
    startRef.current = Date.now();
  };

  const goBackMBTI = () => {
    if (mbtiCurrentIdx === 0 || mbtiAnimating || mbtiSubmitting) return;
    setMbtiResponses((items) => items.slice(0, -1));
    setMbtiCurrentIdx((index) => index - 1);
    setMbtiSelectedVal(null);
    mbtiStartRef.current = Date.now();
  };

  const resetQuestionnaire = () => {
    resetSession(true);
  };

  const progress = questions.length > 0 ? (responses.length / questions.length) * 100 : 0;
  const displayProgress = questions.length > 0 ? ((currentIdx + 1) / questions.length) * 100 : 0;
  const currentQuestion = questions[currentIdx];
  const currentMeta = currentQuestion ? getConstructMeta(currentQuestion.construct_type) : constructMeta.default;
  const CurrentIcon = currentMeta.icon;
  const selectedProfileMeta =
    questionProfiles.find((item) => item.key === questionProfile) ?? questionProfiles[0];
  const questionFingerprint = orderType ? orderType.slice(0, 10).toUpperCase() : '-';
  const canChangeQuestions = !refreshingQuestions && !submitting && !animating;
  const currentMBTIQuestion = mbtiQuestions[mbtiCurrentIdx];
  const mbtiDisplayProgress = mbtiQuestions.length > 0 ? ((mbtiCurrentIdx + 1) / mbtiQuestions.length) * 100 : 0;
  const canChangeMBTIQuestions = !mbtiRefreshing && !mbtiSubmitting && !mbtiAnimating;

  const mbtiResponseStats = useMemo(() => {
    const totalMs = mbtiResponses.reduce((total, item) => total + item.reaction_time_ms, 0);
    const averageMs = mbtiResponses.length > 0 ? totalMs / mbtiResponses.length : 0;
    const averageValue =
      mbtiResponses.length > 0
        ? mbtiResponses.reduce((total, item) => total + item.value, 0) / mbtiResponses.length
        : 0;
    const answeredByDimension = mbtiResponses.reduce<Record<string, number>>((acc, item) => {
      const question = mbtiQuestions.find((entry) => entry.id === item.id);
      if (question) acc[question.dimension] = (acc[question.dimension] || 0) + 1;
      return acc;
    }, {});

    return { averageMs, averageValue, answeredByDimension };
  }, [mbtiQuestions, mbtiResponses]);

  const mbtiQuestionMix = useMemo(() => {
    const blueprint =
      Object.keys(mbtiBlueprint.dimensions).length > 0 ? mbtiBlueprint : buildLocalMBTIBlueprint(mbtiQuestions);
    const themeEntries = Object.entries(blueprint.themes).sort(([, left], [, right]) => right - left);
    return {
      dimensions: blueprint.dimensions,
      themes: themeEntries,
    };
  }, [mbtiBlueprint, mbtiQuestions]);

  const responseStats = useMemo(() => {
    const totalMs = responses.reduce((total, item) => total + item.reaction_time_ms, 0);
    const averageMs = responses.length > 0 ? totalMs / responses.length : 0;
    const averageValue =
      responses.length > 0
        ? responses.reduce((total, item) => total + item.value, 0) / responses.length
        : 0;
    const constructCounts = responses.reduce<Record<string, number>>((acc, item) => {
      acc[item.construct_type] = (acc[item.construct_type] || 0) + 1;
      return acc;
    }, {});

    return { averageMs, averageValue, constructCounts };
  }, [responses]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0b0d14] px-6 text-slate-100">
        <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900/70 p-8 text-center shadow-2xl shadow-black/20">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-500/10">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-300" aria-hidden="true" />
          </div>
          <h2 className="mt-5 text-xl font-semibold tracking-normal text-white">Menyiapkan pertanyaan</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Sistem sedang mengambil kuisioner dari API asesmen dan menyiapkan urutan adaptif.
          </p>
        </div>
      </div>
    );
  }

  if (submitting && !result) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0b0d14] px-6 text-slate-100">
        <div className="w-full max-w-lg overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70 p-8 text-center shadow-2xl shadow-black/20">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-xl border border-indigo-400/25 bg-indigo-500/10">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-300" aria-hidden="true" />
          </div>
          <h2 className="mt-5 text-xl font-semibold tracking-normal text-white">Menganalisis respons</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Quantum Cognition dan model prediksi sedang membaca pola jawaban, waktu reaksi,
            serta sinyal risiko psikosomatis.
          </p>
          <div className="mt-6 grid grid-cols-3 gap-3">
            {['Interference', 'Regression', 'Risk map'].map((item) => (
              <div key={item} className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-3 text-xs text-slate-400">
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (result) {
    const risk = getRiskMeta(result.risk_level);
    const burnoutScore = result.burnout_score || 0;
    const psychoScore = result.psychosomatic_score || 0;
    const gaugePercent = Math.min((burnoutScore / 10) * 100, 100);
    const diff = prevPrediction ? burnoutScore - prevPrediction.burnout : 0;
    const stable = Math.abs(diff) < 0.3;
    const TrendIcon = stable ? Minus : diff > 0 ? TrendingUp : TrendingDown;
    const trendColor = stable ? 'text-slate-400' : diff > 0 ? 'text-rose-300' : 'text-emerald-300';
    const trendLabel = stable
      ? 'Stabil'
      : diff > 0
        ? `Naik ${diff.toFixed(1)}`
        : `Turun ${Math.abs(diff).toFixed(1)}`;
    const recommendations =
      result.risk_level === 'High' || result.risk_level === 'Crisis'
        ? [
            'Ambil jeda pemulihan dan kurangi aktivitas yang paling menguras energi.',
            'Bicarakan kondisi ini dengan orang tepercaya atau pendamping profesional.',
            'Pantau kembali skor harian, terutama jika keluhan fisik ikut meningkat.',
          ]
        : result.risk_level === 'Medium'
          ? [
              'Jadwalkan check-in diri singkat selama beberapa hari ke depan.',
              'Atur prioritas tugas dan sisihkan waktu pemulihan yang benar-benar bebas.',
              'Catat pemicu stres yang paling sering muncul setelah aktivitas harian.',
            ]
          : [
              'Pertahankan ritme tidur, makan, dan aktivitas fisik yang sudah membantu.',
              'Gunakan skor hari ini sebagai baseline untuk membaca perubahan berikutnya.',
              'Tetap lakukan refleksi berkala agar kenaikan risiko terbaca lebih awal.',
            ];

    return (
      <div className="min-h-screen bg-[#0b0d14] px-5 py-6 text-slate-100 md:px-8">
        <div className="mx-auto max-w-6xl space-y-5">
          <header className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/70">
            <div className="relative grid gap-6 p-6 md:grid-cols-[1fr_320px]">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(34,197,94,0.20),transparent_28%),radial-gradient(circle_at_88%_8%,rgba(99,102,241,0.18),transparent_26%)]" />
              <div className="relative">
                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-200">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Analisis selesai
                </div>
                <h1 className="text-2xl font-semibold tracking-normal text-white md:text-3xl">
                  Hasil Kuisioner Harian
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                  Data respons berhasil diproses menjadi skor burnout, risiko psikosomatis,
                  dan rekomendasi tindak lanjut yang bisa kamu pantau dari dashboard.
                </p>
              </div>

              <div className={`relative rounded-xl border p-4 ${risk.border} ${risk.bg}`}>
                <p className="text-xs font-semibold uppercase text-slate-400">Status risiko</p>
                <div className={`mt-2 text-3xl font-semibold ${risk.text}`}>{risk.label}</div>
                <p className="mt-2 text-xs leading-5 text-slate-400">Prediction ID #{result.prediction_id}</p>
              </div>
            </div>
          </header>

          <section className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
            <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-6">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase text-slate-500">Skor utama</p>
                  <h2 className="mt-1 text-lg font-semibold tracking-normal text-white">Burnout gauge</h2>
                </div>
                <Gauge className="h-5 w-5 text-emerald-300" aria-hidden="true" />
              </div>

              <div className="relative mx-auto h-52 w-52">
                <svg className="-rotate-90" viewBox="0 0 180 180">
                  <circle cx="90" cy="90" r="74" fill="none" stroke="#1e293b" strokeWidth="14" />
                  <circle
                    cx="90"
                    cy="90"
                    r="74"
                    fill="none"
                    stroke={risk.hex}
                    strokeDasharray={`${465 * (gaugePercent / 100)} 465`}
                    strokeLinecap="round"
                    strokeWidth="14"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className={`text-5xl font-semibold ${risk.text}`}>{burnoutScore.toFixed(1)}</span>
                  <span className="text-xs text-slate-500">dari 10</span>
                </div>
              </div>

              {prevPrediction && (
                <div className="mt-5 flex items-center justify-center gap-2 rounded-lg border border-slate-800 bg-slate-950/70 px-4 py-3">
                  <TrendIcon className={`h-4 w-4 ${trendColor}`} aria-hidden="true" />
                  <span className={`text-sm font-semibold ${trendColor}`}>{trendLabel}</span>
                  <span className="text-xs text-slate-500">dari skor sebelumnya {prevPrediction.burnout.toFixed(1)}</span>
                </div>
              )}
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
                <div className="mb-4 flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-indigo-300" aria-hidden="true" />
                  <h2 className="text-base font-semibold tracking-normal text-white">Breakdown skor</h2>
                </div>

                <div className="space-y-4">
                  {[
                    { label: 'Burnout', value: burnoutScore, icon: Zap, color: risk.hex },
                    { label: 'Psikosomatis', value: psychoScore, icon: Activity, color: '#22d3ee' },
                    { label: 'Rata-rata respons', value: responseStats.averageValue * 2, icon: Target, color: '#a78bfa' },
                  ].map((item) => {
                    const Icon = item.icon;
                    const width = `${Math.min((item.value / 10) * 100, 100)}%`;

                    return (
                      <div key={item.label} className="rounded-lg border border-slate-800 bg-slate-950/70 p-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 text-sm font-medium text-slate-300">
                            <Icon className="h-4 w-4" style={{ color: item.color }} aria-hidden="true" />
                            {item.label}
                          </div>
                          <span className="text-sm font-semibold text-white">{item.value.toFixed(1)}</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                          <div className="h-full rounded-full" style={{ width, backgroundColor: item.color }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
                <div className="mb-4 flex items-center gap-2">
                  <Lightbulb className="h-5 w-5 text-amber-300" aria-hidden="true" />
                  <h2 className="text-base font-semibold tracking-normal text-white">Rekomendasi</h2>
                </div>

                <div className="space-y-3">
                  {recommendations.map((item) => (
                    <div key={item} className="flex gap-3 rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" aria-hidden="true" />
                      <p className="text-sm leading-6 text-slate-400">{item}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
              <div className="mb-5 flex items-center gap-2">
                <Brain className="h-5 w-5 text-violet-300" aria-hidden="true" />
                <h2 className="text-base font-semibold tracking-normal text-white">Cara kerja analisis</h2>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                {[
                  {
                    title: 'Reaction time',
                    body: `Rata-rata ${formatReactionTime(responseStats.averageMs)} per pertanyaan sebagai sinyal konsistensi respons.`,
                    icon: TimerReset,
                    color: 'text-cyan-300',
                  },
                  {
                    title: 'Quantum cognition',
                    body: 'Variasi jawaban dan urutan pertanyaan dipakai untuk membaca interference effect.',
                    icon: Brain,
                    color: 'text-violet-300',
                  },
                  {
                    title: 'Prediksi risiko',
                    body: 'Skor burnout dan psikosomatis dihitung lalu diklasifikasikan menjadi status risiko.',
                    icon: Shield,
                    color: 'text-emerald-300',
                  },
                ].map((item) => {
                  const Icon = item.icon;

                  return (
                    <article key={item.title} className="rounded-lg border border-slate-800 bg-slate-950/70 p-4">
                      <Icon className={`mb-4 h-5 w-5 ${item.color}`} aria-hidden="true" />
                      <h3 className="text-sm font-semibold tracking-normal text-white">{item.title}</h3>
                      <p className="mt-2 text-xs leading-5 text-slate-500">{item.body}</p>
                    </article>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
              <h2 className="text-base font-semibold tracking-normal text-white">Aksi berikutnya</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Lanjutkan ke dashboard untuk melihat tren personal, atau ulangi kuisioner jika
                kamu merasa ada jawaban yang kurang mewakili kondisi saat ini.
              </p>
              <div className="mt-5 grid gap-3">
                <button
                  onClick={() => nav('/user/dashboard')}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
                >
                  Lihat dashboard
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  onClick={() => fetchQuestions({ profile: questionProfile, refresh: true })}
                  disabled={refreshingQuestions}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-4 text-sm font-semibold text-slate-300 transition hover:border-slate-500 hover:text-white"
                >
                  {refreshingQuestions ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  )}
                  Set pertanyaan baru
                </button>
                <button
                  onClick={() => {
                    setResult(null);
                    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0);
                  }}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-violet-400/30 bg-violet-500/10 px-4 text-sm font-semibold text-violet-100 transition hover:border-violet-300/50 hover:bg-violet-500/15"
                >
                  <Brain className="h-4 w-4" aria-hidden="true" />
                  Buka tes MBTI
                </button>
                <button
                  onClick={resetQuestionnaire}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-4 text-sm font-semibold text-slate-300 transition hover:border-slate-500 hover:text-white"
                >
                  <TimerReset className="h-4 w-4" aria-hidden="true" />
                  Ulangi set ini
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0b0d14] px-6 text-slate-100">
        <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900/70 p-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl border border-slate-700 bg-slate-950 text-slate-400">
            <ClipboardList className="h-6 w-6" aria-hidden="true" />
          </div>
          <h2 className="mt-5 text-lg font-semibold tracking-normal text-white">Belum ada pertanyaan</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Kuisioner belum berhasil dimuat dari API. Pilih ulang mode atau coba ambil set baru.
          </p>
          {questionError && (
            <p className="mt-4 rounded-lg border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {questionError}
            </p>
          )}
          <button
            onClick={() => fetchQuestions({ profile: questionProfile, refresh: true })}
            disabled={refreshingQuestions}
            className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {refreshingQuestions ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
            )}
            Ambil pertanyaan
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b0d14] px-5 py-6 text-slate-100 md:px-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/70">
          <div className="relative grid gap-6 p-6 md:grid-cols-[1fr_330px]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(34,197,94,0.18),transparent_28%),radial-gradient(circle_at_84%_16%,rgba(45,212,191,0.16),transparent_26%)]" />
            <div className="relative">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-200">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                Kuisioner harian adaptif
              </div>
              <h1 className="text-2xl font-semibold tracking-normal text-white md:text-3xl">
                Refleksi kondisi hari ini
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                Jawab spontan sesuai kondisi saat ini. Sistem membaca nilai jawaban dan
                waktu respons untuk menghasilkan skor burnout dan rekomendasi personal.
              </p>
            </div>

            <div className="relative grid grid-cols-2 gap-3">
              {[
                { label: 'Pertanyaan', value: questions.length, icon: ClipboardList, color: 'text-emerald-300' },
                { label: 'Terjawab', value: responses.length, icon: CheckCircle2, color: 'text-cyan-300' },
                { label: 'Mode', value: selectedProfileMeta.label, icon: selectedProfileMeta.icon, color: 'text-amber-300' },
                { label: 'Hash API', value: questionFingerprint, icon: Brain, color: 'text-violet-300' },
              ].map((item) => {
                const Icon = item.icon;

                return (
                  <div key={item.label} className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
                    <Icon className={`mb-3 h-4 w-4 ${item.color}`} aria-hidden="true" />
                    <div className="truncate text-xl font-semibold text-white">{item.value}</div>
                    <div className="mt-1 text-[11px] leading-4 text-slate-500">{item.label}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </header>

        {questionError && (
          <div className="rounded-xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {questionError}
          </div>
        )}

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_360px]">
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5 shadow-2xl shadow-black/20 md:p-6">
            <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-violet-400/20 bg-violet-500/10 px-3 py-1.5 text-xs font-semibold text-violet-200">
                  <Brain className="h-3.5 w-3.5" aria-hidden="true" />
                  Tes MBTI adaptif
                </div>
                <h2 className="mt-3 text-lg font-semibold tracking-normal text-white">
                  Pemetaan gaya kepribadian
                </h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-400">
                  Pertanyaan diambil dari API dengan kombinasi berbeda. AI menilai pola jawaban,
                  lalu hasilnya disimpan agar admin dapat melihat ringkasan terbaru.
                </p>
              </div>

              <button
                onClick={() => fetchMBTIQuestions(true)}
                disabled={!canChangeMBTIQuestions}
                className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-violet-400/25 bg-violet-500/10 px-4 text-sm font-semibold text-violet-100 transition hover:border-violet-300/50 hover:bg-violet-500/15 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {mbtiRefreshing ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                )}
                Ganti pertanyaan MBTI
              </button>
            </div>

            <div className="mb-5 grid gap-4 rounded-xl border border-slate-800 bg-slate-950/60 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div>
                <p className="text-xs font-semibold uppercase text-slate-500">Kedalaman tes</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {mbtiSessionModes.map((mode) => {
                    const active = mode.key === mbtiMode;
                    return (
                      <button
                        key={mode.key}
                        onClick={() => fetchMBTIQuestions(true, { mode: mode.key })}
                        disabled={!canChangeMBTIQuestions || active}
                        className={`rounded-lg border p-3 text-left transition ${
                          active
                            ? 'border-violet-300/40 bg-violet-500/10 text-violet-100'
                            : 'border-slate-800 bg-slate-900/80 text-slate-300 hover:border-violet-400/25 hover:bg-slate-900'
                        } disabled:cursor-not-allowed disabled:opacity-80`}
                      >
                        <div className="text-sm font-semibold">{mode.label}</div>
                        <div className="mt-1 text-[11px] leading-4 text-slate-500">
                          {mode.questionCount} soal / {mode.duration}
                        </div>
                        <div className="mt-2 text-xs leading-5 text-slate-400">{mode.desc}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase text-slate-500">Fokus konteks</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {mbtiFocusOptions.map((focus) => {
                    const Icon = focus.icon;
                    const active = focus.key === mbtiFocus;
                    return (
                      <button
                        key={focus.key}
                        onClick={() => fetchMBTIQuestions(true, { focus: focus.key })}
                        disabled={!canChangeMBTIQuestions || active}
                        className={`flex min-h-[72px] items-start gap-3 rounded-lg border p-3 text-left transition ${
                          active
                            ? 'border-cyan-300/40 bg-cyan-500/10 text-cyan-100'
                            : 'border-slate-800 bg-slate-900/80 text-slate-300 hover:border-cyan-400/25 hover:bg-slate-900'
                        } disabled:cursor-not-allowed disabled:opacity-80`}
                      >
                        <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${
                          active ? 'border-cyan-300/25 bg-cyan-500/10' : 'border-slate-700 bg-slate-950'
                        }`}>
                          <Icon className={`h-4 w-4 ${active ? 'text-cyan-200' : 'text-slate-400'}`} aria-hidden="true" />
                        </span>
                        <span>
                          <span className="block text-sm font-semibold">{focus.label}</span>
                          <span className="mt-1 block text-xs leading-5 text-slate-500">{focus.desc}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {mbtiError && (
              <div className="mb-4 rounded-lg border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {mbtiError}
              </div>
            )}

            {mbtiLoading ? (
              <div className="flex min-h-[280px] items-center justify-center rounded-xl border border-slate-800 bg-slate-950/70">
                <Loader2 className="h-7 w-7 animate-spin text-violet-300" aria-hidden="true" />
              </div>
            ) : mbtiQuestions.length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-8 text-center">
                <Brain className="mx-auto h-8 w-8 text-slate-600" aria-hidden="true" />
                <p className="mt-3 text-sm font-semibold text-white">Pertanyaan MBTI belum tersedia</p>
                <p className="mt-1 text-sm text-slate-500">Ambil ulang set pertanyaan untuk memulai tes.</p>
              </div>
            ) : (
              <>
                <div className="mb-5 grid gap-3 md:grid-cols-4">
                  {[
                    { label: 'Pertanyaan', value: mbtiQuestions.length, icon: ClipboardList, color: 'text-violet-300' },
                    { label: 'Terjawab', value: mbtiResponses.length, icon: CheckCircle2, color: 'text-emerald-300' },
                    { label: 'Mode', value: mbtiModeLabel, icon: Shield, color: 'text-cyan-300' },
                    { label: 'Estimasi', value: `${mbtiEstimatedMinutes} menit`, icon: Clock, color: 'text-amber-300' },
                  ].map((item) => {
                    const Icon = item.icon;
                    return (
                      <div key={item.label} className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                        <Icon className={`mb-3 h-4 w-4 ${item.color}`} aria-hidden="true" />
                        <div className="truncate text-base font-semibold text-white">{item.value}</div>
                        <div className="mt-1 text-[11px] leading-4 text-slate-500">{item.label}</div>
                      </div>
                    );
                  })}
                </div>

                <div className="mb-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
                  <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold uppercase text-slate-500">Peta dimensi sesi</p>
                      <span className="text-xs text-slate-500">Fokus: {mbtiFocusLabel}</span>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-4">
                      {['EI', 'SN', 'TF', 'JP'].map((dimension) => {
                        const total = mbtiQuestionMix.dimensions[dimension] || 0;
                        const answered = mbtiResponseStats.answeredByDimension[dimension] || 0;
                        const width = total > 0 ? `${(answered / total) * 100}%` : '0%';

                        return (
                          <div key={dimension} className="rounded-lg border border-slate-800 bg-slate-900/80 p-3">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-semibold text-white">{dimension}</span>
                              <span className="text-slate-500">{answered}/{total}</span>
                            </div>
                            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-800">
                              <div className="h-full rounded-full bg-cyan-400 transition-all" style={{ width }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                    <p className="text-xs font-semibold uppercase text-slate-500">Komposisi konteks</p>
                    <div className="mt-3 space-y-3">
                      {mbtiQuestionMix.themes.map(([theme, count]) => (
                        <div key={theme} className="flex items-center justify-between gap-3">
                          <span className="text-sm text-slate-300">{mbtiThemeLabels[theme] || theme}</span>
                          <span className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white">
                            {count}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 border-t border-slate-800 pt-4 text-xs leading-5 text-slate-500">
                      Sumber: {mbtiSource || 'api'} / Hash: {mbtiFingerprint || '-'}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-5">
                  <div className="mb-5">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase text-slate-500">
                          Pertanyaan MBTI {mbtiCurrentIdx + 1} dari {mbtiQuestions.length}
                        </p>
                        <p className="mt-1 text-sm text-slate-400">{Math.round(mbtiDisplayProgress)}% menuju hasil</p>
                      </div>
                      <span className="rounded-full border border-violet-400/25 bg-violet-500/10 px-3 py-1.5 text-xs font-semibold text-violet-200">
                        Dimensi {currentMBTIQuestion?.dimension || '-'}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                      <div className="h-full rounded-full bg-violet-400 transition-all" style={{ width: `${mbtiDisplayProgress}%` }} />
                    </div>
                  </div>

                  <h3 className="min-h-[74px] text-lg font-semibold leading-8 tracking-normal text-white">
                    {currentMBTIQuestion?.text || 'Pertanyaan belum tersedia.'}
                  </h3>

                  <div className="mt-5 grid gap-3 md:grid-cols-5">
                    {answerOptions.map((option) => (
                      <button
                        key={`mbti-${option.value}`}
                        onClick={() => handleMBTIAnswer(option.value)}
                        disabled={mbtiAnimating || mbtiSubmitting}
                        className={`min-h-[92px] rounded-xl border px-3 py-4 text-center transition ${
                          mbtiSelectedVal === option.value
                            ? 'border-violet-300/50 bg-violet-500/15 text-violet-100'
                            : 'border-slate-800 bg-slate-900 text-slate-300 hover:border-violet-400/35 hover:bg-slate-900/80'
                        } disabled:cursor-not-allowed disabled:opacity-70`}
                      >
                        <span className="block text-lg font-semibold">{option.value}</span>
                        <span className="mt-2 block text-[11px] leading-4 text-slate-500">{option.label}</span>
                      </button>
                    ))}
                  </div>

                  <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <button
                      onClick={goBackMBTI}
                      disabled={mbtiCurrentIdx === 0 || mbtiAnimating || mbtiSubmitting}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-4 text-sm font-semibold text-slate-300 transition hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                      Kembali
                    </button>
                    <div className="text-xs text-slate-500">
                      Skala 1-5: pilih yang paling menggambarkan kebiasaanmu, bukan jawaban ideal.
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          <aside className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
            <div className="mb-4 flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-amber-300" aria-hidden="true" />
              <h2 className="text-base font-semibold tracking-normal text-white">Pengertian hasil MBTI</h2>
            </div>

            <p className="text-sm leading-6 text-slate-400">
              MBTI merangkum kecenderungan pada empat pasangan: E/I, S/N, T/F, dan J/P.
              Hasilnya membantu membaca gaya interaksi, pengambilan keputusan, dan pola kerja;
              bukan diagnosis klinis atau batas tetap kepribadian.
            </p>

            <div className="mt-5 space-y-3">
              {[
                ['E / I', 'Sumber energi: interaksi atau refleksi pribadi.'],
                ['S / N', 'Cara menangkap informasi: fakta konkret atau pola besar.'],
                ['T / F', 'Dasar keputusan: logika atau pertimbangan nilai dan empati.'],
                ['J / P', 'Gaya mengatur hidup: terstruktur atau fleksibel.'],
              ].map(([title, body]) => (
                <div key={title} className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                  <div className="text-sm font-semibold text-white">{title}</div>
                  <div className="mt-1 text-xs leading-5 text-slate-500">{body}</div>
                </div>
              ))}
            </div>

            <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
              <p className="text-xs font-semibold uppercase text-slate-500">Kualitas sesi berjalan</p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-3">
                  <div className="text-[11px] text-slate-500">Rata-rata pilihan</div>
                  <div className="mt-1 text-lg font-semibold text-white">
                    {mbtiResponses.length > 0 ? mbtiResponseStats.averageValue.toFixed(1) : '-'}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-3">
                  <div className="text-[11px] text-slate-500">Waktu respons</div>
                  <div className="mt-1 text-lg font-semibold text-white">
                    {mbtiResponses.length > 0 ? formatReactionTime(mbtiResponseStats.averageMs) : '-'}
                  </div>
                </div>
              </div>
              <p className="mt-4 text-xs leading-5 text-slate-500">
                Ganti mode atau fokus kapan saja sebelum selesai untuk memperoleh set pertanyaan baru yang berbeda.
              </p>
            </div>

            {latestMbti ? (
              <div className="mt-5 rounded-xl border border-violet-400/25 bg-violet-500/10 p-4">
                <p className="text-xs font-semibold uppercase text-violet-200">Hasil terbaru</p>
                <div className="mt-2 text-2xl font-semibold text-white">{latestMbti.type}</div>
                <p className="mt-1 text-sm font-medium text-violet-100">{latestMbti.title}</p>
                <p className="mt-3 text-xs leading-5 text-slate-400">{latestMbti.summary}</p>
                <button
                  onClick={() => {
                    setMbtiResult(latestMbti);
                    setMbtiModalOpen(true);
                  }}
                  className="mt-4 inline-flex h-9 items-center justify-center rounded-lg border border-violet-300/25 px-3 text-xs font-semibold text-violet-100 transition hover:border-violet-200/45"
                >
                  Lihat detail hasil
                </button>
              </div>
            ) : (
              <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-500">
                Belum ada hasil MBTI tersimpan.
              </div>
            )}
          </aside>
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-200">
                <Activity className="h-3.5 w-3.5" aria-hidden="true" />
                API /assessment aktif
              </div>
              <h2 className="mt-3 text-lg font-semibold tracking-normal text-white">Set pertanyaan dinamis</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-400">
                Pilih fokus kuisioner, lalu sistem mengambil varian pertanyaan baru dari endpoint asesmen
                dengan profil dan urutan yang berbeda.
              </p>
            </div>

            <button
              onClick={() => fetchQuestions({ profile: questionProfile, refresh: true })}
              disabled={!canChangeQuestions}
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {refreshingQuestions ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
              )}
              Ganti set pertanyaan
            </button>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-4">
            {questionProfiles.map((profile) => {
              const Icon = profile.icon;
              const active = profile.key === questionProfile;

              return (
                <button
                  key={profile.key}
                  onClick={() => fetchQuestions({ profile: profile.key, refresh: true })}
                  disabled={!canChangeQuestions || active}
                  className={`min-h-[118px] rounded-xl border p-4 text-left transition ${
                    active
                      ? 'border-emerald-400/45 bg-emerald-500/10 text-emerald-100 shadow-lg shadow-emerald-950/10'
                      : 'border-slate-800 bg-slate-950/70 text-slate-300 hover:border-cyan-400/35 hover:bg-slate-950'
                  } disabled:cursor-not-allowed disabled:opacity-80`}
                >
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-lg border ${
                      active ? 'border-emerald-400/30 bg-emerald-500/10' : 'border-slate-800 bg-slate-900'
                    }`}>
                      <Icon className={`h-5 w-5 ${active ? 'text-emerald-300' : 'text-slate-400'}`} aria-hidden="true" />
                    </div>
                    {active && <CheckCircle2 className="h-4 w-4 text-emerald-300" aria-hidden="true" />}
                  </div>
                  <p className="text-sm font-semibold text-white">{profile.label}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{profile.desc}</p>
                </button>
              );
            })}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {[
              { label: 'Sumber', value: questionSource || 'api', icon: Zap },
              { label: 'Tanggal / profil', value: formatDateKey(questionDateKey), icon: Clock },
              { label: 'Order hash', value: questionFingerprint, icon: Shield },
            ].map((item) => {
              const Icon = item.icon;

              return (
                <div key={item.label} className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-slate-500">
                    <Icon className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                    {item.label}
                  </div>
                  <p className="truncate text-sm font-semibold text-slate-200">{item.value}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <main className="rounded-xl border border-slate-800 bg-slate-900/70 p-5 shadow-2xl shadow-black/20 md:p-6">
            <div className="mb-6">
              <div className="mb-3 flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase text-slate-500">
                    Pertanyaan {currentIdx + 1} dari {questions.length}
                  </p>
                  <p className="mt-1 text-sm text-slate-400">{Math.round(displayProgress)}% menuju hasil analisis</p>
                </div>
                <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${currentMeta.border} ${currentMeta.bg} ${currentMeta.text}`}>
                  <CurrentIcon className="h-3.5 w-3.5" aria-hidden="true" />
                  {currentMeta.label}
                </div>
              </div>

              <div className="h-2 overflow-hidden rounded-full bg-slate-950">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-cyan-300 to-indigo-400 transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            <div key={currentQuestion.id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-5 md:p-7">
              <div className="mb-5 flex items-start gap-4">
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border ${currentMeta.border} ${currentMeta.bg}`}>
                  <CurrentIcon className={`h-6 w-6 ${currentMeta.text}`} aria-hidden="true" />
                </div>
                <div>
                  <p className={`text-sm font-semibold ${currentMeta.text}`}>{currentMeta.label}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{currentMeta.helper}</p>
                </div>
              </div>

              <h2 className="min-h-[88px] text-2xl font-semibold leading-snug tracking-normal text-white md:text-3xl">
                {currentQuestion.text}
              </h2>

              <div className="mt-7 grid gap-3 sm:grid-cols-5">
                {answerOptions.map((option) => {
                  const selected = selectedVal === option.value;
                  const toneClass =
                    option.tone === 'rose'
                      ? 'hover:border-rose-400/40 hover:text-rose-200'
                      : option.tone === 'orange'
                        ? 'hover:border-orange-400/40 hover:text-orange-200'
                        : option.tone === 'amber'
                          ? 'hover:border-amber-400/40 hover:text-amber-200'
                          : option.tone === 'emerald'
                            ? 'hover:border-emerald-400/40 hover:text-emerald-200'
                            : 'hover:border-cyan-400/40 hover:text-cyan-200';
                  const selectedClass =
                    option.tone === 'rose'
                      ? 'border-rose-400/60 bg-rose-500/15 text-rose-200'
                      : option.tone === 'orange'
                        ? 'border-orange-400/60 bg-orange-500/15 text-orange-200'
                        : option.tone === 'amber'
                          ? 'border-amber-400/60 bg-amber-500/15 text-amber-200'
                          : option.tone === 'emerald'
                            ? 'border-emerald-400/60 bg-emerald-500/15 text-emerald-200'
                            : 'border-cyan-400/60 bg-cyan-500/15 text-cyan-200';

                  return (
                    <button
                      key={option.value}
                      onClick={() => handleAnswer(option.value)}
                      disabled={animating}
                      className={`min-h-[116px] rounded-xl border p-3 text-center transition ${
                        selected
                          ? `${selectedClass} -translate-y-1 shadow-lg shadow-black/20`
                          : `border-slate-800 bg-slate-900 text-slate-400 ${toneClass}`
                      } disabled:cursor-not-allowed disabled:opacity-80`}
                    >
                      <span className="block text-3xl font-semibold">{option.value}</span>
                      <span className="mt-2 block text-xs font-semibold">{option.short}</span>
                      <span className="mt-1 block text-[11px] leading-4">{option.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <button
                  onClick={goBack}
                  disabled={currentIdx === 0 || animating}
                  className="inline-flex h-10 w-fit items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-4 text-sm font-medium text-slate-400 transition hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  Kembali
                </button>

                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Clock className="h-4 w-4" aria-hidden="true" />
                  Pilihan langsung tersimpan setelah diklik
                </div>
              </div>
            </div>
          </main>

          <aside className="space-y-5">
            <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold tracking-normal text-white">Peta progres</h2>
                  <p className="mt-1 text-xs text-slate-500">Jejak jawaban sesi ini</p>
                </div>
                <Activity className="h-5 w-5 text-cyan-300" aria-hidden="true" />
              </div>

              <div className="grid grid-cols-8 gap-2">
                {questions.map((question, index) => {
                  const answered = index < responses.length;
                  const active = index === currentIdx;
                  const meta = getConstructMeta(question.construct_type);

                  return (
                    <div
                      key={question.id}
                      className={`h-9 rounded-lg border ${
                        answered
                          ? `${meta.border} ${meta.bg}`
                          : active
                            ? 'border-cyan-400/50 bg-cyan-500/10'
                            : 'border-slate-800 bg-slate-950'
                      }`}
                      title={`Pertanyaan ${index + 1}`}
                    />
                  );
                })}
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                  <p className="text-xs text-slate-500">Rata-rata respons</p>
                  <p className="mt-1 text-xl font-semibold text-white">
                    {responses.length > 0 ? responseStats.averageValue.toFixed(1) : '-'}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                  <p className="text-xs text-slate-500">Waktu rata-rata</p>
                  <p className="mt-1 text-xl font-semibold text-white">
                    {responses.length > 0 ? formatReactionTime(responseStats.averageMs) : '-'}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
              <div className="mb-4 flex items-center gap-2">
                <Brain className="h-5 w-5 text-violet-300" aria-hidden="true" />
                <h2 className="text-base font-semibold tracking-normal text-white">Dimensi terjawab</h2>
              </div>

              <div className="space-y-3">
                {(['fatigue', 'cynicism', 'efficacy'] as const).map((type) => {
                  const meta = getConstructMeta(type);
                  const Icon = meta.icon;
                  const count = responseStats.constructCounts[type] || 0;

                  return (
                    <div key={type} className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                      <div className={`flex h-9 w-9 items-center justify-center rounded-lg border ${meta.border} ${meta.bg}`}>
                        <Icon className={`h-4 w-4 ${meta.text}`} aria-hidden="true" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-200">{meta.label}</p>
                        <p className="text-xs text-slate-500">{count} respons</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-5">
              <div className="mb-3 flex items-center gap-2 text-emerald-200">
                <Lightbulb className="h-5 w-5" aria-hidden="true" />
                <h2 className="text-sm font-semibold tracking-normal">Tips menjawab</h2>
              </div>
              <p className="text-sm leading-6 text-slate-400">
                Tidak ada jawaban benar atau salah. Pilih yang paling mendekati kondisi
                hari ini agar prediksi lebih jujur dan berguna.
              </p>
            </div>
          </aside>
        </section>

        {mbtiResult && mbtiModalOpen && (
          <div
            className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
            onClick={() => setMbtiModalOpen(false)}
          >
            <div
              className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-xl border border-violet-300/20 bg-slate-950 p-5 shadow-2xl shadow-black/60 md:p-6"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-violet-400/25 bg-violet-500/10 px-3 py-1.5 text-xs font-semibold text-violet-200">
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Hasil MBTI tersimpan
                  </div>
                  <div className="flex flex-wrap items-end gap-3">
                    <h2 className="text-3xl font-semibold tracking-normal text-white">{mbtiResult.type}</h2>
                    <p className="pb-1 text-sm font-medium text-violet-200">{mbtiResult.title}</p>
                  </div>
                </div>
                <button
                  onClick={() => setMbtiModalOpen(false)}
                  className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-900 hover:text-white"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>

              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_290px]">
                <div className="space-y-5">
                  <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
                    <h3 className="text-sm font-semibold tracking-normal text-white">Makna hasil</h3>
                    <p className="mt-3 text-sm leading-7 text-slate-300">{mbtiResult.summary}</p>
                    <p className="mt-3 text-xs leading-5 text-slate-500">
                      MBTI adalah alat refleksi gaya preferensi, bukan diagnosis klinis dan bukan batas permanen kemampuan seseorang.
                    </p>
                    <div className="mt-5 grid gap-3 sm:grid-cols-3">
                      {[
                        { label: 'Tipe utama', value: mbtiResult.type },
                        { label: 'Dimensi paling jelas', value: getStrongestMBTIDimension(mbtiResult.dimensions) },
                        { label: 'Kejelasan profil', value: `${getMBTIClarity(mbtiResult.dimensions)}%` },
                      ].map((item) => (
                        <div key={item.label} className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                          <p className="text-[11px] uppercase text-slate-500">{item.label}</p>
                          <p className="mt-1 text-sm font-semibold text-white">{item.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
                    <div className="mb-4 flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-cyan-300" aria-hidden="true" />
                      <h3 className="text-sm font-semibold tracking-normal text-white">Profil empat dimensi</h3>
                    </div>
                    <div className="space-y-4">
                      {mbtiResult.dimensions.map((dimension) => {
                        const total = Math.max(dimension.left_score + dimension.right_score, 1);
                        const leftWidth = `${(dimension.left_score / total) * 100}%`;
                        const rightWidth = `${(dimension.right_score / total) * 100}%`;

                        return (
                          <div key={dimension.dimension}>
                            <div className="mb-2 flex items-center justify-between text-xs">
                              <span className="font-semibold text-slate-300">{dimension.left_pole}</span>
                              <span className="rounded-full border border-violet-400/25 bg-violet-500/10 px-2.5 py-1 font-semibold text-violet-200">
                                {dimension.dimension}: {dimension.selected}
                              </span>
                              <span className="font-semibold text-slate-300">{dimension.right_pole}</span>
                            </div>
                            <div className="flex h-2 overflow-hidden rounded-full bg-slate-800">
                              <div className="h-full bg-cyan-400" style={{ width: leftWidth }} />
                              <div className="h-full bg-violet-400" style={{ width: rightWidth }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <aside className="space-y-4">
                  <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
                    <p className="text-xs font-semibold uppercase text-slate-500">Kekuatan dominan</p>
                    <div className="mt-3 space-y-2">
                      {mbtiResult.strengths.map((item) => (
                        <div key={item} className="rounded-lg border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
                    <p className="text-xs font-semibold uppercase text-slate-500">Perlu diperhatikan</p>
                    <div className="mt-3 space-y-2">
                      {mbtiResult.watchouts.map((item) => (
                        <div key={item} className="rounded-lg border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
                    <p className="text-xs font-semibold uppercase text-slate-500">Sumber analisis</p>
                    <p className="mt-2 text-sm font-semibold text-white">
                      {mbtiResult.source === 'ai' ? 'AI evaluator' : 'Local fallback evaluator'}
                    </p>
                    <p className="mt-2 text-xs leading-5 text-slate-500">
                      Hasil otomatis tersimpan dan dapat dibaca admin dari panel responden.
                    </p>
                  </div>
                </aside>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
