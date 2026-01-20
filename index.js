//@ts-check

import * as path from 'path';
import * as fs from "fs";

import puppeteer, { Page } from 'puppeteer';

import { PageAdmin } from "./page-admin.js";
import { FileAdmin } from './file-admin.js';

/** Initial URL from command line */
const initialURL = Bun.argv[2] || null;

/** @type Map<string, ImageInfo> */
const fileMap = new Map();

/** Configuration file */
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
    console.log("config.json os not present or incorrect. Creating a new configuration");
};
console.log(config);

/** Directory where the media is located */
const mediaDir = path.resolve(__dirname, config.mediaDir);
console.log(`Saving files to ${mediaDir}`);
// Make sure the media directory exists
fs.mkdirSync(mediaDir, { recursive: true });

const fileAdmin = new FileAdmin(mediaDir, fileMap);
await fileAdmin.scan();
console.log("File admin ready");

// console.log("Scanning for similar images..");
// fileAdmin.testPhash();
// console.log("Done scanning for similar images..");

/**
 * Per-page administration
 *
 * @type {Map<Page, PageAdmin>}
 */
const pages = new Map();

// Launch the browser and select/open a blank page.
const browser = await puppeteer.launch({ headless: false, defaultViewport: null });

// Called when a new page has been created
browser.on('targetcreated', async function (target) {
    await addPage(await target.page(), fileMap);
    console.log("New page created");
});
// Called when a page has been destroyed
browser.on('targetdestroyed', async function (target) {
    removePage(await target.page());
    console.log(`Page closed`);
});

await initBrowser(initialURL);

/** @type Page | undefined */
var uiPage;

/**
 * Initialize browser state
 *
 * @param {string?} initialURL
 */
async function initBrowser(initialURL) {
    const pages = await browser.pages();
    // UI page: first open page. Create a new one if needed.
    uiPage = pages[0];
    if (!uiPage) {
        uiPage = await browser.newPage();
    }
    uiPage.on("domcontentloaded", () => {
        if (uiPage) {

            /** Browser-side function to open a new tab with a given url */
            uiPage.exposeFunction('openTab', async (/** @type {string} */ url) => {
                console.log("OPEN TAB " + url);
                if (url) {
                    const page = await browser.newPage();
                    await page.goto(url);
                    await addPage(page, fileMap);
                    page.bringToFront();
                }
            });

            /** Update bookmarks in browser */
            uiPage.evaluate(config => {
                const bookmarks = document.getElementById("bookmarks");
                if (bookmarks) {
                    bookmarks.innerHTML = config.bookmarks.map(url => `<div class="bookmark" onclick="openTab('${url}')">${url}</div>`).join("");
                }
            }, config);
        }
    });
    await uiPage.goto("file:///" + path.resolve(__dirname, "ui/index.html"));

    // If a start url is specified, add a page for it.
    if (initialURL) {
        const page = await browser.newPage();
        await page.goto(initialURL);
    }

    // Observe all pages, apart from the UI page
    for (const page of pages) {
        if (page !== uiPage) {
            addPage(page, fileMap);
        }
    }
}

/**
 * Create a new administration for the given page
 *
 * @param {Page?} page
 * @param {Map<string,ImageInfo>} hashMap
 */
async function addPage(page, hashMap) {
    if (page) {
        const pageAdmin = await PageAdmin.create(page, hashMap);
        pages.set(page, pageAdmin);
    }
    else {
        console.warn("No page specified to add");
    }
}

/**
 * Remove admin for the given page
 *
 * @param {Page?} page
 */
function removePage(page) {
    if (page) {
        if (page !== uiPage) {
            const success = pages.delete(page);
            if (!success) {
                console.warn(`Could not find page to be removed`);
            }
        }
    }
    else {

        console.warn("No page specified to remove");
    }
}
