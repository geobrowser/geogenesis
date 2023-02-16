import * as React from 'react';
import cx from 'classnames';

type EmptyTableTextProps = React.ComponentPropsWithoutRef<'td'>;

export const EmptyTableText = ({ className = '', ...rest }: EmptyTableTextProps) => (
  <td className={cx('p-2.5', className)} {...rest} />
);

type PageContainerProps = React.ComponentPropsWithoutRef<'div'>;

export const PageContainer = ({ className = '', ...rest }: PageContainerProps) => (
  <div className={cx('flex flex-col', className)} {...rest} />
);

type PageNumberContainerProps = React.ComponentPropsWithoutRef<'div'>;

export const PageNumberContainer = ({ className = '', ...rest }: PageNumberContainerProps) => (
  <div className={cx('flex items-center justify-end self-end', className)} {...rest} />
);

type TableProps = React.ComponentPropsWithoutRef<'table'>;

export const Table = ({ className = '', ...rest }: TableProps) => (
  <table className={cx('w-full border-collapse border-none bg-white', className)} {...rest} />
);

type TableHeaderProps = React.ComponentPropsWithoutRef<'th'> & { width: number };

export const TableHeader = ({ width, className = '', style = {}, ...rest }: TableHeaderProps) => (
  <th
    className={cx('border border-grey-02 p-2.5 text-left', className)}
    style={{ minWidth: width, ...style }}
    {...rest}
  />
);

type TableRowProps = React.ComponentPropsWithoutRef<'tr'>;

export const TableRow = ({ className = '', ...rest }: TableRowProps) => (
  <tr className={cx('hover:bg-bg', className)} {...rest} />
);
