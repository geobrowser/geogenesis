import { useTheme } from '@emotion/react';
import { ColorName } from '~/modules/design-system/theme/colors';

interface Props {
  color?: ColorName;
}

export function Text({ color }: Props) {
  const theme = useTheme();
  const themeColor = color ? theme.colors[color] : 'currentColor';

  return (
    <svg width="16" height="17" viewBox="0 0 16 17" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M4.86209 3.5L0 13.3444H1.86903L2.83622 11.308H6.90104L7.86823 13.3444H9.72419L4.86209 3.5ZM4.86209 7.02789L6.2606 9.95914H3.47666L4.86209 7.02789Z"
        fill={themeColor}
      />
      <path
        d="M14.327 13.3444H16V9.14202C16 7.52075 14.9021 6.54799 13.1115 6.54799C12.2358 6.54799 11.3862 6.78145 10.8634 7.0668V8.57134C11.3993 8.26005 12.0397 8.02659 12.7455 8.02659C13.7519 8.02659 14.327 8.5454 14.327 9.21984V9.71271C14.0525 9.42737 13.4252 9.12905 12.6671 9.12905C11.2686 9.12905 10.1054 9.99805 10.1054 11.2821C10.1054 12.644 11.2686 13.5 12.6148 13.5C13.4513 13.5 14.0787 13.1498 14.327 12.8385V13.3444ZM14.3532 11.2821C14.3532 11.8917 13.6735 12.2289 13.0069 12.2289C12.3273 12.2289 11.6869 11.8917 11.6869 11.2821C11.6869 10.6725 12.3273 10.3223 13.0069 10.3223C13.6735 10.3223 14.3532 10.6725 14.3532 11.2821Z"
        fill={themeColor}
      />
    </svg>
  );
}
