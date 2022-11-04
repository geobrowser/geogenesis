import { useRouter } from 'next/router';
import { FormEvent } from 'react';
import { useSigner } from 'wagmi';
import { Space__factory } from '~/../../packages/contracts';
import { useAccessControl } from '~/modules/state/use-access-control';
import { useSpaces } from '~/modules/state/use-spaces';

export default function AccessControl() {
  const store = useSpaces();
  const router = useRouter();
  const { id: spaceId } = router.query as { id: string };
  const { isAdmin } = useAccessControl(spaceId);
  const { data: signer } = useSigner();

  const onSubmit = (type: 'editor' | 'admin') => async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const address = formData.get('address');

    if (signer) {
      const contract = Space__factory.connect(spaceId, signer);
      const roleToChange = type === 'editor' ? await contract.EDITOR_ROLE() : await contract.ADMIN_ROLE();
      const tx = await contract.grantRole(roleToChange, address as string);
      await tx.wait();
    }
  };

  const onRevoke = async (address: string, type: 'editor' | 'admin') => {
    if (signer) {
      const contract = Space__factory.connect(spaceId, signer);
      const roleToChange = type === 'editor' ? await contract.EDITOR_ROLE() : await contract.ADMIN_ROLE();
      const tx = await contract.revokeRole(roleToChange, address);
      await tx.wait();
    }
  };

  return isAdmin ? (
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
    </div>
  ) : (
    <h1>You must be an admin to add people to this Space</h1>
  );
}
