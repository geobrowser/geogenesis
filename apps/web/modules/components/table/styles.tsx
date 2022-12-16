import styled from '@emotion/styled';

export const SpaceHeaderContainer = styled.div({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  width: '100%',
});

export const EmptyTableText = styled.td(props => ({
  ...props.theme.typography.tableCell,
  padding: props.theme.space * 2.5,
}));

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

export const Table = styled.table(props => ({
  width: '100%',
  borderStyle: 'hidden',
  borderCollapse: 'collapse',
  backgroundColor: props.theme.colors.white,
}));

export const SpaceHeader = styled.th<{ width: number }>(props => ({
  border: `1px solid ${props.theme.colors['grey-02']}`,
  padding: props.theme.space * 2.5,
  textAlign: 'left',
  width: props.width,
}));

export const TableRow = styled.tr(props => ({
  ':hover': {
    backgroundColor: props.theme.colors.bg,
  },
}));

// Using a container to wrap the table to make styling borders around
// the table easier. Otherwise we need to do some pseudoselector shenanigans
// or use box-shadow instead of border.
export const Container = styled.div(props => ({
  padding: 0,
  border: `1px solid ${props.theme.colors['grey-02']}`,
  borderRadius: props.theme.radius,
  overflow: 'hidden',
}));

// Negative margin so table row height matches a single line of text
export const ChipCellContainer = styled.div({
  margin: '-1px 0',
});
