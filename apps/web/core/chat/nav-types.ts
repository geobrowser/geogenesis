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

export type JoinSpaceInput = { spaceId: string };

// `requested` is the only success: membership is a proposal editors vote on,
// never an immediate join, and the reply must not imply otherwise.
export type JoinSpaceOutput =
  | { ok: true; status: 'requested'; spaceId: string; spaceName?: string }
  | {
      ok: false;
      error:
        | 'invalid_input'
        | 'not_signed_in'
        | 'no_personal_space'
        | 'space_not_found'
        | 'not_joinable'
        | 'already_member'
        // Named for what already happened, not for the state it leaves behind:
        // `request_pending` read to the closer as "your request is now pending"
        // and got reported as a fresh request we never made.
        | 'already_requested'
        | 'request_failed';
      spaceId?: string;
      spaceName?: string;
    };
