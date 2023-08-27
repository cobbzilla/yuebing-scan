import { ZillaClock } from "zilla-util";
import { MobilettoLogger } from "mobiletto-common";
import { MobilettoOrmRepository } from "mobiletto-orm";
import {
    SourceAssetType,
    LibraryScanType,
    LibraryType,
    LocalConfigType,
    MediaType,
    MediaProfileType,
    SourceScanType,
    SourceType,
    DestinationType,
    ProfileJobType,
    UploadJobType,
} from "yuebing-model";
import { MobilettoConnection } from "mobiletto-base";

export type YbScanConfig = {
    systemName: string;
    logger: MobilettoLogger;
    localConfigRepo: () => MobilettoOrmRepository<LocalConfigType>;
    mediaRepo: () => MobilettoOrmRepository<MediaType>;
    mediaProfileRepo: () => MobilettoOrmRepository<MediaProfileType>;
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
    clock?: ZillaClock;
    scanPollInterval?: number;
    analyzerPollInterval?: number;
    transformerPollInterval?: number;
    uploaderPollInterval?: number;
    runScanner?: boolean;
    runAnalyzer?: boolean;
    runTransformer?: boolean;
    runUploader?: boolean;
    removeLocalFiles?: boolean;
};
