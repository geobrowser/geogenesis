DROP SCHEMA public CASCADE;

CREATE SCHEMA IF NOT EXISTS public;

CREATE TABLE public.accounts (id text PRIMARY KEY);

CREATE TABLE public.cursors (
    id integer PRIMARY KEY,
    cursor text NOT NULL,
    block_number integer NOT NULL
);

COMMENT ON TABLE public.cursors IS '@name substreamCursor';

CREATE TABLE public.geo_entities (
    id text PRIMARY KEY,
    name character varying,
    description character varying,
    -- latest_version_id text REFERENCES public.versions(id),
    created_by_id text NOT NULL REFERENCES public.accounts(id),
    created_at integer NOT NULL,
    created_at_block integer NOT NULL,
    updated_at integer,
    updated_at_block integer 
    -- is_attribute boolean DEFAULT false,
    -- attribute_value_type_id text
);

CREATE TABLE public.spaces (
    id text PRIMARY KEY,
    created_at_block integer NOT NULL,
    is_root_space boolean NOT NULL,
    space_plugin_address text,
    main_voting_plugin_address text,
    member_access_plugin_address text,
    configuration_id text REFERENCES public.geo_entities(id)
);

CREATE TABLE public.geo_entity_types (
    id serial PRIMARY KEY,
    entity_id text NOT NULL REFERENCES public.geo_entities(id),
    type_id text NOT NULL REFERENCES public.geo_entities(id),
    created_at integer NOT NULL,
    created_at_block integer NOT NULL,
    CONSTRAINT geo_entity_types_unique_entity_type_pair UNIQUE (entity_id, type_id)
);

CREATE TABLE public.onchain_profiles (
    id text PRIMARY KEY,
    account_id text REFERENCES public.accounts(id) NOT NULL,
    home_space_id text REFERENCES public.spaces(id) NOT NULL,
    created_at integer NOT NULL,
    created_at_block integer NOT NULL
);

CREATE TABLE public.profiles (
    id text PRIMARY KEY,
    entity_id text REFERENCES public.geo_entities(id) NOT NULL,
    onchain_profile_id text REFERENCES public.onchain_profiles(id) NOT NULL,
    created_at integer NOT NULL,
    created_at_block integer NOT NULL
);

-- ALTER TABLE
--     public.geo_entities
-- ADD
--     CONSTRAINT attribute_value_type_id_fk FOREIGN KEY (attribute_value_type_id) REFERENCES public.geo_entities(id);
CREATE TABLE public.log_entries (
    id text PRIMARY KEY,
    created_at_block text NOT NULL,
    uri text NOT NULL,
    created_by_id text NOT NULL REFERENCES public.accounts(id),
    space_id text NOT NULL REFERENCES public.spaces(id),
    mime_type text,
    decoded text,
    json text
);

CREATE TYPE public.proposal_type as ENUM ('content', 'add_subspace', 'remove_subspace', 'add_editor', 'remove_editor', 'add_member', 'remove_member');
CREATE TYPE public.proposal_status as ENUM ('proposed', 'approved', 'rejected', 'canceled', 'executed');

-- Maps to 2 or 3 onchain
CREATE TYPE public.vote_type as ENUM ('yes', 'no');

CREATE TABLE public.proposals (
    id text PRIMARY KEY,
    onchain_proposal_id text NOT NULL,
    space_id text NOT NULL REFERENCES public.spaces(id),
    name text,
    description text,
    uri text,
    type proposal_type NOT NULL,
    status proposal_status NOT NULL,
    created_at integer NOT NULL,
    created_at_block integer NOT NULL,
    created_by_id text NOT NULL REFERENCES public.accounts(id),
    start_time integer NOT NULL,
    end_time integer NOT NULL
);

CREATE TABLE public.proposed_versions (
    id text PRIMARY KEY,
    name text,
    description text,
    created_at integer NOT NULL,
    created_at_block integer NOT NULL,
    created_by_id text NOT NULL REFERENCES public.accounts(id),
    entity_id text NOT NULL REFERENCES public.geo_entities(id),
    proposal_id text NOT NULL REFERENCES public.proposals(id),
    space_id text NOT NULL REFERENCES public.spaces(id)
);

CREATE TABLE public.space_admins (
    space_id text NOT NULL REFERENCES public.spaces(id),
    account_id text NOT NULL REFERENCES public.accounts(id),
    created_at integer NOT NULL,
    created_at_block integer NOT NULL,
    CONSTRAINT space_admins_unique_account_space_pair UNIQUE (account_id, space_id)
);

CREATE TABLE public.space_editors (
    space_id text NOT NULL REFERENCES public.spaces(id),
    account_id text NOT NULL REFERENCES public.accounts(id),
    created_at integer NOT NULL,
    created_at_block integer NOT NULL,
    CONSTRAINT space_editors_unique_account_space_pair UNIQUE (account_id, space_id)
);

