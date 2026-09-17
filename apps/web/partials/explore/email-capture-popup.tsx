'use client';

import { usePrivy } from '@geogenesis/auth';

import * as React from 'react';

import cx from 'classnames';
import { useAtomValue } from 'jotai';

import { useDebatesHub } from '~/core/debates/matchmaking/use-debates-hub';
import { useAnyModalOpen } from '~/core/hooks/use-any-modal-open';
import { useDismissedNotice } from '~/core/hooks/use-dismissed-notice';
import { type NewsletterSubscribeResult, isLikelyEmail } from '~/core/newsletter/subscribe-result';
import { isChatOpenAtom } from '~/core/state/chat-store';
import { timeoutSignal } from '~/core/timeout-signal';

import { ClientOnly } from '~/design-system/client-only';
import { CloseSmall } from '~/design-system/icons/close-small';

import { entitySidePanelAtom } from '~/atoms';

/**
 * Persisted alongside the other one-time notices, which is what makes "dismissed" mean dismissed
 * rather than dismissed-until-reload. A popup that returns on every page load is worse than no
 * popup, and the same storage the welcome banner uses already answers that.
 */
const EMAIL_CAPTURE_ID = 'exploreEmailCapture';

/**
 * How far down the reader has to be before they are asked.
 *
 * Two viewport heights, not a pixel count: the feed is an infinite list whose length says nothing,
 * and a fixed pixel figure means something different on a laptop and a phone. Two screens is far
 * enough that they have scrolled past the fold deliberately and seen a dozen claims — which is the
 * point, since there is nothing to subscribe *for* until they have seen what this place publishes.
 */
const SCROLL_TRIGGER_VIEWPORTS = 2;

/**
 * The same guard the route puts on its own call to MailerLite, for the same reason: a request that
 * is accepted and never answered would otherwise leave this stuck in `submitting` with the button
 * disabled and no way forward. Longer than the route's own eight seconds on purpose — the server's
 * specific answer should win whenever it is coming, and this is only for when nothing is.
 */
const SUBMIT_TIMEOUT_MS = 15_000;

type Status = 'idle' | 'submitting' | 'done' | NewsletterSubscribeResult;

/**
 * Asks a logged-out reader for their email once they have scrolled the Explore feed (GEO-2925).
 *
 * `ClientOnly` for the same reason the welcome banner uses it: whether this has been dismissed, and
 * whether anyone is signed in, are both facts that only exist in the browser. Server-rendering a
 * popup that the reader has already closed would flash it back at them on every load.
 */
export function ExploreEmailCapturePopup() {
  return (
    <ClientOnly>
      <EmailCapturePopup />
    </ClientOnly>
  );
}

