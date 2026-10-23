/**
 * Linked accounts that carry a sign-in email, in precedence order. A Google-only user has no
 * `user.email`; their address is on the `google_oauth` account.
 */
const EMAIL_ACCOUNTS = [
  { type: 'email', field: 'address' },
  { type: 'google_oauth', field: 'email' },
] as const;

/** The signed-in Privy user's email, trimmed and lowercased, or undefined. */
export function privyUserEmail(user: unknown): string | undefined {
  if (!isRecord(user)) return undefined;
  // The shorthand fields mirror the linked accounts; read first so a partial user object still works.
  const shorthand = normalizeEmail(field(user.email, 'address')) ?? normalizeEmail(field(user.google, 'email'));
  if (shorthand) return shorthand;
  if (!Array.isArray(user.linkedAccounts)) return undefined;

  for (const { type, field: key } of EMAIL_ACCOUNTS) {
    for (const account of user.linkedAccounts) {
      if (!isRecord(account) || account.type !== type) continue;
      const email = normalizeEmail(account[key]);
      if (email) return email;
    }
  }

  return undefined;
}

function field(value: unknown, key: string) {
  return isRecord(value) ? value[key] : undefined;
}

function normalizeEmail(value: unknown) {
  if (typeof value !== 'string') return undefined;
  const email = value.trim().toLowerCase();
  return email.includes('@') ? email : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
