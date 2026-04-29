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
  3: CLAMP_CLASS,
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
  const ref = React.useRef<HTMLParagraphElement>(null);

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      // Temporarily remove clamp to measure the natural height.
      const wasClamped = el.classList.contains(CLAMP_CLASS);
      if (wasClamped) el.classList.remove(CLAMP_CLASS);
      const lineHeight = parseFloat(getComputedStyle(el).lineHeight || '0');
      const fullHeight = el.scrollHeight;
      if (wasClamped) el.classList.add(CLAMP_CLASS);

      if (lineHeight > 0) {
        setIsOverflowing(fullHeight > lineHeight * MAX_LINES + 1);
      }
    };

    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text]);

  const showToggle = isOverflowing;
  const clamp = showToggle && !expanded;

  return (
    <p
      ref={ref}
      className={[
        'relative text-body text-text',
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
            className="cursor-pointer underline"
          >
            Less
          </button>
        </>
      )}
      {showToggle && !expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="absolute bottom-0 right-0 cursor-pointer bg-white pl-6 underline"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(255,255,255,0), #fff 1.25rem)',
          }}
        >
          More
        </button>
      )}
    </p>
  );
}
