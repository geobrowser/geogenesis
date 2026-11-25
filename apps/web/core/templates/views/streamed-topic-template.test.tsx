// @vitest-environment node
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { renderToReadableStream } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { QuerySeedEntry } from '~/core/query-seed';

import { StreamedLiveTopicTemplateView, TopicTemplateSeedProvider } from './streamed-topic-template';

// The live view reads a dozen hooks; this stand-in draws only what the seed decides: the sections
// when their key is seeded, a skeleton when it is not.
vi.mock('./live-topic-template-view', () => ({
  LiveTopicTemplateView: ({ entityId, awaitingSeed }: { entityId: string; awaitingSeed?: boolean }) => {
    const rows = useQueryClient().getQueryData<string[]>(['sections', entityId]);
    // `awaiting` marks the view that must not read the feeds itself: the seed is on its way.
    return <section>{rows ? `sections:${rows.join(',')}` : awaitingSeed ? 'skeleton awaiting' : 'skeleton'}</section>;
  },
}));

const TOPIC = 'topic-1';

async function readAll(stream: ReadableStream<Uint8Array>, onChunk: (html: string) => void) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let html = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return html;
    html += decoder.decode(value, { stream: true });
    onChunk(html);
  }
}

// A host element at the root, as the real page has <html>: React holds back a stream whose root is
// only components and text until the whole tree is ready, which would hide the streaming.
function page(entries: Promise<QuerySeedEntry[]>, entityId = TOPIC) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      <TopicTemplateSeedProvider entityId={TOPIC} entries={entries}>
        <main>
          <h1>Topic title</h1>
          <StreamedLiveTopicTemplateView entityId={entityId} spaceId="space-1" />
        </main>
      </TopicTemplateSeedProvider>
    </QueryClientProvider>
  );
}

describe('StreamedLiveTopicTemplateView', () => {
  it('sends the page before the seed answers, then streams the seeded sections into it', async () => {
    let answer!: (entries: QuerySeedEntry[]) => void;
    const entries = new Promise<QuerySeedEntry[]>(resolve => {
      answer = resolve;
    });

    let beforeAnswer = '';
    const stream = await renderToReadableStream(page(entries));
    const done = readAll(stream, html => {
      beforeAnswer = html;
    });
    await new Promise(resolve => setTimeout(resolve, 50));
    const sentBeforeAnswer = beforeAnswer;
    answer([{ queryKey: ['sections', TOPIC], data: ['a', 'b'] }]);
    const html = await done;

    // The shell was out while the seed was still pending: title and section skeletons, no sections.
    expect(sentBeforeAnswer).toContain('Topic title');
    expect(sentBeforeAnswer).toContain('skeleton awaiting');
    expect(sentBeforeAnswer).not.toContain('sections:');
    // Then the seeded sections streamed into the same response.
    expect(html).toContain('sections:a,b');
  });

  it('draws the plain view for another entity, without waiting on this page’s seed', async () => {
    const never = new Promise<QuerySeedEntry[]>(() => {});
    const stream = await renderToReadableStream(page(never, 'other-topic'));
    const html = await readAll(stream, () => {});
    expect(html).toContain('skeleton');
    expect(html).not.toContain('awaiting');
    expect(html).not.toContain('<template');
  });

  it('falls back to the unseeded view when the seed has nothing', async () => {
    const stream = await renderToReadableStream(page(Promise.resolve([])));
    const html = await readAll(stream, () => {});
    expect(html).toContain('skeleton');
    expect(html).not.toContain('sections:');
    // The view that replaced the fallback reads the feeds itself.
    expect(html.slice(html.lastIndexOf('<section'))).not.toContain('awaiting');
  });
});
