import { RightArrowLong } from '~/modules/design-system/icons/right-arrow-long';
import { DebugPopover } from './debug-popover';

export const DebugObject = ({
  object,
  containerWidth = 3000,
  className,
}: {
  object: Record<string, any>;
  containerWidth?: number;
  className?: string;
}) => {
  /* A useful component for debugging triple data - generates a button which opens a popover containing nicely formatted triple data*/
  if (process.env.NODE_ENV !== 'development') return null;

  return (
    <DebugPopover containerWidth={containerWidth} className={className}>
      <div className="whitespace-wrap space-y-8 font-mono font-normal  overflow-y-auto">
        {Object.entries(object).map(([key, value]) => (
          <div key={key} className="whitespace-normal flex items-center">
            <div className="text-purple inline-block underline">{key}</div>
            <div className="px-4">
              <RightArrowLong />
            </div>
            <div>{JSON.stringify(value)}</div>
          </div>
        ))}
      </div>
    </DebugPopover>
  );
};
