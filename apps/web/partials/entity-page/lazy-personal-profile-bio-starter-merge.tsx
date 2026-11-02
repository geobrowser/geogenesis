'use client';

import dynamic from 'next/dynamic';

// Renders nothing; it only merges starter blocks into the editor state. It needs the editor store,
// which carries the markdown schema, so it loads as its own chunk rather than with the page.
export const PersonalProfileBioStarterMerge = dynamic(
  () => import('./personal-profile-bio-starter-merge').then(m => m.PersonalProfileBioStarterMerge),
  { ssr: false, loading: () => null }
);