function EmailCapturePopup() {
  const { ready, authenticated, isModalOpen } = usePrivy();
  const isChatOpen = useAtomValue(isChatOpenAtom);
  const { isOpen: isDebatesHubOpen } = useDebatesHub();
  const entitySidePanelTarget = useAtomValue(entitySidePanelAtom);
  const { dismissed, remember: rememberDismissed } = useDismissedNotice(EMAIL_CAPTURE_ID);
  const [scrolledEnough, setScrolledEnough] = React.useState(false);
  const [email, setEmail] = React.useState('');
  const [status, setStatus] = React.useState<Status>('idle');
  // Separate from the persisted notice below. Subscribing *records* the dismissal so the popup does
  // not return next visit, but it must not close the card out from under the confirmation — so the
  // two are different acts: one remembers, one closes.
  const [closed, setClosed] = React.useState(false);

  // Watched only while the popup could still appear. The observer covers the whole body on a page
  // holding an infinite feed, so leaving it on after the card is dismissed, closed, or made moot by
  // signing in would keep scanning the document for every card the feed appends, to answer a
  // question that can no longer change anything. `status === 'done'` keeps it on through the
  // confirmation, which is still on screen and still owes the same precedence.
  const couldStillShow = scrolledEnough && !closed && ready && !authenticated && (!dismissed || status === 'done');
  const isAnyModalOpen = useAnyModalOpen(couldStillShow);

  // Anything the reader deliberately opened owns the screen until they close it, and this waits
  // rather than competing. Not a z-index rule: each of these is a surface someone chose to open,
  // and an unasked-for signup card over it is the worse interruption whichever draws on top.
  //
  // `useAnyModalOpen` is the general half, and it exists because the specific half kept losing.
  // This guard was built by naming surfaces one at a time and every round of review found another
  // — the sign-in prompt and global search were the fifth and sixth — which is the signal that
  // enumerating was the wrong method. Asking the document whether a modal is open covers those two
  // and whatever is added next, without anyone remembering to come back here.
  //
  // The named ones stay because none of them is a modal dialog and none would be caught:
  //
  //  - Privy's modal lives in its own portal and reports through `usePrivy`.
  //  - The chat panel shares this exact corner (`chat-panel.tsx` is `z-1100` at the same
  //    `fixed right-4 bottom-…`), so one above it covers its controls and takes their clicks.
  //  - The debates hub opens from the welcome banner on this very page. Its mobile sheet is
  //    `aria-modal` and would be caught; its desktop aside is deliberately a non-modal companion
  //    panel, carrying no dialog role, and would not.
  //  - The entity side panel is what every card title opens here (`titleOpensSidePanel`).
  //
  // All reactive, so the popup returns on its own once they close whichever it was.
  const anOverlayIsOpen =
    isModalOpen || isChatOpen || isDebatesHubOpen || entitySidePanelTarget !== null || isAnyModalOpen;

  React.useEffect(() => {
    if (authenticated || dismissed || scrolledEnough) return;

    const check = () => {
      if (window.scrollY >= window.innerHeight * SCROLL_TRIGGER_VIEWPORTS) setScrolledEnough(true);
    };

    // Checked once on mount as well as on scroll: a reader who returns to a restored scroll
    // position, or follows a link to an anchor, never fires a scroll event and would otherwise be
    // held below a threshold they are already past.
    check();
    window.addEventListener('scroll', check, { passive: true });
    return () => window.removeEventListener('scroll', check);
  }, [authenticated, dismissed, scrolledEnough]);

  /** What the close button does: remember it, and take it off the screen now. */
  const close = React.useCallback(() => {
    rememberDismissed();
    setClosed(true);
  }, [rememberDismissed]);

  const submit = React.useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!isLikelyEmail(email)) {
        setStatus('invalid-email');
        return;
      }

      setStatus('submitting');
      try {
        const response = await fetch('/api/newsletter/subscribe', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          // Names the surface so the signup is filed under its own group. The server resolves this
          // against a closed map; it is not a group name and cannot become one.
          body: JSON.stringify({ email, source: 'explore' }),
          signal: timeoutSignal(SUBMIT_TIMEOUT_MS),
        });
        const body = (await response.json()) as { result?: NewsletterSubscribeResult };
        if (body.result === 'subscribed') {
          setStatus('done');
          // Recorded, not closed. Having joined is the strongest reason not to ask again next
          // visit, but the confirmation still has to be readable — and still has to be closable,
          // which it was not while this called the same function the close button does.
          rememberDismissed();
          return;
        }
        setStatus(body.result ?? 'failed');
      } catch {
        setStatus('failed');
      }
    },
    [email, rememberDismissed]
  );

  // Signed in is never, not "not yet": the reader already has an account, and the list is for
  // people who do not. Unconditional, and deliberately outside the `done` exception below — an
  // earlier version let the success state bypass the whole eligibility check, so signing in while
  // the confirmation was open left a logged-out-only card sitting there for a logged-in reader.
  //
  // `ready` is what makes "signed in" true rather than nearly true. Privy reports
  // `authenticated: false` while it is still restoring a session from storage, so without it a
  // signed-in reader returning to a restored scroll position is briefly indistinguishable from an
  // anonymous one — long enough to be shown a signup card and to start typing into it before it
  // vanishes under them. `core/auth/use-sign-in-deep-link.ts` gates on `ready` for the same reason.
  if (closed || !ready || authenticated || !scrolledEnough || anOverlayIsOpen) return null;

  // Dismissal is the one thing the confirmation is exempt from, and only that. Subscribing records
  // the dismissal — which is what stops the popup returning next visit — and without this the same
  // write would unmount the card on the spot, so nobody would see the confirmation for the thing
  // they just did.
  if (dismissed && status !== 'done') return null;

  const errorMessage =
    status === 'invalid-email'
      ? 'That does not look like an email address.'
      : status === 'rate-limited'
        ? 'Too many tries from here. Please try again later.'
        : status === 'failed'
          ? 'Something went wrong. Try again in a moment.'
          : null;

  return (
    <div
      // A named `region` rather than a `dialog`. Nothing here asked to be opened, so the focus move
      // a dialog owes its reader would be an interruption mid-sentence — and a `dialog` that never
      // takes focus is the worst of both, promising behaviour that is not implemented. As a
      // landmark this is reachable by the same landmark navigation used to skip between page
      // sections, and it is mounted ahead of the feed (`explore-page.tsx`) so tabbing reaches it
      // early rather than after an infinite list, which is where it actually sits on screen.
      role="region"
      aria-label="Geo network launching soon"
      // Escape closes it, scoped to the card: while focus is inside, Escape is unambiguous. A
      // document listener would take the key from whatever else the reader is doing out in the feed.
      onKeyDown={event => {
        if (event.key === 'Escape') close();
      }}
      // `z-1101` is one above the chat launcher's `z-1100` (`partials/chat/chat-widget.tsx`), which
      // shares this corner: at `z-100` the assistant's button sat over the "Remind me" button and
      // took the click. Deliberately no higher — the slide-up, status bar and toast layers start at
      // 10000 and a dismissible prompt has no business outranking them.
      //
      // Below `sm` (max-width 639px here) it is the mobile frame (76376:22868) instead: a full-width
      // sheet on the bottom edge, top corners rounded, no shadow, with its own wider artwork.
      //
      // Rises 5px into place as it fades in, each time it mounts — including when it comes back after
      // an overlay closes. With reduced motion it only fades.
      className={cx(
        'fixed right-4 bottom-4 z-1101 w-[308px] animate-rise-in overflow-clip rounded-xl border border-grey-02 bg-white shadow-lg motion-reduce:animate-fade-in',
        'sm:inset-x-0 sm:bottom-0 sm:w-auto sm:rounded-none sm:rounded-t-xl sm:shadow-none'
      )}
    >
      <DesktopArtwork />
      <MobileArtwork />

      {/* The frame's 12px line close icon (76378:23346), 11px in from the top-right corner. The
          button is padded 4px past the glyph so the hit target is 20px rather than 12, with the
          offsets pulled in by the same 4px to keep the glyph where the design puts it. On the
          phone sheet the padding grows to 16px for a touch-sized target, offset so the glyph still
          lands where the mobile frame puts it, 11px in; the few pixels past the sheet's edge are
          clipped and cannot be tapped, which leaves about 39px. */}
      <button
        type="button"
        onClick={close}
        // Named, not just "Dismiss": the welcome banner sits on this same page with its own
        // dismiss button, and a list of controls reading "Dismiss" twice says nothing about which
        // notice either one closes. Matches how the banner names its own.
        aria-label="Dismiss newsletter signup"
        className="absolute top-[7px] right-[7px] z-20 p-1 text-grey-03 transition-colors duration-200 ease-in-out hover:text-text sm:top-[-5px] sm:right-[-5px] sm:p-4"
      >
        <CloseSmall />
      </button>

      {/* Spacing is the frame's, in padding-box coordinates: heading cap box at y=152, 15 tall;
          subtext at 175, 17 tall; form at 211, 62 tall; card ends at 300. Figma trims text to cap
          height, which CSS only does with `text-box-trim` — not dependable across browsers yet — so
          the leading is set to the design's box heights instead, which keeps the same rhythm.

          Mobile frame: heading at y=155, 16 tall; subtext at 179, 19 tall; a 394px form at 218,
          ending 49 above the sheet's bottom. The 20px gutters are not in the frame, which is drawn
          at 639 wide; they keep the form off the screen edge on a real phone, where it would
          otherwise run the full width once the viewport is narrower than 434px. */}
      <div className="px-5 pb-[27px] text-center sm:pb-[max(49px,env(safe-area-inset-bottom))]">
        {status === 'done' ? (
          // `role="status"` because submitting removes the button that had focus, so a reader who
          // is not watching this corner would otherwise get silence where the confirmation is. The
          // failure path has had `role="alert"` all along; this is the same courtesy for the case
          // that actually worked.
          <div role="status">
            <p className={HEADING_CLASS}>You are on the list.</p>
            <p className={SUBTEXT_CLASS}>We will be in touch about features, points, and the path to mainnet.</p>
          </div>
        ) : (
          // `noValidate`, and the field below is a text input rather than `type="email"`. Native
          // constraint validation blocks the submit event outright for a malformed address, so the
          // handler never runs and the reader gets a browser bubble instead of our message —
          // different wording in every browser, unstyleable, and gone the moment they look away.
          // `inputMode` and `autoComplete` keep the phone keyboard and the autofill that
          // `type="email"` was there for.
          <form onSubmit={submit} noValidate>
            <p className={HEADING_CLASS}>Geo network launching soon!</p>
            <p className={SUBTEXT_CLASS}>Get updates on features, points, and path to mainnet.</p>

            <div className="mt-[19px] flex flex-col gap-[6px] sm:mx-auto sm:mt-5 sm:max-w-[394px]">
              <input
                type="text"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={event => {
                  setEmail(event.currentTarget.value);
                  // Cleared on edit rather than on submit: the message is about what was typed, and
                  // leaving it under a field they are already fixing reads as a second complaint.
                  if (status !== 'idle' && status !== 'submitting') setStatus('idle');
                }}
                placeholder="Email..."
                aria-label="Email address"
                aria-invalid={status === 'invalid-email'}
                disabled={status === 'submitting'}
                className={cx(
                  'h-7 w-full min-w-0 rounded-full border bg-white px-3 text-left text-[17px] leading-[19px] text-text outline-hidden transition-colors placeholder:text-grey-03 disabled:text-grey-03 sm:text-center',
                  status === 'invalid-email' ? 'border-red-01' : 'border-grey-02 focus:border-text'
                )}
              />
              {/* Not the design-system `Button`: this one is a full pill at 28px on a dark fill,
                  which none of its variants draw — and `Button` also defaults to `type="button"`,
                  which inside a form is silently inert. */}
              <button
                type="submit"
                disabled={status === 'submitting'}
                className="inline-flex h-7 w-full items-center justify-center rounded-full bg-[#151515] px-2.5 text-[16px] leading-none tracking-[-0.35px] whitespace-nowrap text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {status === 'submitting' ? 'Subscribing…' : 'Subscribe'}
              </button>
            </div>

            {errorMessage ? (
              // `role="alert"` on the element rather than on `Text`, which takes no such prop —
              // and it is what makes a failure reach someone who is not watching this corner.
              <p role="alert" className="mt-2 text-[14px] tracking-[-0.35px] text-red-01">
                {errorMessage}
              </p>
            ) : null}
          </form>
        )}
      </div>
    </div>
  );
}

