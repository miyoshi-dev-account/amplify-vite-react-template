import { defineFunction } from '@aws-amplify/backend';

export const updateContactAttributes = defineFunction({
    name: 'updateContactAttributes',
    entry: './handler.ts',
    resourceGroupName: 'data'
});