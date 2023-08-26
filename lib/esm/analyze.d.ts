import { MobilettoConnection } from "mobiletto-base";
import { ProfileJobType, SourceAssetType } from "yuebing-model";
import { ParsedProfile } from "yuebing-media";
import { TransformResult } from "./util.js";
import { YbAnalyzer } from "./ybAnalyzer.js";
export declare const analyzeAsset: (analyzer: YbAnalyzer, sourceAsset: SourceAssetType, downloaded: string, profile: ParsedProfile, conn: MobilettoConnection, analysisResults: ProfileJobType[]) => Promise<TransformResult | null>;
export declare const analyzeSourceAsset: (analyzer: YbAnalyzer, sourceAsset: SourceAssetType) => Promise<boolean>;
