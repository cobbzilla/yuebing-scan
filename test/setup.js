import * as fs from "fs";
import * as os from "os";
import { dirname } from "path";
import { fileURLToPath } from "url";
import { rand, repositoryFactory } from "mobiletto-orm";
import { logger, mobiletto } from "mobiletto-base";
import {
    resolveConnectionConfig,
    DestinationTypeDef,
    LibraryScanTypeDef,
    LibraryTypeDef,
    LocalConfigTypeDef,
    MediaProfileTypeDef,
    MediaTypeDef,
    ProfileJobTypeDef,
    SourceAssetTypeDef,
    SourceScanTypeDef,
    SourceTypeDef,
    UploadJobTypeDef,
} from "yuebing-model";

const __dirname = dirname(fileURLToPath(import.meta.url));

const ensureDir = (dir) => {
    const stat = fs.statSync(dir, { throwIfNoEntry: false });
    if (!stat) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
};

export const newTest = async () => {
    logger.setLogLevel("info");

    const test = {
        factory: null,
        tempDir: null,
        sourceRepo: null,
        destinationRepo: null,
        libraryRepo: null,
        mediaRepo: null,
        mediaProfileRepo: null,
        mediaOperationRepo: null,
        localConfigRepo: null,
        libraryScanRepo: null,
        sourceScanRepo: null,
        sourceAssetRepo: null,
        profileJobRepo: null,
        uploadJobRepo: null,
        source: null,
        destination: null,
        media: null,
        library: null,
        connectionConfig: null,
        sourceConnections: null,
        downloadDir: null,
        assetDir: null,
        localConfig: null,
        scanner: null,
    };
    const srcDir = __dirname + "/source";
    test.tempDir = `${os.tmpdir()}/ybScanTest_${rand(8)}`;
    const tmp = await mobiletto("local", test.tempDir, null, {
        createIfNotExist: true,
    });
    tmp.name = "tmp";

    test.factory = repositoryFactory([tmp]);
    test.sourceRepo = test.factory.repository(SourceTypeDef);
    test.destinationRepo = test.factory.repository(DestinationTypeDef);
    test.mediaRepo = test.factory.repository(MediaTypeDef);
    test.mediaProfileRepo = test.factory.repository(MediaProfileTypeDef);
    test.libraryRepo = test.factory.repository(LibraryTypeDef);
    test.localConfigRepo = test.factory.repository(LocalConfigTypeDef);
    test.libraryScanRepo = test.factory.repository(LibraryScanTypeDef);
    test.sourceScanRepo = test.factory.repository(SourceScanTypeDef);
    test.sourceAssetRepo = test.factory.repository(SourceAssetTypeDef);
    test.profileJobRepo = test.factory.repository(ProfileJobTypeDef);
    test.uploadJobRepo = test.factory.repository(UploadJobTypeDef);
    test.downloadDir = ensureDir("/tmp/yb_test/download");
    test.assetDir = ensureDir("/tmp/yb_test/asset");
    test.source = {
        name: "tempSource",
        type: "local",
        local: { key: srcDir },
    };
    await test.sourceRepo.create(test.source);

    test.destination = {
        name: "tempDestination",
        type: "local",
        local: { key: test.tempDir },
    };
    await test.destinationRepo.create(test.destination);

    test.media = {
        name: "textMedia",
        ext: ["txt"],
    };
    await test.mediaRepo.create(test.media);

    test.library = {
        name: "tempLibrary",
        sources: ["tempSource"],
        destinations: ["tempDestination"],
        media: "textMedia",
        autoscanEnabled: true,
        autoscan: { interval: 10000 },
    };
    await test.libraryRepo.create(test.library);

    test.connectionConfig = resolveConnectionConfig(test.source);
    test.sourceConnections = {
        tempSource: await mobiletto(
            test.source.type,
            test.connectionConfig.key,
            test.connectionConfig.secret,
            test.connectionConfig.opts,
            test.source.encryption,
        ),
    };

    test.localConfig = {
        systemName: "testSystem",
        autoscanEnabled: true,
        autoscan: { initialDelay: 10000 },
    };
    await test.localConfigRepo.create(test.localConfig);

    test.scanConfig = () => ({
        systemName: test.localConfig.systemName,
        localConfigRepo: () => test.localConfigRepo,
        scanCheckInterval: 1000,
        logger,
        mediaRepo: () => test.mediaRepo,
        mediaProfileRepo: () => test.mediaProfileRepo,
        sourceRepo: () => test.sourceRepo,
        libraryRepo: () => test.libraryRepo,
        libraryScanRepo: () => test.libraryScanRepo,
        sourceScanRepo: () => test.sourceScanRepo,
        sourceAssetRepo: () => test.sourceAssetRepo,
        profileJobRepo: () => test.profileJobRepo,
        uploadJobRepo: () => test.uploadJobRepo,
        sourceConnections: test.sourceConnections,
        downloadDir: test.downloadDir,
        assetDir: test.assetDir,
        runAnalyzer: false,
        runTransformer: false,
        runUploader: false,
    });
    return test;
};
