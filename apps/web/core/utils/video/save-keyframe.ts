import { KEY_FRAME_IMAGE_PROPERTY } from '~/core/constants';

import { extractVideoKeyframe } from './extract-keyframe';

type LinkImage = (params: {
  file: File;
  fromEntityId: string;
  fromEntityName?: string | null;
  relationPropertyId: string;
  relationPropertyName: string | null;
  spaceId: string;
}) => Promise<{ imageId: string; relationId: string }>;

/**
 * Extract a still keyframe from `file` and link it onto the video entity's Key frame
 * (Image renderable) property via the caller's image `link` mutator. Fire-and-forget:
 * returns immediately and never throws, so a slow or broken keyframe (extraction can run
 * to its timeout) never holds up or fails the video save.
 */
export function saveVideoKeyframe(
  file: File,
  { fromEntityId, spaceId, link }: { fromEntityId: string; spaceId: string; link: LinkImage }
): void {
  void (async () => {
    try {
      const keyframe = await extractVideoKeyframe(file);
      if (keyframe) {
        await link({
          file: keyframe,
          fromEntityId,
          fromEntityName: null,
          relationPropertyId: KEY_FRAME_IMAGE_PROPERTY,
          relationPropertyName: 'Key frame',
          spaceId,
        });
      }
    } catch (error) {
      console.warn('Failed to save video keyframe', error);
    }
  })();
}
