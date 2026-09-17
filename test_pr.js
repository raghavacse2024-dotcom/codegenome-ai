import { createPullRequest } from './server/services/prService.js';
import dotenv from 'dotenv';
dotenv.config();
(async () => {
  try {
    const res = await createPullRequest({
      owner: 'numpy',
      repository: 'numpy',
      title: 'Test PR',
      branch: 'test-branch-' + Date.now(),
      body: 'Testing',
      files: [],
      patch: '',
      user: { login: 'arulraghav07' },
      token: process.env.GITHUB_TOKEN // assuming it's available or user provides one
    });
    console.log(res);
  } catch (err) {
    console.error(err);
  }
})();
