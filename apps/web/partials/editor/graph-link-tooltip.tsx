'use client';

import React from 'react';

import { useEntity } from '~/core/database/entities';
import { useToast } from '~/core/hooks/use-toast';

import { SquareButton } from '~/design-system/button';
import { Copy } from '~/design-system/icons/copy';
import { Unlink } from '~/design-system/icons/unlink';
import { Spinner } from '~/design-system/spinner';

interface GraphLinkTooltipProps {
  linkText: string;
  linkUrl: string;
  spaceId?: string;
  entityId?: string;
  /** Entity name from data attribute (avoids fetching) */
  entityName?: string;
  /** Entity space ID from data attribute (avoids fetching) */
  entitySpaceId?: string;
  onShowConnection: () => void;
  onRemoveLink: () => void;
  onCopy: () => void;
  onClose?: () => void;
}

export const GraphLinkTooltip: React.FC<GraphLinkTooltipProps> = ({
  linkText,
  entityId,
  entityName: propEntityName,
  entitySpaceId: propEntitySpaceId,
  onShowConnection,
  onRemoveLink,
  onClose,
}) => {
  const [, setToast] = useToast();

  // Fetch entity data if not provided via props (handles rerender case)
  const { name: entityName, spaces, isLoading } = useEntity({ id: entityId || '', spaceId: propEntitySpaceId });
  const entityNameValue = propEntityName || entityName || linkText;
  const entitySpaceId = propEntitySpaceId || spaces?.[0];

  const copyHandler = async () => {
    try {
      const fullUrl = `${window.location.origin}/space/${entitySpaceId}/${entityId}`;
      await navigator.clipboard.writeText(fullUrl);
      setToast(<div className="text-button">Link copied</div>);
      onClose?.();
    } catch (error) {
      console.error('Failed to copy link:', error);
      setToast(<div className="text-button">Failed to copy link</div>);
    }
  };

  const removeLinkHandler = () => {
    onRemoveLink();
  };

  const showConnectionHandler = () => {
    onShowConnection();
    onClose?.();
  };

  return (
    <div className="shadow-xl z-50 flex min-w-14 gap-x-1 rounded-lg border border-grey-02 bg-white p-2">
      <button
        type="button"
        onClick={showConnectionHandler}
        aria-label={`Show connection for ${entityNameValue || linkText}`}
        disabled={isLoading}
        className="flex-1 cursor-pointer truncate rounded border border-grey-02 px-1.5 text-text transition-colors hover:bg-grey-01 focus:outline-none focus:ring-2 focus:ring-ctaPrimary focus:ring-offset-1 disabled:cursor-wait"
      >
        {isLoading && !propEntityName ? (
          <span className="flex items-center justify-center">
            <Spinner />
          </span>
        ) : (
          entityNameValue || linkText
        )}
      </button>
      <SquareButton onClick={removeLinkHandler}>
        <Unlink color="grey-04" />
      </SquareButton>
      <SquareButton onClick={copyHandler}>
        <Copy color="grey-04" />
      </SquareButton>
    </div>
  );
};
