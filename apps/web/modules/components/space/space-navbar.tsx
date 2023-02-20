import styled from '@emotion/styled';
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

const Actions = styled.div({
  display: 'flex',
  alignItems: 'center',
});

const NavbarContainer = styled.div({
  display: 'flex',
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'center',
  width: '100%',
});

const TabLinksContainer = styled.div(props => ({
  display: 'flex',
  alignItems: 'center',
  flexDirection: 'row',
  gap: props.theme.space * 4,
}));

export const SpaceActions = ({ spaceId }: Props) => {
  const { isEditor, isAdmin, isEditorController } = useAccessControl(spaceId);
  const { editable } = useEditable();

  return (
    <Actions>
      {(isEditor || isAdmin || isEditorController) && editable && (
        <NavbarContainer>
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
        </NavbarContainer>
      )}
    </Actions>
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
    <NavbarContainer>
      <TabLinksContainer>
        {tabs.map(tab => (
          <TabLink key={tab.name} href={tab.href} isActive={tab.selected}>
            {tab.name}
          </TabLink>
        ))}
      </TabLinksContainer>
      <SpaceActions spaceId={spaceId} />
    </NavbarContainer>
  );
};
