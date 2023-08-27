import { OP_SPLIT_WORDS_INTO_FILES, OP_UPCASE, TEST_OPS, textMediaPlugin } from "./setup.js";
import { updateMediaProfile } from "yuebing-media";

export const XFORM_UPCASE_PROFILE_NAME = "toUpperCase";
export const XFORM_SPLIT_PROFILE_NAME = "splitWords";

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
        name: XFORM_UPCASE_PROFILE_NAME,
        operation: OP_UPCASE,
        ext: "txt",
        contentType: "text/plain",
    };
    await updateMediaProfile(textMediaPlugin, upcaseProfile, test.mediaProfileRepo);
};

export const setupUploadObjects = async (test) => {
    const cfg = test.scanConfig;
    cfg.runAnalyzer = true;
    cfg.runTransformer = true;
    TEST_OPS[OP_SPLIT_WORDS_INTO_FILES] = {
        name: OP_SPLIT_WORDS_INTO_FILES,
        media: "textMedia",
        command: `${test.testDir}/split-words-into-files.sh`,
        minFileSize: 1,
    };
    const splitProfile = {
        name: XFORM_SPLIT_PROFILE_NAME,
        operation: OP_SPLIT_WORDS_INTO_FILES,
        ext: "txt",
        contentType: "text/plain",
        additionalAssets: ["^summary\\.md$"],
    };
    const parsed = await updateMediaProfile(textMediaPlugin, splitProfile, test.mediaProfileRepo);
    console.log(`parsed=${JSON.stringify(parsed, null, 2)}`);
    return parsed;
};
