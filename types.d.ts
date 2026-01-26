// To prevent warning when importing as text
declare module '*.css';

interface Bookmark {
    name?: string;
    description?: string;
    url: string;
}

interface Config {
    mediaDir: string;
    bookmarks: Bookmark[];
}

interface ImageInfo {
    /** File name with extension, without path */
    name: string,
    /** MD5 hash */
    hash: string,
    /** 64-bit binary representation. When reading/writing to the media info file, it is converted into a hex string */
    phash?: string,
    /** File size in bytes */
    size: number,
    /** True only if the file was found */
    [PRESENT: symbol]: boolean | undefined;
};

interface MarkerInfo {
    name: string;
    url: string;
    pdist: number;
    phash: string;
    buffer: Buffer;
}