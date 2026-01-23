//@ts-check

import * as path from "path";

import { HTTPResponse, Page } from "puppeteer";

import { createPerceptualHash, imageExtensions } from "../util.js";

import { FileAdmin } from "../file-admin.js";

import clientStyles from "./client-side/styles-import.css" with { type: "text" };
import { pageScript } from "./client-side/script-evaluate.js";

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
            if (url) {
                let info = this.markerInfo.find(e => e.url === url);
                if (!info) {
                    console.log("No info found, fetching page again..");
                    // TODO: No info available (anymore). Fetch page again.
                    await page.reload();
                    await page.waitForNetworkIdle();
                    info = this.markerInfo.find(e => e.url === url);
                    if (info) {
                        console.log("Info found!");
                    }
                    else {
                        console.log("Could not retrieve info, try refreshing the page and download image again.");
                    }
                }
                if (info) {
                    console.log(`Saving ${info.name}, ${info.buffer.byteLength} bytes`);
                    console.log(url);
                    await this.#fileAdmin.addImage(info.name, info.buffer, { phash: info.phash });
                    this.addMarkers([{ url: info.url, name: info.name, buffer: info.buffer, pdist: 0, phash: info.phash }]);
                }
                else {
                    console.log("No info found");
                }
            }
        });

        // Called when page has fully loaded
        page.on("domcontentloaded", async () => {
            console.log("DOM content loaded");

            await page.addStyleTag({ content: clientStyles });
            try {
                await page.evaluate(pageScript);
            }
            catch (e) {
                console.log("Cannot initialize script for this page");
                console.log(e);
            }
        });

        page.on("load", async () => {
            console.log("PAGE LOAD");
            // Page needs some time before we can process the images
            await page.waitForNetworkIdle();

            this.#pageLoaded = true;
            // If image info was already added to the queue, process it now
            this.addMarkers(this.markerInfo);
            console.log(`Processed ${this.markerInfo.length} queued markers`);
        });

        // Handle incoming responses
        page.on('response', this.handleResponse);

        // Called when requesting data
        // We use this to detect actual navigation instead of the "framenavigated"
        // event because that is also triggered when navigating inside the page.
        page.on('request', (req) => {
            if (req.isNavigationRequest()) {
                const frame = req.frame();
                const isMain = frame === page.mainFrame();
                if (isMain) {
                    // Clear requested url that belong to the old page
                    console.log(`CLEARING BUFFERS (${this.#buffers.size})`)
                    this.#buffers.clear();
                    this.#pageLoaded = false;
                    this.markerInfo.length = 0;
                }
            }
        });
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
                                                this.addMarkers([info]);
                                            }
                                            this.markerInfo.push(info);
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
     * @param {MarkerInfo[]} markers
     */
    addMarkers(markers) {
        this.#page.evaluate((mList) => {
            // @ts-ignore
            if (window.addMarkers) {
                // @ts-ignore
                window.addMarkers(mList);
            }
            else {
                console.log("Cannot find window.addMarkers");
            }
        }, markers.map(info => ({
            url: info.url,
            pdist: info.pdist,
            type: path.extname(info.name).slice(1).toUpperCase(),
            size: `${(info.buffer.byteLength / 1000).toFixed()}K`
        })
        ));
    }
}
