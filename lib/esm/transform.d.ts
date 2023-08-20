import { DestinationType, ProfileJobType } from "yuebing-model";
import { MobilettoLogger } from "mobiletto-common";
import { ParsedProfile } from "yuebing-media";
import { YbTransformer } from "./ybTransformer.js";
export declare const execTransform: (assetDir: string, downloaded: string, profile: ParsedProfile, job: ProfileJobType, logger: MobilettoLogger) => Promise<string | null>;
export declare const transformAsset: (xform: YbTransformer, job: ProfileJobType, destinations: DestinationType[]) => Promise<boolean>;
