import styled from '@emotion/styled';
import { useRouter } from 'next/router';
import { useSpaces } from '~/modules/state/use-spaces';
import { intersperse, titleCase } from '~/modules/utils';
import { Breadcrumb } from '../design-system/breadcrumb';
import { ChevronDownSmall } from '../design-system/icons/chevron-down-small';
import { GeoLogoLarge } from '../design-system/icons/geo-logo-large';
import { Spacer } from '../design-system/spacer';

const Header = styled.header(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  padding: `${theme.space * 3}px ${theme.space * 4}px`,
  backgroundColor: theme.colors.white,
  boxShadow: `0 1px 21px ${theme.colors['grey-02']}`,
}));

const BreadcrumbsContainer = styled.div({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
});

function getComponentRoute(
  components: string[],
  index: number,
  spaceNames: Record<string, string>
): { title: string; path: string } {
  if (index === 0) return { path: '/', title: 'Geo' }; // This shouldn't be hit

  const component = components[index];
  const path = components.slice(0, index + 1).join('/');

  switch (components[1]) {
    case 'space':
      switch (index) {
        case 1:
          return { path: '/spaces', title: 'Spaces' };
        case 2:
          return { path, title: spaceNames[component] };
        // case 3:
      }
  }

  return { path, title: titleCase(component) };
}

export function Navbar() {
  const router = useRouter();
  const asPath = router.asPath;
  const components = asPath.split('/');
  const { spaces } = useSpaces();
  // How do we get entityNames?
  // 1. const { entityNames } = useEntities(); // this isn't available in the navbar. We can lift it somehow.
  // 2. Use separate store for the navbar to store the entity name
  // 3. query for it?

  const spaceNames = Object.fromEntries(spaces.map(space => [space.id, space.attributes.name]));

  return (
    <Header>
      <GeoLogoLarge />
      <Spacer width={32} />
      <BreadcrumbsContainer>
        {intersperse(
          components.map((component, index) => {
            if (index === 0) return null; // skip the "Geo" part
            const { path, title } = getComponentRoute(components, index, spaceNames);

            return (
              <Breadcrumb key={index} href={path} img="">
                {title}
              </Breadcrumb>
            );
          }),
          ({ index }) => {
            if (index === 1) return null; // skip the "Geo" part
            return (
              <span key={`separator-${index}`} style={{ rotate: '270deg' }}>
                <ChevronDownSmall color="grey-03" />
              </span>
            );
          }
        )}
      </BreadcrumbsContainer>
    </Header>
  );
}
