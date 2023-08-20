import { before, after, describe, it } from "mocha";
import { expect } from "chai";
import { shutdownMobiletto } from "mobiletto-base";
import { waitForNonemptyQuery, newTest, ANALYSIS_PROFILE_NAME, OP_UPCASE } from "./setup.js";
import fs from "fs";

let test;

const TRANSFORM_PROFILE_NAME = "toUpperCase";

before(async () => {
    test = await newTest(async (test) => {
        const cfg = test.scanConfig;
        cfg.runAnalyzer = true;
        cfg.runTransformer = true;
        await test.mediaOperationRepo.create({
            name: OP_UPCASE,
            media: "textMedia",
            command: `${test.testDir}/upcase.sh`,
            minFileSize: 10,
        });
        await test.mediaProfileRepo.create({
            name: TRANSFORM_PROFILE_NAME,
            operation: OP_UPCASE,
            media: "textMedia",
            ext: "txt",
            contentType: "text/plain",
        });
    });
});

describe("transform test", async () => {
    it("should scan a directory, discover an asset, analyze it, and transform it", async () => {
        // wait for scanner to create sourceAsset with status==pending
        const scanned = await waitForNonemptyQuery(() => test.sourceAssetRepo.findAll());
        expect(scanned[0].name).eq(test.assetName);

        // wait for analyzer to update sourceAsset with status==finished
        const finishedScans = await waitForNonemptyQuery(
            () => test.sourceAssetRepo.findAll(),
            (a) => a.status === "finished",
            1000 * 60,
        );
        expect(finishedScans[0].name).eq(test.assetName);

        // when the source asset is finished, the analysis profile should also be finished
        const analyzed = await test.profileJobRepo.safeFindBy("asset", test.assetName, {
            predicate: (a) => a.profile === ANALYSIS_PROFILE_NAME,
        });
        expect(analyzed[0].status).eq("finished");

        // wait for transform job to start. It cannot finish because the uploader isn't running
        const startedTransforms = await waitForNonemptyQuery(
            () =>
                test.profileJobRepo.safeFindBy("asset", test.assetName, {
                    predicate: (a) => a.profile === TRANSFORM_PROFILE_NAME,
                }),
            (a) => a.status === "started",
        );
        expect(startedTransforms[0].asset).eq(test.assetName);

        // Wait for UploadJob to appear
        const uploadJobs = await waitForNonemptyQuery(() => test.uploadJobRepo.safeFindBy("asset", test.assetName));
        expect(uploadJobs.length).eq(1);
        expect(uploadJobs[0].status).eq("pending");
        const orig = fs.readFileSync(test.testDir + "/source/sample.txt").toString();
        const data = fs.readFileSync(uploadJobs[0].localPath, "utf8").toString();
        expect(data).eq(orig.toUpperCase());
    });
});

after((done) => {
    if (test.scanner) test.scanner.stop();
    shutdownMobiletto().finally(done);
});
