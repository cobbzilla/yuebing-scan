import { YbAnalyzer } from "./ybAnalyzer";
import { SourceAssetType } from "yuebing-model";
import { ParsedProfile } from "yuebing-media";
export declare const analyzeAsset: (processor: YbAnalyzer, sourceAsset: SourceAssetType, downloaded: string, profile: ParsedProfile) => Promise<null | undefined>;
export declare const analyzeSourceAsset: (processor: YbAnalyzer, sourceAsset: SourceAssetType) => Promise<void>;
