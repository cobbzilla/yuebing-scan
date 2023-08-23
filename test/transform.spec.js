import * as fs from "fs";
import { before, after, describe, it } from "mocha";
import { expect } from "chai";
import { waitForNonemptyQuery, newTest, ANALYSIS_PROFILE_NAME, cleanupTest } from "./setup.js";
import { setupTransformObjects, TRANSFORM_PROFILE_NAME } from "./xform-helper.js";

let test;

before(async () => {
    test = await newTest(async (test) => {
        await setupTransformObjects(test);
        test.scanConfig.removeLocalFiles = false;
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

after((done) => cleanupTest(test, done));
