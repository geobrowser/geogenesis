import { NONPROFIT_TYPE, PROJECT_TYPE } from '@geogenesis/ids/system-ids';

import { Subgraph } from '~/core/io';
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

const getProjects = async (spaceId: string) => {
  const projects: Array<any> = [];

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
        name: project.name,
        description: project.description,
        avatar: Entity.avatar(project.triples),
      });
    });

  return projects;
};
