import { cachedFetchSpace } from '~/app/space/[id]/cached-fetch-space';
import { fetchSubtopics } from '~/core/io/subgraph/fetch-subtopics';
import { reportError } from '~/core/telemetry/logger';

import { SubtopicGallery } from '~/partials/space-page/subtopic-gallery';

type SubtopicGalleryServerContainerProps = {
  spaceId: string;
};

/**
 * The space overview's subtopic gallery, which is decoration: every path below returns `null` and
 * the page is expected to render without it.
 *
 * That matters because it used to be able to take the page down with it. `fetchSubtopics` throws on
 * *any* transport failure, this is an async Server Component, and nothing caught it — so a
 * transient upstream failure became an unhandled render error on the space page. GEOGENESIS-1T:
 * 1,945 of them since March, still ongoing on the current release, nearly all on `/root`. The
 * upstream says why in as many words elsewhere in the same project ("Service temporarily
 * unavailable due to database pressure; please retry", GEOGENESIS-9K/9J/7S), so this is a retryable
 * blip being treated as fatal.
 *
 * Lives here rather than inline in `page.tsx` so the degradation is testable — the page module
 * pulls in the whole editor surface, and this container is the unit that has to fail soft.
 */
export const SubtopicGalleryServerContainer = async ({ spaceId }: SubtopicGalleryServerContainerProps) => {
  const space = await cachedFetchSpace(spaceId);

  if (!space) {
    return null;
  }

  let subtopics: Awaited<ReturnType<typeof fetchSubtopics>>;
  try {
    subtopics = await fetchSubtopics(spaceId);
  } catch (error) {
    // Reported as handled: the signal is worth keeping, an unhandled render crash is not.
    reportError(error, { tags: { surface: 'subtopic-gallery' }, contexts: { space: { spaceId } } });
    return null;
  }

  if (subtopics.length === 0) {
    return null;
  }

  return <SubtopicGallery spaceId={spaceId} subtopics={subtopics} />;
};
