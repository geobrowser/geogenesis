import { SlideUp } from '~/design-system/slide-up';

// these will come from the context in a store

interface Props {
  isMoveReviewOpen: boolean;
  setIsMoveReviewOpen: (isMoveReviewOpen: boolean) => void;
}

export const MoveEntityReview = ({ isMoveReviewOpen, setIsMoveReviewOpen }: Props) => {
  return (
    <SlideUp isOpen={isMoveReviewOpen} setIsOpen={setIsMoveReviewOpen}>
      <div>
        <p>test</p>
      </div>
    </SlideUp>
  );
};
