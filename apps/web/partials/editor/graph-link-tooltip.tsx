'use client';

import { ReactRenderer } from '@tiptap/react';
import tippy, { Instance } from 'tippy.js';

import React, { useEffect, useRef } from 'react';

import { SquareButton } from '~/design-system/button';
import { CheckClose } from '~/design-system/icons/check-close';
import { Copy } from '~/design-system/icons/copy';
import { Link } from '~/design-system/icons/link';

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
  onShowConnection: () => void;
  onRemoveLink: () => void;
  onCopy: () => void;
  onClose?: () => void;
  parentTippy?: Instance; // Reference to parent tippy instance
  editor?: any; // Editor instance for ReactRenderer
}

export const GraphLinkTooltip: React.FC<GraphLinkTooltipProps> = ({
  linkText,
  onShowConnection,
  onRemoveLink,
  onCopy,
  onClose,
  parentTippy,
  editor,
}) => {
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
      // Create ReactRenderer with LinkTextHoverButtons component
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
        interactiveBorder: 30, // Add border to keep both tooltips open
        placement: 'top',
        theme: 'light',
        arrow: false,
        offset: [0, 0],
        trigger: 'mouseenter',
        delay: [300, 100],
        duration: [200, 150],
        zIndex: 10000,
        appendTo: document.body,
        hideOnClick: false,
        onShow: () => {
          // Keep parent tooltip open while child is showing
          if (parentTippy) {
            parentTippy.setProps({ hideOnClick: false });
          }
          console.log('Child tippy showing');
        },
        onHide: () => {
          // Allow parent tooltip to hide normally when child is hidden
          if (parentTippy) {
            parentTippy.setProps({ hideOnClick: 'toggle' });
          }
          console.log('Child tippy hiding');
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

  return (
    <div className="shadow-xl border-grey-02 z-50 flex min-w-14 gap-x-2.5 rounded-lg border bg-white p-2">
      <p ref={linkTextRef} className="text-gray-900 flex-1 rounded border px-1.5 border-grey-02">
        {linkText} :
      </p>
      <SquareButton
        onClick={() => {
          onCopy();
          onClose?.();
        }}
      >
        <Copy />
      </SquareButton>
    </div>
  );
};
