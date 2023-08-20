import { MobilettoLogger } from "mobiletto-common";
import { MobilettoOrmRepository } from "mobiletto-orm";
import { SourceAssetType, LibraryScanType, LibraryType, LocalConfigType, MediaType, MediaProfileType, SourceScanType, SourceType, DestinationType, MediaOperationType, ProfileJobType, UploadJobType } from "yuebing-model";
import { MobilettoConnection } from "mobiletto-base";
import { MobilettoClock } from "mobiletto-orm-scan-typedef";
export type YbScanConfig = {
    systemName: string;
    scanCheckInterval?: number;
    logger: MobilettoLogger;
    localConfigRepo: () => MobilettoOrmRepository<LocalConfigType>;
    mediaRepo: () => MobilettoOrmRepository<MediaType>;
    mediaProfileRepo: () => MobilettoOrmRepository<MediaProfileType>;
    mediaOperationRepo: () => MobilettoOrmRepository<MediaOperationType>;
    libraryRepo: () => MobilettoOrmRepository<LibraryType>;
    libraryScanRepo: () => MobilettoOrmRepository<LibraryScanType>;
    sourceScanRepo: () => MobilettoOrmRepository<SourceScanType>;
    sourceRepo: () => MobilettoOrmRepository<SourceType>;
    destinationRepo: () => MobilettoOrmRepository<DestinationType>;
    sourceAssetRepo: () => MobilettoOrmRepository<SourceAssetType>;
    profileJobRepo: () => MobilettoOrmRepository<ProfileJobType>;
    uploadJobRepo: () => MobilettoOrmRepository<UploadJobType>;
    sourceConnections: Record<string, MobilettoConnection>;
    downloadDir: string;
    assetDir: string;
    clock?: MobilettoClock;
    analyzerPollInterval?: number;
    jobPollInterval?: number;
};
