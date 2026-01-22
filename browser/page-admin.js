//@ts-check

import * as path from "path";

import puppeteer, { Page } from "puppeteer";

import { FileAdmin } from "../file-admin.js";
import { BrowserPage } from "./browser-page.js";

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
