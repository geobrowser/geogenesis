'use client';

import { useValues } from '~/core/sync/use-store';

export function useImageUrlFromEntity(imageEntityId: string | undefined, spaceId: string): string | undefined {
  const imageValues = useValues({
    selector: v => v.entity.id === imageEntityId && v.spaceId === spaceId,
  });

  if (!imageEntityId || imageValues.length === 0) return undefined;

  // Find the first value that is a string starting with 'ipfs://'
  const imageUrlValue = imageValues.find(v => typeof v.value === 'string' && v.value.startsWith('ipfs://'));

  return imageUrlValue?.value;
}

export function useVideoUrlFromEntity(videoEntityId: string | undefined, spaceId: string): string | undefined {
  const videoValues = useValues({
    selector: v => v.entity.id === videoEntityId && v.spaceId === spaceId,
  });

  if (!videoEntityId || videoValues.length === 0) return undefined;

  // Find the first value that is a string starting with 'ipfs://'
  const videoUrlValue = videoValues.find(v => typeof v.value === 'string' && v.value.startsWith('ipfs://'));

  return videoUrlValue?.value;
}
