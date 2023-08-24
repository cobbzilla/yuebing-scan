import { MobilettoLogger } from "mobiletto-common";
import { DestinationType, ProfileJobType } from "yuebing-model";
import { ParsedProfile } from "yuebing-media";
import { YbTransformer } from "./ybTransformer.js";
import { MobilettoConnection } from "mobiletto-base";
export declare const execTransform: (assetDir: string, downloaded: string, profile: ParsedProfile, job: ProfileJobType, logger: MobilettoLogger, conn: MobilettoConnection) => Promise<string | null>;
export declare const transformAsset: (xform: YbTransformer, job: ProfileJobType, destinations: DestinationType[]) => Promise<boolean>;
