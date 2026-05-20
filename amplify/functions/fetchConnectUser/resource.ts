import { defineFunction } from "@aws-amplify/backend";

export const fetchConnectUser = defineFunction({
    name: "fetchConnectUser",
    entry: "./handler.ts"
});