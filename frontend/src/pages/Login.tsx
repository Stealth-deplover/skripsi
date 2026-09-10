import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Brain, TrendingUp, RefreshCw, ShieldCheck, Users, Database, BarChart2, Percent, Mail, Lock, Eye, EyeOff } from 'lucide-react';
import api from '../api';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import GoogleAccountButton, { getAuthErrorMessage, getGoogleOriginNotice } from '../components/auth/GoogleAccountButton';
import { homePathForRole, normalizeRole } from '../components/RequireRole';

const features = [
  { Icon: Brain, t: 'Quantum Cognition', d: 'Memodelkan ketidakpastian dan pengambilan keputusan manusia secara probabilistik.' },
  { Icon: TrendingUp, t: 'Regresi Linier', d: 'Prediksi numerik yang interpretable dan mudah diimplementasikan.' },
  { Icon: RefreshCw, t: 'Agile Development', d: 'Iteratif, adaptif, dan kolaboratif untuk hasil yang berkualitas.' },
  { Icon: ShieldCheck, t: 'Keamanan Data', d: 'Data Anda aman bersama kami dengan enkripsi tingkat enterprise.' },
];
const defaultStats = [
  { Icon: Users, v: '-', l: 'Total Pengguna' },
  { Icon: Database, v: '-', l: 'Data Asesmen' },
  { Icon: BarChart2, v: '-', l: 'Prediksi Dilakukan' },
  { Icon: Percent, v: '-', l: 'Akurasi Model' },
];

