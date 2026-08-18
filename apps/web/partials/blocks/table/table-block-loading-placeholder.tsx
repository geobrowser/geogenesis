import cx from 'classnames';

const DEFAULT_PLACEHOLDER_COLUMN_WIDTH = 880 / 3;

type TableBlockPlaceholderProps = {
  className?: string;
  columns?: number;
  rows?: number;
  shimmer?: boolean;
};

export function TableBlockLoadingPlaceholder({
  className = '',
  columns = 3,
  rows = 10,
  shimmer = true,
}: TableBlockPlaceholderProps) {
  const PLACEHOLDER_COLUMNS = Array.from({ length: columns }, (_, i) => `column-${i}`);
  const PLACEHOLDER_ROWS = Array.from({ length: rows }, (_, i) => `row-${i}`);

  return (
    <div className="overflow-hidden rounded-lg border border-grey-02 p-0">
      <div className={cx('overflow-x-clip rounded-lg', className)}>
        <table className="relative w-full border-collapse border-hidden bg-white" cellSpacing={0} cellPadding={0}>
          <thead>
            <tr>
              {PLACEHOLDER_COLUMNS.map(columnKey => (
                <th
                  key={columnKey}
                  className="lg:min-w-none border border-b-0 border-grey-02 p-[10px] text-left"
                  style={{ minWidth: DEFAULT_PLACEHOLDER_COLUMN_WIDTH }}
                >
                  <p className={cx('h-5 w-16 rounded-sm bg-divider align-middle', shimmer && 'animate-pulse')}></p>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PLACEHOLDER_ROWS.map(rowKey => (
              <tr key={rowKey}>
                {PLACEHOLDER_COLUMNS.map(columnKey => (
                  <td
                    key={`${rowKey}-${columnKey}`}
                    className={cx(
                      'border border-grey-02 bg-transparent p-[10px] align-top',
                      shimmer && 'animate-pulse'
                    )}
                  >
                    <p className="h-5 rounded-sm bg-divider" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
