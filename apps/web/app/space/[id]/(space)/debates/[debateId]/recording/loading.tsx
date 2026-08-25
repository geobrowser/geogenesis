import { Spinner } from '~/design-system/spinner';
import { Text } from '~/design-system/text';

/**
 * Without this, the `[debateId]` boundary one level up would serve the recording view too and
 * promise to open a debate room the viewer is not going into.
 */
export default function DebateRecordingLoading() {
  return (
    <div className="flex min-h-[calc(100dvh-2.75rem)] items-center justify-center px-5 py-8" role="status">
      <div className="flex items-center gap-3 rounded-lg border border-grey-02 bg-white px-5 py-4 shadow-light">
        <Spinner />
        <Text color="grey-04">Loading the recording…</Text>
      </div>
    </div>
  );
}
