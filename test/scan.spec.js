import { before, after, describe, it } from "mocha";
import { expect } from "chai";
import { sleep } from "mobiletto-orm-scan-typedef";
import { logger, registerDriver, shutdownMobiletto } from "mobiletto-base";

import { storageClient as localDriver } from "mobiletto-driver-local";

import { YbScanner } from "../lib/esm/index.js";
import { ASSET_SEP } from "yuebing-media";
import { newTest } from "./setup.js";

registerDriver("local", localDriver);

let test;

before(async () => {
    test = await newTest();
});

describe("scan test", async () => {
    it("should scan a directory and discover and download and analyze an asset", async () => {
        const scanConfig = {
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
        };
        test.scanner = new YbScanner(scanConfig);
        logger.setLogLevel("info");

        // wait for scanner to discover asset
        let all = await test.sourceAssetRepo.findAll();
        const start = Date.now();
        const discoverTimeout = 1000 * 15;
        while ((!all || all.length === 0) && Date.now() - start < discoverTimeout) {
            await sleep(5000);
            all = await test.sourceAssetRepo.findAll();
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
