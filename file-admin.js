//@ts-check

import * as path from 'path';
import * as fs from "fs";

import dist from "sharp-phash/distance";

import { binToHex, createMD5Hash, createPerceptualHash, hexToBin, imageExtensions, splitName } from './util.js';

/** Symbol key to indicate the file matching the entry exists */
const PRESENT = Symbol("PRESENT");

const INFO_NAME = "info.json";

export class FileAdmin {
    /** @type string */
    #mediaPath;
    #equalHash = 0;
    /** @type { {imageInfo: ImageInfo[]} } */
    #info = { imageInfo: [] };

    /** @type Map<string, ImageInfo> */
    fileMap = new Map();
    /** @type Map<string,ImageInfo> */
    #hashMap = new Map();
    /** @type Map<string, ImageInfo[]> */
    #duplicates = new Map();
    /** Will be true if any changes were made to the info file */
    changes = 0;

    /** @param {string} mediaPath
    */
    constructor(mediaPath) {
        this.#mediaPath = mediaPath;
    }

    /**
     * Scan media file path and update media file.
     */
    async scan() {
        console.log(`Directory set to ${this.#mediaPath}`);
        console.log("Collecting file info...");

        this.changes = 0;

        if (this.#mediaPath) {
            let totalFiles = 0;
            let imagesAdded = 0;
            this.#equalHash = 0;

            try {
                // *****
                // Read or create info file
                try {
                    const txt = fs.readFileSync(path.join(this.#mediaPath, INFO_NAME), { encoding: "utf8" });
                    const jso = JSON.parse(txt, (k, v) => (k === "phash") ? hexToBin(v) : v);
                    this.#info = jso;
                }
                catch (e) {
                    console.log("Media info file not present or incorrect. Creating a new one.");
                };

                this.#hashMap.clear();
                this.#duplicates.clear();
                this.fileMap.clear();

                // Load info from media info json
                for (const e of this.#info.imageInfo) {
                    this.registerImageInfo(e);
                    //                fileMap.set(e.name, e);
                }

                // *****
                // Scan files and match with info file
                const entries = fs.readdirSync(this.#mediaPath, { withFileTypes: true });
                for await (const entry of entries) {
                    const name = entry.name;
                    const filePath = path.join(entry.parentPath, name);
                    totalFiles++;
                    if (entry.isFile()) {
                        const ext = path.extname(name).toLowerCase();
                        if (imageExtensions.has(ext)) {
                            let info = this.fileMap.get(name);
                            /** @type string */
                            let hash;
                            if (info) {
                                hash = info.hash;
                                // Add phash if not present yet
                                if (!info.phash) {
                                    const file = fs.readFileSync(filePath);
                                    info.phash = await createPerceptualHash(file);
                                    console.log(`Adding phash to ${info.name}`);
                                    this.changes++;
                                }
                            }
                            else {
                                const file = fs.readFileSync(filePath);
                                hash = createMD5Hash(file);
                                // Add perceptual hash
                                const phash = await createPerceptualHash(file);
                                // fileMap.set(name, { name, hash: hash, size: file.size });
                                info = { name, hash, phash, size: file.byteLength };
                                this.changes++;
                                this.registerImageInfo(info);
                                imagesAdded++;
                            }
                            // Mark file as present
                            info[PRESENT] = true;
                            const eq = (hash === name.split(".")[0]);
                            if (eq) {
                                this.#equalHash++;
                            }
                        }
                    }
                    if ((totalFiles % 100) === 0) {
                        this.update();
                    }
                }

                this.update();

                {   // Remove entries with file missing
                    let missingFiles = 0;
                    for (const [k, e] of this.fileMap.entries()) {
                        if (!e[PRESENT]) {
                            const res = this.fileMap.delete(k);
                            this.changes++;
                            missingFiles++;
                        }
                    }
                    if (missingFiles > 0) {
                        console.log(`Removed ${missingFiles} missing files`);
                    }
                }

                console.log(`Total number of files: ${totalFiles}, images: ${this.#equalHash}/${this.fileMap.size} equal to hash`);
                console.log(`Added ${imagesAdded} images`);

                if (this.changes > 0) {
                    console.log(`${this.changes} changes: saving info`);
                    this.saveInfo();
                }

                console.log("Scanned all files and updated info");

            } catch (e) {
                console.log("Exception:");
                console.log(e);
            }
        }
    }

    /**
     * Registers image info.
     *
     * @param {ImageInfo} info
     */
    registerImageInfo(info) {
        // Add to name map
        this.fileMap.set(info.name, info);
        // Add to hash map (and duplicates if needed)
        const hash = info.hash;
        const dup = this.#hashMap.get(hash);
        if (dup) {
            // Already exists
            let dups = this.#duplicates.get(hash);
            if (!dups) {
                // Create a new duplicate list and add the first image info
                dups = [dup];
                this.#duplicates.set(hash, dups);
            }
            // Add to duplicates
            dups.push(info);
        }
        else {
            // Does not exist yet: register it
            this.#hashMap.set(hash, info);
        }
    }

    update() {
        console.log(`${this.fileMap.size} files, ${this.#duplicates.size} duplicate entries, ${this.changes} changes`);
    }

    saveInfo() {
        this.#info.imageInfo = Array.from(this.fileMap.values());
        console.log(`Scanned ${this.#info.imageInfo.length} images`);
        const res = JSON.stringify(this.#info, (k, v) => (k === "phash") ? binToHex(v) : v, 2);
        this.changes = 0;
        return Bun.write(path.join(this.#mediaPath, INFO_NAME), res);
    }

    // TEST TEST
    testPhash() {
        const lst = Array.from(this.fileMap.values());
        const N = Math.min(10000, lst.length);
        for (let i = 0; i < N; i++) {
            const e1 = lst[i];
            if (e1?.phash) {
                for (let j = i + 1; j < N; j++) {
                    const e2 = lst[j];
                    if (e2?.phash) {
                        if (dist(e1.phash, e2.phash) < 5) {
                            console.log(`SIM: ${e1.name}, ${e2.name}`);
                        }
                    }
                }
            }
        }
    }
}
