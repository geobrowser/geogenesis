import * as React from 'react';

type Props = React.ComponentPropsWithoutRef<'div'> & {
  height?: number;
  width?: number;
};

export function Spacer({ height = 0, width = 0, style = {}, ...rest }: Props) {
  return <div style={{ height, width, ...style }} {...rest} />;
}
