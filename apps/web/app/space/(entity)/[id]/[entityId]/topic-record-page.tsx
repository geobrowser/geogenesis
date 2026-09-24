import { TOPIC_TYPE_ID } from '~/core/constants';

import { EntityRecordPage, type EntityRecordPageProps } from './entity-record-page';

export type TopicRecordPageProps = EntityRecordPageProps;

export function TopicRecordPage(props: TopicRecordPageProps) {
  return <EntityRecordPage {...props} requiredTypeId={TOPIC_TYPE_ID} />;
}
