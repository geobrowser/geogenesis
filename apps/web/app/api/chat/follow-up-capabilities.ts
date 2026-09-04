import type { ToolSet } from 'ai';

const NO_ABILITIES =
  "It has no other abilities. The chat's one attachment control takes a CSV or Excel spreadsheet to import and nothing else, so the assistant cannot receive a photo, image or document from the user, and it cannot send email, export or download anything, or act outside Geo. An image can only be attached from a URL or an image search.";

const SELF_CHECK =
  'Before offering an option, name to yourself the tool that would run when the user clicks it. If there is no such tool, do not offer that option.';

const USER_VOICE =
  'Clicking an option sends its text to you as the user\'s own message, so write every option in the user\'s voice, as a short command addressed to you — "Add a bio", "Search for related topics", "Remove that block". Never write one in your own voice ("I\'ll add the photo property", "Let me search for you"), never as a question, and never as a statement about what you will do.';

export function buildFollowUpCapabilityNote(tools: ToolSet): string {
  const names = Object.keys(tools).sort();

  const opening =
    names.length === 0
      ? 'Every option you suggest becomes a one-click message from the user. The assistant has no tools available in this conversation, so do not suggest any action it would have to perform.'
      : `Every option you suggest becomes a one-click message from the user, so only suggest something the assistant can actually carry out. The assistant acts solely by calling these tools: ${names.join(', ')}.`;

  return [opening, NO_ABILITIES, USER_VOICE, SELF_CHECK].join('\n\n');
}
