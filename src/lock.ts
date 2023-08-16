import { MobilettoOrmObject, MobilettoOrmRepository, MobilettoOrmTypeDef } from "mobiletto-orm";
import { MobilettoClock } from "mobiletto-orm-scan-typedef";
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
    clock: MobilettoClock,
    lockRepo: MobilettoOrmRepository<LOCK>,
    targetType: MobilettoOrmTypeDef,
    targetId: string,
    logger: MobilettoLogger,
): Promise<LOCK | null> => {
    const update = Object.assign({}, lock, {
        owner: systemName,
        status: "started",
        started: clock.now(),
    });
    const updated = await lockRepo.update(update);
    const verified = await lockRepo.safeFindFirstBy(targetType.typeName, targetId);
    if (verified?.owner === systemName) {
        return verified;
    } else {
        logger.error(
            `acquireLock error=update_lock updated=${updated._meta?.version} verified=${verified?._meta?.version}`,
        );
        return null;
    }
};

export const acquireLock = async <LOCK extends MobilettoLockType, T extends MobilettoOrmObject>(
    systemName: string,
    clock: MobilettoClock,
    logger: MobilettoLogger,
    lockRepo: MobilettoOrmRepository<LOCK>,
    target: T,
    targetType: MobilettoOrmTypeDef,
    interval: number,
): Promise<LOCK | null> => {
    const targetId = targetType.id(target);
    const lock: LOCK | null = await lockRepo.safeFindFirstBy(targetType.typeName, targetId);
    if (!lock) {
        const toCreate: MobilettoLockType = {
            owner: systemName,
            status: "started",
            started: clock.now(),
        };
        toCreate[targetType.typeName] = targetId;
        const created = await lockRepo.create(toCreate as LOCK);
        const found = await lockRepo.safeFindFirstBy(targetType.typeName, targetId);
        if (found?.owner === systemName) {
            return found;
        } else {
            logger.error(
                `acquireLock found.owner=${found?.owner} expected_owner=${systemName} error=create_lock created=${created._meta?.version} found=${found?._meta?.version}`,
            );
            return null;
        }
    } else if (lock.finished) {
        if (clock.now() - lock.finished > interval) {
            return await claimLock(lock, systemName, clock, lockRepo, targetType, targetId, logger);
        } else {
            logger.warn(`acquireLock warn=recently_scanned finished=${lock.finished}`);
            return null;
        }
    } else if (lock.started) {
        if (clock.now() - lock.started > 4 * interval) {
            return await claimLock(lock, systemName, clock, lockRepo, targetType, targetId, logger);
        } else {
            logger.warn(`acquireLock warn=recently_scanning started=${lock.started}`);
            return null;
        }
    } else {
        return await claimLock(lock, systemName, clock, lockRepo, targetType, targetId, logger);
    }
};
