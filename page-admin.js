//@ts-check

import * as path from "path";
import { HTTPResponse, Page } from "puppeteer";
import { createPerceptualHash, imageExtensions } from "./util.js";
import dist from "sharp-phash/distance";

export class PageAdmin {
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
        const pageAdmin = new PageAdmin(page, hashMap);
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

