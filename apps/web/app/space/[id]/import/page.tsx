import { Component } from '~/app/space/[id]/import/component';

type ImportPageProps = {
  params: { id: string };
};

export default function ImportPage({ params }: ImportPageProps) {
  return null;

  return <Component spaceId={params.id} />;
}