CREATE TABLE public.space_editors_v2 (
    space_id text NOT NULL REFERENCES public.spaces(id),
    account_id text NOT NULL REFERENCES public.accounts(id),
    created_at integer NOT NULL,
    created_at_block integer NOT NULL,
    CONSTRAINT space_editors_v2_unique_account_space_pair UNIQUE (account_id, space_id)
);

CREATE TABLE public.space_editor_controllers (
    space_id text NOT NULL REFERENCES public.spaces(id),
    account_id text NOT NULL REFERENCES public.accounts(id),
    created_at integer NOT NULL,
    created_at_block integer NOT NULL,
    CONSTRAINT space_editor_controllers_unique_account_space_pair UNIQUE (account_id, space_id)
);

CREATE TABLE public.subspaces (
    id text PRIMARY KEY,
    parent_space_id text NOT NULL REFERENCES public.spaces(id),
    child_space_id text NOT NULL REFERENCES public.spaces(id)
);

CREATE TABLE public.triples (
    id text PRIMARY KEY,
    entity_id text NOT NULL REFERENCES public.geo_entities(id),
    attribute_id text NOT NULL REFERENCES public.geo_entities(id),
    value_type text NOT NULL CHECK(
        value_type IN (
            'number',
            'string',
            'entity',
            'collection',
            'image',
            'date',
            'url'
        )
    ),
    value_id text NOT NULL,
    number_value text,
    string_value text,
    array_value text,
    entity_value_id text REFERENCES public.geo_entities(id),
    is_protected boolean NOT NULL,
    space_id text NOT NULL REFERENCES public.spaces(id),
    created_at integer NOT NULL,
    created_at_block integer NOT NULL,
    is_stale boolean NOT NULL
);

CREATE TABLE public.versions (
    id text PRIMARY KEY,
    name text,
    description text,
    created_at integer NOT NULL,
    created_at_block integer NOT NULL,
    created_by_id text NOT NULL REFERENCES public.accounts(id),
    proposed_version_id text NOT NULL REFERENCES public.proposed_versions(id),
    entity_id text NOT NULL REFERENCES public.geo_entities(id),
    space_id text NOT NULL REFERENCES public.spaces(id)
);

-- @TODO: Proposed Member
-- @TODO: Proposed Editor
-- @TODO: Proposed Subspace

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

CREATE TABLE public.actions (
    id text PRIMARY KEY NOT NULL,
    action_type text NOT NULL,
    entity_id text REFERENCES public.geo_entities(id) NOT NULL,
    attribute_id text REFERENCES public.geo_entities(id) NOT NULL,
    value_type text,
    value_id text,
    number_value text,
    string_value text,
    entity_value_id text REFERENCES public.geo_entities(id),
    array_value text [],
    proposed_version_id text REFERENCES public.proposed_versions(id) NOT NULL,
    -- version_id text REFERENCES public.versions(id) NOT NULL,
    created_at integer NOT NULL,
    created_at_block integer NOT NULL
);

CREATE TABLE public.triple_versions (
    PRIMARY KEY (triple_id, version_id),
    triple_id text NOT NULL REFERENCES public.triples(id),
    version_id text NOT NULL REFERENCES public.versions(id)
);

-- 
-- Disable Foreign Key Constraints to allow for bulk loading + unordered inserts
-- 
ALTER TABLE
    public.accounts DISABLE TRIGGER ALL;

ALTER TABLE
    public.actions DISABLE TRIGGER ALL;

ALTER TABLE
    public.geo_entities DISABLE TRIGGER ALL;

ALTER TABLE
    public.geo_entity_types DISABLE TRIGGER ALL;

ALTER TABLE
    public.log_entries DISABLE TRIGGER ALL;

ALTER TABLE
    public.proposals DISABLE TRIGGER ALL;

ALTER TABLE
    public.proposed_versions DISABLE TRIGGER ALL;

ALTER TABLE
    public.triples DISABLE TRIGGER ALL;

ALTER TABLE
    public.subspaces DISABLE TRIGGER ALL;

ALTER TABLE
    public.spaces DISABLE TRIGGER ALL;

ALTER TABLE
    public.versions DISABLE TRIGGER ALL;

ALTER TABLE
    public.space_admins DISABLE TRIGGER ALL;

ALTER TABLE
    public.space_editors DISABLE TRIGGER ALL;

ALTER TABLE
    public.space_editors_v2 DISABLE TRIGGER ALL;

ALTER TABLE
    public.space_editor_controllers DISABLE TRIGGER ALL;

ALTER TABLE
    public.triple_versions DISABLE TRIGGER ALL;
