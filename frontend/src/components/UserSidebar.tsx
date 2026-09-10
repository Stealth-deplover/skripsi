import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  MessageSquareHeart,
  ClipboardList,
  Activity,
  User,
  Users,
  LogOut,
  Sun,
  Moon,
  Brain,
  Bell,
  Bot,
  Clapperboard,
  HeartPulse,
  Flame,
  Smile,
  TrendingUp,
  Sparkles,
  GraduationCap,
  NotebookPen,
  History,
  FileBarChart,
  X,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import api from '../api';
import { useTheme } from '../hooks/useTheme';

type NavItem = {
  label: string;
  icon: typeof Flame;
  path: string;
  badge?: boolean;
};

type NavGroup = {
  title: string | null;
  items: NavItem[];
};

const navGroups: NavGroup[] = [
  {
    title: null,
    items: [
      { label: 'Dashboard', icon: LayoutDashboard, path: '/user/dashboard' },
      { label: 'Profil Saya', icon: User, path: '/user/settings' },
    ],
  },
  {
    title: 'Burnout',
    items: [
      { label: 'Assessment Burnout', icon: Flame, path: '/user/kuisioner' },
      { label: 'Hasil Burnout', icon: Activity, path: '/user/burnout/hasil' },
      { label: 'Riwayat & Trend Burnout', icon: History, path: '/user/asesmen' },
    ],
  },
  {
    title: 'Happiness',
    items: [
      { label: 'Assessment Happiness', icon: Smile, path: '/user/happiness/assessment' },
      { label: 'Happiness Index', icon: HeartPulse, path: '/user/happiness/index' },
      { label: 'Riwayat & Trend Happiness', icon: FileBarChart, path: '/user/happiness/history' },
    ],
  },
  {
    title: 'Well-Being',
    items: [
      { label: 'Burnout vs Happiness', icon: TrendingUp, path: '/user/well-being' },
      { label: 'Faktor Kondisi', icon: ClipboardList, path: '/user/faktor' },
      { label: 'Rekomendasi', icon: Sparkles, path: '/user/rekomendasi' },
      { label: 'DPA Saya', icon: GraduationCap, path: '/user/dpa' },
      { label: 'Grup Bimbingan', icon: Users, path: '/user/grup-bimbingan' },
      { label: 'Bimbingan Akademik', icon: NotebookPen, path: '/user/bimbingan' },
    ],
  },
  {
    title: 'Lainnya',
    items: [
      { label: 'Ruang Curhat Anonim', icon: MessageSquareHeart, path: '/user/curhat', badge: true },
      { label: 'Recovery Plan', icon: HeartPulse, path: '/user/recovery' },
      { label: 'Jaringan Teman', icon: Users, path: '/user/network' },
      { label: 'Ruang Film', icon: Clapperboard, path: '/user/film' },
    ],
  },
];

const allNavItems = navGroups.flatMap((group) => group.items);

