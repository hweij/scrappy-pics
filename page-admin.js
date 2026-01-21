//@ts-check

import * as path from "path";

import puppeteer, { HTTPResponse, Page } from "puppeteer";

import { createPerceptualHash, imageExtensions } from "./util.js";

import { FileAdmin } from "./file-admin.js";

export class BrowserAdmin {
    /**
     * Per-page administration
     *
     * @type {Map<Page, BrowserPage>}
     */
    pages = new Map();

    /** @type Page | undefined */
    uiPage;

    /** @type FileAdmin */
    fileAdmin;

    /** @type Config */
    config;

    /**
     * Callback on browser disconnect
     *
     * @type (() => void) | undefined
     */
    onDisconnect;

    /**
     *
     * @param {FileAdmin} fileAdmin
     * @param {Config} config
     */
    constructor(fileAdmin, config) {
        this.fileAdmin = fileAdmin;
        this.config = config;
    }

    /**
     * Create a new administration for the given page
     *
     * @param {Page?} page
     */
    async addPage(page) {
        if (page) {
            if (!this.pages.has(page)) {
                const pageAdmin = await BrowserPage.create(page, this.fileAdmin);
                this.pages.set(page, pageAdmin);
            }
            else {
                console.log("******** Page added multiple times");
            }
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
    removePage(page) {
        if (page) {
            if (page !== this.uiPage) {
                const success = this.pages.delete(page);
                if (!success) {
                    console.warn(`Could not find page to be removed`);
                }
            }
        }
        else {
            console.log("No page specified to remove");
        }
    }

    /**
     * Initialize browser state
     *
     * @param {string?} initialURL
     */
    async init(initialURL) {

        // Launch the browser and select/open a blank page.
        const browser = await puppeteer.launch({ headless: false, defaultViewport: null });

        // Called when a new page has been created
        browser.on('targetcreated', async (target) => {
            await this.addPage(await target.page());
            console.log("New page created");
        });
        // Called when a page has been destroyed
        browser.on('targetdestroyed', async (target) => {
            this.removePage(await target.page());
            console.log(`Page closed`);
        });

        browser.on("disconnected", () => {
            console.log("BROWSER CLOSED");
            if (this.onDisconnect) {
                this.onDisconnect();
            }
        });

        const pages = await browser.pages();
        // UI page: first open page. Create a new one if needed.
        this.uiPage = pages[0];
        if (!this.uiPage) {
            this.uiPage = await browser.newPage();
        }
        this.uiPage.on("domcontentloaded", () => {
            if (this.uiPage) {

                /** Browser-side function to open a new tab with a given url */
                this.uiPage.exposeFunction('openTab', async (/** @type {string} */ url) => {
                    console.log("OPEN TAB " + url);
                    if (url) {
                        const page = await browser.newPage();
                        await page.goto(url);
                        page.bringToFront();
                    }
                });

                /** Update bookmarks in browser */
                this.uiPage.evaluate(config => {
                    const bookmarks = document.getElementById("bookmarks");
                    if (bookmarks) {
                        bookmarks.innerHTML = config.bookmarks.map(url => `<div class="bookmark" onclick="openTab('${url}')">${url}</div>`).join("");
                    }
                }, this.config);
            }
        });
        await this.uiPage.goto("file:///" + path.resolve(__dirname, "ui/index.html"));

        // If a start url is specified, add a page for it.
        if (initialURL) {
            const page = await browser.newPage();
            await page.goto(initialURL);
        }
    }
}

export class BrowserPage {
    /** @type Page */
    #page;
    /**
     * Maps image URLs to image request buffers
     *
     * @type Map<string, Buffer>
     */
    #buffers = new Map();
    /** @type FileAdmin */
    #fileAdmin;

    /**
     * Queued image info to be processed when the DOM content has been loaded
     * @type {MarkerInfo[]}
     */
    markerInfo = [];

    /** True when the current DOM content has loaded */
    #pageLoaded = false;

    /** @param {Page} page
     * @param {FileAdmin} fileAdmin
      */
    constructor(page, fileAdmin) {
        this.#page = page;
        this.#fileAdmin = fileAdmin;
    }

    /** @param {Page} page
     * @param {FileAdmin} fileAdmin
    */
    static async create(page, fileAdmin) {
        const pageAdmin = new BrowserPage(page, fileAdmin);
        await pageAdmin.init();
        return pageAdmin;
    }

    /** Initialize the page */
    async init() {
        const page = this.#page;

        /** Browser-side function to save an image with a given url */
        page.exposeFunction('saveImage', async (/** @type {string} */ url) => {
            console.log("SAVE IMAGE " + url);
            if (url) {
                const info = this.markerInfo.find(e => e.url === url);
                console.log(`Save image ${url}...`);
                if (info) {
                    console.log(`Saving ${info.name}, ${info.buffer.byteLength} bytes`);
                    await this.#fileAdmin.addImage(info.name, info.buffer, { phash: info.phash });
                    this.addMarkers({ url: info.url, name: info.name, buffer: info.buffer, pdist: 0, phash: info.phash });
                }
                else {
                    console.log("No info found");
                }
            }
        });

        // Called when page has fully loaded
        page.on("domcontentloaded", async () => {
            console.log("DOM content loaded");
            await page.addStyleTag({
                content: `
.marker {
  position: absolute;
  z-index: 10;
  width: 0px;
  height: 0px;
}
.marker > div {
  width: max-content;
}
.marker-button {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0px 4px;
  line-height: 1;
  color: white;
  min-width: 20px;
  min-height: 20px;
  border: 1.5px solid white;
  border-radius: 10px;
  cursor: pointer;
}`
            });
            this.#pageLoaded = true;
            // If image info was already added to the queue, process it now
            for (const info of this.markerInfo) {
                this.addMarkers(info);
            }
            console.log(`Processed ${this.markerInfo.length} queued markers`);
        });

        // Called when navigating to a new document (frame, actually)
        page.on("framenavigated", frame => {
            const isMain = frame === page.mainFrame();
            console.log(`FRAME NAVIGATED: ${isMain}`);
            if (isMain) {
                // Clear requested url that belong to the old page
                console.log(`CLEARING BUFFERS (${this.#buffers.size})`)
                this.#buffers.clear();
                this.#pageLoaded = false;
                this.markerInfo.length = 0;
            }
        });

        // Handle incoming responses
        page.on('response', this.handleResponse);

        page.on('request', (req) => console.log("**** REQUEST, type = " + req.resourceType()));
    }

    /** Handle response that applies to this page */
    handleResponse =
        /** @param {HTTPResponse} response */
        (response) => {
            const url = response.url();
            if (response.request().resourceType() === 'image') {
                // console.log(`resp ${url}`);
                const last = url.split('/').pop();
                if (last) {
                    // Remove query part
                    const name = last.split("?")[0];
                    if (name) {
                        const ext = path.extname(name).toLowerCase();
                        if (imageExtensions.has(ext)) {
                            response.buffer().then(
                                buffer => {
                                    createPerceptualHash(buffer).then(
                                        phash => {
                                            // Add image to this page's collection
                                            let pdist = this.#fileAdmin.getMinDist(phash);
                                            this.#buffers.set(url, buffer);
                                            const info = { url, pdist, phash, name, buffer };
                                            if (this.#pageLoaded) {
                                                // DOM content already loaded: add markers directly
                                                // (if DOM content not yet loaded, this will be done on load)
                                                this.addMarkers(info);
                                            }
                                            this.markerInfo.push(info);
                                            // try {
                                            //     const filePath = path.resolve(__dirname, "downloads", fileName);
                                            //     console.log(`Saving image: ${fileName}`);
                                            //     const writeStream = fs.createWriteStream(filePath);
                                            //     writeStream.write(file);
                                            // }
                                            // catch (e) {
                                            //     console.error(e);
                                            // }
                                        }
                                    )
                                }
                            )
                        }
                    }
                }
            }
        }

    /**
     *
     * @param {MarkerInfo} info
     */
    addMarkers(info) {
        this.#page.evaluate((url, pdist, type, size) => {
            const img = /** @type HTMLImageElement */ (document.querySelector(`img[src="${url}"]`));
            if (img) {
                const color = (pdist < 11) ? ((pdist < 5) ? "green" : "blue") : "red";
                const marker = img.previousElementSibling;
                if ((marker instanceof HTMLElement) && (marker.className === "marker")) {
                    // Remove the marker if it already existed
                    marker.remove();
                }
                img.insertAdjacentHTML(
                    "beforebegin",
                    `
<div class="marker">
  <div class="marker-button" style="background-color: ${color};" onclick="saveImage('${url}')">${pdist}</div>
  <div style="background-color: #00000033; color: white;">${type} ${size} ${img.naturalWidth}x${img.naturalHeight}</div>
</div>`);
            }
        }, info.url, info.pdist, path.extname(info.name).slice(1).toUpperCase(), `${(info.buffer.byteLength / 1000).toFixed()}K`);
    }
}
