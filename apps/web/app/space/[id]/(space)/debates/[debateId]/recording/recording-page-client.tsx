'use client';

import * as React from 'react';

import { useDebate, useDebateMediaArtifactUrl } from '~/core/debates/hooks';

import { Text } from '~/design-system/text';

export function PublicDebateRecordingClient({ debateId }: { debateId: string }) {
  const debateQuery = useDebate(debateId, true);
  const artifactUrl = useDebateMediaArtifactUrl();
  const [videoUrl, setVideoUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    artifactUrl.mutate(
      { debateId, request: { kind: 'final_video' } },
      {
        onSuccess: response => {
          if (active) setVideoUrl(response.upload.url);
        },
      }
    );
    return () => {
      active = false;
    };
  }, [debateId]);

  return (
    <div className="mx-auto grid min-h-[calc(100dvh-5rem)] w-full max-w-[760px] content-center px-4 py-8">
      <header className="mb-5 text-center">
        <Text as="div" variant="body" color="grey-04">
          Debate recording
        </Text>
        <h1 className="mx-auto mt-2 max-w-[680px] text-[1.75rem] leading-tight font-semibold">
          {debateQuery.data?.claim.claim ?? 'Geo debate'}
        </h1>
      </header>
      {videoUrl ? (
        <video
          src={videoUrl}
          controls
          playsInline
          autoPlay
          className="mx-auto aspect-[27/41] w-full max-w-[49.4dvh] rounded-lg bg-transparent object-contain shadow-card"
        />
      ) : artifactUrl.error instanceof Error ? (
        <div className="rounded-lg border border-red-01 bg-white p-5 text-center">
          <Text color="red-01">{artifactUrl.error.message}</Text>
        </div>
      ) : (
        <div className="rounded-lg border border-grey-02 bg-white p-5 text-center">
          <Text color="grey-04">Loading recording...</Text>
        </div>
      )}
    </div>
  );
}
