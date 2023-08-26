import { ZillaClock } from "zilla-util";
import { MobilettoOrmRepository } from "mobiletto-orm";
import { MobilettoConnection } from "mobiletto-base";
import { SourceAssetType, SourceType } from "yuebing-model";
export type DownloadAssetResult = {
    outfile: string;
    conn: MobilettoConnection;
};
export declare const downloadSourceAsset: (downloadDir: string, sourceAsset: SourceAssetType | string, sourceRepo: MobilettoOrmRepository<SourceType>, clock: ZillaClock) => Promise<DownloadAssetResult | null>;
