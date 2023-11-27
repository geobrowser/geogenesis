import * as db from "zapatos/db";
import type * as s from "zapatos/schema";
import { TYPES } from "./constants/systemIds";
import { upsertCachedEntries } from "./populateCache";
import { StreamData, TripleAction, TripleDatabaseTuple } from "./types";
import {
  actionTypeCheck,
  actionsFromURI,
  isValidAction,
} from "./utils/actions";
import { upsertChunked } from "./utils/db";
import {
  generateActionId,
  generateProposalId,
  generateTripleId,
  generateVersionId,
} from "./utils/id";
import { pool } from "./utils/pool";
import { Entry, ZodUriData, type FullEntry } from "./zod";

export const populateWithEntries = async ({
  entries,
  blockNumber,
  timestamp,
  cursor,
}: StreamData) => {
  try {
    const fullEntries: FullEntry[] = [];
    const uriResponses = await Promise.all(
      entries.map((entry) => actionsFromURI(entry.uri))
    );

    for (let i = 0; i < entries.length; i++) {
      console.log("\nProcessing entry", i + 1, "of", entries.length, "entries");
      // First check if the general response conforms to what we expect
      const uriResponse = ZodUriData.safeParse(uriResponses[i]);
      if (uriResponse.success) {
        // Then check if the actions conform to what we expect
        console.log("Original Action Count: ", uriResponse.data.actions.length);
        const actions = uriResponse.data.actions.filter(isValidAction);
        console.log("Valid Actions:", actions.length);
        fullEntries.push({
          ...entries[i],
          uriData: { ...uriResponse.data, actions },
        });
      } else {
        console.error("Failed to parse URI data: ", uriResponse);
        console.error("URI used: ", entries[i].uri);
        console.error(uriResponse.error);
      }
    }
    await populateWithFullEntries({
      fullEntries,
      blockNumber,
      timestamp,
      cursor,
    });
  } catch (error) {
    console.error(`Error populating entries: ${error} at block ${blockNumber}`);
  }
};

export const populateWithFullEntries = async ({
  fullEntries,
  blockNumber,
  timestamp,
  cursor,
}: {
  fullEntries: FullEntry[];
  blockNumber: number;
  timestamp: number;
  cursor: string;
}) => {
  try {
    // Upsert the full entries into the cache
    await upsertCachedEntries({ fullEntries, blockNumber, cursor, timestamp });

    const accounts: s.accounts.Insertable[] = toAccounts({ fullEntries });
    console.log("Accounts Count: ", accounts.length);
    await upsertChunked("accounts", accounts, "id", {
      updateColumns: db.doNothing,
    });

    const actions: s.actions.Insertable[] = toActions({
      fullEntries,
      cursor,
      timestamp,
      blockNumber,
    });
    console.log("Actions Count", actions.length);
    await upsertChunked("actions", actions, "id", {
      updateColumns: db.doNothing,
    });

    const geoEntities: s.geo_entities.Insertable[] = toGeoEntities({
      fullEntries,
      blockNumber,
      timestamp,
    });
    console.log("Geo Entities Count", geoEntities.length);
    await upsertChunked("geo_entities", geoEntities, "id", {
      updateColumns: ["name", "description", "updated_at", "updated_at_block"],
    });

    const proposals: s.proposals.Insertable[] = toProposals({
      fullEntries,
      blockNumber,
      timestamp,
      cursor,
    });
    console.log("Proposals Count", proposals.length);

    const proposed_versions: s.proposed_versions.Insertable[] =
      toProposedVersions({
        fullEntries,
        blockNumber,
        timestamp,
        cursor,
      });
    console.log("Proposed Versions Count", proposed_versions.length);
    await upsertChunked("proposed_versions", proposed_versions, "id", {
      updateColumns: db.doNothing,
    });

    const spaces: s.spaces.Insertable[] = toSpaces(fullEntries, blockNumber);
    console.log("Spaces Count", spaces.length);
    await upsertChunked("spaces", spaces, "id", {
      updateColumns: db.doNothing,
    });

    // /* Todo: How are duplicate triples being handled in Geo? I know it's possible, but if the triple ID is defined, what does that entail */
    const triplesDatabaseTuples: TripleDatabaseTuple[] = toTripleDatabaseTuples(
      fullEntries,
      timestamp,
      blockNumber
    );
    console.log("TriplesDatabaseTuples Count", triplesDatabaseTuples.length);

    for (const [tupleType, triple] of triplesDatabaseTuples) {
      const isCreateTriple = tupleType === TripleAction.Create;
      const isDeleteTriple = tupleType === TripleAction.Delete;
      const isAddType = triple.attribute_id === TYPES && isCreateTriple;
      const isDeleteType = triple.attribute_id === TYPES && isDeleteTriple;

      if (isCreateTriple) {
        await db
          .upsert("triples", triple, "id", { updateColumns: db.doNothing })
          .run(pool);
      } else {
        await db.deletes("triples", { id: triple.id }).run(pool);
      }

      if (isAddType) {
        await db
          .upsert(
            "geo_entity_types",
            {
              entity_id: triple.entity_id,
              type_id: triple.value_id,
              created_at: timestamp,
              created_at_block: blockNumber,
            },
            ["entity_id", "type_id"],
            { updateColumns: db.doNothing }
          )
          .run(pool);
      } else if (isDeleteType) {
        console.log(
          "Deleting type",
          triple.value_id,
          "to entity",
          triple.entity_id
        );
        await db
          .deletes("geo_entity_types", {
            entity_id: triple.entity_id,
            type_id: triple.value_id,
          })
          .run(pool);
      }
    }

    const versions: s.versions.Insertable[] = toVersions({
      fullEntries,
      blockNumber,
      timestamp,
      cursor,
    });
    console.log("Versions Count", versions.length);
    await upsertChunked("versions", versions, "id", {
      updateColumns: db.doNothing,
    });
  } catch (error) {
    console.error(`Error populating entries: ${error} at block ${blockNumber}`);
  }
};

