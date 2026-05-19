import { apiFetch } from './index';

export interface User {
  id: number;
  email: string;
  role: 'admin' | 'user';
  employeeId: number | null;
  mustChangePassword: boolean;
}

export async function login(email: string, password: string): Promise<User> {
  const { user } = await apiFetch<{ user: User }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  return user;
}

export async function logout(): Promise<void> {
  await apiFetch<void>('/api/auth/logout', { method: 'POST' });
}

export async function me(): Promise<User | null> {
  try {
    const { user } = await apiFetch<{ user: User }>('/api/auth/me');
    return user;
  } catch {
    return null;
  }
}

export async function changePassword(oldPassword: string, newPassword: string): Promise<void> {
  await apiFetch<void>('/api/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
  });
}
