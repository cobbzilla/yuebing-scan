import { SourceAssetType } from "yuebing-model";
import { ParsedProfile } from "yuebing-media";
import { YbAnalyzer } from "./ybAnalyzer.js";
import { MobilettoConnection } from "mobiletto-base";
export declare const analyzeAsset: (analyzer: YbAnalyzer, sourceAsset: SourceAssetType, downloaded: string, profile: ParsedProfile, conn: MobilettoConnection) => Promise<null | undefined>;
export declare const analyzeSourceAsset: (analyzer: YbAnalyzer, sourceAsset: SourceAssetType) => Promise<boolean>;
