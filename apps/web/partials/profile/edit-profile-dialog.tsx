'use client';

import { Content, Description, Overlay, Portal, Root, Title } from '@radix-ui/react-dialog';

import * as React from 'react';

import cx from 'classnames';

import { type ProfileImageEdit, useEditProfile } from '~/core/hooks/use-edit-profile';

import { Button, SquareButton } from '~/design-system/button';
import { Close } from '~/design-system/icons/close';
import { Warning } from '~/design-system/icons/warning';

import { ProfileImageField } from './profile-image-field';

const UNCHANGED: ProfileImageEdit = { kind: 'unchanged' };

type ImageState = {
  edit: ProfileImageEdit;
  /** Object URL for a picked file. Owned here so it can be revoked on replace. */
  previewUrl: string | null;
};

const EMPTY_IMAGE_STATE: ImageState = { edit: UNCHANGED, previewUrl: null };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Edit profile (GEO-2839). Four fields, published straight to the viewer's
 * personal space with no review step.
 *
 * Publishing is what shapes it: the write is slow enough (p50 ~10s) that closing
 * on click would leave people looking at their old avatar with nothing to explain
 * it. So the modal stays open with the fields locked, and closing is an explicit
 * hand-off to the status bar rather than a cancel.
 */
export function EditProfileDialog({ open, onOpenChange }: Props) {
  const { canEdit, isLoading, current, status, errorMessage, publish, discard } = useEditProfile({ isOpen: open });

  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [banner, setBanner] = React.useState<ImageState>(EMPTY_IMAGE_STATE);
  const [avatar, setAvatar] = React.useState<ImageState>(EMPTY_IMAGE_STATE);
  const [rejection, setRejection] = React.useState<string | null>(null);

  // The entity loads after the dialog opens, so the text fields keep seeding from
  // it until the user types. Without this, opening before the fetch settles leaves
  // someone editing two blank fields over a profile that has both.
  const isPristineRef = React.useRef(true);

  const isPublishing = status === 'publishing';

  React.useEffect(() => {
    if (!open || !isPristineRef.current) return;
    setName(current.name);
    setDescription(current.description);
  }, [open, current.name, current.description]);

  const resetForm = React.useCallback(() => {
    isPristineRef.current = true;
    setBanner(previous => {
      if (previous.previewUrl) URL.revokeObjectURL(previous.previewUrl);
      return EMPTY_IMAGE_STATE;
    });
    setAvatar(previous => {
      if (previous.previewUrl) URL.revokeObjectURL(previous.previewUrl);
      return EMPTY_IMAGE_STATE;
    });
    setRejection(null);
  }, []);

  // A finished publish is the one case where the modal closes itself.
  React.useEffect(() => {
    if (status !== 'published' || !open) return;
    resetForm();
    onOpenChange(false);
  }, [status, open, onOpenChange, resetForm]);

  const setImage = (kind: 'banner' | 'avatar', next: ImageState) => {
    const setter = kind === 'banner' ? setBanner : setAvatar;
    setter(previous => {
      if (previous.previewUrl) URL.revokeObjectURL(previous.previewUrl);
      return next;
    });
    setRejection(null);
  };

  const onPick = (kind: 'banner' | 'avatar') => (file: File) =>
    setImage(kind, { edit: { kind: 'replaced', file }, previewUrl: URL.createObjectURL(file) });

  const onRemove = (kind: 'banner' | 'avatar') => () => setImage(kind, { edit: { kind: 'removed' }, previewUrl: null });

  const imageSrc = (state: ImageState, currentUrl: string | undefined) => {
    if (state.edit.kind === 'replaced') return state.previewUrl ?? undefined;
    if (state.edit.kind === 'removed') return undefined;
    return currentUrl;
  };

  const hasFailed = status === 'error';
  const isUnavailable = !canEdit && !isLoading;
  const hasChanges =
    name !== current.name ||
    description !== current.description ||
    banner.edit.kind !== 'unchanged' ||
    avatar.edit.kind !== 'unchanged';

  // A failed save has already written its rows to the local store, so the entity
  // now reads back the edit and `hasChanges` goes false. Retry has to stay live
  // regardless — the work is staged, it just hasn't been published.
  const canSave = canEdit && (hasChanges || hasFailed) && name.trim() !== '' && !isPublishing;

  const close = () => {
    // Closing mid-publish hands off to the status bar; it does not cancel the
    // write, and the staged edit stays put so the retry there can re-send it.
    if (!isPublishing) {
      discard();
      resetForm();
    }
    onOpenChange(false);
  };

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSave) return;
    void publish({ name: name.trim(), description: description.trim(), banner: banner.edit, avatar: avatar.edit });
  };

  return (
    <Root open={open} onOpenChange={next => (next ? onOpenChange(true) : close())}>
      <Portal>
        <Overlay className="fixed inset-0 z-100 bg-text/20" />
        <Content className="fixed inset-0 z-101 flex items-start justify-center overflow-y-auto focus:outline-hidden">
          <form
            onSubmit={onSubmit}
            className="my-10 flex w-full max-w-[560px] flex-col rounded-lg border border-grey-02 bg-white shadow-dropdown"
          >
            <header className="flex items-center justify-between px-5 py-4">
              <Title className="text-smallTitle text-text">Edit profile</Title>
              <SquareButton type="button" onClick={close} icon={<Close />} aria-label="Close" />
            </header>

            <Description className="sr-only">
              Update your banner, photo, name and description. Saving publishes to your personal space.
            </Description>

            {hasFailed && errorMessage && (
              <div className="mx-5 mb-4 flex items-start gap-2 rounded-lg bg-red-02 p-3">
                <div className="text-red-01">
                  <Warning />
                </div>
                <p className="text-metadata text-text">{errorMessage}</p>
              </div>
            )}

            {rejection && (
              <div className="mx-5 mb-4 rounded-lg bg-red-02 p-3">
                <p className="text-metadata text-text">{rejection}</p>
              </div>
            )}

            <div className="px-5">
              <ProfileImageField
                kind="banner"
                src={imageSrc(banner, current.bannerUrl)}
                disabled={isPublishing}
                onPick={onPick('banner')}
                onRemove={onRemove('banner')}
                onReject={setRejection}
              />

              {/* Hangs off the banner's bottom edge, matching how a profile already
                  reads on a space page. */}
              <div className="-mt-11 pl-4">
                <ProfileImageField
                  kind="avatar"
                  src={imageSrc(avatar, current.avatarUrl)}
                  disabled={isPublishing}
                  onPick={onPick('avatar')}
                  onRemove={onRemove('avatar')}
                  onReject={setRejection}
                />
              </div>
            </div>

            <div className="flex flex-col gap-4 px-5 pt-5">
              <label className="flex flex-col gap-1.5">
                <span className="text-metadataMedium text-grey-04">Name</span>
                <input
                  value={name}
                  onChange={event => {
                    isPristineRef.current = false;
                    setName(event.currentTarget.value);
                  }}
                  disabled={isPublishing}
                  placeholder="Your name"
                  className="w-full appearance-none rounded px-[10px] py-[9px] text-input text-text shadow-inner shadow-grey-02 outline-hidden transition-all duration-150 placeholder:text-grey-03 hover:shadow-text focus:shadow-inner-lg focus:shadow-text disabled:cursor-not-allowed disabled:bg-divider disabled:text-grey-03 disabled:hover:shadow-grey-02"
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-metadataMedium text-grey-04">Description</span>
                <textarea
                  value={description}
                  onChange={event => {
                    isPristineRef.current = false;
                    setDescription(event.currentTarget.value);
                  }}
                  disabled={isPublishing}
                  rows={3}
                  placeholder="A sentence about who you are and what you work on."
                  className="w-full resize-none appearance-none rounded px-[10px] py-[9px] text-input text-text shadow-inner shadow-grey-02 outline-hidden transition-all duration-150 placeholder:text-grey-03 hover:shadow-text focus:shadow-inner-lg focus:shadow-text disabled:cursor-not-allowed disabled:bg-divider disabled:text-grey-03 disabled:hover:shadow-grey-02"
                />
                <span className="text-footnote text-grey-04">Shown under your name across Geo.</span>
              </label>
            </div>

            {isPublishing && (
              <div className="mt-5 px-5">
                <p className="text-metadata text-grey-04">
                  Publishing to your space. This usually takes about 10 seconds.
                </p>
                {/* Indeterminate — the write gives no progress to report, and a fake
                    percentage would be worse than none. */}
                <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-divider">
                  <div className="h-full w-1/3 animate-pulse rounded-full bg-ctaPrimary" />
                </div>
              </div>
            )}

            <footer className="mt-5 flex items-center justify-between gap-3 border-t border-grey-02 px-5 py-4">
              {/* Save is dead without a resolvable profile entity, so say why
                  rather than leaving a button that does nothing. */}
              <p className={cx('text-footnote', isUnavailable ? 'text-red-01' : 'text-grey-04')}>
                {isUnavailable
                  ? 'We couldn’t find your profile to edit. Try reloading the page.'
                  : hasFailed
                    ? 'Nothing was published.'
                    : 'Saving publishes to your space.'}
              </p>
              <div className="flex items-center gap-2">
                <Button type="button" variant="secondary" onClick={close}>
                  {isPublishing ? 'Close' : 'Cancel'}
                </Button>
                <Button type="submit" disabled={!canSave}>
                  {isPublishing ? 'Publishing' : hasFailed ? 'Retry' : 'Save profile'}
                </Button>
              </div>
            </footer>
          </form>
        </Content>
      </Portal>
    </Root>
  );
}
