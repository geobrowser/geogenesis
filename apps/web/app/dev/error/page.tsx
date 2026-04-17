import { notFound } from 'next/navigation';

import { DevErrorPreview } from './preview';

export default function Page() {
  if (process.env.NEXT_PUBLIC_ENABLE_DEV_PREVIEWS !== '1') {
    notFound();
  }

  return <DevErrorPreview />;
}
