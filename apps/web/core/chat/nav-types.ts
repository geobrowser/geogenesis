// Navigate tool shapes shared between the API route (producer) and the chat
// widget (consumer). Types only — no runtime code — so importing across the
// client/server boundary is safe.

export type NavigateTarget = 'root' | 'explore' | 'personalHome' | 'personalSpace' | 'space' | 'entity';

export type NavigateInput = {
  target: NavigateTarget;
  spaceId?: string;
  entityId?: string;
};

export type NavigateOutput =
  | { ok: true; target: NavigateTarget; spaceId?: string; entityId?: string }
  | {
      ok: false;
      error: 'space_not_found' | 'invalid_input' | 'no_personal_space';
      target: NavigateTarget;
      attemptedSpaceId?: string;
    };
