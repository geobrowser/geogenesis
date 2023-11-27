import * as dotenv from "dotenv";
import * as pg from "pg";
import { invariant } from "./invariant";

dotenv.config();

invariant(process.env.DATABASE_URL, "DATABASE_URL is required");
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 97, // TODO: Confirm with Byron, document if this is a good number
});

pool.on("error", (err) => console.error("Pool Error", err)); // don't let a pg restart kill your app
