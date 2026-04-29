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

// Nav-side (not write): opens a client overlay without changing the graph.
// Membership enforced at tool registration, not here.
export type OpenReviewPanelInput = Record<string, never>;

export type OpenReviewPanelOutput = { ok: true } | { ok: false; error: 'not_signed_in' };
