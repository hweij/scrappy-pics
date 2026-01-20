//@ts-check

import phash from "sharp-phash";

export const imageExtensions = new Set([".jpeg", ".jpg", ".png", ".webp", ".gif"]);

/**
 * Helper: split file into base name and extension (lower case)
 * 
 * @param {string} fname
 */
export function splitName(fname) {
    const idx = fname.lastIndexOf(".");
    if (idx > 0) {
        const ext = fname.substring(idx + 1, fname.length).toLowerCase();
        const name = fname.substring(0, idx);
        return { name, ext };
    }
    else {
        return { name: fname, ext: "" };
    }
}

/** @param {Buffer} buffer  */
export function createMD5Hash(buffer) {
    return Bun.MD5.hash(buffer, "hex");
}

/** @type {{[id: string]: string}} */
const binToHexTable = {};
/** @type {{[id: string]: string}} */
const hexToBinTable = {};
for (let i = 0; i < 256; i++) {
    const bin = i.toString(2).padStart(8, "0");
    const hex = i.toString(16).padStart(2, "0");
    binToHexTable[bin] = hex;
    hexToBinTable[hex] = bin;
}

/** @param {string} bin */
export function binToHex(bin) {
    const res = [];
    const len = bin.length;
    for (let idx = 0; idx < len; idx += 8) {
        res.push(binToHexTable[bin.slice(idx, idx + 8)]);
    }
    return res.join("");
}
/** @param {string} hex */
export function hexToBin(hex) {
    const res = [];
    const len = hex.length;
    for (let idx = 0; idx < len; idx += 2) {
        res.push(hexToBinTable[hex.slice(idx, idx + 2)]);
    }
    return res.join("");
}
/** @param {Buffer} buffer  */
export async function createPerceptualHash(buffer) {
    const bin = await phash(buffer);
    return bin;
}