interface ToAccountArgs {
  fullEntries: Entry[];
}
export const toAccounts = ({ fullEntries }: ToAccountArgs) => {
  const accounts: s.accounts.Insertable[] = [];
  const author = fullEntries[0].author;
  if (author) {
    accounts.push({
      id: author,
    });
  }
  return accounts;
};

interface ToActionArgs {
  fullEntries: FullEntry[];
  cursor: string;
  timestamp: number;
  blockNumber: number;
}
export const toActions = ({
  fullEntries,
  cursor,
  timestamp,
  blockNumber,
}: ToActionArgs) => {
  const actions: s.actions.Insertable[] = fullEntries.flatMap(
    (fullEntry, entryIdx) => {
      return fullEntry.uriData.actions.map((action) => {
        const string_value =
          action.value.type === "string" ? action.value.value : null;
        const entity_value =
          action.value.type === "entity" ? action.value.id : null;

        const proposed_version_id = generateVersionId({
          entryIdx,
          entityId: action.entityId,
          cursor,
        });

        const version_id = generateVersionId({
          entryIdx,
          entityId: action.entityId,
          cursor,
        });

        const action_id = generateActionId({
          space_id: fullEntry.space,
          entity_id: action.entityId,
          attribute_id: action.attributeId,
          value_id: action.value.id,
          cursor,
        });

        return {
          id: action_id,
          action_type: action.type,
          entity_id: action.entityId,
          attribute_id: action.attributeId,
          value_type: action.value.type,
          value_id: action.value.id,
          string_value,
          entity_value,
          proposed_version_id,
          version_id,
          created_at: timestamp,
          created_at_block: blockNumber,
          cursor,
        };
      });
    }
  );

  return actions;
};

interface toGeoEntitiesArgs {
  fullEntries: FullEntry[];
  timestamp: number;
  blockNumber: number;
}
export const toGeoEntities = ({
  fullEntries,
  timestamp,
  blockNumber,
}: toGeoEntitiesArgs) => {
  const entitiesMap: Record<string, s.geo_entities.Insertable> = {};

  fullEntries.forEach((fullEntry) => {
    fullEntry.uriData.actions.map((action) => {
      const {
        isNameCreateAction,
        isNameDeleteAction,
        isDescriptionCreateAction,
        isDescriptionDeleteAction,
      } = actionTypeCheck(action);

      const currentName = entitiesMap[action.entityId]?.name;
      const currentDescription = entitiesMap[action.entityId]?.description;

      const updatedName = isNameCreateAction
        ? action.value.value
        : isNameDeleteAction
        ? null
        : currentName;

      const updatedDescription = isDescriptionCreateAction
        ? action.value.value
        : isDescriptionDeleteAction
        ? null
        : currentDescription;

      entitiesMap[action.entityId] = {
        id: action.entityId,
        name: updatedName,
        description: updatedDescription,
        created_at: timestamp,
        created_at_block: blockNumber,
        updated_at: timestamp,
        updated_at_block: blockNumber,
        created_by_id: fullEntry.author,
      };
    });
  });

  return Object.values(entitiesMap);
};

