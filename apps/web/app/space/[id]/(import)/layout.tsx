import { EntityPageContentContainer } from '~/partials/entity-page/entity-page-content-container';

type LayoutProps = {
  children: React.ReactNode;
};

export default function ImportLayout({ children }: LayoutProps) {
  return <EntityPageContentContainer>{children}</EntityPageContentContainer>;
}
