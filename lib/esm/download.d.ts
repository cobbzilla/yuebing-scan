import { MobilettoOrmRepository } from "mobiletto-orm";
import { MobilettoClock } from "mobiletto-orm-scan-typedef";
import { SourceAssetType, SourceType } from "yuebing-model";
export declare const downloadSourceAsset: (downloadDir: string, sourceAsset: SourceAssetType | string, sourceRepo: MobilettoOrmRepository<SourceType>, clock: MobilettoClock) => Promise<string | null>;
