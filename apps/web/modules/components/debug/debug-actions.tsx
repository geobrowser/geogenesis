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
      <div className="whitespace-wrap max-h-screen space-y-8 overflow-y-auto pb-24 font-mono font-normal">
        {actions.map((action, i) => (
          <div key={i}>
            {Object.entries(action).map(([key, value]) => (
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
