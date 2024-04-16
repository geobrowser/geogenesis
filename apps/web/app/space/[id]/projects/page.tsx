import { NONPROFIT_TYPE, PROJECT_TYPE } from '@geogenesis/ids/system-ids';

import { Subgraph } from '~/core/io';
import { Triple } from '~/core/types';
import { Entity } from '~/core/utils/entity';

import { Projects } from '~/partials/projects/projects';

type ProjectsPageProps = {
  params: { id: string; entityId: string };
};

export default async function ProjectsPage({ params }: ProjectsPageProps) {
  const spaceId = params.id;
  const space = await Subgraph.fetchSpace({ id: spaceId });
  const entity = space?.spaceConfig;

  if (!space || !entity) return null;

  const spaceName = entity.name ?? '';
  const spaceAvatar = Entity.avatar(entity.triples);

  const projects = await getProjects(spaceId);

  return <Projects spaceName={spaceName} spaceAvatar={spaceAvatar} spaceId={spaceId} projects={projects} />;
}

export type ProjectType = {
  id: string;
  name: string;
  description: string;
  avatar: string | null;
  triples: Array<Triple>;
};

const getProjects = async (spaceId: string) => {
  const projects: Array<ProjectType> = [];

  const projectEntities = await Subgraph.fetchEntities({
    spaceId,
    typeIds: [PROJECT_TYPE],
    filter: [],
  });

  projectEntities
    .filter(
      project =>
        project.nameTripleSpaces?.includes(spaceId) && !project.types.some((type: any) => type.id === NONPROFIT_TYPE)
    )
    .forEach(project => {
      projects.push({
        id: project.id,
        name: project.name ?? '',
        description: project.description ?? '',
        avatar: Entity.avatar(project.triples),
        triples: project.triples,
      });
    });

  return projects;
};
