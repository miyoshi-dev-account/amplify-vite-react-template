import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
//import "./index.css";
import { Amplify } from "aws-amplify";
import outputs from "../amplify_outputs.json";

//import { Authenticator } from '@aws-amplify/ui-react';
//import '@aws-amplify/ui-react/styles.css';

//Amplify.configure(outputs);
// AppSync へのアクセスを、アプリと同じオリジン（CloudFront）経由にする
Amplify.configure({
  ...outputs,
  data: {
    ...outputs.data,
    url: `${window.location.origin}/graphql`,
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
