'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { useMutate } from '~/core/sync/use-mutate';
import { useValue } from '~/core/sync/use-store';

import { PageStringField } from '~/design-system/editable-fields/editable-fields';

const MAX_LINES = 3;

// Tailwind needs literal class names to include them in the build; pick from a
// static map keyed by line count so MAX_LINES stays the single source of truth.
const LINE_CLAMP_CLASS: Record<number, string> = {
  1: 'line-clamp-1',
  2: 'line-clamp-2',
  3: 'line-clamp-3',
  4: 'line-clamp-4',
  5: 'line-clamp-5',
  6: 'line-clamp-6',
};

const CLAMP_CLASS = LINE_CLAMP_CLASS[MAX_LINES];

export function EntityPageInlineDescription({ entityId, spaceId }: { entityId: string; spaceId: string }) {
  const isEditing = useUserIsEditing(spaceId);
  const { storage } = useMutate();

  const rawValue = useValue({
    selector: v =>
      v.entity.id === entityId && v.spaceId === spaceId && v.property.id === SystemIds.DESCRIPTION_PROPERTY,
  });

  const description = rawValue?.value ?? '';

  if (isEditing) {
    const onChange = (next: string) => {
      if (next === '' && rawValue) {
        storage.values.delete(rawValue);
        return;
      }

      if (!rawValue) {
        if (next === '') return;
        storage.values.set({
          spaceId,
          entity: { id: entityId, name: null },
          property: {
            id: SystemIds.DESCRIPTION_PROPERTY,
            name: 'Description',
            dataType: 'TEXT',
          },
          value: next,
        });
        return;
      }

      storage.values.update(rawValue, draft => {
        draft.value = next;
        draft.property.dataType = 'TEXT';
      });
    };

    return (
      <div className="-mt-3 mb-3 text-text">
        <PageStringField
          variant="body"
          placeholder="Add a description..."
          aria-label="Description"
          value={description}
          onChange={onChange}
        />
      </div>
    );
  }

  if (!description) {
    return null;
  }

  return (
    <div className="-mt-3 mb-3">
      <TruncatedDescription text={description} />
    </div>
  );
}

function TruncatedDescription({ text }: { text: string }) {
  const [expanded, setExpanded] = React.useState(false);
  const [isOverflowing, setIsOverflowing] = React.useState(false);
  // Measure overflow on a hidden sibling that's never clamped, so we don't
  // mutate layout-affecting classes on the visible (and observed) element.
  const measureRef = React.useRef<HTMLParagraphElement>(null);

  React.useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el) return;

    const measure = () => {
      const lineHeight = parseFloat(getComputedStyle(el).lineHeight || '0');
      const fullHeight = el.scrollHeight;
      if (lineHeight > 0) {
        setIsOverflowing(fullHeight > lineHeight * MAX_LINES + 1);
      }
    };

    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text]);

  // Always clamp on first paint to avoid a flash of unclamped text before the
  // layout effect runs. `isOverflowing` only gates the More/Less toggle.
  const showToggle = isOverflowing;
  const clamp = !expanded;

  const buttonFocus =
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text';

  return (
    <div className="relative">
      <p
        className={[
          'text-body wrap-break-word text-text',
          clamp ? CLAMP_CLASS : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {text}
        {showToggle && expanded && (
          <>
            {' '}
            <button
              type="button"
              onClick={() => setExpanded(false)}
              aria-expanded={true}
              className={`cursor-pointer underline ${buttonFocus}`}
            >
              Less
            </button>
          </>
        )}
        {showToggle && !expanded && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            aria-expanded={false}
            className={`absolute bottom-0 right-0 cursor-pointer bg-white pl-6 underline ${buttonFocus}`}
            style={{
              backgroundImage:
                'linear-gradient(to right, rgba(255,255,255,0), #fff 1.25rem)',
            }}
          >
            More
          </button>
        )}
      </p>
      <p
        ref={measureRef}
        aria-hidden="true"
        className="pointer-events-none invisible absolute inset-x-0 top-0 text-body wrap-break-word"
      >
        {text}
      </p>
    </div>
  );
}
