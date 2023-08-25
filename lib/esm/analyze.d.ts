import { MobilettoConnection } from "mobiletto-base";
import { SourceAssetType } from "yuebing-model";
import { ParsedProfile } from "yuebing-media";
import { YbAnalyzer } from "./ybAnalyzer.js";
export declare const analyzeAsset: (analyzer: YbAnalyzer, sourceAsset: SourceAssetType, downloaded: string, profile: ParsedProfile, conn: MobilettoConnection) => Promise<boolean>;
export declare const analyzeSourceAsset: (analyzer: YbAnalyzer, sourceAsset: SourceAssetType) => Promise<boolean>;
