import { Navigate, Outlet } from 'react-router-dom';

export type Role = 'student' | 'dpa' | 'superadmin' | 'staff';

// Alias role lama sebelum migrasi (admin->dpa, user->student)
const ROLE_ALIASES: Record<string, Role> = {
  admin: 'dpa',
  user: 'student',
};

export function normalizeRole(role?: string | null): Role {
  const raw = (role || '').toLowerCase().trim();
  if (raw === 'superadmin' || raw === 'kaprodi') return 'superadmin';
  if (raw === 'dpa' || raw === 'dosen') return 'dpa';
  if (raw === 'staff' || raw === 'staf') return 'staff';
  if (raw === 'student') return 'student';
  return ROLE_ALIASES[raw] || 'student';
}

export function homePathForRole(role: Role): string {
  switch (role) {
    case 'superadmin':
      return '/dashboard';
    case 'dpa':
      return '/dpa/dashboard';
    case 'staff':
      return '/staff/dashboard';
    default:
      return '/user/dashboard';
  }
}

function getStoredUser(): { role?: string } | null {
  try {
    return JSON.parse(localStorage.getItem('user') || 'null');
  } catch {
    return null;
  }
}

export default function RequireRole({ allow }: { allow: Role[] }) {
  const token = localStorage.getItem('token');
  const user = getStoredUser();
  const role = normalizeRole(user?.role);

  if (!token || !user?.role) {
    return <Navigate to="/login" replace />;
  }

  if (!allow.includes(role)) {
    return <Navigate to={homePathForRole(role)} replace />;
  }

  return <Outlet />;
}
