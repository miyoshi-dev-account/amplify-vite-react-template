import { type ClientSchema, a, defineData } from "@aws-amplify/backend";
import { updateContactAttributes } from '../functions/updateContactAttributes/resource';
import { getContactInfo } from '../functions/getContactInfo/resource';
import { searchQueues } from '../functions/searchQueues/resource';

/*== STEP 1 ===============================================================
The section below creates a Todo database table with a "content" field. Try
adding a new "isDone" field as a boolean. The authorization rule below
specifies that any user authenticated via an API key can "create", "read",
"update", and "delete" any "Todo" records.
=========================================================================*/
const schema = a.schema({
  Todo: a
    .model({
      content: a.string(),
    })
    .authorization((allow) => [allow.publicApiKey()]),

  /* UserList用データ定義追加 */
  UserList: a
    .model({
      instanceAlias: a.string(),
      userName: a.string(),
      agentId: a.string(),
      directoryUserId: a.string(),
      firstName: a.string(),
      lastName: a.string(),
      emailAddress: a.string(),
      securityProfileIds: a.string(),
      routingProfileId: a.string(),
      hierarchyGroupId: a.string(),
      acwTimeLimit: a.string(),
      autoAccept: a.string(),
      phoneType: a.string(),
      deviceId: a.string(),
      inQueueAlert: a.json(), /*{
        blowserPhone: a.string(),
        realtimeMetrics: a.string(),
        __typename: a.string()
      }*/
      status: a.string(),
      statusStartTimestamp: a.string(),
      correspondingQueue: a.string(),
      outboundQueueListId: a.string(),
      queueList: a.json()  // キューによるフィルター用の項目
    })
    .authorization((allow) => [allow.publicApiKey()]),

  /* メトリクスデータ定義 */
  QueueMetrics: a
    .model({
      queueId: a.string(),
      queueName: a.string(),
      contactsInQueue: a.integer(),
      oldestContactAge: a.integer()
    })
    .authorization((allow) => [allow.publicApiKey()]),

  /* 転送時のコンタクト属性設定用API（Lambda）定義 */
  updateContactAttributes: a
    .query()
    .arguments({
      //instanceId: a.string().required(),
      contactId: a.string().required(),
      customName: a.string().required(),
      queueName: a.string().required(),
    })
    .returns(
      a.customType({
        success: a.boolean().required(),
        message: a.string().required(),
      })
    )
    .handler(a.handler.function(updateContactAttributes))
    .authorization((allow) => [allow.publicApiKey()]), // Lambda関数を紐付け

  /* 通話終了時のコンタクト情報参照用API（Lambda）定義 */
  getContactInfo: a
    .query()
    .arguments({
      //instanceId: a.string().required(),
      contactId: a.string().required(),
    })
    .returns(
      a.customType({
        success: a.boolean().required(),
        queueName: a.string().required(),
        phoneNumber: a.string().required(),
        transferCustomName: a.string(),
        transferQueueName: a.string(),
        initiationMethod: a.string(),
      })
    )
    .handler(a.handler.function(getContactInfo))
    .authorization((allow) => [allow.publicApiKey()]),

  searchQueues: a
    .query()
    // arguments は不要になったため削除（またはコメントアウト）
    // .arguments({
    //   instanceId: a.string().required(),
    // })
    .returns(
      a.customType({
        success: a.boolean().required(),
        queues: a.string().required(),
      })
    )
    .handler(a.handler.function(searchQueues))
    .authorization((allow) => [allow.publicApiKey()]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: "apiKey",
    // API Key is used for a.allow.public() rules
    apiKeyAuthorizationMode: {
      expiresInDays: 30,
    },
  },
});

/*== STEP 2 ===============================================================
Go to your frontend source code. From your client-side code, generate a
Data client to make CRUDL requests to your table. (THIS SNIPPET WILL ONLY
WORK IN THE FRONTEND CODE FILE.)

Using JavaScript or Next.js React Server Components, Middleware, Server
Actions or Pages Router? Review how to generate Data clients for those use
cases: https://docs.amplify.aws/gen2/build-a-backend/data/connect-to-API/
=========================================================================*/

/*
"use client"
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";

const client = generateClient<Schema>() // use this Data client for CRUDL requests
*/

/*== STEP 3 ===============================================================
Fetch records from the database and use them in your frontend component.
(THIS SNIPPET WILL ONLY WORK IN THE FRONTEND CODE FILE.)
=========================================================================*/

/* For example, in a React component, you can use this snippet in your
  function's RETURN statement */
// const { data: todos } = await client.models.Todo.list()

// return <ul>{todos.map(todo => <li key={todo.id}>{todo.content}</li>)}</ul>
