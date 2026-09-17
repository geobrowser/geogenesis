import { Spinner } from '~/design-system/spinner';
import { Text } from '~/design-system/text';

/** In-page loading card. Shared with the room's route `loading.tsx` so both render identically. */
export function DebateRoomLoadingState() {
  return (
    <div className="flex min-h-[calc(100dvh-2.75rem)] items-center justify-center px-5 py-8" role="status">
      <div className="flex items-center gap-3 rounded-lg border border-grey-02 bg-white px-5 py-4 shadow-light">
        <Spinner />
        <Text color="grey-04">Opening your debate room…</Text>
      </div>
    </div>
  );
}

/**
 * Full-screen placeholder for the gaps between the room's full-screen views. It covers the app
 * shell the same way the intro and recording views do.
 */
export function DebateRoomHoldingScreen({ label, claim }: { label: string; claim?: string }) {
  return (
    <div
      role="status"
      aria-label={label}
      className="fixed inset-0 z-[1000] flex flex-col items-center justify-center gap-5 bg-white px-5 py-8 text-center text-text"
    >
      {claim && <h1 className="max-w-[390px] text-[1.375rem] leading-[1.1] font-semibold text-text">{claim}</h1>}
      <Spinner />
    </div>
  );
}
