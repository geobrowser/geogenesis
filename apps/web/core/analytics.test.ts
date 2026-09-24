import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const analyticsScriptSrc = 'http://localhost:3000/geo-analytics-8f8dba53d466.js';

describe('analytics', () => {
  beforeEach(() => {
    vi.resetModules();
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    window.localStorage.clear();
    delete (window as any).GeoAnalyticsConfig;
    delete (window as any).lytics;
    delete (window as any).lyticsConfig;
    delete (window as any).geoAnalytics;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads the current Genesis analytics runtime with collector-safe defaults', async () => {
    const { initAnalytics } = await import('./analytics');

    initAnalytics();

    expect(window.lyticsConfig).toMatchObject({
      app: 'genesis',
      collectorUrl: false,
      collectorMode: 'shadow',
      autoPageViews: false,
      autoRouteTracking: false,
    });

    const script = document.querySelector<HTMLScriptElement>('script[data-geo-analytics-loader="true"]');

    expect(script?.src).toBe(analyticsScriptSrc);
    expect(script?.integrity).toBe('sha256-j426U9Rmd38aqJcds0bqAaOlribZukZWDJFfY8cZTbY=');
    expect(script?.crossOrigin).toBe('anonymous');
  });

  it('enables production collection for Genesis app routes on www.geobrowser.io', async () => {
    const { analyticsEnvironment, isProductionGenesisHost, shouldUseAnalyticsCollector } = await import('./analytics');

    expect(shouldUseAnalyticsCollector('www.geobrowser.io')).toBe(true);
    expect(isProductionGenesisHost('www.geobrowser.io')).toBe(true);
    expect(analyticsEnvironment('www.geobrowser.io')).toBe('production');
  });

  it('tracks new Privy users as signups with reviewed email and no raw account data', async () => {
    const signedUp = vi.fn();
    window.lytics = {
      capture: vi.fn(),
      signedUp,
    };

    const { trackPrivyAuth } = await import('./analytics');

    trackPrivyAuth({
      user: {
        id: 'did:privy:user-1',
        email: { address: 'person@example.com' },
        wallet: {
          address: '0x123',
          walletClientType: 'privy',
          chainType: 'ethereum',
          connectorType: 'embedded',
          imported: false,
          delegated: true,
        },
        linkedAccounts: [{ type: 'email', address: 'person@example.com' }],
        mfaMethods: [],
        hasAcceptedTerms: true,
        isGuest: false,
      },
      isNewUser: true,
      wasAlreadyAuthenticated: false,
      loginMethod: 'email',
      loginAccount: {
        type: 'email',
      },
    });

    expect(signedUp).toHaveBeenCalledTimes(1);

    const [identity, properties] = signedUp.mock.calls[0];

    expect(identity).toMatchObject({
      user_id: 'did:privy:user-1',
      privy_user_id: 'did:privy:user-1',
      auth_provider: 'privy',
      has_privy_email: true,
      has_privy_wallet: true,
      privy_wallet_client_type: 'privy',
      privy_wallet_chain_type: 'ethereum',
      privy_wallet_connector_type: 'embedded',
    });
    expect(identity).not.toHaveProperty('email');
    expect(identity).not.toHaveProperty('wallet');

    expect(properties).toMatchObject({
      source: 'privy',
      auth_provider: 'privy',
      email: 'person@example.com',
      is_new_user: true,
      was_already_authenticated: false,
      login_method: 'email',
      login_account_type: 'email',
    });
    expect(properties).not.toHaveProperty('wallet');
  });

  it('tracks existing Privy users as logins', async () => {
    const loggedIn = vi.fn();
    window.lytics = {
      capture: vi.fn(),
      loggedIn,
    };

    const { trackPrivyAuth } = await import('./analytics');

    trackPrivyAuth({
      user: {
        id: 'did:privy:user-2',
      },
      isNewUser: false,
      wasAlreadyAuthenticated: false,
      loginMethod: 'email',
      loginAccount: {
        type: 'email',
      },
    });

    expect(loggedIn).toHaveBeenCalledTimes(1);
    expect(loggedIn.mock.calls[0][0]).toMatchObject({
      user_id: 'did:privy:user-2',
      privy_user_id: 'did:privy:user-2',
    });
    expect(loggedIn.mock.calls[0][1]).toMatchObject({
      is_new_user: false,
      was_already_authenticated: false,
      login_method: 'email',
    });
    expect(loggedIn.mock.calls[0][1]).not.toHaveProperty('email');
  });

  it('tracks already-authenticated Privy completions as restored sessions', async () => {
    const sessionRestored = vi.fn();
    window.lytics = {
      capture: vi.fn(),
      sessionRestored,
    };

    const { trackPrivyAuth } = await import('./analytics');

    trackPrivyAuth({
      user: {
        id: 'did:privy:user-3',
      },
      isNewUser: false,
      wasAlreadyAuthenticated: true,
      loginMethod: null,
      loginAccount: null,
    });

    expect(sessionRestored).toHaveBeenCalledTimes(1);
    expect(sessionRestored.mock.calls[0][0]).toMatchObject({
      user_id: 'did:privy:user-3',
      privy_user_id: 'did:privy:user-3',
    });
    expect(sessionRestored.mock.calls[0][1]).toMatchObject({
      was_already_authenticated: true,
    });
  });

  it('tracks explicit login completions as logins even when Privy reports an existing session', async () => {
    const loggedIn = vi.fn();
    const sessionRestored = vi.fn();
    window.lytics = {
      capture: vi.fn(),
      loggedIn,
      sessionRestored,
    };

    const { trackPrivyAuth } = await import('./analytics');

    trackPrivyAuth(
      {
        user: {
          id: 'did:privy:user-4',
        },
        isNewUser: false,
        wasAlreadyAuthenticated: true,
        loginMethod: null,
        loginAccount: null,
      },
      { auth_flow: 'manual_login' }
    );

    expect(loggedIn).toHaveBeenCalledTimes(1);
    expect(sessionRestored).not.toHaveBeenCalled();
    expect(loggedIn.mock.calls[0][1]).toMatchObject({
      auth_flow: 'manual_login',
      was_already_authenticated: true,
    });
  });

  it('tracks Genesis product actions with semantic helpers', async () => {
    const capture = vi.fn();
    const upvoted = vi.fn();
    const voteCast = vi.fn();
    const editModeToggled = vi.fn();
    const browseModeToggled = vi.fn();
    const graphEntityViewed = vi.fn();
    window.lytics = {
      capture,
      upvoted,
      voteCast,
      editModeToggled,
      browseModeToggled,
      graphEntityViewed,
    };

    const {
      browseModeToggled: browse,
      commentCreated,
      commentEdited,
      editModeToggled: edit,
      personProfileOpened,
      personalSpaceViewed,
      profileUpdated,
      publishedEdit,
      reviewChangesOpened,
      signupCompleted,
      upvoted: up,
      voteCast: vote,
    } = await import('./analytics');

    up({ entity_id: 'entity-1' });
    vote('none', { entity_id: 'entity-1' });
    edit({ space_id: 'space-1' });
    browse({ space_id: 'space-1' });
    personalSpaceViewed('personal-space-1');
    personProfileOpened('profile-space-1', 'person-1', { interaction_surface: 'claim_vote_list' });
    reviewChangesOpened({ space_id: 'space-1' });
    publishedEdit({ space_id: 'space-1' });
    profileUpdated('person-1', 'profile-space-1');
    commentCreated('comment-1', 'claim-1', { space_id: 'space-1' });
    commentEdited('comment-1', 'claim-1', { space_id: 'space-1' });
    signupCompleted('newsletter', { signup_surface: 'explore_email_capture' });

    expect(upvoted).toHaveBeenCalledWith({ entity_id: 'entity-1' });
    expect(voteCast).toHaveBeenCalledWith('none', { entity_id: 'entity-1' });
    expect(editModeToggled).toHaveBeenCalledWith({ space_id: 'space-1' });
    expect(browseModeToggled).toHaveBeenCalledWith({ space_id: 'space-1' });
    expect(graphEntityViewed).toHaveBeenCalledWith({
      source: 'browse_sidebar',
      graph_entity_type: 'personal_space',
      space_id: 'personal-space-1',
      entity_id: 'personal-space-1',
    });
    expect(capture).toHaveBeenCalledWith('review_changes_opened', {
      app: 'genesis',
      source: 'review_changes',
      space_id: 'space-1',
    });
    expect(capture).toHaveBeenCalledWith('published_edit', {
      app: 'genesis',
      source: 'publishing',
      space_id: 'space-1',
    });
    expect(capture).toHaveBeenCalledWith('graph_relationship_followed', {
      app: 'genesis',
      source: 'person_profile',
      entity_id: 'person-1',
      graph_entity_type: 'person',
      profile_space_id: 'profile-space-1',
      interaction_surface: 'claim_vote_list',
    });
    expect(capture).toHaveBeenCalledWith('published_edit', {
      app: 'genesis',
      source: 'profile_editor',
      content_id: 'person-1',
      content_type: 'profile',
      space_id: 'profile-space-1',
    });
    expect(capture).toHaveBeenCalledWith('comment_created', {
      app: 'genesis',
      source: 'commenting',
      comment_id: 'comment-1',
      target_type: 'entity',
      target_id: 'claim-1',
      space_id: 'space-1',
    });
    expect(capture).toHaveBeenCalledWith('content_edited', {
      app: 'genesis',
      source: 'commenting',
      content_id: 'comment-1',
      content_type: 'comment',
      target_type: 'entity',
      target_id: 'claim-1',
      space_id: 'space-1',
    });
    expect(capture).toHaveBeenCalledWith('signup_completed', {
      app: 'genesis',
      source: 'signup_form',
      form_type: 'newsletter',
      signup_surface: 'explore_email_capture',
    });
  });

  it('tracks completed searches with result, latency, and privacy-safe query fields', async () => {
    const capture = vi.fn();
    window.lytics = { capture };

    const { searchSubmitted } = await import('./analytics');

    searchSubmitted({
      queryText: '  reach Jane@example.com using 4242 4242 4242 4242  ',
      resultCount: 12,
      latencyMs: 370,
      surface: 'global',
    });

    expect(capture).toHaveBeenCalledWith('search_submitted', {
      app: 'genesis',
      source: 'global_search',
      query_id: expect.stringMatching(/^genesis_search_[a-z0-9]+$/),
      query_type: 'global_entities',
      query_text: 'reach ***** using *****',
      result_count: 12,
      no_results: false,
      latency_bucket: '250_500ms',
    });
  });

  it('uses stable search query ids without storing unmasked sensitive text', async () => {
    const { searchQueryId } = await import('./analytics');

    expect(searchQueryId('Graph Search')).toBe(searchQueryId('  graph search  '));
    expect(searchQueryId('Graph Search')).not.toBe(searchQueryId('Another Search'));
  });

  it('marks a completed zero-result search without emitting for an empty query', async () => {
    const capture = vi.fn();
    window.lytics = { capture };

    const { searchSubmitted } = await import('./analytics');

    searchSubmitted({
      queryText: 'missing entity',
      resultCount: 0,
      latencyMs: 100,
      surface: 'entity',
    });
    searchSubmitted({ queryText: '   ', resultCount: 0, latencyMs: 100, surface: 'entity' });

    expect(capture).toHaveBeenCalledOnce();
    expect(capture).toHaveBeenCalledWith(
      'search_submitted',
      expect.objectContaining({ result_count: 0, no_results: true })
    );
  });

  it('assigns stable latency buckets at their boundaries', async () => {
    const { searchLatencyBucket } = await import('./analytics');

    expect(searchLatencyBucket(249)).toBe('0_250ms');
    expect(searchLatencyBucket(250)).toBe('250_500ms');
    expect(searchLatencyBucket(500)).toBe('500_1000ms');
    expect(searchLatencyBucket(1000)).toBe('1000_2000ms');
    expect(searchLatencyBucket(2000)).toBe('2000ms_plus');
  });

  it('keeps product actions best-effort when the analytics runtime throws', async () => {
    window.lytics = {
      capture: vi.fn(() => {
        throw new Error('collector unavailable');
      }),
    };

    const { personProfileOpened } = await import('./analytics');

    expect(() => personProfileOpened('profile-space-1', 'person-1')).not.toThrow();
  });

  it('attributes a profile entity fallback as its personal space', async () => {
    const capture = vi.fn();
    window.lytics = { capture };

    const { personProfileOpened } = await import('./analytics');

    personProfileOpened('profile-space-1', 'profile-space-1', { interaction_surface: 'claim_vote_list' });

    expect(capture).toHaveBeenCalledWith('graph_relationship_followed', {
      app: 'genesis',
      source: 'person_profile',
      entity_id: 'profile-space-1',
      graph_entity_type: 'personal_space',
      profile_space_id: 'profile-space-1',
      interaction_surface: 'claim_vote_list',
    });
  });

  it('recognizes dashed and differently cased forms of the same personal-space id', async () => {
    const capture = vi.fn();
    window.lytics = { capture };

    const { personProfileOpened } = await import('./analytics');

    personProfileOpened('4C81561D-1F95-4131-9CDD-DD20AB831BA2', '4c81561d1f9541319cdddd20ab831ba2');

    expect(capture).toHaveBeenCalledWith('graph_relationship_followed', {
      app: 'genesis',
      source: 'person_profile',
      entity_id: '4C81561D-1F95-4131-9CDD-DD20AB831BA2',
      graph_entity_type: 'personal_space',
      profile_space_id: '4C81561D-1F95-4131-9CDD-DD20AB831BA2',
    });
  });

  it('does not attribute a profile open to a pending personal-space sentinel', async () => {
    const capture = vi.fn();
    window.lytics = { capture };

    const { personProfileOpened } = await import('./analytics');

    personProfileOpened('pending:0x123', null, { interaction_surface: 'comment_author' });

    expect(capture).not.toHaveBeenCalled();
  });
});
