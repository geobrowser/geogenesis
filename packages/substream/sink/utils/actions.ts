import { type Action, ZodAction } from '../zod.js';

export function isValidAction(action: Action): action is Action {
  return ZodAction.safeParse(action).success;
}
