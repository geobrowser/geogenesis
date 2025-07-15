import { Cell } from '~/core/v2.types';

export const getName = (nameCell: Cell, currentSpaceId: string) => {
  // let name = nameCell?.name;
  // const maybeNameInSpaceRenderable = nameCell.renderables.find(
  //   r => r.propertyId === SystemIds.NAME_PROPERTY && r.spaceId === currentSpaceId
  // );
  // let maybeNameInSpace = maybeNameInSpaceRenderable?.value;
  // if (maybeNameInSpaceRenderable?.type === 'RELATION') {
  //   maybeNameInSpace = maybeNameInSpaceRenderable?.valueName ?? maybeNameInSpace;
  // }
  // const maybeNameRenderable = nameCell?.renderables.find(r => r.propertyId === SystemIds.NAME_PROPERTY);
  // let maybeOtherName = maybeNameRenderable?.value;
  // if (maybeNameRenderable?.type === 'RELATION') {
  //   maybeOtherName = maybeNameRenderable?.valueName ?? maybeNameInSpace;
  // }
  // const maybeName = maybeNameInSpace ?? maybeOtherName;
  // if (maybeName) {
  //   name = maybeName ?? null;
  // }
  // return name;
};
