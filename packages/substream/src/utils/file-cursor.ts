import type { BlockEmitter } from "@substreams/node";
import fs from "fs";

export function onCursor(emitter: BlockEmitter, cursorPath: string) {
    emitter.on("cursor", (cursor) => {
        fs.writeFileSync(cursorPath, cursor, "utf-8");
    });
}

export function readCursor(cursorPath: string) {
    return fs.existsSync(cursorPath) ? fs.readFileSync(cursorPath, 'utf8') : "";
}

