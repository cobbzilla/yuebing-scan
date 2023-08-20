import { SourceAssetType } from "yuebing-model";
import { ParsedProfile } from "yuebing-media";
import { YbAnalyzer } from "./ybAnalyzer.js";
export declare const analyzeAsset: (analyzer: YbAnalyzer, sourceAsset: SourceAssetType, downloaded: string, profile: ParsedProfile) => Promise<null | undefined>;
export declare const analyzeSourceAsset: (analyzer: YbAnalyzer, sourceAsset: SourceAssetType) => Promise<boolean>;
