import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAccessControl } from '~/modules/auth/use-access-control';
import { Button } from '~/modules/design-system/button';
import { Spacer } from '~/modules/design-system/spacer';
import { TabLink } from '~/modules/design-system/tab-link';
import { useEditable } from '~/modules/stores/use-editable';
import { NavUtils } from '~/modules/utils';

interface Props {
  spaceId: string;
}

const SpaceActions = ({ spaceId }: Props) => {
  const { isEditor, isAdmin, isEditorController } = useAccessControl(spaceId);
  const { editable } = useEditable();

  return (
    <div className="flex items-center">
      {(isEditor || isAdmin || isEditorController) && editable && (
        <div className="flex items-center justify-between w-full">
          {(isEditorController || isAdmin) && (
            <Link href={`/space/${spaceId}/access-control`}>
              <Button variant="secondary">Devvy Admin</Button>
            </Link>
          )}
          {isAdmin && isEditor && <Spacer width={8} />}
          {isEditor && (
            <>
              <Spacer width={12} />
              <Link href={NavUtils.toCreateEntity(spaceId)} passHref>
                <a>
                  <Button icon="create">New entity</Button>
                </a>
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export const SpaceNavbar = ({ spaceId }: Props) => {
  const { route, query } = useRouter();

  const tabEntitiesSelected = !route.includes('/triples');
  const tabTriplesSelected = route.includes('/triples');

  const tabs = [
    {
      name: 'Entities',
      href: `/space/${spaceId}`,
      selected: tabEntitiesSelected,
    },
    {
      name: 'Triples',
      href: `/space/${query.id}/triples`,
      selected: tabTriplesSelected,
    },
  ];

  return (
    <div className="flex items-center justify-between w-full h-9">
      <div className="flex items-center gap-4">
        {tabs.map(tab => (
          <TabLink key={tab.name} href={tab.href} isActive={tab.selected}>
            {tab.name}
          </TabLink>
        ))}
      </div>
      <SpaceActions spaceId={spaceId} />
    </div>
  );
};
