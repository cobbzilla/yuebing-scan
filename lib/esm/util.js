import fs from "fs";
import { basename, sha } from "mobiletto-orm-typedef";
export const prepareOutputDir = (assetDir, downloaded, profile) => {
    const outDir = `${assetDir}/${profile.name}/${sha(downloaded)}`;
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }
    return outDir;
};
export const profileJobName = (sourceAsset, profile) => {
    return [profile.name, basename(sourceAsset.name), sha(sourceAsset.name)].join("~");
};
const MIN_XFER_TIMEOUT = 1000 * 60; // 1 minute
const MAX_XFER_TIMEOUT = 1000 * 60 * 60 * 4; // 4 hours
const MIN_BANDWIDTH = 500 * 1000; // ~500Kbps
export const transferTimeout = (size, bandwidth, minTimeout, maxTimeout) => {
    bandwidth || (bandwidth = MIN_BANDWIDTH);
    minTimeout || (minTimeout = MIN_XFER_TIMEOUT);
    maxTimeout || (maxTimeout = MAX_XFER_TIMEOUT);
    const millis = 1000 * Math.floor(size / bandwidth);
    return Math.min(Math.max(millis, minTimeout), maxTimeout);
};
