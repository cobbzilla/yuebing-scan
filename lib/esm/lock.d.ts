import { ZillaClock } from "zilla-util";
import { MobilettoOrmObject, MobilettoOrmRepository, MobilettoOrmTypeDef } from "mobiletto-orm";
import { MobilettoLogger } from "mobiletto-common";
export type MobilettoLockType = MobilettoOrmObject & {
    owner?: string;
    status?: string;
    started?: number;
    finished?: number;
};
export declare const acquireLock: <LOCK extends MobilettoLockType>(systemName: string, clock: ZillaClock, logger: MobilettoLogger, lockRepo: MobilettoOrmRepository<LOCK>, targetId: string, targetType: MobilettoOrmTypeDef, lockTimeout: number) => Promise<LOCK | null>;
