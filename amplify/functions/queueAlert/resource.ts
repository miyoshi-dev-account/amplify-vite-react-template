import { defineFunction } from "@aws-amplify/backend";

export const queueAlert = defineFunction({
    name: "queueAlert",
    entry: "./handler.ts",
    // 約1分間（5秒間隔×11回）のループ処理を行うため、既定値（3秒）から延長する
    timeoutSeconds: 60
});