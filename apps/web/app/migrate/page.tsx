'use client';

import { useMigrateHub } from '~/core/migrate/migrate';

export default function MigratePage() {
  const hub = useMigrateHub();

  const onMigrate = () => {
    hub.migrate({
      type: 'DELETE_ENTITY',
      payload: {
        entityId: '5fb965b5-7dcf-4eb7-883b-0279470b8686',
      },
    });
  };

  return (
    <div>
      <h1>Migrate Page</h1>
      <button onClick={onMigrate}>Migrate</button>
    </div>
  );
}
