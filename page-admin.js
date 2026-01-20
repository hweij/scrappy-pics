//@ts-check

import * as path from "path";
import puppeteer, { HTTPResponse, Page } from "puppeteer";
import { createPerceptualHash, imageExtensions } from "./util.js";
import dist from "sharp-phash/distance";

export class BrowserAdmin {
    /**
     * Per-page administration
     *
     * @type {Map<Page, BrowserPage>}
     */
    pages = new Map();

    /** @type Page | undefined */
    uiPage;

    /** @type Map<string, ImageInfo> */
    fileMap = new Map();

    /** @type Config */
    config;

    /**
     *
     * @param {Map<string, ImageInfo>} fileMap
     * @param {Config} config
     */
    constructor(fileMap, config) {
        this.fileMap = fileMap;
        this.config = config;
    }

    /**
     * Create a new administration for the given page
     *
     * @param {Page?} page
     * @param {Map<string,ImageInfo>} hashMap
     */
    async addPage(page, hashMap) {
        if (page) {
            const pageAdmin = await BrowserPage.create(page, hashMap);
            this.pages.set(page, pageAdmin);
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

            console.warn("No page specified to remove");
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
            await this.addPage(await target.page(), this.fileMap);
            console.log("New page created");
        });
        // Called when a page has been destroyed
        browser.on('targetdestroyed', async (target) => {
            this.removePage(await target.page());
            console.log(`Page closed`);
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
                        await this.addPage(page, this.fileMap);
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

        // Observe all pages, apart from the UI page
        for (const page of pages) {
            if (page !== this.uiPage) {
                this.addPage(page, this.fileMap);
            }
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
    /** @type Map<string, ImageInfo> */
    #fileMap;

    /**
     * Queued image info to be processed when the DOM content has been loaded
     * @type {{ url: string, pdist: number }[]}
     */
    imageInfo = [];

    /** True when the current DOM content has loaded */
    #pageLoaded = false;

    /** @param {Page} page
     * @param {Map<string, ImageInfo>} fileMap
      */
    constructor(page, fileMap) {
        this.#page = page;
        this.#fileMap = fileMap;
    }

    /** @param {Page} page
     * @param {Map<string,ImageInfo>} hashMap
    */
    static async create(page, hashMap) {
        const pageAdmin = new BrowserPage(page, hashMap);
        await pageAdmin.init();
        return pageAdmin;
    }

    /** Initialize the page */
    async init() {
        const page = this.#page;

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
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0px 4px;
  line-height: 1;
  color: white;
  min-width: 20px;
  min-height: 20px;
  width: max-content;
  border: 1.5px solid white;
  border-radius: 10px;
}
.marker.similar > div {
  background-color: green;
}`
            });
            this.#pageLoaded = true;
            // If image info was already added to the queue, process it now
            for (const { url, pdist } of this.imageInfo) {
                this.addMarkers(url, pdist);
            }
            console.log(`Processed ${this.imageInfo.length} queued markers`);
            this.imageInfo.length = 0;
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
                this.imageInfo.length = 0;
            }
        });

        // Handle incoming responses
        page.on('response', this.handleResponse);
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
                    const fileName = last.split("?")[0];
                    if (fileName) {
                        const ext = path.extname(fileName).toLowerCase();
                        if (imageExtensions.has(ext)) {
                            response.buffer().then(
                                file => {
                                    const phash = createPerceptualHash(file).then(
                                        phash => {
                                            // Add image to this page's collection
                                            let pdist = this.#fileMap.values().reduce((s, e) => (e.phash ? Math.min(s, dist(e.phash, phash)) : s), 100)
                                            this.#buffers.set(url, file);
                                            if (this.#pageLoaded) {
                                                this.addMarkers(url, pdist);
                                            }
                                            else {
                                                // DOM content not yet loaded: queue data
                                                this.imageInfo.push({ url, pdist });
                                            }
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
     * @param {string} url
     * @param {number} pdist
     */
    addMarkers(url, pdist) {
        this.#page.evaluate((url, pdist) => {
            const img = /** @type HTMLElement */ (document.querySelector(`img[src="${url}"]`));
            if (img) {
                const color = (pdist < 10) ? ((pdist < 5) ? "green" : "blue") : "red";
                img.insertAdjacentHTML(
                    "beforebegin",
                    `<div class="marker"><div style="background-color: ${color};">${pdist}</div></div>`);
            }
        }, url, pdist);
    }
}
