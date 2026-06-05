'use client';

const RANKING_COMPOSE_NAVBAR_OFFSET_PX = 60;

type Props = {
  children: React.ReactNode;
};

/** Fullscreen shell for ranking compose — fixed overlay like power tools. */
export function RankingComposeFullscreen({ children }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col overflow-x-hidden bg-white"
      style={{ top: RANKING_COMPOSE_NAVBAR_OFFSET_PX }}
    >
      {children}
    </div>
  );
}
