// Bundled into js/vendor/amplify-bundle.js (run: npm run build:cloud)
import { Amplify } from 'aws-amplify';
import { signUp, signIn, signOut, getCurrentUser, updatePassword, deleteUser } from 'aws-amplify/auth';
import { generateClient } from 'aws-amplify/data';

window.AmplifyLib = { Amplify, signUp, signIn, signOut, getCurrentUser, updatePassword, deleteUser, generateClient };
