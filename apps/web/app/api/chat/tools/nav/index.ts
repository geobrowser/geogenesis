import type { ToolSet } from 'ai';

import type { WriteContext } from '../write/context';
import { type NavigateToolContext, buildNavigateTool } from './navigate';
import { buildOpenReviewPanelTool } from './open-review-panel';

export { buildNavigateTool, buildOpenReviewPanelTool };
export type { NavigateToolContext };

// openReviewPanel only registers for members — guests can't stage edits, so
// opening the review panel has no meaning for them. Keeping it off the guest
// tool list also avoids adding prompt tokens they'd never use.
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
