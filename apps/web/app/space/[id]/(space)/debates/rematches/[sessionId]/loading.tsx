import { Spinner } from '~/design-system/spinner';
import { Text } from '~/design-system/text';

export default function DebateRematchLoading() {
  return (
    <div className="flex min-h-[calc(100dvh-2.75rem)] items-center justify-center px-5 py-8" role="status">
      <div className="flex items-center gap-3 rounded-lg border border-grey-02 bg-white px-5 py-4 shadow-light">
        <Spinner />
        <Text color="grey-04">Opening debate-again choices…</Text>
      </div>
    </div>
  );
}
