import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';

import { resolveSpaceImage, type SpaceImageRelationNode } from './space-image';

export const MAX_TOPIC_USAGE_AVATARS = 3;
export const PLACEHOLDER_TOPIC_NAME = 'Untitled';

export interface TopicUsageSpaceNode {
  id: string;
  page: {
    name: string | null;
    relationsList: SpaceImageRelationNode[];
  } | null;
}

export interface TopicUsage {
  id: string;
  name: string;
  spaces: {
    id: string;
    name: string;
    image: string;
  }[];
  spacesCount: number;
}

function isPlaceholderName(name: string) {
  return name === PLACEHOLDER_TOPIC_NAME;
}

function isPlaceholderImage(image: string) {
  return image === PLACEHOLDER_SPACE_IMAGE;
}

function toUsageSpace(space: TopicUsageSpaceNode): TopicUsage['spaces'][number] {
  return {
    id: space.id,
    name: space.page?.name ?? PLACEHOLDER_TOPIC_NAME,
    image: resolveSpaceImage(space.page?.relationsList ?? []),
  };
}

export function mergeTopicUsageSpaces(spaces: TopicUsageSpaceNode[]) {
  const spacesById = new Map<string, TopicUsage['spaces'][number]>();

  for (const space of spaces) {
    const nextSpace = toUsageSpace(space);
    const existingSpace = spacesById.get(space.id);

    if (!existingSpace) {
      spacesById.set(space.id, nextSpace);
      continue;
    }

    spacesById.set(space.id, {
      id: existingSpace.id,
      name:
        isPlaceholderName(existingSpace.name) && !isPlaceholderName(nextSpace.name)
          ? nextSpace.name
          : existingSpace.name,
      image:
        isPlaceholderImage(existingSpace.image) && !isPlaceholderImage(nextSpace.image)
          ? nextSpace.image
          : existingSpace.image,
    });
  }

  return Array.from(spacesById.values()).slice(0, MAX_TOPIC_USAGE_AVATARS);
}
