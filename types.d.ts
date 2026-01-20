type ImageInfo = {
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
