'use client';

import { Content, Description, Overlay, Portal, Root, Title } from '@radix-ui/react-dialog';

import * as React from 'react';

import cx from 'classnames';

import { type ProfileImageEdit, useEditProfile } from '~/core/hooks/use-edit-profile';

import { Button, SquareButton } from '~/design-system/button';
import { Close } from '~/design-system/icons/close';
import { Warning } from '~/design-system/icons/warning';
import { Input, inputStyles } from '~/design-system/input';

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
 * Saving closes it. The write is slow — p50 ~10s, p95 ~48s — and the status bar
 * carries the whole of that: the image upload, the publish, and the result. A
 * failure reopens this modal with the draft still in it, so nothing is lost by
 * getting out of the way in the meantime.
 *
 * The publishing state below is still reachable, just no longer the common path:
 * the modal can be reopened from the menu while a save is still running, and it
 * locks rather than offering to start a second one.
 */
export function EditProfileDialog({ open, onOpenChange }: Props) {
  const { canEdit, entityId, isHydrated, isLoading, current, status, errorMessage, publish, reset } = useEditProfile({
    isOpen: open,
  });

  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [banner, setBanner] = React.useState<ImageState>(EMPTY_IMAGE_STATE);
  const [avatar, setAvatar] = React.useState<ImageState>(EMPTY_IMAGE_STATE);
  const [rejection, setRejection] = React.useState<string | null>(null);

  // The entity loads after the dialog opens, so each text field keeps seeding from
  // it until the user types in *that* field. Tracked per field, not once for the
  // form: the name arrives early from the warm profile query while the description
  // only exists on the entity, so a single flag let someone type a name during
  // hydration and silently delete a description they never saw.
  const pristineRef = React.useRef({ name: true, description: true });

  const isPublishing = status === 'publishing';

  /** Where the current press began; see the backdrop handler below. */
  const pressStartedOnBackdrop = React.useRef(false);

  const resetForm = React.useCallback(() => {
    pristineRef.current = { name: true, description: true };
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

  // Declared before the seeding effect so it runs first in the same commit: it
  // clears the pristine flags, which is what lets the seed below fill the fields
  // from the account that just took over.
  //
  // The hook abandons a staged edit when the account changes; the form it was typed
  // into has to go with it. Otherwise the fields stay non-pristine, the new profile
  // can never seed them, and the previous account's draft sits on screen ready to
  // be saved into somebody else's space.
  const ownerRef = React.useRef(entityId);
  React.useEffect(() => {
    if (ownerRef.current === entityId) return;
    ownerRef.current = entityId;
    resetForm();
  }, [entityId, resetForm]);

  React.useEffect(() => {
    if (!open) return;
    if (pristineRef.current.name) setName(current.name);
    if (pristineRef.current.description) setDescription(current.description);
  }, [open, current.name, current.description]);

  // A finished publish is the one case where the modal closes itself.
  //
  // The clearing is not conditional on being open. The hook outlives the close —
  // the navbar keeps it mounted so a publish the user walked away from still
  // lands — so a success that arrives after they closed would otherwise leave the
  // status on 'published', and this effect would shut the modal on sight the next
  // time they opened it.
  React.useEffect(() => {
    if (status !== 'published') return;
    resetForm();
    reset();
    if (open) onOpenChange(false);
  }, [status, open, onOpenChange, resetForm, reset]);

  // A failure that lands after the user closed has nowhere else to go. The status
  // bar's generic publish error carries no Retry — `toUserFacingError` only
  // supplies one for chunk-load and wallet failures — and the staged edit lives
  // here, so the modal comes back with the work intact rather than stranding it.
  React.useEffect(() => {
    if (status !== 'error' || open) return;
    onOpenChange(true);
  }, [status, open, onOpenChange]);

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
  // Includes a hydration that settled without producing an entity: the fields would
  // be seeded from the profile endpoint alone, and saving against no relations
  // would duplicate an image edge rather than retarget it.
  const isUnavailable = !isLoading && (!canEdit || !isHydrated);

  // Trim only what the user actually typed. A stored value with stray whitespace
  // is not a change until they touch the field — comparing a trimmed draft against
  // an untrimmed original marked the form dirty the moment it opened, and let an
  // image-only edit quietly rewrite the name in trimmed form.
  const publishName = pristineRef.current.name ? current.name : name.trim();
  const publishDescription = pristineRef.current.description ? current.description : description.trim();

  // Compared the way they are published — trimmed, and with a removal of an image
  // that was never set counting as no change. Otherwise Save offers to publish an
  // edit that resolves to no ops, which the SDK rejects as "Nothing to publish".
  const changesImage = (state: ImageState, currentUrl: string | undefined) =>
    state.edit.kind === 'replaced' || (state.edit.kind === 'removed' && Boolean(currentUrl));

  const hasChanges =
    publishName !== current.name ||
    publishDescription !== current.description ||
    changesImage(banner, current.bannerUrl) ||
    changesImage(avatar, current.avatarUrl);

  // A failed save has already written its rows to the local store, so the entity
  // now reads back the edit and `hasChanges` goes false. Retry has to stay live
  // regardless — the work is staged, it just hasn't been published.
  //
  // Not while the entity is still loading: the profile fallback can already show
  // an avatar, and staging a replacement before the relations arrive would add a
  // second image edge instead of retargeting the one that exists.
  const isNameMissing = publishName.trim() === '';
  const canSave = canEdit && isHydrated && !isLoading && (hasChanges || hasFailed) && !isNameMissing && !isPublishing;

  const close = () => {
    // Dismissing during a publish never cancels it, and the staged edit stays put
    // so a retry can re-send it. Reachable by reopening the modal while a save is
    // still running — Save itself closes without coming through here.
    if (!isPublishing) {
      reset();
      resetForm();
    }
    onOpenChange(false);
  };

  const footerNote = isUnavailable
    ? 'We couldn’t find your profile to edit. Try reloading the page.'
    : isPublishing
      ? 'Publishing to your space. This usually takes about 10 seconds.'
      : hasFailed
        ? 'Nothing was published.'
        : 'Saving publishes to your space.';

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSave) return;

    // Save hands straight off to the status bar rather than holding the screen.
    // The wait runs to ~48s at p95, and the bar already carries all of it — the
    // image upload, the publish, and "Changes published!" at the end — while a
    // failure brings this modal back with the work intact. There is nothing left
    // for a blocking dialog to add to that.
    //
    // No `resetForm()` here: the draft has to survive in case the publish fails
    // and the modal is reopened on it.
    void publish({ name: publishName, description: publishDescription, banner: banner.edit, avatar: avatar.edit });
    onOpenChange(false);
  };

  return (
    <Root open={open} onOpenChange={next => (next ? onOpenChange(true) : close())}>
      <Portal>
        <Overlay className="fixed inset-0 z-100 bg-text/20" />
        {/* This container spans the viewport and sits above the overlay, so a click
            on the backdrop lands here rather than "outside" the Radix content —
            `onPointerDownOutside` never fires. Closing on a click that reached the
            container itself restores the dismissal the design asks for.
            
            The press has to have *started* on the backdrop too. A click's target is
            the common ancestor of its pointerdown and pointerup, so drag-selecting
            text in a field and releasing past the card edge produces a click
            targeting this container — which would have thrown away everything typed
            with no confirmation. */}
        <Content
          onPointerDown={event => {
            pressStartedOnBackdrop.current = event.target === event.currentTarget;
          }}
          onClick={event => {
            if (event.target === event.currentTarget && pressStartedOnBackdrop.current) close();
          }}
          className="fixed inset-0 z-101 flex items-start justify-center overflow-y-auto focus:outline-hidden"
        >
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
              <div role="alert" className="mx-5 mb-4 flex items-start gap-2 rounded-lg bg-red-02 p-3">
                <div className="text-red-01">
                  <Warning />
                </div>
                <p className="text-metadata text-text">{errorMessage}</p>
              </div>
            )}

            {rejection && (
              <div role="alert" className="mx-5 mb-4 rounded-lg bg-red-02 p-3">
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
                <Input
                  value={name}
                  onChange={event => {
                    pristineRef.current.name = false;
                    setName(event.currentTarget.value);
                  }}
                  disabled={isPublishing}
                  placeholder="Your name"
                  required
                  aria-required="true"
                  aria-invalid={isNameMissing}
                  aria-describedby={isNameMissing ? 'edit-profile-name-error' : undefined}
                />
                {/* Name is the only thing that blocks Save. Without this the button
                    just sits disabled, which says nothing to anyone and nothing at
                    all to a screen reader. */}
                {isNameMissing && (
                  <span id="edit-profile-name-error" role="alert" className="text-footnote text-red-01">
                    Name is required.
                  </span>
                )}
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-metadataMedium text-grey-04">Description</span>
                <textarea
                  value={description}
                  onChange={event => {
                    pristineRef.current.description = false;
                    setDescription(event.currentTarget.value);
                  }}
                  disabled={isPublishing}
                  rows={3}
                  placeholder="A sentence about who you are and what you work on."
                  className={cx(inputStyles(), 'resize-none')}
                />
                <span className="text-footnote text-grey-04">Shown under your name across Geo.</span>
              </label>
            </div>

            <footer className="mt-5 flex items-center justify-between gap-3 border-t border-grey-02 px-5 py-4">
              {/* One line, carrying whatever the modal currently owes the reader:
                  why Save is dead, how long the wait is, or what a failure cost. */}
              <p className={cx('text-footnote', isUnavailable ? 'text-red-01' : 'text-grey-04')}>{footerNote}</p>
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
