import { defineWebExtConfig } from 'wxt';

// Don't launch a temporary browser profile on `pnpm dev`.
// Load .output/chrome-mv3 as an unpacked extension in your normal Chrome
// instead — storage (Copilot auth, sessions) then persists across restarts.
export default defineWebExtConfig({
  disabled: true,
});
