import type { Metadata } from 'next';

import { RankingLab } from '~/partials/explore/ranking-lab/ranking-lab';

/** GEO-3221. Admin-only; the page checks with the server before it shows anything. */
export const metadata: Metadata = {
  title: 'Ranking lab',
  robots: { index: false, follow: false },
};

export default function RankingLabPage() {
  return <RankingLab />;
}
