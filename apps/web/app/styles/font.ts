import localFont from 'next/font/local';

export const calibre = localFont({
  variable: '--font-calibre',
  src: [
    {
      path: './fonts/calibre-regular.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: './fonts/calibre-medium.woff2',
      weight: '500',
      style: 'normal',
    },
    {
      path: './fonts/calibre-semibold.woff2',
      weight: '600',
      style: 'normal',
    },
    {
      path: './fonts/calibre-bold.woff2',
      weight: '700',
      style: 'normal',
    },
  ],
});
