import styled from '@emotion/styled';
import { Button } from '../design-system/button';
import { Copy } from '../design-system/icons/copy';
import { Entity } from '../design-system/icons/entity';
import { RightArrowLong } from '../design-system/icons/right-arrow-long';
import { Target } from '../design-system/icons/target';
import { Spacer } from '../design-system/spacer';

const Row = styled.div(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.space * 2,
}));

export function OboardingCarousel() {
  return (
    <Row>
      <Button icon="facts" variant="teriary">
        Collect data
      </Button>

      <RightArrowLong color="grey-04" />

      <Button variant="secondary">
        <Copy color="grey-04" />
        <Spacer width={8} />
        Organize data
      </Button>

      <RightArrowLong color="grey-04" />

      <Button variant="secondary">
        <Entity color="grey-04" />
        <Spacer width={8} />
        Empower communities
      </Button>

      <RightArrowLong color="grey-04" />

      <Button variant="secondary">
        <Target color="grey-04" />
        <Spacer width={8} />
        Solve real problems
      </Button>
    </Row>
  );
}
