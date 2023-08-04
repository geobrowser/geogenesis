'use server';

import { cookies } from 'next/headers';

import { Cookie } from '~/core/cookie';

// Uses Nextjs server actions
// https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions
export async function setOnboardingDismissedCookie() {
  cookies().set({
    name: Cookie.HAS_DISMISSED_PERSONAL_SPACE_ONBOARDING_KEY,
    value: 'true',
  });
}
