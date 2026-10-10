import { defineAuth } from '@aws-amplify/backend';
import { preSignUp } from './pre-sign-up/resource';

/**
 * Accounts live in a Cognito user pool.
 * WORD QUEST signs people in by *username*, so the front-end turns the username
 * into a private login id "<username>@wordquest.example". The pre-sign-up
 * function below confirms those accounts automatically (no email code needed).
 * The player's real, optional email is stored in the UserProfile table.
 */
export const auth = defineAuth({
  loginWith: { email: true },
  triggers: { preSignUp }
});
