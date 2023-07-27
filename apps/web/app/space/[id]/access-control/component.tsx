'use client';

import { Space, Space__factory } from '@geogenesis/contracts';
import { useSearchParams } from 'next/navigation';

import * as React from 'react';
import { FormEvent } from 'react';

import { useSigner } from 'wagmi';

import { useAccessControl } from '~/core/hooks/use-access-control';
import { useSpaces } from '~/core/hooks/use-spaces';

type RoleType = 'editor' | 'admin' | 'editorController';

const getRole = (contract: Space, roleType: RoleType): Promise<string> => {
  switch (roleType) {
    case 'editor':
      return contract.EDITOR_ROLE();
    case 'editorController':
      return contract.EDITOR_CONTROLLER_ROLE();
    case 'admin':
      return contract.ADMIN_ROLE();
  }
};

export function Component() {
  const store = useSpaces();
  const searchParams = useSearchParams();
  const spaceId = searchParams?.get('id');

  console.log('spaceId', spaceId);

  const { isAdmin, isEditorController } = useAccessControl(spaceId);
  const { data: signer } = useSigner();

  const onSubmit = (type: RoleType) => async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const address = formData.get('address');

    if (signer && spaceId) {
      const contract = Space__factory.connect(spaceId, signer);
      const roleToChange = await getRole(contract, type);
      const tx = await contract.grantRole(roleToChange, address as string);
      await tx.wait();
    }
  };

  const onRevoke = async (address: string, type: RoleType) => {
    if (signer && spaceId) {
      const contract = Space__factory.connect(spaceId, signer);
      const roleToChange = await getRole(contract, type);
      const tx = await contract.revokeRole(roleToChange, address);
      await tx.wait();
    }
  };

  if (!(isAdmin || isEditorController)) {
    return <h1>You must be an admin or editor controller to add people to this Space</h1>;
  }

  return (
    <div>
      <form onSubmit={onSubmit('editor')}>
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
              <button onClick={() => onRevoke(editor, 'editor')}>Revoke</button>
            </li>
          ))}
      </ul>

      {isAdmin && (
        <>
          <hr style={{ width: '100%', borderBottom: '1px solid grey', margin: '32px 0px' }} />

          <form onSubmit={onSubmit('editorController')}>
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
                  <button onClick={() => onRevoke(editorController, 'editorController')}>Revoke</button>
                </li>
              ))}
          </ul>

          <hr style={{ width: '100%', borderBottom: '1px solid grey', margin: '32px 0px' }} />

          <h1 style={{ color: 'red' }}>
            DANGER: ADDING ADMINS GIVES THEM PERMISSIONS TO ADD ADMINS AND EDITORS. THERE BE DRAGONS.
          </h1>
          <form onSubmit={onSubmit('admin')}>
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
                  <button onClick={() => onRevoke(admin, 'admin')}>Revoke</button>
                </li>
              ))}
          </ul>
        </>
      )}
    </div>
  );
}
