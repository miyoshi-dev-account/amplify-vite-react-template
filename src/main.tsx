import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
//import "./index.css";
import { Amplify } from "aws-amplify";
import outputs from "../amplify_outputs.json";

//import { Authenticator } from '@aws-amplify/ui-react';
//import '@aws-amplify/ui-react/styles.css';

//Amplify.configure(outputs);
// 元のAppSyncエンドポイントのホスト名（サブスクリプション開始メッセージの host に使用）
const appsyncHost = new URL(outputs.data.url).host;

// AppSync へのアクセスを、アプリと同じオリジン（CloudFront）経由にする
Amplify.configure(
  {
    ...outputs,
    data: {
      ...outputs.data,
      url: `${window.location.origin}/graphql`,
    },
  },
  {
    // ブラウザは HTTP リクエストの host ヘッダーを上書きできないため、
    // 実質的に WebSocket のサブスクリプション開始メッセージにのみ反映される
    API: { GraphQL: { headers: async () => ({ host: appsyncHost }) } },
  }
);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
