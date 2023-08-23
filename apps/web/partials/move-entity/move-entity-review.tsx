import { useMoveEntity } from '~/core/state/move-entity-store';

import { SlideUp } from '~/design-system/slide-up';

// these will come from the context in a store

export const MoveEntityReview = () => {
  const { isMoveReviewOpen, setIsMoveReviewOpen } = useMoveEntity();
  return (
    <SlideUp isOpen={isMoveReviewOpen} setIsOpen={setIsMoveReviewOpen}>
      <div>
        <p>test, opening from context store</p>
      </div>
    </SlideUp>
  );
};