interface toProposalsArgs {
  fullEntries: FullEntry[];
  blockNumber: number;
  timestamp: number;
  cursor: string;
}
export const toProposals = ({
  fullEntries,
  blockNumber,
  timestamp,
  cursor,
}: toProposalsArgs) => {
  const proposals: s.proposals.Insertable[] = fullEntries.flatMap(
    (fullEntry, entryIdx) => {
      const proposalId = generateProposalId({ entryIdx, cursor });
      return {
        id: proposalId,
        created_at_block: blockNumber,
        created_by_id: fullEntry.author,
        space_id: fullEntry.space,
        created_at: timestamp,
        status: "APPROVED",
      };
    }
  );

  return proposals;
};

interface toProposedVersionArgs {
  fullEntries: FullEntry[];
  blockNumber: number;
  timestamp: number;
  cursor: string;
}
export const toProposedVersions = ({
  fullEntries,
  blockNumber,
  timestamp,
  cursor,
}: toProposedVersionArgs) => {
  const proposedVersions: s.proposed_versions.Insertable[] =
    fullEntries.flatMap((fullEntry, entryIdx) => {
      const uniqueEntityIds = fullEntry.uriData.actions
        .map((action) => action.entityId)
        .filter((value, index, self) => self.indexOf(value) === index);

      return uniqueEntityIds.map((entityId) => {
        const proposedVersionName = fullEntry.uriData.name;
        return {
          id: generateVersionId({ entryIdx, entityId, cursor }),
          entity_id: entityId,
          created_at_block: blockNumber,
          created_at: timestamp,
          name: proposedVersionName ? proposedVersionName : null,
          created_by_id: fullEntry.author,
          proposal_id: generateProposalId({ entryIdx, cursor }),
          space_id: fullEntry.space,
        };
      });
    });

  return proposedVersions;
};

interface toVersionArgs {
  fullEntries: FullEntry[];
  blockNumber: number;
  timestamp: number;
  cursor: string;
}
export const toVersions = ({
  fullEntries,
  blockNumber,
  timestamp,
  cursor,
}: toVersionArgs) => {
  const versions: s.versions.Insertable[] = fullEntries.flatMap(
    (fullEntry, entryIdx) => {
      const uniqueEntityIds = fullEntry.uriData.actions
        .map((action) => action.entityId)
        .filter((value, index, self) => self.indexOf(value) === index);

      return uniqueEntityIds.map((entityId) => {
        const proposedVersionName = fullEntry.uriData.name;
        return {
          id: generateVersionId({ entryIdx, entityId, cursor }),
          entity_id: entityId,
          created_at_block: blockNumber,
          created_at: timestamp,
          name: proposedVersionName ? proposedVersionName : null,
          proposed_version_id: generateVersionId({
            entryIdx,
            entityId,
            cursor,
          }),
          created_by_id: fullEntry.author,
          space_id: fullEntry.space,
        };
      });
    }
  );

  return versions;
};

export const toSpaces = (fullEntries: FullEntry[], blockNumber: number) => {
  const spaces: s.spaces.Insertable[] = fullEntries.flatMap((fullEntry) => ({
    id: fullEntry.space,
    is_root_space: false,
    created_at_block: blockNumber,
  }));

  return spaces;
};

export const toTripleDatabaseTuples = (
  fullEntries: FullEntry[],
  timestamp: number,
  blockNumber: number
) => {
  const triples: TripleDatabaseTuple[] = fullEntries.flatMap((fullEntry) => {
    return fullEntry.uriData.actions.map((action) => {
      const action_type = action.type;

      const entity_id = action.entityId;
      const attribute_id = action.attributeId;
      const value_type = action.value.type;
      const value_id = action.value.id;
      const space_id = fullEntry.space;
      const is_protected = false;
      const id = generateTripleId({
        space_id,
        entity_id,
        attribute_id,
        value_id,
      });

      const entity_value_id = value_type === "entity" ? value_id : null;
      const string_value = value_type === "string" ? action.value.value : null;

      const tupleType =
        action_type === "deleteTriple"
          ? TripleAction.Delete
          : TripleAction.Create;
      return [
        tupleType,
        {
          id,
          entity_id,
          attribute_id,
          value_id,
          value_type,
          entity_value_id,
          string_value,
          space_id,
          is_protected,
          created_at: timestamp,
          created_at_block: blockNumber,
        },
      ] as TripleDatabaseTuple;
    });
  });

  return triples;
};
