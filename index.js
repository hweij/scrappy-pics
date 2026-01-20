//@ts-check

import * as path from 'path';
import * as fs from "fs";

import { BrowserAdmin } from "./page-admin.js";
import { FileAdmin } from './file-admin.js';

/** Initial URL from command line */
const initialURL = Bun.argv[2] || null;

/**
 * Configuration file
 * @type Config
 */
let config = {
    mediaDir: "downloads",
    bookmarks: []
};
try {
    const filePath = path.resolve(__dirname, "config.json");
    const txt = fs.readFileSync(filePath, { encoding: "utf8" });
    const jso = JSON.parse(txt);
    Object.assign(config, jso);
}
catch (e) {
    console.log("config.json is not present or incorrect. Creating a new configuration");
};
console.log(config);

/** Directory where the media is located */
const mediaDir = path.resolve(__dirname, config.mediaDir);
console.log(`Saving files to ${mediaDir}`);
// Make sure the media directory exists
fs.mkdirSync(mediaDir, { recursive: true });

const fileAdmin = new FileAdmin(mediaDir);
await fileAdmin.scan();
console.log("File admin ready");

// console.log("Scanning for similar images..");
// fileAdmin.testPhash();
// console.log("Done scanning for similar images..");

const browserAdmin = new BrowserAdmin(fileAdmin, config);
browserAdmin.onDisconnect = () => {
    fileAdmin.saveInfo();
}

await browserAdmin.init(initialURL);
