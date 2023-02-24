import { useActionsStore } from '~/modules/action';
import { RightArrowLong } from '~/modules/design-system/icons/right-arrow-long';
import { DebugPopover } from './debug-popover';

export const DebugActions = ({
  spaceId,
  containerWidth = 3000,
  className,
}: {
  spaceId: string;
  containerWidth?: number;
  className?: string;
}) => {
  const { actions } = useActionsStore(spaceId);
  /* A useful component for debugging triple data - generates a button which opens a popover containing nicely formatted triple data*/
  if (process.env.NODE_ENV !== 'development' || !spaceId) return null;

  return (
    <DebugPopover containerWidth={containerWidth} className={className}>
      Action Count: {actions.length}
      <div className="whitespace-wrap space-y-8 font-mono font-normal max-h-screen overflow-y-auto">
        {actions.map((action, i) => (
          <div key={i}>
            {Object.entries(action).map(([key, value]) => (
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
