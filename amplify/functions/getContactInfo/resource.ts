import { defineFunction } from '@aws-amplify/backend';

export const getContactInfo = defineFunction({
    name: 'getContactInfo',
    entry: './handler.ts',
    resourceGroupName: 'data'
});