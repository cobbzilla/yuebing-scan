var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const claimLock = (lock, systemName, clock, lockRepo, targetId, logger) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const startedAt = clock.now();
    const update = Object.assign({}, lock, {
        owner: systemName,
        status: "started",
        started: startedAt,
    });
    console.info(`claimLock: updating LOCK: ${JSON.stringify(lock)}`);
    const updated = yield lockRepo.update(update);
    const verified = yield lockRepo.safeFindById(targetId);
    if ((verified === null || verified === void 0 ? void 0 : verified.owner) === systemName && (verified === null || verified === void 0 ? void 0 : verified.status) === "started" && (verified === null || verified === void 0 ? void 0 : verified.started) === startedAt) {
        return verified;
    }
    else {
        logger.error(`acquireLock error=update_lock updated=${(_a = updated._meta) === null || _a === void 0 ? void 0 : _a.version} verified=${(_b = verified === null || verified === void 0 ? void 0 : verified._meta) === null || _b === void 0 ? void 0 : _b.version}`);
        return null;
    }
});
export const acquireLock = (systemName, clock, logger, lockRepo, targetId, targetType, lockTimeout) => __awaiter(void 0, void 0, void 0, function* () {
    var _c, _d;
    if (!targetType.primary) {
        throw new Error(`acquireLock: cannot lock on type that has no 'primary' field: ${targetType.typeName}`);
    }
    const lock = yield lockRepo.safeFindById(targetId);
    if (!lock) {
        const toCreate = {
            owner: systemName,
            status: "started",
            started: clock.now(),
        };
        toCreate[targetType.primary] = targetId;
        console.info(`acquireLock: creating LOCK<${targetType.typeName}>: ${JSON.stringify(toCreate)}`);
        const created = yield lockRepo.create(toCreate);
        const found = yield lockRepo.safeFindById(targetId);
        if ((found === null || found === void 0 ? void 0 : found.owner) === systemName) {
            return found;
        }
        else {
            logger.error(`acquireLock found.owner=${found === null || found === void 0 ? void 0 : found.owner} expected_owner=${systemName} error=create_lock created=${(_c = created._meta) === null || _c === void 0 ? void 0 : _c.version} found=${(_d = found === null || found === void 0 ? void 0 : found._meta) === null || _d === void 0 ? void 0 : _d.version}`);
            return null;
        }
    }
    else if (lock.finished) {
        logger.warn(`acquireLock warn=recently_scanned finished=${lock.finished}`);
        return null;
    }
    else if (lock.started) {
        if (clock.now() - lock.started > lockTimeout) {
            return yield claimLock(lock, systemName, clock, lockRepo, targetId, logger);
        }
        else {
            logger.warn(`acquireLock warn=recently_scanning started=${lock.started}`);
            return null;
        }
    }
    else {
        return yield claimLock(lock, systemName, clock, lockRepo, targetId, logger);
    }
});
