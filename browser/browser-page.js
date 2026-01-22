//@ts-check

import * as path from "path";

import { HTTPResponse, Page } from "puppeteer";

import { createPerceptualHash, imageExtensions } from "../util.js";

import { FileAdmin } from "../file-admin.js";

import clientStyles from "./client-side/styles-import.css" with { type: "text" };
import clientScript from "./client-side/script-import.js" with { type: "text" };

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
            await page.addStyleTag({ content: clientStyles });
            await page.addScriptTag({ content: /** @type string */(clientScript) });

            this.#pageLoaded = true;
            // If image info was already added to the queue, process it now
            for (const info of this.markerInfo) {
                this.addMarkers(info);
            }
            console.log(`Processed ${this.markerInfo.length} queued markers`);
        });

        // page.on("load", async () => {
        //     console.log("PAGE LOAD");
        // });

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
                                                this.addMarkers(info);
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
     * @param {MarkerInfo} info
     */
    addMarkers(info) {
        this.#page.evaluate((url, pdist, type, size) => {
            // @ts-ignore
            addMarker(url, pdist, type, size);
        }, info.url, info.pdist, path.extname(info.name).slice(1).toUpperCase(), `${(info.buffer.byteLength / 1000).toFixed()}K`);
    }
}
