import { defineFunction } from '@aws-amplify/backend';

export const originAuthorizer = defineFunction({
    name: 'originAuthorizer',
    entry: './handler.ts',
});
