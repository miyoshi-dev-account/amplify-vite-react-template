import { defineFunction } from '@aws-amplify/backend';

export const originAuthorizer = defineFunction({
    name: 'originAuthorizer',
    entry: './handler.ts',
    // data スタックから参照されるため同じスタックに配置する（function スタックとの循環参照を避ける）
    resourceGroupName: 'data',
});
