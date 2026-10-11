import { defineConfig } from '@playwright/test';
import base from './playwright.config';

/** `npm run screenshots`: regenerates the README screenshots in docs/screenshots/ (not part of `npm test`). */
export default defineConfig({
  ...base,
  testDir: './scripts',
  testMatch: /screenshots\.spec\.ts$/,
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  projects: [{ name: 'screenshots', use: { browserName: 'chromium' } }],
});
