'use client';

import * as React from 'react';

import cx from 'classnames';

import { useImageWithFallback } from '~/core/hooks/use-image-with-fallback';

import { Camera } from '~/design-system/icons/camera';

import { ACCEPTED_PROFILE_IMAGE_ATTR, type ProfileImageKind, validateProfileImage } from './profile-edit-rules';

type Props = {
  kind: ProfileImageKind;
  /** Rendered preview: an object URL for a freshly picked file, or an ipfs:// value. */
  src?: string;
  disabled?: boolean;
  onPick: (file: File) => void;
  onRemove: () => void;
  onReject: (message: string) => void;
};

const COPY: Record<ProfileImageKind, { empty: string; hint: string; label: string }> = {
  banner: {
    empty: 'Add a banner',
    hint: 'PNG or JPEG, up to 5 MB. 1500 × 500 looks best.',
    label: 'Banner',
  },
  avatar: {
    empty: 'Add a photo',
    hint: 'PNG or JPEG, up to 5 MB. 400 × 400 looks best.',
    label: 'Profile photo',
  },
};

/**
 * Banner and avatar picker for the Edit profile modal.
 *
 * `PageImageField` covers the same job elsewhere, but at a fixed 44px-tall
 * thumbnail with no drop target and no dimension guidance — this surface needs a
 * 3:1 banner and an 88px avatar, so it renders its own frame and reuses only the
 * rules. Drag-and-drop bypasses the file input's `accept` filter, which is why
 * validation runs on both paths rather than on the input alone.
 */
export function ProfileImageField({ kind, src, disabled = false, onPick, onRemove, onReject }: Props) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const { src: resolvedSrc, onError } = useImageWithFallback(src);
  const copy = COPY[kind];

  const accept = React.useCallback(
    (file: File | undefined) => {
      if (!file) return;
      const rejection = validateProfileImage(file, kind);
      if (rejection) {
        onReject(rejection);
        return;
      }
      onPick(file);
    },
    [kind, onPick, onReject]
  );

  const openPicker = () => {
    if (disabled) return;
    inputRef.current?.click();
  };

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    accept(event.dataTransfer.files[0]);
  };

  const frameClassName =
    kind === 'banner'
      ? 'relative aspect-[3/1] w-full overflow-hidden rounded-lg'
      : 'relative h-[88px] w-[88px] overflow-hidden rounded-full ring-4 ring-white';

  return (
    <div className={kind === 'banner' ? 'w-full' : 'flex items-end gap-3'}>
      <div
        data-testid={`profile-${kind}-frame`}
        onDragOver={event => {
          event.preventDefault();
          if (!disabled) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        className={cx(
          frameClassName,
          'group',
          resolvedSrc ? 'bg-grey-01' : 'border border-dashed border-grey-02 bg-bg',
          isDragging && 'border-solid border-ctaPrimary bg-ctaTertiary',
          disabled && 'opacity-60'
        )}
      >
        {resolvedSrc ? (
          <img src={resolvedSrc} onError={onError} alt="" className="h-full w-full object-cover" />
        ) : (
          <button
            type="button"
            onClick={openPicker}
            disabled={disabled}
            className="flex h-full w-full flex-col items-center justify-center gap-1 px-4 text-center"
          >
            <Camera />
            <span className="text-metadataMedium text-text">{copy.empty}</span>
            {kind === 'banner' && <span className="text-footnote text-grey-04">{copy.hint}</span>}
          </button>
        )}

        {/* An 88px circle is too small to carry two overlay buttons, so the avatar
            puts its pair alongside the frame instead (below). */}
        {resolvedSrc && kind === 'banner' && (
          <div
            className={cx(
              'absolute inset-0 flex items-center justify-center gap-2 bg-text/40 transition-opacity',
              // Transparent is still hit-testable, and these buttons sit dead centre
              // of the banner — without this a tap lands on an invisible Remove.
              'pointer-events-none opacity-0',
              'group-hover:pointer-events-auto group-hover:opacity-100',
              'group-focus-within:pointer-events-auto group-focus-within:opacity-100',
              // Nothing hovers on touch, so there they are simply always shown.
              '[@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100'
            )}
          >
            <OverlayButton onClick={openPicker} disabled={disabled}>
              Replace
            </OverlayButton>
            <OverlayButton onClick={onRemove} disabled={disabled}>
              Remove
            </OverlayButton>
          </div>
        )}
      </div>

      {/* Only once there is a photo. The empty frame is already an "Add a photo"
          button, and repeating it here put two controls with the same name and the
          same action next to each other — two tab stops a screen reader cannot
          tell apart. */}
      {kind === 'avatar' && resolvedSrc && (
        <div className="flex items-center gap-3 pb-2">
          <button
            type="button"
            onClick={openPicker}
            disabled={disabled}
            className="text-metadataMedium text-ctaPrimary hover:underline disabled:text-grey-03 disabled:no-underline"
          >
            Replace
          </button>
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            className="text-metadataMedium text-grey-04 hover:underline disabled:text-grey-03 disabled:no-underline"
          >
            Remove
          </button>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_PROFILE_IMAGE_ATTR}
        aria-label={copy.label}
        className="hidden"
        onChange={event => {
          accept(event.target.files?.[0]);
          // Let the same file be re-picked after a rejection.
          event.target.value = '';
        }}
      />
    </div>
  );
}

function OverlayButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded border border-white/40 bg-white/90 px-2 py-1 text-metadataMedium text-text transition-colors hover:bg-white"
    >
      {children}
    </button>
  );
}
