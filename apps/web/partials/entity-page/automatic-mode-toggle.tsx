'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { useEffect } from 'react';

import { useEditable } from '~/core/state/editable-store';

export const AutomaticModeToggle = () => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const shouldStartInEditMode = searchParams?.get('edit') === 'true';

  const { editable, setEditable } = useEditable();

  useEffect(() => {
    if (!editable && shouldStartInEditMode) {
      setTimeout(() => {
        const newSearchParams = new URLSearchParams(searchParams?.toString());
        newSearchParams.delete('edit');
        const newSearchString = newSearchParams.toString();
        const queryString = newSearchString ? `?${newSearchString}` : '';
        router.push(`${pathname}${queryString}`);
        setEditable(true);
      }, 500);
    }
  }, [editable, pathname, router, searchParams, setEditable, shouldStartInEditMode]);

  return null;
};
