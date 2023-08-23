import * as fs from "fs";
import { before, after, describe, it } from "mocha";
import { expect } from "chai";
import { waitForNonemptyQuery, newTest, ANALYSIS_PROFILE_NAME, cleanupTest } from "./setup.js";
import { setupTransformObjects, TRANSFORM_PROFILE_NAME } from "./xform-helper.js";
import { connectVolume } from "yuebing-model";
import { destinationPath } from "yuebing-media";

let test;

before(async () => {
    test = await newTest(async (test) => {
        await setupTransformObjects(test);
        test.scanConfig.runUploader = true;
        test.scanConfig.removeLocalFiles = false;
    });
});

describe("upload test", async () => {
    it("should scan a directory, discover an asset, analyze it, transform it, and upload it", async () => {
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

        // wait for transform job to finish
        const finishedTransforms = await waitForNonemptyQuery(
            () =>
                test.profileJobRepo.safeFindBy("asset", test.assetName, {
                    predicate: (a) => a.profile === TRANSFORM_PROFILE_NAME,
                }),
            (a) => a.status === "finished",
        );
        expect(finishedTransforms[0].asset).eq(test.assetName);

        // UploadJob should already be finished
        const uploadJobs = await test.uploadJobRepo.safeFindBy("asset", test.assetName);
        expect(uploadJobs.length).eq(1);
        const uploadJob = uploadJobs[0];
        expect(uploadJob.status).eq("finished");
        expect(uploadJob.finished).lt(finishedTransforms[0].finished); // upload finishes, then xform
        const orig = fs.readFileSync(test.testDir + "/source/sample.txt").toString();
        const data = fs.readFileSync(uploadJob.localPath, "utf8").toString();
        expect(data).eq(orig.toUpperCase());

        // transformed file should now be available at the destination
        const destConn = await connectVolume(test.destination);
        const destPath = destinationPath(uploadJob.asset, uploadJob.media, uploadJob.profile, uploadJob.localPath);
        const uploadedData = await destConn.safeReadFile(destPath);
        expect(uploadedData).is.not.null;
        expect(uploadedData.toString()).eq(data);
    });
});

after((done) => cleanupTest(test, done));
