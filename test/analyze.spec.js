import { before, after, describe, it } from "mocha";
import { expect } from "chai";
import { waitForNonemptyQuery, newTest, cleanupTest } from "./setup.js";

let test;

before(async () => {
    test = await newTest((test) => (test.scanConfig.runAnalyzer = true));
});

describe("analyze test", async () => {
    it("should scan a directory, discover an asset, and analyze it", async () => {
        // wait for scanner to create sourceAsset with status==pending
        const scanned = await waitForNonemptyQuery(() => test.sourceAssetRepo.findAll());
        expect(scanned).is.not.null;
        expect(scanned.length).eq(1);
        expect(scanned[0].name).eq(test.assetName);

        // wait for analyzer to update sourceAsset with status==finished
        const finishedScans = await waitForNonemptyQuery(
            () => test.sourceAssetRepo.findAll(),
            (a) => a.status === "finished",
        );
        expect(finishedScans).is.not.null;
        expect(finishedScans.length).eq(1);
        expect(finishedScans[0].name).eq(test.assetName);

        // when the source asset is finished, the analysis profile should also be finished
        const analyzed = await test.profileJobRepo.safeFindBy("asset", test.assetName);
        expect(analyzed).is.not.null;
        expect(analyzed.length).eq(1);
        expect(analyzed[0].asset).eq(test.assetName);
        expect(analyzed[0].status).eq("finished");
        expect(analyzed[0].finished).is.not.null;
        expect(analyzed[0].finished).gt(analyzed[0].started);
        expect(analyzed[0].finished).gt(finishedScans[0].started);
        expect(analyzed[0].analysis).is.not.null;
        expect(analyzed[0].analysis).is.not.undefined;
        const analysis = JSON.parse(analyzed[0].analysis);
        expect(analysis).eq(5);
    });
});

after((done) => cleanupTest(test, done));
