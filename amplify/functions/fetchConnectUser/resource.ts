import { defineFunction } from "@aws-amplify/backend";

export const fetchConnectUser = defineFunction({
    name: "fetchConnectUser",
    entry: "./handler.ts",
    // Kinesis のイベントを複数件まとめて受け取り、1件ずつ AppSync に問い合わせて処理するため、既定値（3秒）から延長する
    timeoutSeconds: 30
});