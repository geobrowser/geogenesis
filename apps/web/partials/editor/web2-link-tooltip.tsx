import React from 'react';

interface Web2LinkHoverCardProps {
  url: string;
}

export const Web2LinkHoverCard: React.FC<Web2LinkHoverCardProps> = () => {
  return (
    <div className="w-64 rounded-lg border border-grey-02 bg-white p-2 shadow-[0_4px_4px_0_rgba(0,0,0,0.07)]">
      <p className="text-gray-700 text-grey-05 leading-5">
        Links aren't clickable in browse mode but still appear in text; add external links in the properties panel.
      </p>
    </div>
  );
};
