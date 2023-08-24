import { MobilettoOrmRepository } from "mobiletto-orm";
import { MobilettoClock } from "mobiletto-orm-scan-typedef";
import { MobilettoConnection } from "mobiletto-base";
import { SourceAssetType, SourceType } from "yuebing-model";
export type DownloadAssetResult = {
    outfile: string;
    conn: MobilettoConnection;
};
export declare const downloadSourceAsset: (downloadDir: string, sourceAsset: SourceAssetType | string, sourceRepo: MobilettoOrmRepository<SourceType>, clock: MobilettoClock) => Promise<DownloadAssetResult | null>;