/**
 * 15px leading under 24px glyphs is the design's cap-height trim, and it only holds while the line
 * does not wrap. On the mobile frame the heading is 26px (16px trimmed) and 277 wide, inside a sheet
 * with 20px gutters, so it wraps below about 318px — a folded Galaxy Fold is 280 — at which point
 * the trimmed leading would put the second line inside the first. 28px clears it.
 */
const HEADING_CLASS =
  'text-[24px] leading-[15px] font-medium tracking-[-0.72px] text-[#151515] sm:text-[26px] sm:leading-[16px] sm:tracking-[-0.78px] sm:max-[319px]:leading-[28px]';

/** 14px on both layouts, the desktop frame's size. The mobile frame sets it at 16px; it was matched to desktop on request. */
const SUBTEXT_CLASS = 'mt-2 text-[14px] leading-[17px] tracking-[-0.42px] text-[rgba(21,21,21,0.7)]';

const ASSET = '/explore-email-capture';

/**
 * The knowledge-graph vignette from the design: entity cards joined by dashed edges and relation
 * tags. Built from the frames' own exported assets rather than flattened to one raster, so it stays
 * sharp at any pixel density and nothing else from the frame (text, the card's border) gets baked
 * in. Photos are downsized to 2x their drawn size.
 *
 * Every position is the frame's, in padding-box pixels. Figma rotates each element about the
 * centre of its unrotated box, which is what the outer flex wrapper plus inner `rotate` reproduces;
 * the card's `overflow-clip` trims whatever the design lets bleed off the edges.
 *
 * Desktop and mobile are separate compositions in Figma, not one scaled, so each is drawn as its
 * own tree and CSS shows one. `sm` is max-width here, so `sm:hidden` is the desktop one.
 */
