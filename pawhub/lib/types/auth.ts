export type UserRole = 'admin' | 'user' | 'guest';

export interface UserProfile {
  id: string;
  display_name: string;
  role: UserRole;
  created_at?: string;
  updated_at?: string;
}

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  displayName: string;
}