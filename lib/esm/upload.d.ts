import { DestinationType, ProfileJobType } from "yuebing-model";
import { TransformerDaemonType, TransformResult } from "./util.js";
import { ParsedProfile } from "yuebing-media";
export declare const DEFAULT_UPLOAD_POLL_INTERVAL: number;
export declare const uploadFiles: (result: TransformResult, profile: ParsedProfile, job: ProfileJobType, destinations: DestinationType[], daemon: TransformerDaemonType) => Promise<boolean>;
