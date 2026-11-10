import type { PublicUser, Role } from '@app/shared';

interface UserRecord {
  email: string;
  id: string;
  name: string;
  phone: string;
  role: Role;
}

export function toPublicUser(user: UserRecord): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    role: user.role,
  };
}
