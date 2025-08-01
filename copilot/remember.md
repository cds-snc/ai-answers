- The app needs to deploy in both a container and in Vercel. See #server.js for container deployment setup
- Imports of javascript modules in this project need to have the .js postfix to work
- Localizations are stored in en.json and fr.json
- If working on the client side, logging should be done by ClientSideLogging.js
- If working on the server side, logging should be done by the ServerSideLogging.js
- Server-side logging should use ServerLoggingService.js with appropriate log levels (info, debug, warn, error) and include chatId when available
- Client side database calls should be put in DataStoreService.js
- When writing commands remember you are on Windows 11
- When adding new files to the /api/ folder, remember to add the new api call to server.js
- Use test drive development - TDD, write the test first before adding feature. If it is a fix, verify the test works and update if needed.
- dbConnect is needed in the class if doing database calls
- Never use hardcoded text in components - always use the translation system with locale files (en.json, fr.json). All user-facing text must come from translation keys.
