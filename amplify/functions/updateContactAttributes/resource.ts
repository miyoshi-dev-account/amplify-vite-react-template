import { defineFunction } from '@aws-amplify/backend';

export const updateContactAttributes = defineFunction({
    name: 'updateContactAttributes',
    entry: './handler.ts',
    resourceGroupName: 'data',
    environment: {
        CONNECT_INSTANCE_ID: "5c9f7d3e-d54b-4d4c-aec6-ccd7308dc833" // 実際のインスタンスIDを設定してください
    }
});