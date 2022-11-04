import styled from '@emotion/styled';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { StyledLabel } from '~/modules/design-system/button';
import { useSpaces } from '~/modules/state/use-spaces';
import { intersperse, titleCase } from '~/modules/utils';

const Header = styled.header(({ theme }) => ({
  display: 'flex',
  gap: '10px',
  alignItems: 'center',
  padding: `${theme.space * 2}px ${theme.space * 2.5}px`,
  backgroundColor: theme.colors.bg,
  height: '46px',
}));

function getComponentRoute(
  components: string[],
  index: number,
  spaceNames: Record<string, string>
): { title: string; path: string } {
  if (index === 0) return { path: '/', title: 'Geo' };

  const component = components[index];
  const path = components.slice(0, index + 1).join('/');

  switch (components[1]) {
    case 'space':
      switch (index) {
        case 1:
          return { path: '/spaces', title: 'Spaces' };
        case 2:
          return { path, title: spaceNames[component] };
      }
  }

  return { path, title: titleCase(component) };
}

export function Navbar() {
  const router = useRouter();
  const asPath = router.asPath;
  const components = asPath.split('/');
  const { spaces } = useSpaces();

  const spaceNames = Object.fromEntries(spaces.map(space => [space.id, space.attributes.name]));

  return (
    <Header>
      {intersperse(
        components.map((component, index) => {
          const { path, title } = getComponentRoute(components, index, spaceNames);

          return (
            <Link key={index} href={path}>
              <StyledLabel variant="secondary" disabled={false}>
                {title}
              </StyledLabel>
            </Link>
          );
        }),
        ({ index }) => (
          <span key={`separator-${index}`}>›</span>
        )
      )}
    </Header>
  );
}
