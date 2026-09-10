import { Navigate } from 'react-router-dom';
import { normalizeRole } from './RequireRole';

export default function LegacyUserRedirect({ to }: { to: string }) {
  const token = localStorage.getItem('token');
  let role = '';
  try {
    role = JSON.parse(localStorage.getItem('user') || '{}')?.role || '';
  } catch {
    role = '';
  }

  if (!token) return <Navigate to="/login" replace />;
  if (normalizeRole(role) !== 'student') return <Navigate to="/dashboard" replace />;
  return <Navigate to={to} replace />;
}
