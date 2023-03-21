'use client';

import { Analytics } from '@vercel/analytics/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Action, useActionsStore } from '~/modules/action';
import { useAccessControl } from '~/modules/auth/use-access-control';
import { FlowBar } from '~/modules/components/flow-bar';
import { Navbar } from '~/modules/components/navbar/navbar';
import { useKeyboardShortcuts } from '~/modules/hooks/use-keyboard-shortcuts';
import { OnboardingDialog } from '~/modules/onboarding/dialog';
import { Dialog } from '~/modules/search';
import { useEditable } from '~/modules/stores/use-editable';
import { NavUtils } from '~/modules/utils';

export function App({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  const { setEditable, editable } = useEditable();
  // @TODO: Fix parsing segment from URL to pass to useAccessControl
  const { isEditor, isAdmin, isEditorController } = useAccessControl();
  const [open, setOpen] = useState(false);

  useKeyboardShortcuts(
    [
      // Toggle the menu when ⌘ + / is pressed
      {
        key: '/',
        callback: () => setOpen(open => !open),
      },
      // Toggle edit mode when ⌘ + e is pressed
      {
        key: 'e',
        callback: () => {
          if (isEditor || isAdmin || isEditorController) setEditable(!editable);
        },
      },
    ],
    [editable, open, isEditor]
  );

  return (
    <>
      <Navbar onSearchClick={() => setOpen(true)} />
      <OnboardingDialog />
      <Dialog
        open={open}
        onOpenChange={setOpen}
        onDone={result => {
          if (!result?.nameTripleSpace) return;

          router.push(NavUtils.toEntity(result.nameTripleSpace, result.id));
          setOpen(false);
        }}
        spaceId=""
      />
      <main className="mx-auto max-w-[1200px] pt-10 pb-20 xl:pt-[40px] xl:pr-[2ch] xl:pb-[4ch] xl:pl-[2ch]">
        {children}
        <Analytics />
      </main>
      {/* @TODO: Pass correct spaceId */}
      <GlobalFlowBar spaceId={''} />
    </>
  );
}

function GlobalFlowBar({ spaceId }: { spaceId: string }) {
  const { actions, publish, clear } = useActionsStore(spaceId);

  return (
    <div className="relative flex flex-col items-center">
      <FlowBar actions={Action.unpublishedChanges(actions)} onClear={clear} onPublish={publish} spaceId={spaceId} />
    </div>
  );
}
