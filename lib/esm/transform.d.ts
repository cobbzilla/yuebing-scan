import { DestinationType, ProfileJobType } from "yuebing-model";
import { MobilettoLogger } from "mobiletto-common";
import { ParsedProfile } from "yuebing-media";
import { MobilettoClock } from "mobiletto-orm-scan-typedef";
import { YbTransformer } from "./ybTransformer.js";
export declare const execTransform: (assetDir: string, downloaded: string, profile: ParsedProfile, job: ProfileJobType, logger: MobilettoLogger, clock: MobilettoClock) => Promise<string | null>;
export declare const transformAsset: (xform: YbTransformer, job: ProfileJobType, destinations: DestinationType[]) => Promise<boolean>;
