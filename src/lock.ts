import { ZillaClock } from "zilla-util";
import { MobilettoOrmObject, MobilettoOrmRepository, MobilettoOrmTypeDef } from "mobiletto-orm";
import { MobilettoLogger } from "mobiletto-common";

export type MobilettoLockType = MobilettoOrmObject & {
    owner?: string;
    status?: string;
    started?: number;
    finished?: number;
};

const claimLock = async <LOCK extends MobilettoLockType>(
    lock: LOCK,
    systemName: string,
    clock: ZillaClock,
    lockRepo: MobilettoOrmRepository<LOCK>,
    targetId: string,
    logger: MobilettoLogger,
): Promise<LOCK | null> => {
    const startedAt = clock.now();
    const update = Object.assign({}, lock, {
        owner: systemName,
        status: "started",
        started: startedAt,
    });
    logger.info(`claimLock: updating LOCK: ${JSON.stringify(lock)}`);
    const updated = await lockRepo.update(update);
    const verified = await lockRepo.safeFindById(targetId);
    if (verified?.owner === systemName && verified?.status === "started" && verified?.started === startedAt) {
        return verified;
    } else {
        logger.error(
            `acquireLock error=update_lock updated=${updated._meta?.version} verified=${verified?._meta?.version}`,
        );
        return null;
    }
};

export const acquireLock = async <LOCK extends MobilettoLockType>(
    systemName: string,
    clock: ZillaClock,
    logger: MobilettoLogger,
    lockRepo: MobilettoOrmRepository<LOCK>,
    targetId: string,
    targetType: MobilettoOrmTypeDef,
    lockTimeout: number,
): Promise<LOCK | null> => {
    if (!targetType.primary) {
        throw new Error(`acquireLock: cannot lock on type that has no 'primary' field: ${targetType.typeName}`);
    }
    const lock: LOCK | null = await lockRepo.safeFindById(targetId);
    if (!lock) {
        const toCreate: MobilettoLockType = {
            owner: systemName,
            status: "started",
            started: clock.now(),
        };
        toCreate[targetType.primary] = targetId;
        logger.info(`acquireLock: creating LOCK<${targetType.typeName}>: ${JSON.stringify(toCreate)}`);
        const created = await lockRepo.create(toCreate as LOCK);
        const found = await lockRepo.safeFindById(targetId);
        if (found?.owner === systemName) {
            return found;
        } else {
            logger.error(
                `acquireLock found.owner=${found?.owner} expected_owner=${systemName} error=create_lock created=${created._meta?.version} found=${found?._meta?.version}`,
            );
            return null;
        }
    } else if (lock.finished) {
        logger.debug(`acquireLock warn=recently_finished finished=${lock.finished}`);
        return null;
    } else if (lock.started) {
        if (clock.now() - lock.started > lockTimeout) {
            return await claimLock(lock, systemName, clock, lockRepo, targetId, logger);
        } else {
            logger.debug(`acquireLock warn=recently_started started=${lock.started}`);
            return null;
        }
    } else {
        return await claimLock(lock, systemName, clock, lockRepo, targetId, logger);
    }
};