export default function Login() {
  const nav = useNavigate();
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [rem, setRem] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [stats, setStats] = useState(defaultStats);
  const online = useOnlineStatus();
  const googleOriginNotice = getGoogleOriginNotice();

  useEffect(() => {
    api.get('/public/overview')
      .then((response) => {
        const overview = response.data;
        setStats([
          { Icon: Users, v: Number(overview.total_users || 0).toLocaleString('id-ID'), l: 'Total Pengguna' },
          { Icon: Database, v: Number(overview.total_assessments || 0).toLocaleString('id-ID'), l: 'Data Asesmen' },
          { Icon: BarChart2, v: Number(overview.total_predictions || 0).toLocaleString('id-ID'), l: 'Prediksi Dilakukan' },
          { Icon: Percent, v: `${((overview.model_accuracy || 0) * 100).toFixed(1)}%`, l: 'Akurasi Model' },
        ]);
      })
      .catch(() => undefined);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      const r = await api.post('/login', { username: u, password: p });
      localStorage.setItem('token', r.data.token);
      localStorage.setItem('user', JSON.stringify(r.data.user));
      nav(homePathForRole(normalizeRole(r.data.user?.role)));
    } catch (x: unknown) { setErr(getAuthErrorMessage(x, 'Username atau kata sandi salah')); }
    finally { setBusy(false); }
  };

  return (
    <>
      <style>{`
        .login-root{display:flex;min-height:100vh;font-family:'Inter',sans-serif;margin:0}
        .login-root *{box-sizing:border-box}
        .login-root h1,.login-root h2,.login-root h3,.login-root h4,.login-root p,.login-root label{font-family:'Inter',sans-serif !important;letter-spacing:normal}

        /* LEFT */
        .lp{width:50%;background:#080c24;color:#fff;display:flex;flex-direction:column;justify-content:space-between;padding:44px 48px;position:relative;overflow:hidden}
        .lp::before{content:'';position:absolute;top:-100px;right:-80px;width:420px;height:420px;border-radius:50%;background:rgba(99,102,241,.15);filter:blur(100px);pointer-events:none}
        .lp::after{content:'';position:absolute;bottom:-60px;left:-40px;width:320px;height:320px;border-radius:50%;background:rgba(139,92,246,.12);filter:blur(80px);pointer-events:none}
        .lp-content{position:relative;z-index:1;flex:1;display:flex;flex-direction:column}

        .lp-logo{display:flex;align-items:center;gap:12px;margin-bottom:40px}
        .lp-logo-icon{width:44px;height:44px;border-radius:12px;background:rgba(99,102,241,.12);border:1px solid rgba(99,102,241,.3);display:flex;align-items:center;justify-content:center}
        .lp-logo-text{font-size:18px;font-weight:700;color:#fff}
        .lp-logo-sub{font-size:11px;color:#818cf8;margin-top:1px}

        .lp-hero{margin-bottom:32px}
        .lp-hero h2{font-size:32px;font-weight:800;line-height:1.2;margin:0;color:#fff}
        .lp-hero .grad{background:linear-gradient(90deg,#818cf8,#c084fc);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
        .lp-hero p{margin:16px 0 0;font-size:13px;color:#94a3b8;line-height:1.7;max-width:420px}

        .feat{display:flex;gap:14px;align-items:flex-start;margin-bottom:16px}
        .feat-icon{flex-shrink:0;width:36px;height:36px;border-radius:10px;background:rgba(99,102,241,.1);border:1px solid rgba(99,102,241,.22);display:flex;align-items:center;justify-content:center;margin-top:2px}
        .feat h4{margin:0 0 2px;font-size:13px;font-weight:600;color:#fff !important}
        .feat p{margin:0;font-size:11.5px;color:#94a3b8;line-height:1.5}

        .stats-bar{position:relative;z-index:1;display:flex;border-radius:14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);overflow:hidden;margin-top:auto}
        .stat{flex:1;padding:14px 8px;text-align:center;border-right:1px solid rgba(255,255,255,.07)}
        .stat:last-child{border-right:none}
        .stat .v{font-weight:700;font-size:15px;margin-top:4px;color:#fff}
        .stat .lb{font-size:10px;color:#64748b;margin-top:2px}

        /* RIGHT */
        .rp{flex:1;background:#f1f5f9;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px;position:relative}
        .rp-card{width:100%;max-width:400px;background:#fff;border-radius:24px;box-shadow:0 4px 24px rgba(0,0,0,.06);padding:36px 32px;position:relative;z-index:1}
        .rp-header{text-align:center;margin-bottom:24px}
        .rp-brain{display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:16px;background:linear-gradient(135deg,rgba(99,102,241,.12),rgba(139,92,246,.08));border:1.5px solid rgba(99,102,241,.2);margin-bottom:14px}
        .rp-header h3{margin:0 0 4px;font-size:20px;font-weight:700;color:#0f172a}
        .rp-header p{margin:0;font-size:12px;color:#94a3b8}

        .field{margin-bottom:14px}
        .field label{display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px}
        .field .wrap{position:relative}
        .field input[type=text],.field input[type=password]{width:100%;padding:10px 14px 10px 38px;border:1.5px solid #e5e7eb;border-radius:10px;font-size:12px;color:#111827;background:#f9fafb;outline:none;transition:border-color .2s;font-family:'Inter',sans-serif}
        .field input:focus{border-color:#6366f1}
        .field .icon-l{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#9ca3af}
        .field .icon-r{position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:#9ca3af;padding:0;display:flex}

        .opts{display:flex;align-items:center;justify-content:space-between;margin-bottom:18px}
        .opts label{display:flex;align-items:center;gap:6px;font-size:12px;color:#374151;cursor:pointer}
        .opts input[type=checkbox]{width:15px;height:15px;accent-color:#6366f1;cursor:pointer}
        .opts a{font-size:12px;color:#6366f1;font-weight:600;text-decoration:none}

        .btn-submit{width:100%;padding:11px;background:linear-gradient(135deg,#6366f1,#7c3aed);color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;box-shadow:0 4px 14px rgba(99,102,241,.3);transition:opacity .2s;font-family:'Inter',sans-serif}
        .btn-submit:hover{opacity:.9}
        .btn-submit:disabled{opacity:.6;cursor:not-allowed}

        .divider{display:flex;align-items:center;gap:10px;margin:20px 0}
        .divider span{font-size:11px;color:#9ca3af;white-space:nowrap}
        .divider::before,.divider::after{content:'';flex:1;height:1px;background:#e5e7eb}

        .socials{display:grid;grid-template-columns:1fr;gap:8px}
        .social-btn{display:flex;align-items:center;justify-content:center;gap:5px;padding:8px 4px;border:1.5px solid #e5e7eb;border-radius:10px;background:#fff;cursor:pointer;font-size:11px;font-weight:600;color:#374151;transition:background .15s;font-family:'Inter',sans-serif}
        .social-btn:hover{background:#f9fafb}
        .social-btn img,.social-btn svg{width:14px;height:14px}

        .signup{text-align:center;font-size:12px;color:#6b7280;margin-top:20px}
        .signup a{color:#6366f1;font-weight:700;text-decoration:none}
        .rp-footer{margin-top:28px;font-size:11px;color:#94a3b8;position:relative;z-index:1}

        .err-box{background:#fef2f2;border:1px solid #fecaca;color:#dc2626;padding:8px 12px;border-radius:8px;font-size:12px;margin-bottom:14px}
        .role-box{margin:18px 0 12px}
        .role-title{font-size:12px;font-weight:700;color:#374151;margin-bottom:8px}
        .role-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
        .role-btn{border:1.5px solid #e5e7eb;background:#f9fafb;color:#475569;border-radius:12px;padding:10px 12px;text-align:left;cursor:pointer;font-family:'Inter',sans-serif;transition:all .18s}
        .role-btn strong{display:block;font-size:12px;color:#111827;margin-bottom:2px}
        .role-btn span{display:block;font-size:10.5px;line-height:1.35;color:#64748b}
        .role-btn.active{border-color:#6366f1;background:#eef2ff;box-shadow:0 0 0 3px rgba(99,102,241,.12)}
        .role-help{margin:7px 0 0;font-size:10.5px;line-height:1.45;color:#64748b}
        .lan-note{margin:10px 0 0;padding:9px 10px;border-radius:10px;border:1px solid #fde68a;background:#fffbeb;color:#92400e;font-size:10.5px;line-height:1.45}

        @media(max-width:1024px){.lp{display:none}.rp{width:100%;min-height:100vh}}
        @media(max-width:520px){
          .rp{padding:18px;background:#f8fafc;justify-content:flex-start}
          .rp-card{max-width:none;border-radius:18px;padding:24px 18px;margin-top:10px;box-shadow:0 14px 40px rgba(15,23,42,.08)}
          .rp-header h3{font-size:18px}
          .rp-footer{position:static;margin-top:18px;text-align:center}
          .sec-row{grid-template-columns:1fr}
          .role-grid{grid-template-columns:1fr}
        }
      `}</style>

      <div className="login-root">
        {/* LEFT */}
        <div className="lp">
          <div className="lp-content">
            <div className="lp-logo">
              <div className="lp-logo-icon"><Brain size={22} color="#a5b4fc" /></div>
              <div><div className="lp-logo-text">QC Analytics</div><div className="lp-logo-sub">Quantum Cognition</div></div>
            </div>

            <div className="lp-hero">
              <h2>Sistem Analitik Kesejahteraan</h2>
              <h2 className="grad">Burnout &amp; Happiness Mahasiswa</h2>
              <h2>Universitas Muhammadiyah Cileungsi</h2>
              <p>Menggabungkan metode Quantum Cognition dan Regresi Linier dengan pendekatan Agile Development untuk prediksi yang lebih akurat dan insight yang bermakna.</p>
            </div>

            {features.map(({ Icon, t, d }) => (
              <div className="feat" key={t}>
                <div className="feat-icon"><Icon size={16} color="#a5b4fc" /></div>
                <div><h4>{t}</h4><p>{d}</p></div>
              </div>
            ))}
          </div>

          <div className="stats-bar">
            {stats.map(({ Icon, v, l }) => (
              <div className="stat" key={l}>
                <Icon size={16} color="#818cf8" />
                <div className="v">{v}</div>
                <div className="lb">{l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT */}
        <div className="rp">
          <div className="rp-card">
            <div className="rp-header">
              <div className="rp-brain"><Brain size={26} color="#6366f1" /></div>
              <h3>Selamat Datang!</h3>
              <p>Silakan masuk untuk melanjutkan ke dashboard</p>
            </div>

            {err && <div className="err-box">{err}</div>}

            <form onSubmit={submit}>
              <div className="field">
                <label>Username</label>
                <div className="wrap">
                  <Mail size={14} className="icon-l" />
                  <input type="text" value={u} onChange={e => setU(e.target.value)} placeholder="Masukkan username Anda" required />
                </div>
              </div>
              <div className="field">
                <label>Kata Sandi</label>
                <div className="wrap">
                  <Lock size={14} className="icon-l" />
                  <input type={showPw ? 'text' : 'password'} value={p} onChange={e => setP(e.target.value)} placeholder="Masukkan kata sandi Anda" required />
                  <button type="button" className="icon-r" onClick={() => setShowPw(!showPw)}>
                    {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              <div className="opts">
                <label><input type="checkbox" checked={rem} onChange={e => setRem(e.target.checked)} /> Ingat saya</label>
                <Link to="/forgot-password">Lupa kata sandi?</Link>
              </div>

              <button type="submit" className="btn-submit" disabled={busy}>
                <Lock size={14} />{busy ? 'Memuat...' : 'Masuk'}
              </button>
            </form>

            <div className="divider"><span>atau masuk dengan</span></div>

            <div className="socials">
              <GoogleAccountButton
                busy={busy}
                online={online}
                label="Google"
                onBusyChange={setBusy}
                onError={setErr}
                onAuthenticated={(token, user) => {
                  localStorage.setItem('token', token);
                  localStorage.setItem('user', JSON.stringify(user));
                  nav(user.role === 'admin' ? '/dashboard' : '/user/dashboard');
                }}
              />
            </div>
            {googleOriginNotice && <div className="lan-note">{googleOriginNotice}</div>}

            <div className="signup">Belum punya akun? <Link to="/register">Daftar di sini</Link></div>
          </div>
          <div className="rp-footer">© 2024 QC Analytics. All rights reserved.</div>
        </div>
      </div>
    </>
  );
}
