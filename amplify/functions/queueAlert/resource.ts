import { defineFunction } from "@aws-amplify/backend";

export const queueAlert = defineFunction({
    name: "queueAlert",
    entry: "./handler.ts"
});