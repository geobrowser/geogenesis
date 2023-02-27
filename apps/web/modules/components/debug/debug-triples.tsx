import { RightArrowLong } from '~/modules/design-system/icons/right-arrow-long';
import { Triple } from '~/modules/types';
import { DebugPopover } from './debug-popover';

export const DebugTriples = ({
  triples,
  containerWidth = 3000,
  className,
}: {
  triples: Triple[];
  containerWidth?: number;
  className?: string;
}) => {
  /* A useful component for debugging triple data - generates a button which opens a popover containing nicely formatted triple data*/
  if (process.env.NODE_ENV !== 'development') return null;

  return (
    <DebugPopover containerWidth={containerWidth} className={className}>
      Triple Count: {triples.length}
      <div className="whitespace-wrap max-h-96 space-y-8 overflow-y-auto font-mono font-normal">
        {triples.map(triple => (
          <div key={triple.id}>
            {Object.entries(triple).map(([key, value]) => (
              <div key={key} className="flex items-center whitespace-normal">
                <div className="inline-block w-32 text-purple underline">{key}</div>
                <div className="px-4">
                  <RightArrowLong />
                </div>
                <div>{JSON.stringify(value)}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </DebugPopover>
  );
};
