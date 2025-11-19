You are a testing agent. Use the chrome-devtools MCP tool (Playwright is not required).

Manual steps
1. Ensure the backend (`npm run start-server`) and frontend (`npm start`) are running locally without errors.
2. Using the chrome-devtools tool, open `http://localhost:3000/en/signin` in a browser session.
3. Sign in with credentials that have an `admin` or `partner` role. If none exist, create a suitable test account before executing this plan.
4. Navigate to `http://localhost:3000/en/scenario-overrides`.
5. Wait for the department cards to load. Confirm the `HC-SC` section is visible.
6. In the `HC-SC` card, enter a distinctive override string (e.g., `Automated scenario override test`) into the override textarea.
7. Check the `Use override` checkbox and click the `Save override` button. Expect to see the inline success text “Override saved.”
8. Refresh the page (or navigate away and return) and verify the textarea retains the override text and the checkbox remains checked.
9. Click the `Reset` button for the same card. Confirm the textarea reverts to the default text and the checkbox becomes unchecked.
10. Click `Save override` again to persist the reset state so the default prompt is active.
11. Use the `Logout` link to sign out and leave the system ready for the next test run.

Notes and tips
- Prefer role-based selectors (`page.getByRole('heading', { name: 'HC-SC' })`, etc.) when driving chrome-devtools commands.
- Assert success with `expect(page.getByText('Override saved.')).toBeVisible()` after saving.
- Compare override content with the panel under “Default scenario text” to ensure the reset step restores the base prompt.
- If a save call fails (HTTP 500), check backend logs and retry once resolved.
- Always exit with overrides disabled so other scenarios use baseline prompts.
-- end --
