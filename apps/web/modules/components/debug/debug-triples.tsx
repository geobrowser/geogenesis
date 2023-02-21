import { RightArrowLong } from '~/modules/design-system/icons/right-arrow-long';
import { Triple } from '~/modules/types';
import { DebugPopover } from './debug-popover';

export const DebugTriples = ({ triples, containerWidth = 3000 }: { triples: Triple[]; containerWidth?: number }) => {
  /* A useful component for debugging triple data - generates a button which opens a popover containing nicely formatted triple data*/
  if (process.env.NODE_ENV !== 'development') return null;

  return (
    <DebugPopover containerWidth={containerWidth}>
      Triple Count: {triples.length}
      <div className="whitespace-wrap space-y-8 font-mono font-normal max-h-96 overflow-y-auto">
        {triples.map(triple => (
          <div key={triple.id}>
            {Object.entries(triple).map(([key, value]) => (
              <div key={key} className="whitespace-normal flex items-center">
                <div className="text-purple inline-block underline w-32">{key}</div>
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
