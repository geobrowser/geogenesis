import * as React from 'react';

interface Props {
  children: React.ReactNode;
}

export function EntityPageContentContainer({ children }: Props) {
  return (
    <div className="m-auto flex min-h-full max-w-[784px] flex-col items-center">
      <div className="w-full">{children}</div>
    </div>
  );
}
