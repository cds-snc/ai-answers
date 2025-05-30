# Changelog

## [1.4.2](https://github.com/cds-snc/ai-answers/compare/v1.4.1...v1.4.2) (2025-05-30)


### Bug Fixes

* update Azure OpenAI client creation to use correct model configuration and add logging ([83e082b](https://github.com/cds-snc/ai-answers/commit/83e082b59d28051d139a061075bb29e86a5655b0))

## [1.4.1](https://github.com/cds-snc/ai-answers/compare/v1.4.0...v1.4.1) (2025-05-23)


### Bug Fixes

* Update memory to valid value ([2284ec8](https://github.com/cds-snc/ai-answers/commit/2284ec87cb7a88ff6e06a8388a0767a09a6ac3c1))
* Update memory to valid value ([1f6a47a](https://github.com/cds-snc/ai-answers/commit/1f6a47a792cd5c4a26e455644c4df7df7374b3d3))

## [1.4.0](https://github.com/cds-snc/ai-answers/compare/v1.3.3...v1.4.0) (2025-05-23)


### Features

* add a unique identifier for each DocumentDB instance ([4c3519c](https://github.com/cds-snc/ai-answers/commit/4c3519c58508469cb7d3024284fae825993c4fe3))
* add a unique identifier for each DocumentDB instance ([e6e6df5](https://github.com/cds-snc/ai-answers/commit/e6e6df57967e3ec566141a7f4aad9941e424c578))
* add logging for embedding creation process in db-persist-interaction ([5481d54](https://github.com/cds-snc/ai-answers/commit/5481d540a9f8eab9dc58a68229bfe23db22324b4))
* add logging for interaction start and end in db-persist-interaction ([44bbb3e](https://github.com/cds-snc/ai-answers/commit/44bbb3e513304a5a29ae5678f589c16a1413a285))
* add logging for invokeHandler execution time in azure-message ([282341d](https://github.com/cds-snc/ai-answers/commit/282341df24c559ba0db58257187f3d75be0e3579))
* add skip button to feedback component ([1e00943](https://github.com/cds-snc/ai-answers/commit/1e00943ee38d03eb874f9193ee87fdc4345f6f6e))
* configure higher throughput for testing Document DB cluster. ([3af01ea](https://github.com/cds-snc/ai-answers/commit/3af01ea7ae28f29331f7616fdc8789c573d22863))
* increase ecs ram to 4gb ([a9431ca](https://github.com/cds-snc/ai-answers/commit/a9431ca884986e2deefac3df7ca4e6c47dd36634))
* increase ecs ram to 4gb ([c5593e8](https://github.com/cds-snc/ai-answers/commit/c5593e8d66930b9bd0893d62d1ef0e924835b7c0))
* increase timeout for URL checks in checkUrlStatus and downloadW… ([5eafd1d](https://github.com/cds-snc/ai-answers/commit/5eafd1da12323a92a99fef7830388a70295af979))
* increase timeout for URL checks in checkUrlStatus and downloadWebPage functions ([e92733e](https://github.com/cds-snc/ai-answers/commit/e92733ea1c158b4f11fa81d85cca704189da1b4c))
* integrate Piscina for worker-based evaluation processing ([be8e6a4](https://github.com/cds-snc/ai-answers/commit/be8e6a45f3270d1abb142703fe45ae57ace02c9f))
* reduce timeout for URL checks in checkUrlStatus and downloadWebPage functions ([029c534](https://github.com/cds-snc/ai-answers/commit/029c534874aa2aefd00f0b015f5ef9afdd6c6171))
* refactor App and HomePage components to improve outage handling and add OutageComponent; update service status messages in locales ([949af68](https://github.com/cds-snc/ai-answers/commit/949af68a1e01517831d4ab28ddf7792d73cfd78c))


### Bug Fixes

* add connection pool settings to database connection options ([7b711f4](https://github.com/cds-snc/ai-answers/commit/7b711f404e7bc32765e9420c5352707c9c7fbe1b))
* add idle timeout to the ALB ([b8fb4f8](https://github.com/cds-snc/ai-answers/commit/b8fb4f82f9ef397e6e143c7fd989bb0d2f76f553))
* add idle timeout to the ALB ([860f2e3](https://github.com/cds-snc/ai-answers/commit/860f2e3c83e96c33a42af88222c72a282b7ac13e))
* configure environment-specific CPU and memory resources ([39bd844](https://github.com/cds-snc/ai-answers/commit/39bd8447f0693eb14fcec6013cc79b00e0ba2e2e))
* configure environment-specific CPU and memory resources ([8a1782b](https://github.com/cds-snc/ai-answers/commit/8a1782ba87a2446e84d914f4dc35c0a50c9afa8e))
* enhance database connection options with additional timeout and pool settings ([40a6381](https://github.com/cds-snc/ai-answers/commit/40a63814face445d647e990f71717f9cf34b7038))
* increase minimum connection pool size for improved database performance ([e732238](https://github.com/cds-snc/ai-answers/commit/e732238d8912e66d17c2fdd3a91617d24d2f704e))
* increase timeout settings for database connections and server routes ([a2c9b5e](https://github.com/cds-snc/ai-answers/commit/a2c9b5effbc75e83d2983ce97e046ad51ecbeded))
* make fmt ([2eff705](https://github.com/cds-snc/ai-answers/commit/2eff705f8355626e5366149741d3665296d8ee55))
* make fmt ([56e311a](https://github.com/cds-snc/ai-answers/commit/56e311a85428bc8b38f7420901e811adac65b9bd))
* optimize logging in ServerLoggingService and AnswerService by removing unnecessary await statements ([cdf6d98](https://github.com/cds-snc/ai-answers/commit/cdf6d98816b50a331a5eb590aa6b8c7442afd4ce))
* refactor OpenAI client creation for improved error handling and consistency ([2a52897](https://github.com/cds-snc/ai-answers/commit/2a52897157518a76db46dcc1a43cb5f69a10e8d9))
* update @cdssnc/gcds-components-react to version 0.34.3 and enhance outage handling in App and OutagePage components ([8dd3b70](https://github.com/cds-snc/ai-answers/commit/8dd3b7018438319c40d1d2f1a158278de5d8c305))
* update Dockerfile to install only production dependencies ([83d4e93](https://github.com/cds-snc/ai-answers/commit/83d4e937446533a212ff56252657ead80b8e8b4e))
* update Dockerfile to install only production dependencies ([6869dd6](https://github.com/cds-snc/ai-answers/commit/6869dd6d444375ebea1723773792fbf790cc6a56))
* update Dockerfile to use --omit=dev for npm install commands ([6f09961](https://github.com/cds-snc/ai-answers/commit/6f099611cf359978e7589dbe76ae7250dfdbb737))
* update package.json and package-lock.json to include @babel/plug… ([a320250](https://github.com/cds-snc/ai-answers/commit/a3202500abd1d5b2fbba171f64aaf737b15884ad))
* update package.json and package-lock.json to include @babel/plugin-proposal-private-property-in-object ([57facd4](https://github.com/cds-snc/ai-answers/commit/57facd483325e0b8c783ef3c6f9c62e73bcc23fa))
* update resources to scale by x2 ([7543c43](https://github.com/cds-snc/ai-answers/commit/7543c437f9876efe6ccb2b7da6d153225d366d09))
* update resources to scale by x2 ([2aada0e](https://github.com/cds-snc/ai-answers/commit/2aada0ead4f40bf486873debf61b4bd9f02ee7f2))
* upgrade ecs resources 4x ([170b5ec](https://github.com/cds-snc/ai-answers/commit/170b5ecb5200b9705a02e4eda79ac9a629e218ce))


### Miscellaneous Chores

* add mongodb-memory-server for in-memory testing and update vit… ([f2e3154](https://github.com/cds-snc/ai-answers/commit/f2e315446cbee27d490390355523428e12c3c83f))
* add mongodb-memory-server for in-memory testing and update vitest configuration ([3840c6f](https://github.com/cds-snc/ai-answers/commit/3840c6f972b514fce50303a82684436e41984e74))
* add vitest as a development dependency in package.json ([65c3ff5](https://github.com/cds-snc/ai-answers/commit/65c3ff51f7263110c00f6c384e9ee148f26cc87c))
* migrate tests to vitest ([6e74188](https://github.com/cds-snc/ai-answers/commit/6e741886511a45eb8573341b00779b1f76c99ec7))

## [1.3.3](https://github.com/cds-snc/ai-answers/compare/v1.3.2...v1.3.3) (2025-05-15)


### Bug Fixes

* improve clarity in README by adjusting wording for AI service in… ([9e93649](https://github.com/cds-snc/ai-answers/commit/9e93649f8f44ba003eb98bfc4a1fe56aeb32697a))
* improve clarity in README by adjusting wording for AI service interaction patterns ([4778193](https://github.com/cds-snc/ai-answers/commit/47781939f7015d71fb8c0a8eddee7acae946eb15))

## [1.3.2](https://github.com/cds-snc/ai-answers/compare/v1.3.1...v1.3.2) (2025-05-15)


### Miscellaneous Chores

* switch to CDS Release Bot ([#132](https://github.com/cds-snc/ai-answers/issues/132)) ([01a7452](https://github.com/cds-snc/ai-answers/commit/01a745260591440792c9154c9a0ab97bc9374676))

## [1.3.1](https://github.com/cds-snc/ai-answers/compare/v1.3.0...v1.3.1) (2025-04-22)


### Miscellaneous Chores

* make fmt ([7b08f25](https://github.com/cds-snc/ai-answers/commit/7b08f258d38d1c90d2f72c97b51d1849b19ed1a7))

## [1.3.0](https://github.com/cds-snc/ai-answers/compare/v1.2.11...v1.3.0) (2025-04-22)


### Features

* update Terraform workflows and ECS configurations for productio… ([7ccb0bb](https://github.com/cds-snc/ai-answers/commit/7ccb0bb81ca59c3a6c23939d86e34ae5b660776e))
* update Terraform workflows and ECS configurations for production and staging environments to add new key ([e06a959](https://github.com/cds-snc/ai-answers/commit/e06a959a0ec645081bd746a85cd4c4fa801521ea))


### Bug Fixes

* enhance embedding client creation to support Azure provider and … ([0efef0e](https://github.com/cds-snc/ai-answers/commit/0efef0e8c239b60373d2c8e16615c298a76b1eac))
* enhance embedding client creation to support Azure provider and improve error handling ([6b21dfd](https://github.com/cds-snc/ai-answers/commit/6b21dfd1b6881b3530872c31b57d2359570a4e4d))
* fmt file and fix comma error ([5ab9df6](https://github.com/cds-snc/ai-answers/commit/5ab9df6df0455ac66c73576135c628db01190f03))
* Rename google_ai_api_key to google_api_key ([9e977c2](https://github.com/cds-snc/ai-answers/commit/9e977c2fc52de8db98ec788e15699b2b2be3a9d6))
* update default AI provider from OpenAI to Azure ([ec4d867](https://github.com/cds-snc/ai-answers/commit/ec4d8679ff3b580a7b36c9e9892c420462b01a27))
* update default AI provider from OpenAI to Azure ([aef40c7](https://github.com/cds-snc/ai-answers/commit/aef40c79203708da3669a7687a25219b1a231e64))
* update embedding creation to include selected AI provider ([2a52107](https://github.com/cds-snc/ai-answers/commit/2a52107d26e0ad78c1797ccbb4d111f562947415))
* update embedding creation to include selected AI provider ([e4701ac](https://github.com/cds-snc/ai-answers/commit/e4701acddbff8e5f26b1e05af8b2ff753ad500f1))
* wrong variable ([b5e122b](https://github.com/cds-snc/ai-answers/commit/b5e122b3f0e39197528d985c35d8859bbf90087d))

## [1.2.11](https://github.com/cds-snc/ai-answers/compare/v1.2.10...v1.2.11) (2025-04-11)


### Bug Fixes

* remove trailing whitespace in user role definition in test.json ([97087f9](https://github.com/cds-snc/ai-answers/commit/97087f944e7520a1a2de423a2a773807c8efe1b5))
* remove trailing whitespace in user role definition in test.json ([b2a13c5](https://github.com/cds-snc/ai-answers/commit/b2a13c5c2659c833b274a9291cb1d078bcb2f077))
* update default embedding model to 'text-embedding-3-large' in ai-models.js ([ac6902e](https://github.com/cds-snc/ai-answers/commit/ac6902e0f2ae21f4e1dab564c0fda7873d91a452))

## [1.2.10](https://github.com/cds-snc/ai-answers/compare/v1.2.9...v1.2.10) (2025-04-11)


### Bug Fixes

* remove -prod suffix from ECS resource names ([f2f0f99](https://github.com/cds-snc/ai-answers/commit/f2f0f999223733ef261557adf74dd080056c7871))
* remove -prod suffix from ECS resource names ([8551dfd](https://github.com/cds-snc/ai-answers/commit/8551dfdf50da9a124b0dc9c933d5bd49bb4da26f))

## [1.2.9](https://github.com/cds-snc/ai-answers/compare/v1.2.8...v1.2.9) (2025-04-11)


### Bug Fixes

* update the arn to use 199 instead of 188 (latest version) ([11ff86b](https://github.com/cds-snc/ai-answers/commit/11ff86b1f5835c5b657aa8d9799d2641af9df97c))
* update the arn to use 199 instead of 188 (latest version) ([ffa5327](https://github.com/cds-snc/ai-answers/commit/ffa5327a5d7d098a177100cfcb6366e9c3e9370e))

## [1.2.8](https://github.com/cds-snc/ai-answers/compare/v1.2.7...v1.2.8) (2025-04-11)


### Bug Fixes

* use environment domain variable for certificates ([750a2e6](https://github.com/cds-snc/ai-answers/commit/750a2e62ddd06515cee4cf14b2df0614a1126d85))
* use environment domain variable for certificates ([6984a28](https://github.com/cds-snc/ai-answers/commit/6984a285058702ab40d0e6cefd920307079de5c6))

## [1.2.7](https://github.com/cds-snc/ai-answers/compare/v1.2.6...v1.2.7) (2025-04-10)


### Bug Fixes

* update claim to use production release ([965b0fb](https://github.com/cds-snc/ai-answers/commit/965b0fb8778df4702199fd715bbbd365aca8087f))
* update claim to use production release ([702760d](https://github.com/cds-snc/ai-answers/commit/702760d3001684cae3bdf2bc4aaad3a994fa7eec))

## [1.2.6](https://github.com/cds-snc/ai-answers/compare/v1.2.5...v1.2.6) (2025-04-10)


### Bug Fixes

* update GitHub workflows to use correct OIDC role name ([d0c5d2c](https://github.com/cds-snc/ai-answers/commit/d0c5d2ceac4bb9cb85d69a34ec4928afde890692))
* update GitHub workflows to use correct OIDC role name ([284241e](https://github.com/cds-snc/ai-answers/commit/284241ea8a337a957f1d7af25dc6d986d73100f1))

## [1.2.5](https://github.com/cds-snc/ai-answers/compare/v1.2.4...v1.2.5) (2025-04-10)


### Bug Fixes

* fix the oidc permissions ([4ed6f76](https://github.com/cds-snc/ai-answers/commit/4ed6f76cfe802dd1bb44ce484fe0b6877448376c))

## [1.2.4](https://github.com/cds-snc/ai-answers/compare/v1.2.3...v1.2.4) (2025-04-10)


### Bug Fixes

* change value from prod to production ([c285833](https://github.com/cds-snc/ai-answers/commit/c28583344ee5cefa3ab6710a668536e6ec1a6ded))
* change value from prod to production ([9b6af2d](https://github.com/cds-snc/ai-answers/commit/9b6af2d1a0c6b13f9766c888c75c7aa756322e7f))

## [1.2.3](https://github.com/cds-snc/ai-answers/compare/v1.2.2...v1.2.3) (2025-04-09)


### Bug Fixes

* correct OIDC role setup for ai-answers GitHub Actions deployment ([b22f490](https://github.com/cds-snc/ai-answers/commit/b22f4906ee23243ad989658ab34cd8e6b6ff3cb5))
* correct OIDC role setup for ai-answers GitHub Actions deployment ([7dd75b8](https://github.com/cds-snc/ai-answers/commit/7dd75b828d30f8994844292bb8e5a06cad3a9396))

## [1.2.2](https://github.com/cds-snc/ai-answers/compare/v1.2.1...v1.2.2) (2025-04-09)


### Bug Fixes

* use correct OIDC role for production terraform apply ([c9ceaf7](https://github.com/cds-snc/ai-answers/commit/c9ceaf7a34638f7d3c42f838cbf152a155fa66e5))
* use correct OIDC role for production terraform apply ([dc7f0e2](https://github.com/cds-snc/ai-answers/commit/dc7f0e206c94d3633b425badc446572d5ff60aae))

## [1.2.1](https://github.com/cds-snc/ai-answers/compare/v1.2.0...v1.2.1) (2025-04-09)


### Bug Fixes

* add release claim to OIDC configuration ([a5e71b7](https://github.com/cds-snc/ai-answers/commit/a5e71b7041485898c0df7549b9eff1f55aee78ff))
* add release claim to OIDC configuration ([7d4fe1a](https://github.com/cds-snc/ai-answers/commit/7d4fe1aabda2908eec8e00a51593de728ad23644))
* correct security group rule for ECS tasks to allow proper commun… ([91d3b79](https://github.com/cds-snc/ai-answers/commit/91d3b793466340f70435562a8f6dcbc091fa1428))
* correct security group rule for ECS tasks to allow proper communication with AWS Systems Manager ([64674be](https://github.com/cds-snc/ai-answers/commit/64674be1b60507e6ffd63af0cf2963184edf8802))
* provide missing vpc_cidr_block input to prod ECS ([cdc73df](https://github.com/cds-snc/ai-answers/commit/cdc73df727fde35a55f5156ee9e352babf57e437))
* provide missing vpc_cidr_block input to prod ECS ([cd61138](https://github.com/cds-snc/ai-answers/commit/cd611385fa088687a4acbfabaf8930cd259fd0c9))
* update readme to trigger release PR update ([b4fa174](https://github.com/cds-snc/ai-answers/commit/b4fa174551a8694cebd0d90f65faf1aebbd77929))
* update readme to trigger release PR update ([2fefc6a](https://github.com/cds-snc/ai-answers/commit/2fefc6a41f7d0be715a911f2646bb9edff199399))

## [1.2.0](https://github.com/cds-snc/ai-answers/compare/v1.1.0...v1.2.0) (2025-03-27)


### Features

* update documentation with minor improvement ([105bb97](https://github.com/cds-snc/ai-answers/commit/105bb9726efa1c0fddc5ab137bb5767ea9985b6c))
* update documentation with minor improvement ([ff03e26](https://github.com/cds-snc/ai-answers/commit/ff03e2625ed2d7afe4807036e8b674427ae9cf94))

## [1.1.0](https://github.com/cds-snc/ai-answers/compare/v1.0.0...v1.1.0) (2025-03-26)


### Features

* add explanation fields to expert feedback for enhanced user input ([c3fb65d](https://github.com/cds-snc/ai-answers/commit/c3fb65df64288a75fe91a5478cef2c942d1e6845))
* add Font Awesome CSS import for icon support ([ecaca25](https://github.com/cds-snc/ai-answers/commit/ecaca254ccdc78304714b98756b4b999f46f399f))
* Add health check fetch on server start ([2e4cb24](https://github.com/cds-snc/ai-answers/commit/2e4cb2495ab85f26e6efaaff393479b9aae2ac2a))
* add release-please automation ([0fb5524](https://github.com/cds-snc/ai-answers/commit/0fb5524fd1676da60c15082f05f9fbfef63efdd7))
* add release-please automation ([aba7bfc](https://github.com/cds-snc/ai-answers/commit/aba7bfcef78c26d7380a19c567d88fa8b9a8e00b))
* add uniqueID to export data for better identification ([d39be4b](https://github.com/cds-snc/ai-answers/commit/d39be4b91449f98dbdd1894142d54e4e2b40ce72))
* add uniqueID to export data for better identification ([f1af80e](https://github.com/cds-snc/ai-answers/commit/f1af80eace3ce22662b7c6c95974607e0d7df587))
* implement exponential backoff strategy and refactor context agent invocation ([500eb33](https://github.com/cds-snc/ai-answers/commit/500eb33e3901d146d9ccdfd80afcb691a2012dcc))


### Bug Fixes

* add valid mock CIDR block for load balancer security group ([303bfeb](https://github.com/cds-snc/ai-answers/commit/303bfeb81953a89612071cb36a7662b9f06ae006))
* enhance uniqueID generation for interactions to handle missing chatId ([41f1505](https://github.com/cds-snc/ai-answers/commit/41f1505e4fe1139c041fce1ef7d5f453c2e6b08e))
* Move health check route before catch-all to fix ALB health checks ([1f7c707](https://github.com/cds-snc/ai-answers/commit/1f7c707e4f9bab5ce698a79ad35d346f552fd756))
* Move health check route before catch-all to fix ALB health checks ([7afee4f](https://github.com/cds-snc/ai-answers/commit/7afee4fc65caaa692eff30e5cb1587a225764173))
* remove 'canceling' and 'canceled' statuses from BatchList component ([6a85cbc](https://github.com/cds-snc/ai-answers/commit/6a85cbc2cf5f4fe32953573cee0efdeb159f6762))
* remove separator in uniqueID generation for interactions ([dfd9b33](https://github.com/cds-snc/ai-answers/commit/dfd9b33d845a7826ccaf779173c9a0238748c24a))
* security group conftest issue ([c635b90](https://github.com/cds-snc/ai-answers/commit/c635b90276a5207de9b3139c4434b8881658caf6))
* update sorting order in BatchList component to use createdAt column ([80635f9](https://github.com/cds-snc/ai-answers/commit/80635f9e705925d2655e569add4b45dd2a0f79a8))


### Code Refactoring

* adjust naming to be account-agnostic across staging and prod ([9e6f5d6](https://github.com/cds-snc/ai-answers/commit/9e6f5d6e5de1b743b50395c82792324b8057b60f))
* streamline batch cancellation and status retrieval logic ([0310982](https://github.com/cds-snc/ai-answers/commit/03109820da74174de269113c31670e7d858278fe))
* streamline batch cancellation and status retrieval logic ([f712754](https://github.com/cds-snc/ai-answers/commit/f71275455891802d3ca2239d7e427f517b6c9614))
* update ContextService tests to improve parameter handling and response structure ([6e4862e](https://github.com/cds-snc/ai-answers/commit/6e4862ed7c240c170e1bc55ced1c6e7618243527))
