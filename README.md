# Scrappy pics

A tool to download and manage images, and detect duplicates and similar images.

The tool makes use of puppeteer and is independent of the site visited. When viewing a page with images,
it shows summary info and the "distance" to other images in your collection. A color coding is used
to give an impression of similarity:

- Green: a very similar image is probably already in the collection
- Blue: undecided, a similar image could be in the collection or not
- Red: no similar image is in the collection yet

To add an image to the collection, simply click on the "distance" button.

## Installing and running the application

To install dependencies, use npm or other package manager:

```
npm install
```

To run, use bun:

```
bun run index.js
```

It is possible to support other runtimes, but for now this is the one used.

## Configuration

To configure your app, create a file named "config.json" in the root of this package. In this file, you can set:

- mediaDir: the folder that contains the image collection
- bookmarks: a list of UIRLs for easy navigation. See "config-template.json" for an example.

```
{
    "mediaDir": "C:\\my-images",
    "bookmarks": [
        "https://safebooru.org/",
        "https://my-other-site.com/"
    ]
}
```

## Credits

We make use of the following software packages:

- puppeteer, a JavaScript library which provides a high-level API to control Chrome or Firefox: https://github.com/puppeteer/puppeteer
- sharp, High performance Node.js image processing: https://github.com/lovell/sharp
- sharp-phash, Sharp based implementation of perceptual hash (phash) algorithm: https://github.com/btd/sharp-phash