function DesktopArtwork() {
  return (
    <div aria-hidden className="pointer-events-none relative h-[152px] select-none sm:hidden">
      <EntityCard
        box={[-33, -16, 54.698, 38.327]}
        rotate={7.92}
        size={[50.825, 31.624]}
        label="Person"
        className="opacity-30 blur-[3.5px]"
        radius={3.345}
      >
        <img src={`${ASSET}/person-faded.png`} alt="" className="absolute inset-0 size-full" />
      </EntityCard>
      <EntityCard box={[57.37, -22.02, 98.682, 71.43]} rotate={10.48} label="Health">
        <HealthPhoto />
      </EntityCard>
      <EntityCard box={[245.57, 28.06, 96.858, 67.868]} rotate={7.92} label="Culture">
        <CulturePhoto />
      </EntityCard>
      <EntityCard box={[129, 58, 95.344, 65.071]} rotate={-5.98} label="Philosophy">
        <PhilosophyPhoto />
      </EntityCard>
      <EntityCard box={[-29, 54, 95.202, 64.815]} rotate={-5.8} label="Person">
        <PersonIllustration />
      </EntityCard>

      <Edge src="edge-top.svg" className="top-[13px] left-[189px] h-[23.823px] w-[46.5px]" inset="-2.1% -1.08%" />
      <Edge src="edge-left.svg" className="top-[66.5px] left-[84.5px] h-[18.008px] w-[28px]" inset="-2.78% -1.79%" />
      <div className="absolute top-[90.05px] left-[286.74px] flex h-[24.341px] w-[76.007px] items-center justify-center">
        <div className="relative h-[23.823px] w-[75.846px] flex-none rotate-[-179.61deg]">
          <div className="absolute" style={{ inset: '-2.09% -0.66% -2.1% -0.66%' }}>
            <img src={`${ASSET}/edge-right.svg`} alt="" className="block size-full max-w-none" />
          </div>
        </div>
      </div>

      <Nodes positions={DESKTOP_NODES} />

      <RelationTag box={[186, 2, 29.27, 30.101]} rotate={46.68} label="Study" />
      <RelationTag box={[7, 29, 46.309, 20.297]} rotate={12.25} label="Related to" />
    </div>
  );
}

