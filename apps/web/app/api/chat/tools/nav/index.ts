import { type NavigateToolContext, buildNavigateTool } from './navigate';

export { buildNavigateTool };
export type { NavigateToolContext };

export function buildNavTools(context: NavigateToolContext) {
  return {
    navigate: buildNavigateTool(context),
  };
}

export type NavToolName = keyof ReturnType<typeof buildNavTools>;
