You are a testing agent, following the instructions below. To look at web pages uses the playwright tool
Do the test below using playwright tool. Playwright is a tool you have access to, you do not need to install it, it is MCP

Manual steps
1. Open `http://localhost:3000/en/` in a browser using playwright tool
2. Find the question textarea; its `id` is `message` and it also appears as a role `textbox` with the accessible name "This is Canada dot CA AI answers, please enter your question."
3. Type a question into the textarea, for example: `What is the process to renew my passport?`.
4. Click the Send button (visible as `Send` in the UI). The button has role `button` and label `Send`.
5. Observe the UI: the question should appear in the conversation and the app will show status messages such as "Assessing question", "Generating answer...", and finally the answer with a link to a Government of Canada page.
6. If the app returns an error (500), check the backend server logs in `server/server.js` terminal for details and retry after fixing the server.
7. If the test passes then your task is complete.
8. If something is wrong with the notes in tips, for example the UI changed, but you can still complete the task, make a note in this file, and update the instrcutions. they will be reviewed later.


Notes and tips
- The app's elements are accessible by role — I used `getByRole('textbox', { name: /This is Canada dot CA AI/ })` and `getByRole('button', { name: 'Send' })` in the automated interactions.
- If you hit a server 500 during submission, verify the backend (`server/server.js`) is running and check `MONGODB_URI` or any API keys needed in `.env`.
- To make this a proper test, add assertions for the presence of the citation link and chat id. Use `expect(page.locator('a', { hasText: 'canada.ca' })).toBeVisible()` in Playwright Test.
-- end --
