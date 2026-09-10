import { GoogleOAuthProvider, useGoogleLogin } from '@react-oauth/google';
import api from '../../api';

export const GOOGLE_CLIENT_ID = '97194511276-qil720ig60sim9bd5i2lmsihoglpsb13.apps.googleusercontent.com';


type AuthUser = {
  username: string;
  nama: string;
  role: string;
};

type AxiosLikeError = {
  response?: {
    data?: {
      error?: string;
    };
  };
  request?: unknown;
  message?: string;
};

interface GoogleAccountButtonInnerProps {
  busy: boolean;
  label: string;
  onBusyChange: (busy: boolean) => void;
  onError: (message: string) => void;
  onAuthenticated: (token: string, user: AuthUser) => void;
}

interface GoogleAccountButtonProps extends GoogleAccountButtonInnerProps {
  online: boolean;
}

export function getGoogleOriginNotice() {
  const { protocol, hostname, origin } = window.location;
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  const isPrivateLan = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(hostname);

  if (protocol === 'http:' && isPrivateLan) {
    return `Google tidak menerima IP LAN seperti ${origin} untuk login OAuth. Pakai HTTPS tunnel atau deploy, lalu tambahkan domain HTTPS itu ke Authorized JavaScript origins.`;
  }
  if (protocol === 'http:' && !isLocalhost) {
    return `Google biasanya hanya menerima HTTP untuk localhost. Untuk device lain, pakai domain HTTPS publik lalu tambahkan ke Authorized JavaScript origins.`;
  }
  return '';
}

export function getAuthErrorMessage(error: unknown, fallback: string) {
  const typed = error as AxiosLikeError;
  const apiError = typed.response?.data?.error;
  if (apiError) return apiError;
  if (typed.request) {
    return 'Backend tidak bisa diakses dari device ini. Pastikan backend aktif, HP dan laptop satu Wi-Fi, lalu buka frontend memakai IP laptop, bukan localhost.';
  }
  return typed.message || fallback;
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M21.82 12.2c0-.72-.06-1.25-.2-1.8H12v3.4h5.65a4.84 4.84 0 0 1-2.1 3.18l-.02.12 3.04 2.36.21.02c1.95-1.8 3.04-4.45 3.04-7.28Z" />
      <path fill="#34A853" d="M12 22c2.76 0 5.08-.91 6.77-2.48l-3.23-2.5c-.87.61-2.04 1.04-3.54 1.04-2.7 0-4.99-1.8-5.8-4.3l-.11.01-3.16 2.44-.04.1C4.57 19.7 8 22 12 22Z" />
      <path fill="#FBBC05" d="M6.2 13.76A6.08 6.08 0 0 1 5.86 12c0-.61.12-1.2.32-1.76l-.01-.12-3.2-2.48-.1.05A10 10 0 0 0 2 12c0 1.56.37 3.03 1.03 4.31l3.17-2.55Z" />
      <path fill="#EA4335" d="M12 5.94c1.93 0 3.24.83 3.98 1.52l2.9-2.83C17.08 2.97 14.76 2 12 2 8 2 4.57 4.3 2.87 7.69l3.3 2.55c.82-2.5 3.11-4.3 5.83-4.3Z" />
    </svg>
  );
}

function GoogleAccountButtonInner({
  busy,
  label,
  onBusyChange,
  onError,
  onAuthenticated,
}: GoogleAccountButtonInnerProps) {
  const handleGoogleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      onError('');
      onBusyChange(true);
      try {
        const response = await api.post('/google-login', {
          access_token: tokenResponse.access_token,
        });
        onAuthenticated(response.data.token, response.data.user);
      } catch (error: unknown) {
        onError(getAuthErrorMessage(error, 'Gagal masuk dengan Google'));
      } finally {
        onBusyChange(false);
      }
    },
    onError: () => {
      const originNotice = getGoogleOriginNotice();
      onError(originNotice || 'Google login dibatalkan atau gagal. Periksa koneksi internet dan konfigurasi Google OAuth.');
    },
  });

  return (
    <button type="button" className="social-btn" onClick={() => handleGoogleLogin()} disabled={busy}>
      <GoogleMark />
      {label}
    </button>
  );
}

export default function GoogleAccountButton(props: GoogleAccountButtonProps) {
  if (!props.online) {
    return (
      <button type="button" className="social-btn" disabled>
        <GoogleMark />
        Google tidak tersedia offline
      </button>
    );
  }

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <GoogleAccountButtonInner {...props} />
    </GoogleOAuthProvider>
  );
}
