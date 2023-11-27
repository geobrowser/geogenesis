import { Command } from "commander";
import { Effect } from "effect";
import { populateFromCache } from "./src/populateCache.js";
import { runStream } from "./src/runStream.js";
import { resetPublicTablesToGenesis } from "./src/utils/resetPublicTablesToGenesis.js";

async function main() {
  try {
    const program = new Command();

    program
      .option("--from-genesis", "Start from genesis block")
      .option("--from-cache", "Start from cached block");

    program.parse(process.argv);

    const options = program.opts();

    if (options.fromGenesis) {
      await resetPublicTablesToGenesis();
    }

    if (options.fromCache) {
      await resetPublicTablesToGenesis();
      const startBlockNum = await populateFromCache();
      await Effect.runPromise(runStream(startBlockNum));
    } else {
      await Effect.runPromise(runStream());
    }
  } catch (error) {
    console.error("An error occurred:", error);
  }
}

main();
