'use client';

import { useParams } from 'next/navigation';

import * as React from 'react';
import { FormEvent } from 'react';

import { useWalletClient } from 'wagmi';

import { useAccessControl } from '~/core/hooks/use-access-control';
import { useSpaces } from '~/core/hooks/use-spaces';
import { Publish } from '~/core/io';

type RoleType = 'EDITOR_ROLE' | 'ADMIN_ROLE' | 'EDITOR_CONTROLLER_ROLE';

export const runtime = 'edge';

export default function AccessControl() {
  const store = useSpaces();
  const params = useParams();
  const spaceId = params?.['id'] as string | undefined;

  const { isAdmin, isEditorController } = useAccessControl(spaceId);
  const { data: wallet } = useWalletClient();

  const onSubmit = (type: RoleType) => async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const address = formData.get('address');

    if (wallet && spaceId && address) {
      const roleToChange = await Publish.getRole(spaceId, type);
      await Publish.grantRole({ spaceId, role: roleToChange, wallet, userAddress: address as string });
    }
  };

  const onRevoke = async (address: string, type: RoleType) => {
    if (wallet && spaceId && address) {
      const roleToChange = await Publish.getRole(spaceId, type);
      await Publish.revokeRole({ spaceId, role: roleToChange, wallet, userAddress: address as string });
    }
  };

  if (!(isAdmin || isEditorController)) {
    return <h1>You must be an admin or editor controller to add people to this Space</h1>;
  }

  return (
    <div>
      <form onSubmit={onSubmit('EDITOR_ROLE')}>
        <input name="address" placeholder="Editor address..." />
        <button>Add editor</button>
      </form>

      <h1 style={{ marginTop: 16 }}>Editors</h1>
      <ul>
        {store.spaces
          .find(space => space.id == spaceId)
          ?.editors.map(editor => (
            <li key={editor}>
              <span>{editor}</span>
              <button onClick={() => onRevoke(editor, 'EDITOR_ROLE')}>Revoke</button>
            </li>
          ))}
      </ul>

      {isAdmin && (
        <>
          <hr style={{ width: '100%', borderBottom: '1px solid grey', margin: '32px 0px' }} />

          <form onSubmit={onSubmit('EDITOR_CONTROLLER_ROLE')}>
            <input name="address" placeholder="Editor controller address..." />
            <button>Add editor controller</button>
          </form>

          <h1 style={{ marginTop: 16 }}>Editor Controllers</h1>
          <p>This role can add and remove other editors</p>
          <ul>
            {store.spaces
              .find(space => space.id == spaceId)
              ?.editorControllers.map(editorController => (
                <li key={editorController}>
                  <span>{editorController}</span>
                  <button onClick={() => onRevoke(editorController, 'EDITOR_CONTROLLER_ROLE')}>Revoke</button>
                </li>
              ))}
          </ul>

          <hr style={{ width: '100%', borderBottom: '1px solid grey', margin: '32px 0px' }} />

          <h1 style={{ color: 'red' }}>
            DANGER: ADDING ADMINS GIVES THEM PERMISSIONS TO ADD ADMINS AND EDITORS. THERE BE DRAGONS.
          </h1>
          <form onSubmit={onSubmit('ADMIN_ROLE')}>
            <input name="address" placeholder="Admin address..." />
            <button>Add admin</button>
          </form>

          <h1 style={{ marginTop: 16 }}>Admins</h1>
          <ul>
            {store.spaces
              .find(space => space.id == spaceId)
              ?.admins.map(admin => (
                <li key={admin}>
                  <span>{admin}</span>
                  <button onClick={() => onRevoke(admin, 'ADMIN_ROLE')}>Revoke</button>
                </li>
              ))}
          </ul>
        </>
      )}
    </div>
  );
}
