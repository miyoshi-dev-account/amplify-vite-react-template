import { defineFunction } from "@aws-amplify/backend";

export const listAllQuickConnects = defineFunction({
    name: "listAllQuickConnects",
    entry: "./handler.ts",
    resourceGroupName: 'data',
    // 詳細の取得を1件ずつ順番に行うため、既定値（3秒）から延長する（AppSync の待ち時間の上限が30秒のため30秒とする）
    timeoutSeconds: 30,
    environment: {
        CONNECT_INSTANCE_ID: "5c9f7d3e-d54b-4d4c-aec6-ccd7308dc833" // 実際のインスタンスIDを設定してください
    }
});