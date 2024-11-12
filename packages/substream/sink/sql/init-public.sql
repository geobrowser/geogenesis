DROP SCHEMA public CASCADE;

CREATE SCHEMA IF NOT EXISTS public;

CREATE TABLE public.accounts (id text PRIMARY KEY);

CREATE TABLE public.cursors (
    id integer PRIMARY KEY,
    cursor text NOT NULL,
    block_number integer NOT NULL
);

COMMENT ON TABLE public.cursors IS '@name substreamCursor';

CREATE TABLE public.entities (
    id text PRIMARY KEY,
    created_by_id text NOT NULL REFERENCES public.accounts(id),
    created_at integer NOT NULL,
    created_at_block integer NOT NULL,
    updated_at integer,
    updated_at_block integer
);

CREATE TYPE public.space_type as ENUM ('personal', 'public');

CREATE TABLE public.spaces (
    id text PRIMARY KEY,
    created_at_block integer NOT NULL,
    is_root_space boolean NOT NULL,
    type space_type NOT NULL,
    dao_address text NOT NULL,
    space_plugin_address text,
    main_voting_plugin_address text,
    member_access_plugin_address text,
    personal_space_admin_plugin_address text
);

CREATE TYPE public.proposal_type as ENUM ('ADD_EDIT', 'ADD_SUBSPACE', 'REMOVE_SUBSPACE', 'ADD_EDITOR', 'REMOVE_EDITOR', 'ADD_MEMBER', 'REMOVE_MEMBER');
CREATE TYPE public.proposal_status as ENUM ('proposed', 'accepted', 'rejected', 'canceled', 'executed');

-- Maps to 2 or 3 onchain
CREATE TYPE public.vote_type as ENUM ('accept', 'reject');

CREATE TABLE public.edits (
    id text PRIMARY KEY,
    name text NOT NULL,
    description text,
    uri text NOT NULL,
    created_at_block text NOT NULL,
    created_at integer NOT NULL,
    created_by_id text NOT NULL REFERENCES public.accounts(id),
    space_id text NOT NULL REFERENCES public.spaces(id)
);

CREATE TABLE public.proposals (
    id text PRIMARY KEY,
    onchain_proposal_id text NOT NULL,
    plugin_address text NOT NULL,
    space_id text NOT NULL REFERENCES public.spaces(id),
    type proposal_type NOT NULL,
    status proposal_status NOT NULL,
    created_by_id text NOT NULL REFERENCES public.accounts(id),
    edit_id text REFERENCES public.edits(id),
    start_time integer NOT NULL,
    end_time integer NOT NULL
);

CREATE TABLE public.space_editors (
    space_id text NOT NULL REFERENCES public.spaces(id),
    account_id text NOT NULL REFERENCES public.accounts(id),
    created_at integer NOT NULL,
    created_at_block integer NOT NULL,
    CONSTRAINT space_editors_unique_account_space_pair UNIQUE (account_id, space_id)
);

CREATE TABLE public.space_members (
    space_id text NOT NULL REFERENCES public.spaces(id),
    account_id text NOT NULL REFERENCES public.accounts(id),
    created_at integer NOT NULL,
    created_at_block integer NOT NULL,
    CONSTRAINT space_members_unique_account_space_pair UNIQUE (account_id, space_id)
);

CREATE TABLE public.space_subspaces (
    subspace_id text NOT NULL REFERENCES public.spaces(id),
    parent_space_id text NOT NULL REFERENCES public.spaces(id),
    created_at_block integer NOT NULL,
    created_at integer NOT NULL,
    CONSTRAINT space_subspaces_unique_space_subspace_pair UNIQUE (parent_space_id, subspace_id)
);

CREATE TABLE public.versions (
    id text PRIMARY KEY,
    name text,
    description text,
    created_at integer NOT NULL,
    created_at_block integer NOT NULL,
    created_by_id text NOT NULL REFERENCES public.accounts(id),
    edit_id text NOT NULL REFERENCES public.edits(id),
    entity_id text NOT NULL REFERENCES public.entities(id)
);

-- For now we use a current_versions JOIN table to create the association between
-- a specific version and an entity. This does add an extra JOIN to the query when
-- looking up the latest version for an entity, but we alleviate it via indexes
-- for now. We'll monitor performance and storage constrants over time to see if
-- it makes more sense to use a different approach.
-- ALTER TABLE public.entities ADD COLUMN current_version text;
-- ALTER TABLE entities ADD CONSTRAINT fk_current_version FOREIGN KEY (current_version) REFERENCES public.versions(id);
CREATE TABLE public.current_versions (
    PRIMARY KEY (entity_id),
    entity_id text NOT NULL REFERENCES public.entities(id),
    version_id text NOT NULL REFERENCES public.versions(id)
);

CREATE TABLE public.relations (
    id text PRIMARY KEY NOT NULL,
    space_id text REFERENCES public.spaces(id) NOT NULL,
    type_of_id text REFERENCES public.versions(id) NOT NULL, -- type of the relation, e.g., "Type", "Attribute", "Friend"
    to_version_id text REFERENCES public.versions(id) NOT NULL, -- the entity the relation is pointing to
    index text, -- the fractional index of the relation relative to other relations of the same type
    from_version_id text REFERENCES public.versions(id) NOT NULL, -- the entity the relation is pointing from
    entity_id text REFERENCES public.entities(id) NOT NULL -- the entity id of the relation entity itself
);

