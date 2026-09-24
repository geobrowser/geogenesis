import type { ToolSet } from 'ai';

import type { WriteContext } from '../write/context';
import { buildJoinSpaceTool } from './join-space';
import { type NavigateToolContext, buildNavigateTool } from './navigate';
import { buildOpenReviewPanelTool } from './open-review-panel';

export { buildJoinSpaceTool, buildNavigateTool, buildOpenReviewPanelTool };
export type { NavigateToolContext };

// openReviewPanel and joinSpace only register for members; guests have no
// staged edits to review and no account to propose a membership with, so for
// them the tools would just burn prompt tokens.
export function buildNavTools(navContext: NavigateToolContext, writeContext: WriteContext): ToolSet {
  if (writeContext.kind === 'member') {
    return {
      navigate: buildNavigateTool(navContext),
      openReviewPanel: buildOpenReviewPanelTool(writeContext),
      joinSpace: buildJoinSpaceTool(),
    };
  }
  return {
    navigate: buildNavigateTool(navContext),
  };
}

export type NavToolName = 'navigate' | 'openReviewPanel' | 'joinSpace';
