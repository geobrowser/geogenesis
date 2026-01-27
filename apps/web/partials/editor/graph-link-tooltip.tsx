'use client';

import { ReactRenderer } from '@tiptap/react';
import tippy, { Instance } from 'tippy.js';

import React, { useEffect, useRef } from 'react';

import { useToast } from '~/core/hooks/use-toast';
import { useEntity } from '~/core/database/entities';

import { SquareButton } from '~/design-system/button';
import { CheckClose } from '~/design-system/icons/check-close';
import { Copy } from '~/design-system/icons/copy';
import { Link } from '~/design-system/icons/link';
import { Unlink } from '~/design-system/icons/unlink';

// Component for hover buttons
const LinkTextHoverButtons: React.FC<{
  onShowConnection: () => void;
  onRemoveLink: () => void;
}> = ({ onShowConnection, onRemoveLink }) => {
  return (
    <div className="flex rounded border border-grey-04 bg-white shadow-lg">
      <SquareButton onClick={onShowConnection} className="h-3 w-3 rounded-l border-transparent">
        <Link />
      </SquareButton>
      <SquareButton onClick={onRemoveLink} className="h-3 w-3 rounded-r border-transparent">
        <CheckClose />
      </SquareButton>
    </div>
  );
};

interface GraphLinkTooltipProps {
  linkText: string;
  linkUrl: string;
  spaceId?: string;
  onShowConnection: () => void;
  onRemoveLink: () => void;
  onCopy: () => void;
  onClose?: () => void;
  parentTippy?: Instance; // Reference to parent tippy instance
  editor?: any; // Editor instance for ReactRenderer
}

export const GraphLinkTooltip: React.FC<GraphLinkTooltipProps> = ({
  linkText,
  linkUrl,
  spaceId,
  onShowConnection,
  onRemoveLink,
  onCopy,
  onClose,
  parentTippy,
  editor,
}) => {
  const entityId = linkUrl.replace('graph://', '');
  const { name: entityName } = useEntity({ id: entityId, spaceId });
  const [, setToast] = useToast();

  const displayName = entityName || linkText;

  const linkTextRef = useRef<HTMLDivElement>(null);
  const hoverTippyRef = useRef<Instance | null>(null);
  const hoverRendererRef = useRef<ReactRenderer | null>(null);

  useEffect(() => {
    // Cleanup any existing instances first
    if (hoverTippyRef.current) {
      hoverTippyRef.current.destroy();
      hoverTippyRef.current = null;
          }
    if (hoverRendererRef.current) {
      hoverRendererRef.current.destroy();
      hoverRendererRef.current = null;
    }

    if (linkTextRef.current && editor) {
      // Create nested Card Hover
      hoverRendererRef.current = new ReactRenderer(LinkTextHoverButtons, {
        props: {
          onShowConnection: () => {
            onShowConnection();
            onClose?.();
          },
          onRemoveLink: () => {
            onRemoveLink();
            onClose?.();
          },
        },
        editor: editor, // Pass editor instance from props
      });

      // Create tippy with ReactRenderer element
      hoverTippyRef.current = tippy(linkTextRef.current, {
        content: hoverRendererRef.current.element,
        interactive: true,
        interactiveBorder: 10, // Add border to keep both tooltips open
        placement: 'top',
        theme: 'light',
        arrow: false,
        offset: [0, 0],
        trigger: 'mouseenter',
        delay: [0, 100],
        zIndex: 10000,
        appendTo: document.body,
        hideOnClick: false,
        onShow: () => {
          // Keep parent tooltip open while child is showing
          if (parentTippy) {
            parentTippy.setProps({ hideOnClick: false });
          }
        },
        onHide: () => {
          // Allow parent tooltip to hide normally when child is hidden
          if (parentTippy) {
            parentTippy.setProps({ hideOnClick: 'toggle' });
          }
        },
      });
    }

    return () => {
      if (hoverTippyRef.current) {
        hoverTippyRef.current.destroy();
        hoverTippyRef.current = null;
      }
      if (hoverRendererRef.current) {
        hoverRendererRef.current.destroy();
        hoverRendererRef.current = null;
      }
    };
  }, [onShowConnection, onRemoveLink, onClose, parentTippy, editor]);

  const copyHandler = () => {
    onCopy();
    setToast(<div className="text-button">Link copied</div>);
    onClose?.();
  };

  const removeLinkHandler = () => {
    onRemoveLink();
  };

  return (
    <div className="shadow-xl z-50 flex min-w-14 gap-x-1 rounded-lg border border-grey-02 bg-white p-2">
      <p ref={linkTextRef} className="flex-1 rounded border border-grey-02 px-1.5 text-text">
        {displayName}
      </p>
      <SquareButton onClick={removeLinkHandler}>
        <Unlink color="grey-04" />
      </SquareButton>
      <SquareButton onClick={copyHandler}>
        <Copy color="grey-04" />
      </SquareButton>
    </div>
  );
};
