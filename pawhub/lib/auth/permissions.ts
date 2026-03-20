import { UserRole } from '@/lib/types/auth';

export const PERMISSIONS = {
  // Event permissions
  canCreateEvent: (role: UserRole) => role === 'admin',
  canEditEvent: (role: UserRole) => role === 'admin',
  canDeleteEvent: (role: UserRole) => role === 'admin',
  
  // Post permissions
  canCreatePost: (role: UserRole) => role === 'user' || role === 'admin',
  canEditOwnPost: (role: UserRole) => role === 'user' || role === 'admin',
  canDeleteAnyPost: (role: UserRole) => role === 'admin',
  
  // General permissions
  canManageUsers: (role: UserRole) => role === 'admin',
  canLike: (role: UserRole) => role === 'user' || role === 'admin',
} as const;

export function hasPermission(
  role: UserRole,
  permission: keyof typeof PERMISSIONS
): boolean {
  return PERMISSIONS[permission](role);
}

export function isAdmin(role: UserRole): boolean {
  return role === 'admin';
}

export function isAuthenticated(role: UserRole): boolean {
  return role !== 'guest';
}

export function getRoleBadgeColor(role: UserRole): string {
  switch (role) {
    case 'admin':
      return 'bg-purple-100 text-purple-700';
    case 'user':
      return 'bg-blue-100 text-blue-700';
    case 'guest':
      return 'bg-gray-100 text-gray-700';
  }
}