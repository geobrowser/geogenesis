import { Command } from "commander";
import { Effect } from "effect";
import { runStream } from "./src/runStream.js";
import { resetDatabaseToGenesis } from "./src/utils/resetDatabaseToGenesis.js";

async function main() {
  try {
    const program = new Command();

    program
      .option("--from-genesis", "Start from genesis block")
      .option("--from-cache", "Start from cached block");

    program.parse(process.argv);

    const options = program.opts();

    console.log("Options: ", options);

    if (options.fromGenesis) {
      await resetDatabaseToGenesis();
    }

    if (options.fromCache) {
      // 1. reset database to genesis
      // 2. populate with cached entries + roles
      // 3. update the public.cursor to the cached.cursor
      // 4. carry on streaming
    }

    await Effect.runPromise(runStream());
  } catch (error) {
    console.error("An error occurred:", error);
  }
}

main();
