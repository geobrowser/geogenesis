import { useMergeEntity } from '~/core/state/merge-entity-store';

import { Button, SquareButton } from '~/design-system/button';
import { SlideUp } from '~/design-system/slide-up';
import { Text } from '~/design-system/text';

export function MergeEntityReview() {
  const { isMergeReviewOpen, setIsMergeReviewOpen } = useMergeEntity();
  return (
    <SlideUp isOpen={isMergeReviewOpen} setIsOpen={setIsMergeReviewOpen}>
      <div className="h-full overflow-y-auto overscroll-contain">
        <MergeEntityReviewChanges />
      </div>
    </SlideUp>
  );
}

function MergeEntityReviewChanges() {
  const { setIsMergeReviewOpen, entityIdOne, entityIdTwo } = useMergeEntity();
  console.log(`entityIdOne: ${entityIdOne} - entityIdTwo: ${entityIdTwo}`);
  return (
    <div className="flex w-full items-center justify-between gap-1 bg-white py-1 px-4 shadow-big md:py-3 md:px-4">
      <div className="inline-flex items-center gap-4">
        <SquareButton onClick={() => setIsMergeReviewOpen(false)} icon="close" />
        <Text variant="metadataMedium">Merge entities</Text>
      </div>
      <div>
        <Button onClick={() => console.log('review')}>Review</Button>
      </div>
    </div>
  );
}
