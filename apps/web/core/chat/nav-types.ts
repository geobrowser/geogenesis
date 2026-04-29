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

// openReviewPanel is a nav-side action too — it changes what the user sees (a
// client-side overlay) without changing the graph. Shape is minimal because
// the server can't usefully validate: "can I open the panel?" is just "am I a
// member?" and that's enforced at tool registration.
export type OpenReviewPanelInput = Record<string, never>;

export type OpenReviewPanelOutput = { ok: true } | { ok: false; error: 'not_signed_in' };
