import { defineAuth } from '@aws-amplify/backend';

export const auth = defineAuth({
  loginWith: {
    email: true, // Cognito自身のメール/パスワード認証(開発環境の代替手段)
  },
});