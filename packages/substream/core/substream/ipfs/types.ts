import type { EditPublishedEvent } from '../parser';
import type { BlockEvent } from '~/core/types';

export type IpfsCacheQueueItem = { block: BlockEvent } & EditPublishedEvent;