CREATE TABLE public.version_types (
    PRIMARY KEY (version_id, type_id),
    version_id text NOT NULL REFERENCES public.versions(id),
    type_id text NOT NULL REFERENCES public.versions(id)
);

CREATE TYPE public.triple_value_type as ENUM ('NUMBER', 'TEXT', 'ENTITY', 'COLLECTION', 'URI', 'CHECKBOX', 'TIME', 'GEO_LOCATION');

CREATE TABLE public.triples (
    PRIMARY KEY (space_id, entity_id, attribute_id, version_id),
    space_id text NOT NULL REFERENCES public.spaces(id),
    entity_id text NOT NULL REFERENCES public.entities(id),
    attribute_id text NOT NULL REFERENCES public.entities(id),
    value_type triple_value_type NOT NULL,
    number_value text,
    text_value text,
    boolean_value boolean,
    entity_value_id text REFERENCES public.entities(id),
    created_at integer NOT NULL,
    created_at_block integer NOT NULL,
    version_id text NOT NULL REFERENCES public.versions(id)
);

CREATE TABLE public.spaces_metadata (
    space_id text NOT NULL REFERENCES public.spaces(id),
    entity_id text NOT NULL REFERENCES public.entities(id),
    CONSTRAINT space_metadata_unique_entity_space_pair UNIQUE (entity_id, space_id)
);

CREATE TABLE public.proposal_votes (
    PRIMARY KEY (onchain_proposal_id, space_id, account_id),
    proposal_id text NOT NULL REFERENCES public.proposals(id),
    onchain_proposal_id text,
    space_id text NOT NULL REFERENCES public.spaces(id),
    account_id text NOT NULL REFERENCES public.accounts(id),
    vote vote_type NOT NULL,
    created_at integer NOT NULL,
    created_at_block integer NOT NULL
);

CREATE TYPE public.op_type as ENUM ('SET_TRIPLE', 'DELETE_TRIPLE');

CREATE TYPE public.subspace_proposal_type as ENUM ('ADD_SUBSPACE', 'REMOVE_SUBSPACE');

-- @TODO: Some of these fields might break in a version of the protocol where
-- indexers decide which spaces they index. A space not exist in their DB even
-- though it exists somewhere in the global graph.
CREATE TABLE public.proposed_subspaces (
    id text PRIMARY KEY,
    subspace text NOT NULL REFERENCES public.spaces(id),
    parent_space text NOT NULL REFERENCES public.spaces(id),
    created_at integer NOT NULL,
    created_at_block integer NOT NULL,
    proposal_id text NOT NULL REFERENCES public.proposals(id),
    type subspace_proposal_type NOT NULL
);

CREATE TYPE public.member_proposal_type as ENUM ('ADD_MEMBER', 'REMOVE_MEMBER');

CREATE TABLE public.proposed_members (
    id text PRIMARY KEY,
    account_id text NOT NULL REFERENCES public.accounts(id),
    space_id text NOT NULL REFERENCES public.spaces(id),
    created_at integer NOT NULL,
    created_at_block integer NOT NULL,
    proposal_id text NOT NULL REFERENCES public.proposals(id),
    type member_proposal_type NOT NULL
);

CREATE TYPE public.editor_proposal_type as ENUM ('ADD_EDITOR', 'REMOVE_EDITOR');

CREATE TABLE public.proposed_editors (
    id text PRIMARY KEY,
    account_id text NOT NULL REFERENCES public.accounts(id),
    space_id text NOT NULL REFERENCES public.spaces(id),
    created_at integer NOT NULL,
    created_at_block integer NOT NULL,
    proposal_id text NOT NULL REFERENCES public.proposals(id),
    type editor_proposal_type NOT NULL
);

CREATE TABLE public.geo_blocks (
    PRIMARY KEY (network, hash),
    network text NOT NULL,
    hash text NOT NULL,
    number text NOT NULL,
    timestamp text NOT NULL
);

CREATE TABLE public.version_spaces (
    PRIMARY KEY (version_id, space_id),
    version_id text NOT NULL REFERENCES public.versions(id),
    space_id text NOT NULL REFERENCES public.spaces(id)
);

--
-- Disable Foreign Key Constraints to allow for bulk loading + unordered inserts
--
ALTER TABLE
    public.accounts DISABLE TRIGGER ALL;

ALTER TABLE
    public.entities DISABLE TRIGGER ALL;

ALTER TABLE
    public.version_spaces DISABLE TRIGGER ALL;

ALTER TABLE
    public.version_types DISABLE TRIGGER ALL;

ALTER TABLE
    public.proposals DISABLE TRIGGER ALL;

ALTER TABLE
    public.triples DISABLE TRIGGER ALL;

ALTER TABLE
    public.space_subspaces DISABLE TRIGGER ALL;

ALTER TABLE
    public.spaces DISABLE TRIGGER ALL;

ALTER TABLE
    public.versions DISABLE TRIGGER ALL;
ALTER TABLE

    public.edits DISABLE TRIGGER ALL;

ALTER TABLE
    public.space_editors DISABLE TRIGGER ALL;
