import * as React from 'react';

export function ListViewSkeleton() {
  const items = Array.from({ length: 4 });

  return (
    <div className="space-y-2">
      {items.map((_, i) => (
        <div key={i} className="flex items-start gap-6">
          {/* Avatar placeholder */}
          <div className="h-16 w-16 rounded-[0.625rem] bg-grey-02" />

          {/* Text content */}
          <div className="flex flex-1 flex-col gap-2">
            {/* Title */}
            <div className="h-5 w-32 rounded-sm bg-grey-02" />
            {/* Description line 1 */}
            <div className="h-3 w-full rounded-sm bg-grey-02" />
            {/* Description line 2 */}
            <div className="h-3 w-3/4 rounded-sm bg-grey-02" />
          </div>
        </div>
      ))}
    </div>
  );
}
