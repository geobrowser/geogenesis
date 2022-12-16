import styled from '@emotion/styled';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Button } from '~/modules/design-system/button';
import { Spacer } from '~/modules/design-system/spacer';
import { TabLink } from '~/modules/design-system/tab-link';
import { useAccessControl } from '~/modules/state/use-access-control';
import { useEditable } from '~/modules/state/use-editable';
import { NavUtils } from '~/modules/utils';
import { Actions } from '../table/styles';

interface Props {
  spaceId: string;
}

const NavbarContainer = styled.div({
  display: 'flex',
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'center',
  width: '100%',
});

export const SpaceNavbar = ({ spaceId }: Props) => {
  const { query } = useRouter();

  const { isEditor, isAdmin } = useAccessControl(spaceId);
  const { editable } = useEditable();

  const tabEntitiesSelected = !!query.tabOne;
  const tabTriplesSelected = !!query.tabTwo;

  const tabs = [
    {
      name: 'Entities',
      href: `/space/${query.id}?tabOne=true`,
      selected: tabEntitiesSelected,
    },
    {
      name: 'Triples',
      href: `/space/${query.id}?tabTwo=true`,
      selected: tabTriplesSelected,
    },
  ];

  return (
    <NavbarContainer>
      <div>
        {tabs.map(tab => (
          <TabLink key={tab.name} href={tab.href} isActive={tab.selected}>
            {tab.name}
          </TabLink>
        ))}
      </div>

      <Actions>
        {(isEditor || isAdmin) && editable && (
          <NavbarContainer>
            {isAdmin && (
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
    </NavbarContainer>
  );
};
