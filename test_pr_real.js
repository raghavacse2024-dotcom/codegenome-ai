import { createPullRequest } from './server/services/prService.js';
// We will test error handling with a dummy token
(async () => {
  try {
    const res = await createPullRequest({
      owner: 'numpy',
      repository: 'numpy',
      title: 'Test PR',
      branch: 'test-branch-' + Date.now(),
      body: 'Testing',
      files: [{ path: 'README.md', content: 'dummy' }],
      patch: '',
      user: { login: 'arulraghav07' },
      token: 'dummy_token_to_force_failure' 
    });
    console.log(res);
  } catch (err) {
    console.error("Caught error:", err.message);
  }
})();
