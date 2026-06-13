export function RankingEmptyStateArt() {
  return (
    <div className="relative h-[88px] w-[140px] shrink-0" aria-hidden>
      <div className="absolute top-2 right-0 h-[72px] w-[52px] rotate-[8deg] overflow-hidden rounded-md border border-white bg-grey-02 shadow-card">
        <div className="from-amber-200 to-orange-300 h-full w-full bg-gradient-to-br" />
      </div>
      <div className="absolute top-4 right-8 h-[72px] w-[52px] -rotate-[6deg] overflow-hidden rounded-md border border-white bg-grey-02 shadow-card">
        <div className="h-full w-full bg-gradient-to-br from-grey-02 to-grey-04" />
      </div>
      <div className="absolute top-0 right-16 h-[72px] w-[52px] rotate-[4deg] overflow-hidden rounded-md border border-white bg-grey-02 shadow-card">
        <div className="from-emerald-200 to-teal-400 h-full w-full bg-gradient-to-br" />
      </div>
    </div>
  );
}
