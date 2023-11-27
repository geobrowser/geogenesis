import fs from "fs";
import { pool } from "./pool.js";

export async function runSqlFile(filePath: string) {
  try {
    const sql = fs.readFileSync(filePath, "utf8");
    await pool.query(sql);
    console.log(`Executed SQL file: ${filePath}`);
  } catch (err) {
    console.error(`Error executing SQL file: ${filePath}`, err);
  }
}
