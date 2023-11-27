import { bootstrapRoot } from "../bootstrapRoot.js";
import { runSqlFile } from "./runSqlFile.js";

export const resetPublicTablesToGenesis = async () => {
  try {
    await runSqlFile("./src/sql/clearPublicTables.sql");
    await bootstrapRoot();
  } catch (err) {
    console.error("Error resetting database:", err);
  }
};
