import { OP_UPCASE, TEST_OPS, textMediaPlugin } from "./setup.js";
import { updateMediaProfile } from "yuebing-media";

export const TRANSFORM_PROFILE_NAME = "toUpperCase";

export const setupTransformObjects = async (test) => {
    const cfg = test.scanConfig;
    cfg.runAnalyzer = true;
    cfg.runTransformer = true;
    TEST_OPS[OP_UPCASE] = {
        name: OP_UPCASE,
        media: "textMedia",
        command: `${test.testDir}/upcase.sh`,
        minFileSize: 10,
    };
    const upcaseProfile = {
        name: TRANSFORM_PROFILE_NAME,
        operation: OP_UPCASE,
        ext: "txt",
        contentType: "text/plain",
    };
    await updateMediaProfile(textMediaPlugin, upcaseProfile, test.mediaProfileRepo);
};
