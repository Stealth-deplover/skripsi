import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  User,
  Users,
  BarChart2,
  Brain,
  FlaskConical,
  FileText,
  Settings,
  LogOut,
  Sun,
  Moon,
  Bot,
  ShieldAlert,
  Command,
  X,
  HeartPulse,
} from 'lucide-react';
import { useMemo } from 'react';
import { useTheme } from '../hooks/useTheme';

const navItems = [
  { label: 'Command Center', icon: Command, path: '/command-center' },
  { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
  { label: 'Prediksi Individu', icon: User, path: '/prediksi' },
  { label: 'Data Responden', icon: Users, path: '/responden' },
  { label: 'Pusat Risiko', icon: ShieldAlert, path: '/risk-center' },
  { label: 'Analitik & Insight', icon: BarChart2, path: '/analitik' },
  { label: 'Analitik Well-Being', icon: HeartPulse, path: '/wellbeing-analitik' },
  { label: 'Quantum Cognition', icon: Brain, path: '/quantum' },
  { label: 'Model & Evaluasi', icon: FlaskConical, path: '/model' },
  { label: 'Laporan', icon: FileText, path: '/laporan' },
  { label: 'Manajemen User', icon: Users, path: '/users' },
  { label: 'Pengaturan Sistem', icon: Settings, path: '/settings' },
];

export default function Sidebar({
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
  const admin = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('user') || '{}');
    } catch {
      return {};
    }
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
              background: 'linear-gradient(135deg, #6c63ff, #3ecfcf)',
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
            <div style={{ color: 'var(--theme-text-muted)', fontSize: 10 }}>Kesejahteraan Mahasiswa UMCI</div>
          </div>
          <button type="button" className="mobile-sidebar-close" onClick={onClose} aria-label="Tutup menu admin">
            <X size={17} />
          </button>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: 'auto', padding: '12px 10px' }}>
        {navItems.map((item) => {
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
                padding: '9px 12px',
                borderRadius: 8,
                marginBottom: 2,
                background: active ? 'rgba(108,99,255,0.18)' : 'transparent',
                color: active ? '#a89cff' : 'var(--theme-text-muted)',
                fontSize: 13,
                fontWeight: active ? 600 : 400,
                textDecoration: 'none',
                transition: 'all 0.15s',
              }}
            >
              <Icon size={16} />
              {item.label}
            </Link>
          );
        })}
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
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #6c63ff, #3ecfcf)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <User size={16} color="#fff" />
          </div>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <div style={{ color: 'var(--theme-text-primary)', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {admin.nama || admin.username || 'Admin QC'}
            </div>
            <div style={{ color: 'var(--theme-text-muted)', fontSize: 11 }}>Administrator</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--theme-text-muted)', fontSize: 11 }}>Tema</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Sun size={13} color="var(--theme-text-muted)" />
            <button
              onClick={() => setDark(!dark)}
              style={{
                width: 32,
                height: 18,
                borderRadius: 9,
                background: dark ? '#6c63ff' : '#2a2e42',
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
            <Moon size={13} color="var(--theme-text-muted)" />
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
        <div style={{ color: 'var(--theme-text-muted)', fontSize: 10, textAlign: 'center', marginTop: 10 }}>
          Sistem Analitik Kesejahteraan Mahasiswa UMCI
          <br />Burnout &amp; Happiness Analytics
        </div>
      </div>
    </aside>
  );
}
