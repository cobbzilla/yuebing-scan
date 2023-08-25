import { SourceAssetType, UploadJobType } from "yuebing-model";
import { ApplyProfileResponse, ParsedProfile } from "yuebing-media";
import { MobilettoLogger } from "mobiletto-common";
import { MobilettoOrmRepository } from "mobiletto-orm";
export declare const prepareOutputDir: (assetDir: string, downloaded: string, profile: ParsedProfile) => string;
export declare const profileJobName: (sourceAsset: SourceAssetType, profile: ParsedProfile) => string;
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
export declare const transferTimeout: (size: number, bandwidth?: number, minTimeout?: number, maxTimeout?: number) => number;