/**
 * The mobile frame's composition (76376:22868), 637px wide. It is centred in the sheet rather than
 * pinned left, so on a phone narrower than the frame it bleeds off both edges evenly — the frame
 * shows its full width only at 639px, the widest viewport this variant covers.
 */
function MobileArtwork() {
  return (
    <div aria-hidden className="pointer-events-none relative hidden h-[155px] overflow-clip select-none sm:block">
      <div className="absolute top-0 left-1/2 h-[155px] w-[637px] -translate-x-1/2">
        <EntityCard
          box={[80, -14, 54.698, 38.327]}
          rotate={7.92}
          size={[50.825, 31.624]}
          label="Person"
          className="opacity-30 blur-[3.5px]"
          radius={3.345}
        >
          <img src={`${ASSET}/person-faded.png`} alt="" className="absolute inset-0 size-full" />
        </EntityCard>
        <EntityCard
          box={[507, -22, 72.785, 53]}
          rotate={-10.96}
          size={[66.163, 41.168]}
          label="Culture"
          className="blur-[8.5px]"
          radius={6}
        >
          <img src={`${ASSET}/culture-faded.jpg`} alt="" className="absolute inset-0 size-full object-cover" />
        </EntityCard>
        <EntityCard box={[208.37, -22.02, 98.682, 71.43]} rotate={10.48} label="Health">
          <HealthPhoto />
        </EntityCard>
        <EntityCard box={[398.57, 26.06, 96.858, 67.868]} rotate={7.92} label="Culture">
          <CulturePhoto />
        </EntityCard>
        <EntityCard box={[280, 58, 95.344, 65.071]} rotate={-5.98} label="Philosophy">
          <PhilosophyPhoto />
        </EntityCard>
        <EntityCard box={[122, 54, 95.202, 64.815]} rotate={-5.8} label="Person">
          <PersonIllustration />
        </EntityCard>

        <Edge src="edge-top.svg" className="top-[13px] left-[340px] h-[23.823px] w-[46.5px]" inset="-2.1% -1.08%" />
        <Edge src="edge-left.svg" className="top-[66.5px] left-[235.5px] h-[18.008px] w-[28px]" inset="-2.78% -1.79%" />
        <div className="absolute top-[70.46px] left-[439.75px] flex h-[41.252px] w-[79.252px] items-center justify-center">
          <div className="relative h-[40.713px] w-[78.976px] flex-none rotate-[-179.61deg]">
            <div className="absolute" style={{ inset: '-1.23% -0.63%' }}>
              <img src={`${ASSET}/edge-right-mobile.svg`} alt="" className="block size-full max-w-none" />
            </div>
          </div>
        </div>

        <Nodes positions={MOBILE_NODES} />

        <RelationTag box={[337, 2, 29.27, 30.101]} rotate={46.68} label="Study" />
        <RelationTag box={[158, 29, 46.309, 20.297]} rotate={12.25} label="Related to" />
        <RelationTag box={[430, 3, 42.249, 17.572]} rotate={-9.43} label="Works at" />
      </div>
    </div>
  );
}

