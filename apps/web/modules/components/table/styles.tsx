import styled from '@emotion/styled';

export const EmptyTableText = styled.td(props => ({
  ...props.theme.typography.tableCell,
  padding: props.theme.space * 2.5,
}));

export const PageContainer = styled.div({
  display: 'flex',
  flexDirection: 'column',
});

export const PageNumberContainer = styled.div({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  alignSelf: 'flex-end',
});

export const Table = styled.table(props => ({
  width: '100%',
  borderStyle: 'hidden',
  borderCollapse: 'collapse',
  backgroundColor: props.theme.colors.white,
}));

export const TableHeader = styled.th<{ width: number }>(props => ({
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

// Negative margin so table row height matches a single line of text
export const ChipCellContainer = styled.div({
  margin: '-1px 0',
});
