import { createPullRequest } from './server/services/prService.js';
import dotenv from 'dotenv';
dotenv.config();

(async () => {
  const token = process.env.GITHUB_TOKEN; // Ensure this is a valid token if you want to test
  console.log("Token length:", token ? token.length : 0);
})();
