import { before, after, describe, it } from "mocha";
import { expect } from "chai";
import { sleep } from "mobiletto-orm-scan-typedef";
import { mobiletto, logger, registerDriver, shutdownMobiletto } from "mobiletto-base";
import { repositoryFactory, rand } from "mobiletto-orm";
import * as os from "os";
import { dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));

import { storageClient as localDriver } from "mobiletto-driver-local";
import { YbScan, ASSET_SEP } from "../lib/esm/index.js";
import {
    resolveConnectionConfig,
    DestinationTypeDef,
    DiscoveredAssetTypeDef,
    LibraryScanTypeDef,
    LibraryTypeDef,
    LocalConfigTypeDef,
    MediaTypeDef,
    SourceScanTypeDef,
    SourceTypeDef,
} from "yuebing-model";

registerDriver("local", localDriver);

const test = {
    factory: null,
    tempDir: null,
    sourceRepo: null,
    destinationRepo: null,
    mediaRepo: null,
    libraryRepo: null,
    localConfigRepo: null,
    libraryScanRepo: null,
    sourceScanRepo: null,
    discoveredAssetRepo: null,
    source: null,
    destination: null,
    media: null,
    library: null,
    connectionConfig: null,
    sourceConnections: null,
    localConfig: null,
    scanner: null,
};

before(async () => {
    if (!test.factory) {
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
        test.libraryRepo = test.factory.repository(LibraryTypeDef);
        test.localConfigRepo = test.factory.repository(LocalConfigTypeDef);
        test.libraryScanRepo = test.factory.repository(LibraryScanTypeDef);
        test.sourceScanRepo = test.factory.repository(SourceScanTypeDef);
        test.discoveredAssetRepo = test.factory.repository(DiscoveredAssetTypeDef);
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
    }
});

describe("scan test", async () => {
    it("should scan a directory and discover and download and analyze an asset", async () => {
        const scanConfig = {
            systemName: test.localConfig.systemName,
            localConfigRepo: () => test.localConfigRepo,
            scanCheckInterval: 1000,
            logger,
            mediaRepo: () => test.mediaRepo,
            discoveredAssetRepo: () => test.discoveredAssetRepo,
            sourceRepo: () => test.sourceRepo,
            libraryRepo: () => test.libraryRepo,
            libraryScanRepo: () => test.libraryScanRepo,
            sourceScanRepo: () => test.sourceScanRepo,
            sourceConnections: test.sourceConnections,
        };
        test.scanner = new YbScan(scanConfig);

        // wait for scanner to discover asset
        let all = await test.discoveredAssetRepo.findAll();
        const start = Date.now();
        const discoverTimeout = 1000 * 15;
        while ((!all || all.length === 0) && Date.now() - start < discoverTimeout) {
            await sleep(5000);
            all = await test.discoveredAssetRepo.findAll();
        }
        expect(all.length).eq(1);
        expect(all[0].name).eq(test.source.name + ASSET_SEP + "sample.txt");

        // wait for downloader to download asset
    });
});

after((done) => {
    if (test.scanner) test.scanner.stop();
    shutdownMobiletto().finally(done);
});
