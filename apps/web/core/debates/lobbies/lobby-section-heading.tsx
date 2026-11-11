import * as React from 'react';

/** A heading on the People side: "Speakers · 4", "Listening · 5", "In a debate · 2". */
export function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[17px] leading-[22px] font-semibold text-text">{children}</h2>;
}
