import fs from "fs";
import { basename, sha } from "mobiletto-orm-typedef";
import { SourceAssetType, UploadJobType } from "yuebing-model";
import { ApplyProfileResponse, ParsedProfile } from "yuebing-media";
import { MobilettoLogger } from "mobiletto-common";
import { MobilettoOrmRepository } from "mobiletto-orm";

export const prepareOutputDir = (assetDir: string, downloaded: string, profile: ParsedProfile): string => {
    const outDir = `${assetDir}/${profile.name}/${sha(downloaded)}`;
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }
    return outDir;
};

export const profileJobName = (sourceAsset: SourceAssetType, profile: ParsedProfile): string => {
    return [profile.name, basename(sourceAsset.name), sha(sourceAsset.name)].join("~");
};

export type TransformerDaemonType = {
    config: {
        logger: MobilettoLogger;
        uploadJobRepo: () => MobilettoOrmRepository<UploadJobType>;
    };
    stopping: boolean;
    uploadPollInterval: number;
};

export type TransformResult = {
    outDir: string;
    response: ApplyProfileResponse;
};

const MIN_XFER_TIMEOUT = 1000 * 60; // 1 minute
const MAX_XFER_TIMEOUT = 1000 * 60 * 60 * 4; // 4 hours

const MIN_BANDWIDTH = 500 * 1000; // ~500Kbps

export const transferTimeout = (size: number, bandwidth?: number, minTimeout?: number, maxTimeout?: number): number => {
    bandwidth ||= MIN_BANDWIDTH;
    minTimeout ||= MIN_XFER_TIMEOUT;
    maxTimeout ||= MAX_XFER_TIMEOUT;
    const millis = 1000 * Math.floor(size / bandwidth);
    return Math.min(Math.max(millis, minTimeout), maxTimeout);
};
