import { MobilettoOrmObject, MobilettoOrmRepository, MobilettoOrmTypeDef } from "mobiletto-orm";
import { MobilettoClock } from "mobiletto-orm-scan-typedef";
import { MobilettoLogger } from "mobiletto-common";
export type MobilettoLockType = MobilettoOrmObject & {
    owner?: string;
    status?: string;
    started?: number;
    finished?: number;
};
export declare const acquireLock: <LOCK extends MobilettoLockType>(systemName: string, clock: MobilettoClock, logger: MobilettoLogger, lockRepo: MobilettoOrmRepository<LOCK>, targetId: string, targetType: MobilettoOrmTypeDef, lockTimeout: number) => Promise<LOCK | null>;