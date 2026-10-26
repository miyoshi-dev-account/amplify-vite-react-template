import { defineFunction } from "@aws-amplify/backend";

export const namingTest = defineFunction({
    name: "namingTest",
    entry: "./handler.ts"
});