const DESKTOP_NODES: ReadonlyArray<readonly [number, number]> = [
  [235, 15],
  [271, 97],
  [181, 37],
  [69, 74],
  [106, 51],
];

const MOBILE_NODES: ReadonlyArray<readonly [number, number]> = [
  [386, 15],
  [424, 95],
  [512, 55],
  [332, 37],
  [220, 74],
  [257, 51],
];

function Nodes({ positions }: { positions: ReadonlyArray<readonly [number, number]> }) {
  return positions.map(([left, top]) => (
    <img
      key={`${left}-${top}`}
      src={`${ASSET}/node.svg`}
      alt=""
      className="absolute size-4 max-w-none"
      style={{ left, top }}
    />
  ));
}

function HealthPhoto() {
  return <img src={`${ASSET}/health.jpg`} alt="" className="absolute inset-0 size-full object-cover" />;
}

function CulturePhoto() {
  return (
    <>
      <div className="absolute inset-0 bg-[#d9d9d9]" />
      <img src={`${ASSET}/culture.jpg`} alt="" className="absolute inset-0 size-full object-cover" />
    </>
  );
}

function PhilosophyPhoto() {
  return <img src={`${ASSET}/philosophy.jpg`} alt="" className="absolute inset-0 size-full object-cover" />;
}

/**
 * The frame lays a 628x170 illustration over this card, counter-rotated so it sits level. Only a
 * sliver of it is ever visible, so the asset is that sliver: a 160x110 crop taken 110px in from the
 * illustration's left edge, rotated about the original centre.
 */
function PersonIllustration() {
  return (
    <img
      src={`${ASSET}/person.jpg`}
      alt=""
      className="absolute top-[-14.67px] left-[-35.24px] h-[110px] w-[160px] max-w-none origin-[204px_85px] rotate-[5.8deg]"
    />
  );
}

/** `[left, top, width, height]` of the rotated element's bounding box, as Figma reports it. */
type Box = readonly [number, number, number, number];

const boxStyle = ([left, top, width, height]: Box): React.CSSProperties => ({ left, top, width, height });

function EntityCard({
  box,
  rotate,
  size = [90, 56],
  label,
  className,
  radius = 5,
  children,
}: {
  box: Box;
  rotate: number;
  size?: readonly [number, number];
  label: string;
  /** Effects on the card itself: the background cards are blurred, and some faded. */
  className?: string;
  radius?: number;
  children: React.ReactNode;
}) {
  // The smaller background cards are the same 90px card drawn at a smaller size, so the label chip
  // scales with them.
  const scale = size[0] / 90;
  return (
    <div className="absolute flex items-center justify-center" style={boxStyle(box)}>
      <div className="flex-none" style={{ transform: `rotate(${rotate}deg)` }}>
        <div
          className={cx('relative overflow-clip', className)}
          style={{ width: size[0], height: size[1], borderRadius: radius }}
        >
          {children}
          <div
            className="absolute flex items-center justify-center bg-[rgba(21,21,21,0.4)] text-white"
            style={{
              left: 4 * scale,
              bottom: 4 * scale,
              padding: `${3 * scale}px ${4 * scale}px`,
              borderRadius: 2.23 * scale,
              backdropFilter: `blur(${4.46 * scale}px)`,
            }}
          >
            <span
              className="whitespace-nowrap"
              style={{
                fontFamily: 'var(--font-geist-medium)',
                fontSize: 7.804 * scale,
                lineHeight: `${8.919 * scale}px`,
                letterSpacing: -0.1561 * scale,
              }}
            >
              {label}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Edge({ src, className, inset }: { src: string; className: string; inset: string }) {
  return (
    <div className={cx('absolute', className)}>
      <div className="absolute" style={{ inset }}>
        <img src={`${ASSET}/${src}`} alt="" className="block size-full max-w-none" />
      </div>
    </div>
  );
}

function RelationTag({ box, rotate, label }: { box: Box; rotate: number; label: string }) {
  return (
    <div className="absolute flex items-center justify-center" style={boxStyle(box)}>
      <div
        className="flex flex-none items-center justify-center rounded-[9px] border border-[#a6a6a6] bg-white px-1.5 py-[3px]"
        style={{ transform: `rotate(${rotate}deg)` }}
      >
        <span
          className="whitespace-nowrap text-[#151515]"
          style={{ fontFamily: 'var(--font-geist-medium)', fontSize: 7, lineHeight: '9px', letterSpacing: -0.14 }}
        >
          {label}
        </span>
      </div>
    </div>
  );
}
