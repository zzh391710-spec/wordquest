import type { PreSignUpTriggerHandler } from 'aws-lambda';

const LOGIN_DOMAIN = '@wordquest.example';

/** Auto-confirm accounts created by the WORD QUEST sign-up form. */
export const handler: PreSignUpTriggerHandler = async (event) => {
  const email = String(event.request.userAttributes.email || '').toLowerCase();
  if (email.endsWith(LOGIN_DOMAIN)) {
    event.response.autoConfirmUser = true;
    event.response.autoVerifyEmail = true;
  }
  return event;
};
