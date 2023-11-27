import * as db from "zapatos/db";
import { upsertCachedRoles } from "./populateCache";
import { pool } from "./utils/pool";
import { RoleChange } from "./zod";

export const handleRoleGranted = async ({
  roleGranted,
  blockNumber,
  cursor,
}: {
  roleGranted: RoleChange;
  blockNumber: number;
  cursor: string;
}) => {
  try {
    const role = roleGranted.role;
    const isAdminRole = role === "ADMIN";
    const isMemberRole = role === "MEMBER";
    const isModeratorRole = role === "MODERATOR";

    console.log("Handling role granted:", roleGranted);

    upsertCachedRoles({
      roleChange: roleGranted,
      blockNumber,
      cursor,
      type: "GRANTED",
    });

    if (isAdminRole) {
      await db
        .insert("space_admins", {
          space_id: roleGranted.space,
          account_id: roleGranted.account,
        })
        .run(pool);
    } else if (isMemberRole) {
      await db
        .insert("space_editors", {
          space_id: roleGranted.space,
          account_id: roleGranted.account,
        })
        .run(pool);
    } else if (isModeratorRole) {
      await db
        .insert("space_editor_controllers", {
          space_id: roleGranted.space,
          account_id: roleGranted.account,
        })
        .run(pool);
    }
  } catch (error) {
    console.error("Error handling role granted:", error);
  }
};

export const handleRoleRevoked = async ({
  roleRevoked,
  blockNumber,
  cursor,
}: {
  roleRevoked: RoleChange;
  blockNumber: number;
  cursor: string;
}) => {
  try {
    const role = roleRevoked.role;
    const isAdminRole = role === "ADMIN";
    const isMemberRole = role === "MEMBER";
    const isModeratorRole = role === "MODERATOR";

    console.log("Handling role revoked:", roleRevoked);

    upsertCachedRoles({
      roleChange: roleRevoked,
      blockNumber,
      cursor,
      type: "REVOKED",
    });

    if (isAdminRole) {
      await db
        .deletes("space_admins", {
          space_id: roleRevoked.space,
          account_id: roleRevoked.account,
        })
        .run(pool);
    } else if (isMemberRole) {
      await db
        .deletes("space_editors", {
          space_id: roleRevoked.space,
          account_id: roleRevoked.account,
        })
        .run(pool);
    } else if (isModeratorRole) {
      await db
        .deletes("space_editor_controllers", {
          space_id: roleRevoked.space,
          account_id: roleRevoked.account,
        })
        .run(pool);
    } else {
      console.error("Unknown revoked role:", role);
    }
  } catch (error) {
    console.error("Error handling role revoked:", error);
  }
};