export default function UserSidebar({
  open = false,
  onClose,
  onOpenAssistant,
}: {
  open?: boolean;
  onClose?: () => void;
  onOpenAssistant: () => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { dark, setDark } = useTheme();
  const [profile, setProfile] = useState<any>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  // Poll unread notifications
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await api.get('/notifications/unread');
        const count = (res.data.notifications || []).length;
        setUnreadCount(count);
      } catch (_) {}
    };
    poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    api.get('/user/profile')
      .then(res => setProfile(res.data))
      .catch(console.error);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  return (
    <aside
      className="dashboard-sidebar"
      data-open={open ? 'true' : 'false'}
      style={{
        width: 220,
        minWidth: 220,
        background: 'var(--theme-sidebar)',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        position: 'fixed',
        left: 0,
        top: 0,
        zIndex: 100,
        borderRight: '1px solid var(--theme-sidebar-border)',
      }}
    >
      {/* Brand */}
      <div style={{ padding: '20px 20px 12px', borderBottom: '1px solid var(--theme-sidebar-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: 'linear-gradient(135deg, #22c55e, #3ecfcf)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Brain size={20} color="#fff" />
          </div>
          <div>
            <div style={{ color: 'var(--theme-text-primary)', fontWeight: 700, fontSize: 14, lineHeight: 1.2 }}>
              QC Analytics
            </div>
            <div style={{ color: 'var(--theme-text-muted)', fontSize: 10 }}>User Portal</div>
          </div>
          <button type="button" className="mobile-sidebar-close" onClick={onClose} aria-label="Tutup menu user">
            <X size={17} />
          </button>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: 'auto', padding: '12px 10px' }}>
        {navGroups.map((group, groupIndex) => (
          <div key={group.title ?? `group-${groupIndex}`} style={{ marginBottom: group.title ? 8 : 0 }}>
            {group.title && (
              <div
                style={{
                  padding: '10px 12px 4px',
                  fontSize: 9.5,
                  fontWeight: 700,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: 'var(--theme-text-muted)',
                  opacity: 0.75,
                }}
              >
                {group.title}
              </div>
            )}
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={onClose}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 12px',
                    borderRadius: 8,
                    marginBottom: 2,
                    background: active ? 'var(--theme-nav-active-bg)' : 'transparent',
                    color: active ? '#4ade80' : 'var(--theme-text-muted)',
                    fontSize: 12.5,
                    fontWeight: active ? 600 : 400,
                    textDecoration: 'none',
                    transition: 'all 0.15s',
                  }}
                >
                  <Icon size={15} />
                  {item.label}
                  {item.badge && unreadCount > 0 && (
                    <span style={{
                      marginLeft: 'auto', background: '#ef4444', color: '#fff',
                      borderRadius: '50%', minWidth: 18, height: 18, display: 'flex',
                      alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700,
                    }}>
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
        <button
          onClick={onOpenAssistant}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '9px 12px',
            borderRadius: 8,
            marginTop: 8,
            border: '1px solid rgba(34,211,238,0.18)',
            background: 'rgba(34,211,238,0.08)',
            color: '#a5f3fc',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <Bot size={16} />
          Nexus AI
        </button>
      </nav>

      {/* User & theme */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--theme-sidebar-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          {profile?.profile_pic ? (
            <img 
              src={profile.profile_pic} 
              alt="Profile" 
              style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover' }} 
            />
          ) : (
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #22c55e, #3ecfcf)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <User size={16} color="#fff" />
            </div>
          )}
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <div style={{ color: 'var(--theme-text-primary)', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {profile ? profile.nama : 'Loading...'}
            </div>
            <div style={{ color: 'var(--theme-text-muted)', fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {profile?.bio || 'No bio yet'}
            </div>
          </div>
        </div>
        
        {/* Followers Info */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, fontSize: 11, color: 'var(--theme-text-muted)' }}>
          <div><strong style={{ color: 'var(--theme-text-primary)' }}>{profile?.follower_count || 0}</strong> Followers</div>
          <div><strong style={{ color: 'var(--theme-text-primary)' }}>{profile?.following_count || 0}</strong> Following</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--theme-text-muted)', fontSize: 11 }}>Tema</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Sun size={13} color="#8890a4" />
            <button
              onClick={() => setDark(!dark)}
              style={{
                width: 32,
                height: 18,
                borderRadius: 9,
                background: dark ? '#22c55e' : '#2a2e42',
                border: 'none',
                cursor: 'pointer',
                position: 'relative',
                transition: 'background 0.2s',
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  top: 2,
                  left: dark ? 16 : 2,
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  background: '#fff',
                  transition: 'left 0.2s',
                }}
              />
            </button>
            <Moon size={13} color="#8890a4" />
          </div>
        </div>
        <button
          onClick={handleLogout}
          style={{
            marginTop: 12,
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '7px 10px',
            borderRadius: 7,
            background: 'transparent',
            border: '1px solid var(--theme-btn-secondary-border)',
            color: 'var(--theme-text-muted)',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          <LogOut size={14} />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
