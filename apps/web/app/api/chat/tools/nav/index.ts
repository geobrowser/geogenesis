import type { ToolSet } from 'ai';

import type { WriteContext } from '../write/context';
import { type NavigateToolContext, buildNavigateTool } from './navigate';
import { buildOpenReviewPanelTool } from './open-review-panel';

export { buildNavigateTool, buildOpenReviewPanelTool };
export type { NavigateToolContext };

// openReviewPanel only registers for members; guests have no staged edits and
// the tool would just burn prompt tokens.
export function buildNavTools(navContext: NavigateToolContext, writeContext: WriteContext): ToolSet {
  if (writeContext.kind === 'member') {
    return {
      navigate: buildNavigateTool(navContext),
      openReviewPanel: buildOpenReviewPanelTool(writeContext),
    };
  }
  return {
    navigate: buildNavigateTool(navContext),
  };
}

export type NavToolName = 'navigate' | 'openReviewPanel';
