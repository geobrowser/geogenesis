import styled from '@emotion/styled';

export const TableHeaderContainer = styled.div({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  width: '100%',
});

export const SpaceInfo = styled.div(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.space * 5,
}));

export const PageContainer = styled.div({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
});

export const Actions = styled.div({
  display: 'flex',
  alignItems: 'center',
});

export const PageNumberContainer = styled.div({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  alignSelf: 'flex-end',
});

export const SpaceImageContainer = styled.div(props => ({
  // this is required for next/image
  // https://nextjs.org/docs/api-reference/next/image#fill
  position: 'relative',
  overflow: 'hidden',
  borderRadius: props.theme.radius * 2,
  width: props.theme.space * 14,
  height: props.theme.space * 14,
}));
