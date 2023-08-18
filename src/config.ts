import { MobilettoLogger } from "mobiletto-common";
import { MobilettoOrmRepository } from "mobiletto-orm";
import {
    SourceAssetType,
    DestinationAssetType,
    LibraryScanType,
    LibraryType,
    LocalConfigType,
    MediaType,
    MediaProfileType,
    SourceScanType,
    SourceType,
} from "yuebing-model";
import { MobilettoConnection } from "mobiletto-base";
import { MobilettoClock } from "mobiletto-orm-scan-typedef";

export type YbScanConfig = {
    systemName: string;
    scanCheckInterval?: number;
    logger: MobilettoLogger;
    localConfigRepo: () => MobilettoOrmRepository<LocalConfigType>;
    mediaRepo: () => MobilettoOrmRepository<MediaType>;
    mediaProfileRepo: () => MobilettoOrmRepository<MediaProfileType>;
    libraryRepo: () => MobilettoOrmRepository<LibraryType>;
    libraryScanRepo: () => MobilettoOrmRepository<LibraryScanType>;
    sourceScanRepo: () => MobilettoOrmRepository<SourceScanType>;
    sourceRepo: () => MobilettoOrmRepository<SourceType>;
    sourceAssetRepo: () => MobilettoOrmRepository<SourceAssetType>;
    destinationAssetRepo: () => MobilettoOrmRepository<DestinationAssetType>;
    sourceConnections: Record<string, MobilettoConnection>;
    clock?: MobilettoClock;
    downloadPollInterval?: number;
    downloadDir?: string;
};
