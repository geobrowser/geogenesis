import { ADMIN_ROLE_BINARY, EDITOR_CONTROLLER_ROLE_BINARY, EDITOR_ROLE_BINARY } from '~/core/constants';

export type Role = {
  role: string;
  binary: string;
};

export const ROLES: Role[] = [
  {
    role: 'EDITOR_ROLE',
    binary: EDITOR_ROLE_BINARY,
  },
  {
    role: 'EDITOR_CONTROLLER_ROLE',
    binary: EDITOR_CONTROLLER_ROLE_BINARY,
  },
  {
    role: 'ADMIN_ROLE',
    binary: ADMIN_ROLE_BINARY,
  },
];
