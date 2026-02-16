# Changelog

## [1.103.0](https://github.com/cds-snc/ai-answers/compare/v1.102.0...v1.103.0) (2026-02-16)


### Features

* GPT5 for both context and answer generation ([34e551b](https://github.com/cds-snc/ai-answers/commit/34e551bc5b63a265251a09a259a85715b277e257))
* introduce AgentFactory for centralized creation of AI agents with integrated tools and callbacks. ([dea4745](https://github.com/cds-snc/ai-answers/commit/dea47458feb1a4c7ce1d8b256e062c713773b87b))

## [1.102.0](https://github.com/cds-snc/ai-answers/compare/v1.101.0...v1.102.0) (2026-02-16)


### Features

* Refactor E2E tests and server configuration ([a2ef7d0](https://github.com/cds-snc/ai-answers/commit/a2ef7d0bb242ab699cb8baf7aeb24d00cfb21c52))
* Refactor E2E tests and server configuration ([d342977](https://github.com/cds-snc/ai-answers/commit/d342977dbf3c29ba0bbb5c3775578436e8b4ad9b))


### Bug Fixes

* add auto eval - update eval dashboard ([ed52018](https://github.com/cds-snc/ai-answers/commit/ed520183cebbdc549f7070f590805551187d90f5))
* broken searchQuery in download logs ([7aad20c](https://github.com/cds-snc/ai-answers/commit/7aad20cd037769d0399f2e512514fb80d9c22aaa))
* bug in chat dashboard ([0d444e5](https://github.com/cds-snc/ai-answers/commit/0d444e5da9ea0e600d0edaa1fd0e43e710fa6adc))
* change order so evaluations is second ([d8cb85f](https://github.com/cds-snc/ai-answers/commit/d8cb85f8f38c4d973fe657db8c21cf8c26a317b1))
* eval values weren't showing up ([ecedc4e](https://github.com/cds-snc/ai-answers/commit/ecedc4efc41fd9965e6469b028a5aed0f1573054))
* Express 5 compatibility for catch-all route ([4543154](https://github.com/cds-snc/ai-answers/commit/4543154f258a4f1ae71f2b1fa368f6089a4ed8b4))
* Express 5 compatibility for catch-all route and update lockfiles ([bc73ed7](https://github.com/cds-snc/ai-answers/commit/bc73ed7d84c90476b0dec9c927c6e0ea9a4a9f96))
* force context regeneration in graph flows and disable context reuse ([8b946be](https://github.com/cds-snc/ai-answers/commit/8b946beabde5a4eb4eb1480f5ed7e0356a8603db))
* get the eval values ([1706db9](https://github.com/cds-snc/ai-answers/commit/1706db9764e3279f3e7f9286016d573e5460a174))
* **integrity:** consider signatures embedded in system/error turns when verifying signed prefix ([1b1ce24](https://github.com/cds-snc/ai-answers/commit/1b1ce241a4729470f55b5539b5e2f3c2936ff7fd))
* remove cols from auto eval dashboard ([15f6e3f](https://github.com/cds-snc/ai-answers/commit/15f6e3fa430f2b026ca6df6442b434968d05e51f))
* **tests:** update verification for AI answer visibility in short query tests ([f84a6f0](https://github.com/cds-snc/ai-answers/commit/f84a6f06f1669d67197049c25ddc154184b94baf))


### Miscellaneous Chores

* **deps:** bump jsonpath from 1.1.1 to 1.2.1 ([32122d2](https://github.com/cds-snc/ai-answers/commit/32122d2f2258dd39267eea08cc1f13c14ac06580))
* **deps:** bump jsonpath from 1.1.1 to 1.2.1 ([9e67695](https://github.com/cds-snc/ai-answers/commit/9e67695cb82da268ad077cc48734ab464ace8c6d))
* **deps:** bump qs from 6.14.1 to 6.14.2 ([e279491](https://github.com/cds-snc/ai-answers/commit/e279491e82a19498150cb959c1691c89ae97197f))
* **deps:** bump qs from 6.14.1 to 6.14.2 ([201cd28](https://github.com/cds-snc/ai-answers/commit/201cd289a81670235ca771c5a442f160ffd2420e))
* **tests:** add DEBUG_CONV_INTEGRITY logging to ConversationIntegrityService for e2e debugging ([8a89f6e](https://github.com/cds-snc/ai-answers/commit/8a89f6e655a29b8091518c1c8a06c5f822048399))


### Code Refactoring

* **tests:** enhance context verification in InteractionPersistenceService tests and remove legacy FeedbackComponent test ([f1f26a9](https://github.com/cds-snc/ai-answers/commit/f1f26a9a7c1273d57e9718a733d679135c674f73))
* **tests:** replace withBotProtection with botFingerprintPresence in session logic tests ([106b957](https://github.com/cds-snc/ai-answers/commit/106b9571556fc01ee35e02931f3b42e235690fee))

## [1.101.0](https://github.com/cds-snc/ai-answers/compare/v1.100.2...v1.101.0) (2026-02-13)


### Features

* enhance chat dashboard with interaction count, question column, noEval filter ([991e01a](https://github.com/cds-snc/ai-answers/commit/991e01ad583f12d598f255ecb134ceec1d8d9b73))
* enhance chat dashboard with interaction count, question column,… ([46acded](https://github.com/cds-snc/ai-answers/commit/46acded5e7d78384b940ba0bdf59f6b34d262e30))


### Bug Fixes

* code review fixes ([a232a24](https://github.com/cds-snc/ai-answers/commit/a232a24d6f96365f6a53dce54a11315e4eaf04ca))
* update dockerfile to support new lamda version. ([f5191e4](https://github.com/cds-snc/ai-answers/commit/f5191e4c5daaa984d74da7a9dc102df4dd481c81))
* update RDS global bundle path and `NODE_EXTRA_CA_CERTS` environment variable in Dockerfile. ([639e8a2](https://github.com/cds-snc/ai-answers/commit/639e8a2ffa2d0b2b6fd880544ffba7c90c6c2cf5))

## [1.100.2](https://github.com/cds-snc/ai-answers/compare/v1.100.1...v1.100.2) (2026-02-12)


### Bug Fixes

* add to ceo ([4d1eaae](https://github.com/cds-snc/ai-answers/commit/4d1eaaeda4d761908faadb22098048ea85b56bc8))
* adds and moves ([086d845](https://github.com/cds-snc/ai-answers/commit/086d845f7b85acd729c05d37dc7559dc7f3e3ea2))
* cra updates, cds vs ceo ([70a1e5e](https://github.com/cds-snc/ai-answers/commit/70a1e5e92a7064795ce8079d0b0e520b85599a47))
* tighten up language brevity advice ([96a3227](https://github.com/cds-snc/ai-answers/commit/96a32272496e3d72725cd2db121ced242edee517))
* weather too stern ([f4cf626](https://github.com/cds-snc/ai-answers/commit/f4cf626a15118f6b8dce8e1b93045135f80af642))

## [1.100.1](https://github.com/cds-snc/ai-answers/compare/v1.100.0...v1.100.1) (2026-02-11)


### Bug Fixes

* scenario issues ([83d2d4f](https://github.com/cds-snc/ai-answers/commit/83d2d4f5bcec0b4a30745e3f279ef54dbffafa42))

## [1.100.0](https://github.com/cds-snc/ai-answers/compare/v1.99.0...v1.100.0) (2026-02-11)


### Features

* e2e test for endpoint ([a3c0857](https://github.com/cds-snc/ai-answers/commit/a3c0857eb1a4d505db0360cb6c25aae1364a451b))
* e2e test for endpoint ([8a8a8c7](https://github.com/cds-snc/ai-answers/commit/8a8a8c7cc758eaad7660d5f6a7b225c5b3b51e5b))


### Bug Fixes

* add the registration for availibility ([d9a52d2](https://github.com/cds-snc/ai-answers/commit/d9a52d2b19cbe6fbddff627f35362fd0ef4303f8))
* chat-session-availability typo and public access ([c667f62](https://github.com/cds-snc/ai-answers/commit/c667f62fa97c698fd59a2de2c4a92d651b525a6c))
* resolve graph short circuit issue for GPT-5.1 and handle embedding errors gracefully ([e1059f9](https://github.com/cds-snc/ai-answers/commit/e1059f9fce317b0a02efbacd4264dd0e42d547da))
* Workflows for gpt5 and gpt5chat ([5c25b3d](https://github.com/cds-snc/ai-answers/commit/5c25b3d38a2c05b9ba782ba0021ae4e8aab1956e))


### Miscellaneous Chores

* **deps:** bump axios from 1.13.2 to 1.13.5 ([02b85b9](https://github.com/cds-snc/ai-answers/commit/02b85b9b16ecb0b84a67de24d47d66ef2f4bccfe))

## [1.99.0](https://github.com/cds-snc/ai-answers/compare/v1.98.0...v1.99.0) (2026-02-11)


### Features

* implement redis session store and robustness improvements ([75c377b](https://github.com/cds-snc/ai-answers/commit/75c377b3f7585835b4026cfef120b882f5f13481))
* turn off alert/notice ([f13100c](https://github.com/cds-snc/ai-answers/commit/f13100cffd0b6fc42772b89768c7d844bcbfe19a))

## [1.98.0](https://github.com/cds-snc/ai-answers/compare/v1.97.1...v1.98.0) (2026-02-11)


### Features

* Output the construted system prompt to console and logs ([b7b8d49](https://github.com/cds-snc/ai-answers/commit/b7b8d494612dadbdd94fdac631a747dc529bfd09))


### Bug Fixes

* add why update docs ([fb3eade](https://github.com/cds-snc/ai-answers/commit/fb3eade17e0482f3753ae6724a4df5f9c38823d5))
* add why update docs ([dc1f4b7](https://github.com/cds-snc/ai-answers/commit/dc1f4b7fbbd4b402fdaf83bad2b2604dd881f292))
* another try ([3c3b470](https://github.com/cds-snc/ai-answers/commit/3c3b470e910aafdec07ce8994dbcb693d2277366))
* clean up download triggers in scenarios ([680a1db](https://github.com/cds-snc/ai-answers/commit/680a1dba0af9c9ee5f511c0cbe0776e784dfffc2))
* harden further ([df221a5](https://github.com/cds-snc/ai-answers/commit/df221a5264684a17aee181ac44fd264cc7959947))
* remove clarifying ([beaa9ae](https://github.com/cds-snc/ai-answers/commit/beaa9aebe562929e04817e6cb1d54664208bebc9))
* remove escape hatch ([236c451](https://github.com/cds-snc/ai-answers/commit/236c45116d2e703dda6c0de2bbbce0721702febd))
* signal priority ([20dfbe4](https://github.com/cds-snc/ai-answers/commit/20dfbe41df6a146a76708918fdf13f76003cc849))
* skip adds ([5627c5c](https://github.com/cds-snc/ai-answers/commit/5627c5c9022e6bbbc2a0691062c669bd506c86a3))
* tbs scenario per annie ([0adeee9](https://github.com/cds-snc/ai-answers/commit/0adeee962ed1be8d858e135050350e370868cf49))
* tbs scenario per annie ([2b24bee](https://github.com/cds-snc/ai-answers/commit/2b24beee40f25f75caed86a6ff9d583a53649448))
* test-flip-download ([e03d6f0](https://github.com/cds-snc/ai-answers/commit/e03d6f073e5f1be4f120e8c8329ec26b6d2ea247))
* try again ([d450b3e](https://github.com/cds-snc/ai-answers/commit/d450b3e9a4df26cf2c76a1217aa31476e728d1d4))
* upgrade priority of download flag ([cf56829](https://github.com/cds-snc/ai-answers/commit/cf568298cf4cccb66bf218d3465459c2c96fd915))
* url typo ([7e02b77](https://github.com/cds-snc/ai-answers/commit/7e02b77d8c2cd0ead8f783306ee1e31585b7bbf1))

## [1.97.1](https://github.com/cds-snc/ai-answers/compare/v1.97.0...v1.97.1) (2026-02-09)


### Bug Fixes

* bring back deleted endpoint ([842032b](https://github.com/cds-snc/ai-answers/commit/842032b3daa2f5fba13d2df43a908029857ee83c))
* bring back deleted endpoint ([35be21d](https://github.com/cds-snc/ai-answers/commit/35be21d7d8cc874ab69b3e2f4399c559f770ae3d))

## [1.97.0](https://github.com/cds-snc/ai-answers/compare/v1.96.0...v1.97.0) (2026-02-09)


### Features

* add `unstorage`-based flexible storage service for chat logs and E2E tests for chat log viewer. ([fda4f7e](https://github.com/cds-snc/ai-answers/commit/fda4f7e84e38f64a759c9cb87b77239f6a4d73de))
* add server logging service with database persistence and unit tests ([908cf5d](https://github.com/cds-snc/ai-answers/commit/908cf5dc0f8afa73d6e252c17478368bfe1d1512))
* Chat view E2E for S3 changes. ([ffc8cc7](https://github.com/cds-snc/ai-answers/commit/ffc8cc750c30d49f75473e4c6ca5336944b2d63c))
* docs for claude and copilot ([767667a](https://github.com/cds-snc/ai-answers/commit/767667a073104664db77ac0cc4a04855add8ada3))
* implement dynamic storage configuration using unstorage with S3 and filesystem drivers. ([a56a8b4](https://github.com/cds-snc/ai-answers/commit/a56a8b432f50fe496039e5aa4bbc83cac4491954))
* Implement server-side logging service with dedicated log files and tests. ([b18d11b](https://github.com/cds-snc/ai-answers/commit/b18d11bf6a59219c8f1511be9503d9de17c49400))
* include libraries for unstorage ([1500b7c](https://github.com/cds-snc/ai-answers/commit/1500b7cdc97e0fa7973388de2ddc2ed75667a633))
* install driver compatible with our security model ([1c3ab0e](https://github.com/cds-snc/ai-answers/commit/1c3ab0ebd5fd3cc640172d561d60c02b6a531287))


### Bug Fixes

* **deps:** add @aws-sdk/s3-request-presigner required by flydrive s3 ([ce6d5f5](https://github.com/cds-snc/ai-answers/commit/ce6d5f5951e068db6490a469aa1683ad28ef9f1b))
* finetuning ([0f5e1ef](https://github.com/cds-snc/ai-answers/commit/0f5e1efb9bdb756875ae647f4aedc480a496f047))
* health-infobase download required ([d082855](https://github.com/cds-snc/ai-answers/commit/d082855ee65e80e98e6807ed6f2046fc7e7a20b1))
* protect against post log levels ([f1c6333](https://github.com/cds-snc/ai-answers/commit/f1c63337e25eb6d3324f66b5d9e78d4b9d903bfe))
* remove confidence download-max ([46e3f42](https://github.com/cds-snc/ai-answers/commit/46e3f4227df21b9c21f8a86668b699799d43c767))
* remove confidenceRating from exported logs ([7d25e7a](https://github.com/cds-snc/ai-answers/commit/7d25e7a66ace92bc158ecb0069c6f89a9eefd7ec))
* remove old exploratory folder ([5936c14](https://github.com/cds-snc/ai-answers/commit/5936c14290ffe8a4ed23cd56748764ea6912a0ae))
* try flydrive ([b828b71](https://github.com/cds-snc/ai-answers/commit/b828b719a5324717050c37468bf0bda578680a48))
* tune download ([faec987](https://github.com/cds-snc/ai-answers/commit/faec987569093e91535a3202aaf4db609cf4736e))


### Miscellaneous Chores

* lint ([618f59a](https://github.com/cds-snc/ai-answers/commit/618f59a80775737a85a84f7c552b11000f22080e))

## [1.96.0](https://github.com/cds-snc/ai-answers/compare/v1.95.0...v1.96.0) (2026-02-06)


### Features

* e2e redaction tests, for regex ([1195d73](https://github.com/cds-snc/ai-answers/commit/1195d735c369afc3decb29dbbd15eb3ba9d605c3))
* test results to gitignore ([1631bce](https://github.com/cds-snc/ai-answers/commit/1631bce2afb6f9df9a3bef4ff92873b01ecbfbd7))
* update bot detection and test harness ([fdc59d8](https://github.com/cds-snc/ai-answers/commit/fdc59d801edc1237de41ed4245b44e50e6eef919))


### Bug Fixes

* make sure test passes ([3707545](https://github.com/cds-snc/ai-answers/commit/37075454c318b7fb08363e554acf6b43ca410305))
* race condition when authenticated ([6954af7](https://github.com/cds-snc/ai-answers/commit/6954af71d88a783f94aee8927b9ec17d4cab9bd1))
* repair failing tests ([025059e](https://github.com/cds-snc/ai-answers/commit/025059e3d9b53360df2750c594da5ca189f9d3c1))
* update path for backoff.js ([97619cd](https://github.com/cds-snc/ai-answers/commit/97619cd03de2031b3aba0a5178aaeec70b066187))
* Update to remove unneeded refernces ([179791c](https://github.com/cds-snc/ai-answers/commit/179791c205da1f47b3a70d55439226c7eb1a6d96))


### Miscellaneous Chores

* all tests passing ([efa32b9](https://github.com/cds-snc/ai-answers/commit/efa32b97e67b9f6ced6e535c5c5b7ae273407949))
* fix utils folders ([71d6fc8](https://github.com/cds-snc/ai-answers/commit/71d6fc8ea0a70b19592ea36434d7074ccc4dadb6))
* remove accidentally tracked .terraform modules ([ae21eef](https://github.com/cds-snc/ai-answers/commit/ae21eefbfe0c8c99dfb95adf8eb5a587091131cc))
* Remove all unused workflow files and technical debt. ([d649019](https://github.com/cds-snc/ai-answers/commit/d649019b8258475b4d12163291edb4aa3e4f17ee))
* remove unused labels ([6de8b98](https://github.com/cds-snc/ai-answers/commit/6de8b989e3c442f33625015e967b72d0cc5e8c8a))
* remove unused test ([3ad64db](https://github.com/cds-snc/ai-answers/commit/3ad64db41609f7a73da19907327e7ea0e364d7c6))

## [1.95.0](https://github.com/cds-snc/ai-answers/compare/v1.94.0...v1.95.0) (2026-02-06)


### Features

* add AgentFactory for creating various AI agents with tool integration and callback tracking. ([ee51d5f](https://github.com/cds-snc/ai-answers/commit/ee51d5f67c3cd12b0b17f533be5c4e7e5acd0f56))
* Implement batch upload functionality with configurable AI models, search providers, and workflows, along with new agent and embedding services. ([b0160bf](https://github.com/cds-snc/ai-answers/commit/b0160bfd25c5e20e3e71dacf694fd79d086ff069))
* Introduce configurable AI agents with tools, a chat options UI for model and workflow selection, an embedding service, and a batch upload component. ([2f7cf02](https://github.com/cds-snc/ai-answers/commit/2f7cf02b2ff421f5c22ce071d930c15210f2d8d8))


### Miscellaneous Chores

* **deps:** bump jsonpath from 1.1.1 to 1.2.0 ([efcd273](https://github.com/cds-snc/ai-answers/commit/efcd27390423a63cad992b9bcd9b322af99444a1))
* **deps:** bump jsonpath from 1.1.1 to 1.2.0 ([5db3818](https://github.com/cds-snc/ai-answers/commit/5db38186922a3c86790f975d392c95b24c73bfe4))

## [1.94.0](https://github.com/cds-snc/ai-answers/compare/v1.93.2...v1.94.0) (2026-02-04)


### Features

* Add GPT-5 mini and nano models to config ([8ebd03f](https://github.com/cds-snc/ai-answers/commit/8ebd03f0242afb4932fec7414e72a2529c14e771))
* configure reasoning effort (low) for GPT-5 models ([5d01ede](https://github.com/cds-snc/ai-answers/commit/5d01ede13b5325a3d47de59d75568ed271c4c4c6))
* configure reasoning effort (low) for GPT-5 models ([ed84c35](https://github.com/cds-snc/ai-answers/commit/ed84c3539f219c5103240abb50a9000bef0daee5))


### Bug Fixes

* **deps:** upgrade all langchain packages to v1.x compatible versions ([fc8b9a3](https://github.com/cds-snc/ai-answers/commit/fc8b9a3c91578fea799d9b8ca6a28417ef42b595))


### Miscellaneous Chores

* **deps-dev:** bump eslint from 8.57.1 to 9.26.0 ([b99142b](https://github.com/cds-snc/ai-answers/commit/b99142b413354eba04de57b5630ea166f1b7dd70))
* **deps-dev:** bump eslint from 8.57.1 to 9.26.0 ([7a9505e](https://github.com/cds-snc/ai-answers/commit/7a9505e5a6841d9e5069578a75205e0a56287919))
* **deps:** bump fast-xml-parser, @aws-sdk/client-bedrock-runtime, @aws-sdk/client-s3, @aws-sdk/client-sts, @langchain/anthropic, @aws-sdk/client-sagemaker and @aws-sdk/credential-providers ([7151de0](https://github.com/cds-snc/ai-answers/commit/7151de06a133fcec643fe894d5ce4ea448511301))
* **deps:** bump fast-xml-parser, @aws-sdk/client-sagemaker and @aws-sdk/credential-providers ([ef5afa9](https://github.com/cds-snc/ai-answers/commit/ef5afa90c103c06e6e51df26b309b2928f2aeecd))
* **deps:** bump fast-xml-parser, @aws-sdk/client-sagemaker and @aws-sdk/credential-providers in /server ([993b8e3](https://github.com/cds-snc/ai-answers/commit/993b8e340e69eca3783952d32b952fea869ccdb2))

## [1.93.2](https://github.com/cds-snc/ai-answers/compare/v1.93.1...v1.93.2) (2026-02-02)


### Bug Fixes

* address T3 errors ([efb267c](https://github.com/cds-snc/ai-answers/commit/efb267c8d303cef3e3cce50cb0205e98635e9076))
* languages ([cc5c8cc](https://github.com/cds-snc/ai-answers/commit/cc5c8cca5be11a489b9bdfa05f1f9376706f564c))
* last try ([e0caf8e](https://github.com/cds-snc/ai-answers/commit/e0caf8eebf2650334da7f84dd9a3b7b2dd53ea20))
* more tweaks for errors ([a18d29e](https://github.com/cds-snc/ai-answers/commit/a18d29e65e3bc55dda41ee89e825ba0e2a432286))
* service hours ([69ec07c](https://github.com/cds-snc/ai-answers/commit/69ec07c9bf0482a8f33f0441ae00e99c5a7ce34c))

## [1.93.1](https://github.com/cds-snc/ai-answers/compare/v1.93.0...v1.93.1) (2026-01-30)


### Bug Fixes

* recover redaction patterns - used test set and manual tests ([f50729b](https://github.com/cds-snc/ai-answers/commit/f50729b253d4b5f0500473de877d22da2da6a60b))
* update doc, tweak locales ([8e53134](https://github.com/cds-snc/ai-answers/commit/8e53134798b293a2476fd567639062838190cd60))

## [1.93.0](https://github.com/cds-snc/ai-answers/compare/v1.92.0...v1.93.0) (2026-01-30)


### Features

* touch code base to test workflow ([225b417](https://github.com/cds-snc/ai-answers/commit/225b417acc9dff900119aff5bb7a03bea6e718ce))
* touch code base to test workflow ([5499d28](https://github.com/cds-snc/ai-answers/commit/5499d2874281db038d7ff6daf9881123e6c03c7c))

## [1.92.0](https://github.com/cds-snc/ai-answers/compare/v1.91.1...v1.92.0) (2026-01-28)


### Features

* add detailed axios request logging to downloadWebPage tool ([d5481d3](https://github.com/cds-snc/ai-answers/commit/d5481d3cc33013ae682f7b4c6308df984412b703))
* improve request logging with attempt log and error details ([2569127](https://github.com/cds-snc/ai-answers/commit/25691272ffc6dde6ff57dd12614af6b21dec3ccc))


### Miscellaneous Chores

* Refresh Terragrunt module cache by creating and modifying numerous module-related files. ([653dd47](https://github.com/cds-snc/ai-answers/commit/653dd47ecd3f732ace020678a243ddaaed84701e))

## [1.91.1](https://github.com/cds-snc/ai-answers/compare/v1.91.0...v1.91.1) (2026-01-27)


### Bug Fixes

* about page blog section ([aed97d9](https://github.com/cds-snc/ai-answers/commit/aed97d958440f3007947fb34e83a9ffca9d75fad))
* add instead of replace ([9b4ddc9](https://github.com/cds-snc/ai-answers/commit/9b4ddc93971cd1437a591d035b8727206c9de8c4))
* search query did NOT include grocery benefit ([c463385](https://github.com/cds-snc/ai-answers/commit/c463385f3c6d30d7edc56f1fa9a626d95682835a))
* to help with grocery rebate ([e7a43fb](https://github.com/cds-snc/ai-answers/commit/e7a43fb17647837fad92ea813fbfa1fc985f560b))
* typo add blog link ([42313e3](https://github.com/cds-snc/ai-answers/commit/42313e3f6b5b3b1d1c8b856fb5dc393bd72c2952))

## [1.91.0](https://github.com/cds-snc/ai-answers/compare/v1.90.0...v1.91.0) (2026-01-27)


### Features

* AA tracking on about page (remove components) ([4fc8197](https://github.com/cds-snc/ai-answers/commit/4fc81977190f4056faf588375821a496fb96ae74))
* can't not have title ([a0d4798](https://github.com/cds-snc/ai-answers/commit/a0d4798ce10126eec8dda454a7bdb09179784afc))
* locales ([b487975](https://github.com/cds-snc/ai-answers/commit/b487975f2fc6935ab6d5edb7c450c70b9274d24f))
* qa ([dd6c8de](https://github.com/cds-snc/ai-answers/commit/dd6c8de7b294151795778e8912f7f5f10317c1f5))
* rmv classes and title ([ae40838](https://github.com/cds-snc/ai-answers/commit/ae40838c80564812a0e8685c5d396b3fbe2f32a8))
* warning, toggle on and off-able ([0c34761](https://github.com/cds-snc/ai-answers/commit/0c347613759d17ecc46489f8dc5005d9b6b1490e))

## [1.90.0](https://github.com/cds-snc/ai-answers/compare/v1.89.0...v1.90.0) (2026-01-26)


### Features

* add S3 bucket name, ARN, and SSM parameter ARN outputs. ([0542de9](https://github.com/cds-snc/ai-answers/commit/0542de9c96df107528f0d88d77ed0498ff7e1ce4))
* Add Terragrunt modules for S3, IAM, and ECS infrastructure setup. ([a041505](https://github.com/cds-snc/ai-answers/commit/a0415054067183c3ab876aa972b60d83c7500191))
* Add VPC ID and private subnet ID input variables for S3 module. ([2a700dd](https://github.com/cds-snc/ai-answers/commit/2a700ddbacb92396760eb03356103fb6b8cd4b6e))
* Implement foundational AWS infrastructure modules, including Sentinel forwarder components, for the AI Answers project. ([323745a](https://github.com/cds-snc/ai-answers/commit/323745a3106c3f7c5190440a0fe7d231049e44ab))
* Introduce core AWS infrastructure modules for the AI Answers application, including VPC, RDS, ECS, and various security and logging components. ([6581535](https://github.com/cds-snc/ai-answers/commit/658153575c1f2d68687f278e1b2de130abe710da))
* Introduce initial Terraform modules, CI/CD workflows, and documentation for AI Answers and Sentinel forwarder infrastructure. ([b6d409b](https://github.com/cds-snc/ai-answers/commit/b6d409bd4bc747fa0fe217c39ae1f408dc8bc525))
* provision S3 storage bucket with encryption, public access block, lifecycle rules, VPC endpoint, and SSM parameter. ([a82660b](https://github.com/cds-snc/ai-answers/commit/a82660b27f2692d1080e9eeffd8e5a8c8fe1bd7a))


### Bug Fixes

* Merge container_environment blocks and add s3 to deployment workflows ([59cafdf](https://github.com/cds-snc/ai-answers/commit/59cafdffb0fee40f6f6140ab8d322e9d71e04925))
* typo ([af9075a](https://github.com/cds-snc/ai-answers/commit/af9075a86ab45ab30b8900f2acaf3aea5ae383d3))
* updates per ECCC ([101011d](https://github.com/cds-snc/ai-answers/commit/101011d411a0692a390558103122d665196064b0))


### Miscellaneous Chores

* Initialize Terragrunt/Terraform modules for the AI Answers project, including sentinel forwarder components. ([20d545e](https://github.com/cds-snc/ai-answers/commit/20d545edf3334591851aa9dd171a14c8a353bb9e))

## [1.89.0](https://github.com/cds-snc/ai-answers/compare/v1.88.1...v1.89.0) (2026-01-26)


### Features

* first draft of constitution ([b1c4222](https://github.com/cds-snc/ai-answers/commit/b1c4222af1a6e0c196b7fba1685398399e7bdffa))
* first draft of constitution ([3c6dacb](https://github.com/cds-snc/ai-answers/commit/3c6dacb636802a3123224ecaa09fee429070ca97))


### Bug Fixes

* add DRAFT ([fc048cd](https://github.com/cds-snc/ai-answers/commit/fc048cdd140e26d1a5f0309905d41fe13bb07aed))
* **build:** disable source map generation in production builds ([0085f33](https://github.com/cds-snc/ai-answers/commit/0085f33a361a82dfee578e2ee1ed8245957b3c09))
* **build:** disable source map generation in production builds ([dbff618](https://github.com/cds-snc/ai-answers/commit/dbff6186395bb3d98efeb98587c7400cccbf968b))
* edits ([8e726d3](https://github.com/cds-snc/ai-answers/commit/8e726d3b34fee9033e00969d6a594f81d99b37b9))
* edits ([7d86dc1](https://github.com/cds-snc/ai-answers/commit/7d86dc1d09c5d117f3432bddf2745ad99ceeeaf6))
* rename and update ([dde124c](https://github.com/cds-snc/ai-answers/commit/dde124ceb6b5ec8ad7e1d11451990b78640cf7e4))


### Miscellaneous Chores

* **deps:** bump lodash from 4.17.21 to 4.17.23 ([6008c45](https://github.com/cds-snc/ai-answers/commit/6008c45a825a4f8c91c1079c2b5b027c81e0e52d))

## [1.88.1](https://github.com/cds-snc/ai-answers/compare/v1.88.0...v1.88.1) (2026-01-23)


### Bug Fixes

* handle clarifying question format in integrity normalization ([9bc6ff6](https://github.com/cds-snc/ai-answers/commit/9bc6ff6f09e8dcc09a76cc59e42c6331721e517d))
* handle clarifying question format in integrity normalization ([e67e5b5](https://github.com/cds-snc/ai-answers/commit/e67e5b53749021e7d5d5881b385983ee38ff16bd))

## [1.88.0](https://github.com/cds-snc/ai-answers/compare/v1.87.2...v1.88.0) (2026-01-22)


### Features

* add conversation integrity ssrm permissions to lambda terraform ([02a6e5b](https://github.com/cds-snc/ai-answers/commit/02a6e5bd04e990e1c6691a699b6a4aefd5f667c4))
* reduce download tool timeout to 500ms ([f84d001](https://github.com/cds-snc/ai-answers/commit/f84d0010d03e77c39b3e3075cfb2131012ea9e76))
* reduce download tool timeout to 500ms ([e50a38f](https://github.com/cds-snc/ai-answers/commit/e50a38f99b069f5ebc9bfa97c614fce05e981d84))


### Bug Fixes

* add missing integrity secret to lambda deployment ([826a566](https://github.com/cds-snc/ai-answers/commit/826a5665c4aac406b20f264f522f56604dc34266))
* add missing integrity secret to lambda deployment ([f00399d](https://github.com/cds-snc/ai-answers/commit/f00399d24ed6722ae676d619f2d340c024a66d6a))

## [1.87.2](https://github.com/cds-snc/ai-answers/compare/v1.87.1...v1.87.2) (2026-01-21)


### Bug Fixes

* address declaration incorrect translation ([7fb3e90](https://github.com/cds-snc/ai-answers/commit/7fb3e90153f6020807737e58a3aa895df42dc58f))

## [1.87.1](https://github.com/cds-snc/ai-answers/compare/v1.87.0...v1.87.1) (2026-01-21)


### Bug Fixes

* add elasticache module to terraform plan jobs for production and staging workflows ([01de02b](https://github.com/cds-snc/ai-answers/commit/01de02b29030e7f785192deb438dfd338a89fe8f))
* add missing dependencies block and update apply workflows order … ([740adc6](https://github.com/cds-snc/ai-answers/commit/740adc62088b6d33727af8e04599ace54db93cdb))
* add missing dependencies block and update apply workflows order for elasticache ([44720a1](https://github.com/cds-snc/ai-answers/commit/44720a113492db9e04fb10173c166717da43c2eb))
* remove unused variables for product name, environment, and billi… ([33326b4](https://github.com/cds-snc/ai-answers/commit/33326b48da5dbde0a488a920f9792aca4013d035))
* remove unused variables for product name, environment, and billing code in elasticache inputs ([9c9a2dc](https://github.com/cds-snc/ai-answers/commit/9c9a2dc19ab7267d84b0a4ab09147c2c96d3ef7e))
* terraform fmt for elasticache module ([e6219f1](https://github.com/cds-snc/ai-answers/commit/e6219f10314ff37bbe6479b69a76e660a860a4f2))

## [1.87.0](https://github.com/cds-snc/ai-answers/compare/v1.86.0...v1.87.0) (2026-01-21)


### Features

* add elasticache redis infrastructure (t3.micro) ([8a77103](https://github.com/cds-snc/ai-answers/commit/8a7710311c86388134d047cc7bfee200b3ee08d2))
* add locale for new No option ([e880d83](https://github.com/cds-snc/ai-answers/commit/e880d83d07cb7dca44b89c7657fa771030113218))
* add new option ([57589a5](https://github.com/cds-snc/ai-answers/commit/57589a52a76669ba5669aecd8da6810bf4386991))
* create options ([92b2093](https://github.com/cds-snc/ai-answers/commit/92b20933a8aa48c32d08903f42a825f40367850a))
* dont think I need this ([94848cb](https://github.com/cds-snc/ai-answers/commit/94848cb9f921ef3d62467267bbbebece54c8cb0d))
* placeholder ([b621950](https://github.com/cds-snc/ai-answers/commit/b621950d03c3b35dfe8d224619f72a2c1513e2cf))
* put back ([809da90](https://github.com/cds-snc/ai-answers/commit/809da90d2bcd5ef29ac5ce9f7dbf8311a175e0a7))
* rerun ([1a91f71](https://github.com/cds-snc/ai-answers/commit/1a91f71ec2753912b215df51524fac5cbe27ed59))
* revert ([1839c6b](https://github.com/cds-snc/ai-answers/commit/1839c6b5a487c01702b8a2ec33507eb2c922f5ca))
* revert back ([dc8d317](https://github.com/cds-snc/ai-answers/commit/dc8d317ccbe4f43bb67160730c4ae562074a32f6))
* revert back to last stable ([c295b01](https://github.com/cds-snc/ai-answers/commit/c295b01166e46da559d56b38ca45d832d5733c3b))
* test simplifying more ([3dac2ba](https://github.com/cds-snc/ai-answers/commit/3dac2ba440f9bf65cfbc832489fa9600e3019e02))
* tweaks based on font-size ([94745f6](https://github.com/cds-snc/ai-answers/commit/94745f6cf367d19bef6ead51cfe1a3abda780093))
* use score and not string ([9d42688](https://github.com/cds-snc/ai-answers/commit/9d4268814cca8848b3d066a57f8f386b08f5494a))


### Bug Fixes

* a few more issues ([3948af5](https://github.com/cds-snc/ai-answers/commit/3948af5736bd352e86aae44fba80d3abf2ea0764))
* add CEO-BEC ([13845b8](https://github.com/cds-snc/ai-answers/commit/13845b83276c265663ff491156ce6647c3e33fd8))
* add content to JUS ([215c09f](https://github.com/cds-snc/ai-answers/commit/215c09f5946f625dfdb8505fb47977e61b782010))
* add JUSTICE as partner ([aa3b143](https://github.com/cds-snc/ai-answers/commit/aa3b1439cf2011ba599ccdda73fee1ebded9c634))
* add JUSTICE as partner ([453bf40](https://github.com/cds-snc/ai-answers/commit/453bf40a997633f50468f1df300bcd6a304502a3))
* lamda deployment failing because no access to REDIS_URL ([a5c39a7](https://github.com/cds-snc/ai-answers/commit/a5c39a72ce29f23b3586ae39e283cab99e5d3d97))
* lamda deployment failing because no access to REDIS_URL ([4b72efd](https://github.com/cds-snc/ai-answers/commit/4b72efd465ec73a998ef3d7074a9c9307d49bc62))
* trial3 issues ([0b72fae](https://github.com/cds-snc/ai-answers/commit/0b72fae10b5fbb998d69142e306a7a4cbd379110))
* typo ([6c3ef54](https://github.com/cds-snc/ai-answers/commit/6c3ef54554220c5069b2c7394492d2891342fa72))


### Miscellaneous Chores

* touch staging ssm to trigger infra workflow ([4a26a50](https://github.com/cds-snc/ai-answers/commit/4a26a5003e52d3238e1ea3676c66f35159313857))
* touch staging ssm to trigger infra workflow ([cdbcc59](https://github.com/cds-snc/ai-answers/commit/cdbcc595cb7e37a7c741a60dc0c0e3f2071767a4))

## [1.86.0](https://github.com/cds-snc/ai-answers/compare/v1.85.0...v1.86.0) (2026-01-19)


### Features

* add dev:quick script for easy local development ([b012787](https://github.com/cds-snc/ai-answers/commit/b0127876444160d92ab1a1aa08c13e57bf23043f))
* add dev:quick script for easy local development ([eb48b70](https://github.com/cds-snc/ai-answers/commit/eb48b70c76c50041ba1d7e85a43b8152dd34338d))
* show domain ([8205aba](https://github.com/cds-snc/ai-answers/commit/8205aba07b99a1177a65f5ec7a389b2f0e843b77))
* update URL truncation in filter show domain and segment ([b865db6](https://github.com/cds-snc/ai-answers/commit/b865db6365d9543d17ce8f6a98b404ef568f76b7))

## [1.85.0](https://github.com/cds-snc/ai-answers/compare/v1.84.0...v1.85.0) (2026-01-19)


### Features

* **admin:** enable eval dashboard for partners and move link to partner menu ([a730556](https://github.com/cds-snc/ai-answers/commit/a7305565074c404cf26c7211ce72d159bc24c08c))
* **admin:** split admin menu into Partner and Admin sections ([ec156f8](https://github.com/cds-snc/ai-answers/commit/ec156f8279f9751d9e307a1037068b154da349c4))
* **admin:** split admin menu into Partner and Admin sections ([0bb4f7c](https://github.com/cds-snc/ai-answers/commit/0bb4f7c8f87298514233686df3545d93e1734caf))


### Bug Fixes

* **bedrock:** use Claude 3 Haiku (ON_DEMAND) for Canada, remove US test (SCP blocked) ([6adf17a](https://github.com/cds-snc/ai-answers/commit/6adf17a60d73f8b38a5c517b2b5b161e0d158993))

## [1.84.0](https://github.com/cds-snc/ai-answers/compare/v1.83.0...v1.84.0) (2026-01-16)


### Features

* add infrastructure diagram detailing new Redis, S3, Bedrock, Azure AI Foundry, and external search service integrations. ([e42fb6c](https://github.com/cds-snc/ai-answers/commit/e42fb6ca66aa75264696c90495a0edceeee1faed))
* add workspace synchronization script ([0b055f6](https://github.com/cds-snc/ai-answers/commit/0b055f6c644c14c61e93e7b8ff6ce28a33fd5744))
* Implement ConversationIntegrityService to normalize text, seria… ([723b8be](https://github.com/cds-snc/ai-answers/commit/723b8bef4437f6eac11187a096c4874a16c89a35))
* Implement ConversationIntegrityService to normalize text, serialize history, and verify conversation integrity using HMAC-SHA256 signatures, with accompanying tests. ([e15fd0d](https://github.com/cds-snc/ai-answers/commit/e15fd0d3c819b987b2e6744fa22f9cc704815672))


### Documentation

* add infrastructure diagram with redis s3 and model providers ([a49f5ca](https://github.com/cds-snc/ai-answers/commit/a49f5cadf8825fac1e427dccaefc634f2f0dce6f))
* correct s3 placement outside vpc ([90217ec](https://github.com/cds-snc/ai-answers/commit/90217ec4d82d4954f26db6423d58715ed7ec6c65))
* fix mermaid syntax error and duplicate connection ([38151a5](https://github.com/cds-snc/ai-answers/commit/38151a5f002ce82425342c675b8879d5f81be810))

## [1.83.0](https://github.com/cds-snc/ai-answers/compare/v1.82.0...v1.83.0) (2026-01-15)


### Features

* add bedrock invoke access to ECS ([14cf4cb](https://github.com/cds-snc/ai-answers/commit/14cf4cb9f5104af143cb99e6b55e7dfeacbf511b))
* add ConnectivityService to test connections to DocumentDB, Redis, S3, Azure OpenAI, and AWS Bedrock. ([c6e1a5c](https://github.com/cds-snc/ai-answers/commit/c6e1a5c7e5e376a77401368a0bc7896863dc14bf))
* add ConnectivityService to test health of DocumentDB, Redis, S3, Azure OpenAI, and AWS Bedrock for the admin dashboard. ([9d0d6dc](https://github.com/cds-snc/ai-answers/commit/9d0d6dc6ca5d2ce09661baf29f5684440db46903))
* Add Terragrunt configurations for IAM, ECS, and SSM modules in production and staging environments to pass value of role to assume to application ([a92bb0e](https://github.com/cds-snc/ai-answers/commit/a92bb0e8d31d251ee21a1116534504390513996e))
* Implement AI chat interface, add admin and connectivity pages, … ([1dc6102](https://github.com/cds-snc/ai-answers/commit/1dc6102c5f02decfc45eac3c832b955727b3b1eb))
* Implement AI chat interface, add admin and connectivity pages, and introduce French/English localization. ([5e56a39](https://github.com/cds-snc/ai-answers/commit/5e56a398ac766b030c8c22ee02eeae84e6803b73))
* **infra:** enable Bedrock support in PR Review environments ([99d1222](https://github.com/cds-snc/ai-answers/commit/99d1222a43af549ca0f9659929fd9cca94577652))
* **infra:** expose Bedrock role and region to ECS via SSM and config… ([e3daf20](https://github.com/cds-snc/ai-answers/commit/e3daf2078f6a6d4573239e1cdef3fe8d531b65e4))
* **infra:** expose Bedrock role and region to ECS via SSM and configure IAM permissions ([8e74961](https://github.com/cds-snc/ai-answers/commit/8e74961c6968426683cab67d7cc04be7bf3f5838))


### Bug Fixes

* **bedrock:** clean up connectivity tests, hardcode ca-central-1, and include model reply in details ([3cb57f3](https://github.com/cds-snc/ai-answers/commit/3cb57f30091c6047b98cf55a888e260cd122a8d7))
* **bedrock:** switch to ca-central-1 region and update connectivity tests ([06e593e](https://github.com/cds-snc/ai-answers/commit/06e593e8644b627dc43ecfd0a8c71469d0b6a9ae))
* remove Mongo references, rewrite pipeline doc ([2642ac5](https://github.com/cds-snc/ai-answers/commit/2642ac53ba906ab9e3167f5d6f1ddcef2b0a0e19))


### Miscellaneous Chores

* **deps:** bump diff from 8.0.2 to 8.0.3 ([3695bd6](https://github.com/cds-snc/ai-answers/commit/3695bd68b534f4911c94d301d5d4ec18370474d6))
* **deps:** bump diff from 8.0.2 to 8.0.3 ([6dac8cb](https://github.com/cds-snc/ai-answers/commit/6dac8cbe713cbf27dc391eded002fb3839ad81ee))

## [1.82.0](https://github.com/cds-snc/ai-answers/compare/v1.81.0...v1.82.0) (2026-01-14)


### Features

* Add an endpoint and MongoDB aggregation pipeline to calculate and retrieve AI evaluation metrics with various filtering options. ([63da8fc](https://github.com/cds-snc/ai-answers/commit/63da8fc54e8f499f2dafe0a4d2fcf0c6603b296f))
* add API endpoint for calculating and retrieving AI evaluation metrics. ([2c2eac0](https://github.com/cds-snc/ai-answers/commit/2c2eac09304987e9816cb2c06bde6e881beb5cff))
* add API endpoint for public feedback metrics, including totals and reason breakdowns with comprehensive filtering. ([1d85557](https://github.com/cds-snc/ai-answers/commit/1d855572e1627047d6669e34b325728af11667e5))
* add API endpoint to retrieve public feedback metrics, providing totals and reasons for 'yes' and 'no' feedback with filtering capabilities. ([7ba058c](https://github.com/cds-snc/ai-answers/commit/7ba058ca97c7638b42055247bd5b0811df38fd0d))
* Add new API endpoints for expert feedback, public feedback, AI evaluation, and department metrics. ([929cfba](https://github.com/cds-snc/ai-answers/commit/929cfbaeddef703ca0113bf8609c14167efd1762))
* add new API endpoints for public feedback, sessions, usage, AI eval, departments, and expert feedback metrics. ([4763b1f](https://github.com/cds-snc/ai-answers/commit/4763b1f525e7f7122f63c39cc6dd6affe19489dd))
* add new API endpoints for various metrics including AI evaluation, departments, expert feedback, public feedback, sessions, and usage. ([b306aab](https://github.com/cds-snc/ai-answers/commit/b306aabbd895f9b44a4cf6276c3f4906b8f91f3a))
* Implement a new metrics module with shared request parsing and MongoDB aggregation pipeline stages for various metrics. ([405fc16](https://github.com/cds-snc/ai-answers/commit/405fc16ff2963b0c7e3da1e45435dae90da48e42))
* refactor of metrics now runs each view as separate query and loads in data as it comes in. ([9a9e063](https://github.com/cds-snc/ai-answers/commit/9a9e063deaed7578c8d7f03b9def1132b6f97b4b))


### Bug Fixes

* refactor of user and additonal notification panel feature of ina… ([4a231cb](https://github.com/cds-snc/ai-answers/commit/4a231cbcdfcd0f87d7cd751b5a283d66a3036eeb))
* refactor of user and additonal notification panel feature of inactive and new users. ([3703742](https://github.com/cds-snc/ai-answers/commit/3703742bcb1c841bd3cb37ec4a2029a6efb6115e))
* sanitize user input in user-users API to prevent NoSQL injection ([48398a3](https://github.com/cds-snc/ai-answers/commit/48398a3a9792278579389f4775b8f4c4c5b42eee))


### Documentation

* add evaluation service refactor plan and architecture overview ([2815809](https://github.com/cds-snc/ai-answers/commit/2815809e497db151a897fb0dc66810092ef659c3))
* add evaluation service refactor plan and architecture overview ([cec14e4](https://github.com/cds-snc/ai-answers/commit/cec14e45e0a869126e4b1e65056fe0c542f8f4cd))

## [1.81.0](https://github.com/cds-snc/ai-answers/compare/v1.80.0...v1.81.0) (2026-01-13)


### Features

* **dashboard:** add tooltip to show all departments on hover ([9574728](https://github.com/cds-snc/ai-answers/commit/9574728d544de5f2cf305291a08fa876cbfb7fd7))
* **dashboard:** display all departments with primary and count indicator ([5ee3bef](https://github.com/cds-snc/ai-answers/commit/5ee3bef9b8d48efc652997315555688124c83cc4))


### Bug Fixes

* **admin:** solve export memory limit and fix department/answerType f… ([81e0cdc](https://github.com/cds-snc/ai-answers/commit/81e0cdca75ff93edb5584ca5af09026ac58fdece))
* **admin:** solve export memory limit and fix department/answerType filter paths ([697190e](https://github.com/cds-snc/ai-answers/commit/697190e9bd82ccc0aca8636f13642f9e236ef506))
* **api:** add missing totalScore checks to dashboard aggregation expr… ([c77add1](https://github.com/cds-snc/ai-answers/commit/c77add1be40ad7149f051a56dde453536f4931c0))
* **api:** add missing totalScore checks to dashboard aggregation expressions ([76b04ed](https://github.com/cds-snc/ai-answers/commit/76b04edf3ad9712c6cc2ffb329c0d072e0a4133f))
* **api:** implement eval and answerType rollup logic with worst-case priority ([6d23876](https://github.com/cds-snc/ai-answers/commit/6d23876efe2de6c26521c1538a51a6dd10751652))
* **api:** stricter eval checks, default to null instead of correct ([48a5ac9](https://github.com/cds-snc/ai-answers/commit/48a5ac9976c38426f2da141538265dd3845c705c))
* **api:** use indexOfArray instead of  for DocumentDB compatibility ([70bfcfb](https://github.com/cds-snc/ai-answers/commit/70bfcfba1150ea4fb24e1709b3b4fdfddbc17bc0))
* **auth:** normalize email in signup and remove duplicate reset email ([b29c06f](https://github.com/cds-snc/ai-answers/commit/b29c06fca3fe7370bfaed0a9cf0a609b0d3e6f5c))
* **auth:** normalize email in signup and remove duplicate reset email ([3600578](https://github.com/cds-snc/ai-answers/commit/3600578e44499629165c5fadff2eb330e1b8614f))
* first question is error ([573e418](https://github.com/cds-snc/ai-answers/commit/573e418ce087337c07928af0d8dcd86ec3c89036))
* **graphs:** ensure GENERATING_ANSWER status is emitted in all answer paths ([ad1b101](https://github.com/cds-snc/ai-answers/commit/ad1b1010dad131fdc7dbaa10778df81e02c787fb))
* **integrity:** filter error messages and add missing graph status updates ([13fbf7f](https://github.com/cds-snc/ai-answers/commit/13fbf7fbdb8b8890130c8a0f0945b80de4e20cb0))
* **integrity:** filter out error messages from conversation history ([277613b](https://github.com/cds-snc/ai-answers/commit/277613bb182ec819b9fec846cd1edb35180ab6a0))
* **integrity:** filter out error messages from conversation history serialization ([f1434a9](https://github.com/cds-snc/ai-answers/commit/f1434a921596328a067653e81f68fb365a141933))
* ircc scenario per david - depts ([7eb0c88](https://github.com/cds-snc/ai-answers/commit/7eb0c8888317fe91e3f83ccc448e58df9e09748c))
* langgraph fixes ([7f0f9b0](https://github.com/cds-snc/ai-answers/commit/7f0f9b050d6a084776f7d7c1b96cdcb842c633bb))
* link to about content ([e027221](https://github.com/cds-snc/ai-answers/commit/e02722110f290dc9f87657eaecafba98cc9d6ac0))
* missed these ([2f34d5b](https://github.com/cds-snc/ai-answers/commit/2f34d5b03efca2d1151efc7d57f62a94016f7291))
* more download msgs ([3530fec](https://github.com/cds-snc/ai-answers/commit/3530fec5b59bbfe0f59e9351f465f26620658141))
* service canada was only in dept en ([366088f](https://github.com/cds-snc/ai-answers/commit/366088f89c8690591ed228530579b68b83001daf))
* vaguer so forces upload IRCC PGWP ([fdb7d10](https://github.com/cds-snc/ai-answers/commit/fdb7d1069fb62f6b608f91bd9fffaab5b60f03db))

## [1.80.0](https://github.com/cds-snc/ai-answers/compare/v1.79.4...v1.80.0) (2026-01-12)


### Features

* Add section for redaction settings in settings ([6e4a9a5](https://github.com/cds-snc/ai-answers/commit/6e4a9a54a33d78dc9b0a5465b3e1254455ce40fc))
* readaction service tests for migration. ([5b00d6f](https://github.com/cds-snc/ai-answers/commit/5b00d6f76257e7d27f7fcbde18ebbefd29fa69bc))
* use the database to get threat words instead of files ([7a7a16d](https://github.com/cds-snc/ai-answers/commit/7a7a16dbe3cfbb977f56717663a67d7d91c0cdb8))


### Bug Fixes

* add graphs to settings ([18ffc7b](https://github.com/cds-snc/ai-answers/commit/18ffc7bcacc9994a7a2ec689e2b2356abfc04f04))
* include historySignature in GraphClient requests for conversation integrity check ([1c2cede](https://github.com/cds-snc/ai-answers/commit/1c2cede66842ee513d107486bdffac1d89ce61a3))
* integreity check on graphs. ([021e161](https://github.com/cds-snc/ai-answers/commit/021e1619369ba4ca12ed36e0c4ba1f6dce3e10a0))
* integreity check on graphs. ([c589c0a](https://github.com/cds-snc/ai-answers/commit/c589c0ae35f0772db02222857fa15f1aac8474f0))
* remove threat words from repo ([0b32387](https://github.com/cds-snc/ai-answers/commit/0b32387de8167837b7109fad9162bb573559773e))
* **server:** resolve conversation integrity hash mismatch and context agent crash ([b585a34](https://github.com/cds-snc/ai-answers/commit/b585a3488fbb8c2e94da4bb5441355859ef2e238))
* use public endpoint for values ([daaf948](https://github.com/cds-snc/ai-answers/commit/daaf94833b07ade4f4ce0a64c68110e70b629af4))

## [1.79.4](https://github.com/cds-snc/ai-answers/compare/v1.79.3...v1.79.4) (2026-01-12)


### Bug Fixes

* pi check model and information is done in canada only ([3aa4fa6](https://github.com/cds-snc/ai-answers/commit/3aa4fa681ebc7b399e52b7e0031ec4c7a844be48))
* pi check model and information is done in canada only ([85e8879](https://github.com/cds-snc/ai-answers/commit/85e8879e1545a59c265af5aedb6046276dbc70d5))

## [1.79.3](https://github.com/cds-snc/ai-answers/compare/v1.79.2...v1.79.3) (2026-01-12)


### Bug Fixes

* add blog to About ([18780b8](https://github.com/cds-snc/ai-answers/commit/18780b8da148ddfeb42ba29387f4abcc7362ec38))
* add statcan partner ([5d830cd](https://github.com/cds-snc/ai-answers/commit/5d830cdebf0a11a8013af60af7b3b8ea822e84ae))
* add statcan partner ([76f5c60](https://github.com/cds-snc/ai-answers/commit/76f5c60492aede3cef4960aafd1b7b22b6732595))
* change cds to ceo ([3a52cbc](https://github.com/cds-snc/ai-answers/commit/3a52cbc258f41d8dc0cfd3df4b6ad9e35be26754))
* contact form label ([a2985e9](https://github.com/cds-snc/ai-answers/commit/a2985e9ed622d223abff536dd1fdc762286e35bf))
* move blog link ([57682da](https://github.com/cds-snc/ai-answers/commit/57682da5bfbfe69bf25ae3636a68e8a0b5dec071))
* translation ([ce0eb30](https://github.com/cds-snc/ai-answers/commit/ce0eb309bd3c1d376cd43d1d78b37ddd1fd549eb))
* typo on about ([0fdabc0](https://github.com/cds-snc/ai-answers/commit/0fdabc06b9a014a3205d1779936c658c4b82dfa9))

## [1.79.2](https://github.com/cds-snc/ai-answers/compare/v1.79.1...v1.79.2) (2026-01-09)


### Bug Fixes

* session variables ([9abf555](https://github.com/cds-snc/ai-answers/commit/9abf555a7cedfdf81473d8bdf2d6a4bae32a04b8))
* session variables ([5005a3f](https://github.com/cds-snc/ai-answers/commit/5005a3fbc5af1fb4061edb548d8e89616cb28361))

## [1.79.1](https://github.com/cds-snc/ai-answers/compare/v1.79.0...v1.79.1) (2026-01-09)


### Bug Fixes

* add session_secret to github ([ada4427](https://github.com/cds-snc/ai-answers/commit/ada442770aaf1fa3bca5f5211848cd3ad57dfad0))


### Miscellaneous Chores

* **deps:** bump @smithy/config-resolver, @aws-sdk/client-sagemaker and @aws-sdk/credential-providers in /server ([ba3a20b](https://github.com/cds-snc/ai-answers/commit/ba3a20bb6e193bd8c0d33bdeef4a85b34ab8db74))

## [1.79.0](https://github.com/cds-snc/ai-answers/compare/v1.78.0...v1.79.0) (2026-01-09)


### Features

* check status of index rebuilding. ([474e4b6](https://github.com/cds-snc/ai-answers/commit/474e4b6b6036b4764405884901afc3043e38fb2a))
* check status of index rebuilding. ([c722376](https://github.com/cds-snc/ai-answers/commit/c7223767945a5d5cc292d1864e3e0251c73410d3))


### Bug Fixes

* query optimization no redudant data ([7ec951e](https://github.com/cds-snc/ai-answers/commit/7ec951ee3a647d3b31f93b3794e42fa7614bdf44))

## [1.78.0](https://github.com/cds-snc/ai-answers/compare/v1.77.0...v1.78.0) (2026-01-09)


### Features

* add indexes to database schema ([3835b12](https://github.com/cds-snc/ai-answers/commit/3835b121289d224536c09aae72645e2c0d9d0364))
* add new columns to sort. ([a64004c](https://github.com/cds-snc/ai-answers/commit/a64004c81dc516c01caa5552805f98964befae97))
* add server-side streaming export for chat logs with configurable views and data flattening. ([39cf9e4](https://github.com/cds-snc/ai-answers/commit/39cf9e48fe380b0974067d09163b6f364f5f14cd))
* Add server-side streaming export for chat logs with multiple views and filtering options. ([cbf9e9b](https://github.com/cds-snc/ai-answers/commit/cbf9e9bd2902d8f3629788929993d8841dc2bc26))
* all checked function ([f261394](https://github.com/cds-snc/ai-answers/commit/f2613945a8a7f5718005115a576ccc63aaef54b4))
* answer type also checkboxes ([4253fc0](https://github.com/cds-snc/ai-answers/commit/4253fc0692851618bc003f07cf04fba9b3c71723))
* change to checkboxes ([d8c8438](https://github.com/cds-snc/ai-answers/commit/d8c843892f46f8da9692d955a037ab3e1e10dc2e))
* change to checkboxes ([3cb89ef](https://github.com/cds-snc/ai-answers/commit/3cb89ef615ee3d458af216f9f1779e7c59c5fab1))
* checkboxes ([4aace64](https://github.com/cds-snc/ai-answers/commit/4aace6402399f023ed4686d2f7f006a3bc65eb83))
* checkboxes ([e626d31](https://github.com/cds-snc/ai-answers/commit/e626d31f223daad4c29697bedb0fbea0bfb96049))
* database integrity checks ([128a8ff](https://github.com/cds-snc/ai-answers/commit/128a8ffea485e4c86dc023bb5aecb0c84f8669ed))
* detail/summary for checkboxes ([b6a7d70](https://github.com/cds-snc/ai-answers/commit/b6a7d7003bd8628c991c78653e85596db2e369a7))
* Implement server-side streaming chat log export with support for multiple formats, views, and filtering options. ([eee22ca](https://github.com/cds-snc/ai-answers/commit/eee22caf4c2eedfe7a2e0194496875e2bebeb75b))
* mb ([bc2e0ce](https://github.com/cds-snc/ai-answers/commit/bc2e0cee6288f68daa9b47f232ddb8190aaab257))
* optimie dashbaord queries ([bbf7a8f](https://github.com/cds-snc/ai-answers/commit/bbf7a8fe259a4a29becd1e6e8a20554c6f9372dc))
* optimize query ([d583b69](https://github.com/cds-snc/ai-answers/commit/d583b6990dc60e654fabfd4344a150621e53523a))
* recreate database indexes ([ae0716d](https://github.com/cds-snc/ai-answers/commit/ae0716dcf13290e030f32d40f6f3695c346c4530))
* remove auto load ([b47afb3](https://github.com/cds-snc/ai-answers/commit/b47afb3b8e1dab723dd7de5035d08db173134fec))
* standardize the loading of records. ([a7c7be7](https://github.com/cds-snc/ai-answers/commit/a7c7be709e0521049b590ffd2367fbf154e3d082))


### Bug Fixes

* clean up citation instructions ([8294d70](https://github.com/cds-snc/ai-answers/commit/8294d70f5985ecdce808b7c146e0095ba7f55c54))
* don't autoload the page ([b628ffe](https://github.com/cds-snc/ai-answers/commit/b628ffe1d4ff7b973af14548a55db8f46b175038))
* false premise citation ([88781ae](https://github.com/cds-snc/ai-answers/commit/88781ae18b58d98c54757f3502cc918f5a0a9a63))
* follow-on ([035a54b](https://github.com/cds-snc/ai-answers/commit/035a54b7fa851f3b86c7a9a6d154658b24191cd8))
* localization ([0e704ea](https://github.com/cds-snc/ai-answers/commit/0e704ea7f243463c78db11e24a2c7e764a21782d))
* overlay should stay visible on page ([2c4dec1](https://github.com/cds-snc/ai-answers/commit/2c4dec17c7950ba19387fa1e833443da2b41eb13))
* remoe cached values for panel ([e9dab56](https://github.com/cds-snc/ai-answers/commit/e9dab56467e110e8acd2ecc1678d6918007a7042))
* remove duplicate keys from database. ([a69c2d0](https://github.com/cds-snc/ai-answers/commit/a69c2d018d3de401133e7bea71f349b15c690015))
* remove totals when no apply ([4a65e04](https://github.com/cds-snc/ai-answers/commit/4a65e04251dba614e03c8d53c1ffd628cb653cc6))
* translation ([90d54ec](https://github.com/cds-snc/ai-answers/commit/90d54ec53e26e9554d584f3101a9a2d0af71e991))
* translation in manipulation ([c19cbaa](https://github.com/cds-snc/ai-answers/commit/c19cbaa6e943ed82a6f41d3ba16299963986f396))
* typo-manipulation ([2a9bdd4](https://github.com/cds-snc/ai-answers/commit/2a9bdd46f7c55794313fea106bde21ef1673a84d))

## [1.77.0](https://github.com/cds-snc/ai-answers/compare/v1.76.0...v1.77.0) (2026-01-07)


### Features

* add concept images to system card ([b8ec3d8](https://github.com/cds-snc/ai-answers/commit/b8ec3d8bdfa7d33c48258997914feb434ce87c57))
* move about content to md files ([0d099c3](https://github.com/cds-snc/ai-answers/commit/0d099c3c17b72b280585df1bebac590962bc8c7a))

## [1.76.0](https://github.com/cds-snc/ai-answers/compare/v1.75.0...v1.76.0) (2026-01-06)


### Features

* Implement password reset functionality, including sending reset emails and verifying tokens to update passwords. ([c1ef84c](https://github.com/cds-snc/ai-answers/commit/c1ef84c6401d8c5c68e1df9b5f95b1820afa6b65))
* implement TOTP-based password reset functionality across API, models, and UI. ([4e0bbb1](https://github.com/cds-snc/ai-answers/commit/4e0bbb151944a4bca54606822d5d94f492150738))
* Implement user signup, password reset, and two-factor authentication services. ([9214b5d](https://github.com/cds-snc/ai-answers/commit/9214b5dc62f0e62a7cc228fd68ebce51fcd82cc7))

## [1.75.0](https://github.com/cds-snc/ai-answers/compare/v1.74.1...v1.75.0) (2026-01-06)


### Features

* add authentication service with fetch header logic, user manage… ([926234b](https://github.com/cds-snc/ai-answers/commit/926234b4a5c85ad6a434cbff44ab2ca00eb15612))
* add authentication service with fetch header logic, user management page, and internationalized AI Answers UI ([3a18601](https://github.com/cds-snc/ai-answers/commit/3a186011fed29b81d8264d4f5204195747694043))

## [1.74.1](https://github.com/cds-snc/ai-answers/compare/v1.74.0...v1.74.1) (2026-01-06)


### Bug Fixes

* Add base URL back to settings for proper password reset ([d408eef](https://github.com/cds-snc/ai-answers/commit/d408eefb813d02125b62d1d94f852c5c1e02edeb))
* User role not set to partner ([045510c](https://github.com/cds-snc/ai-answers/commit/045510cc4109a2b5383b14a753d46b5da3c81a12))


### Miscellaneous Chores

* **deps:** bump @langchain/core from 0.3.75 to 0.3.80 ([4919327](https://github.com/cds-snc/ai-answers/commit/4919327f82c3f42e22a8abbc8bfbd45f91de6c0f))
* **deps:** bump qs and express ([81a9904](https://github.com/cds-snc/ai-answers/commit/81a9904c11147f37b3aa8c4495f1eb06d9fe4458))
* **deps:** bump qs and express ([75aedb4](https://github.com/cds-snc/ai-answers/commit/75aedb498a02d9c991e0868e02bfec369ed5390a))
* **deps:** bump storybook from 8.6.14 to 8.6.15 ([fda57b1](https://github.com/cds-snc/ai-answers/commit/fda57b1cc8ecf6de246fe0f0888996e07323fbb3))

## [1.74.0](https://github.com/cds-snc/ai-answers/compare/v1.73.0...v1.74.0) (2025-12-30)


### Features

* admin filter improvements ([0de5758](https://github.com/cds-snc/ai-answers/commit/0de575831697c6c23b463ef199283fb6b566aade))
* admin filter improvements ([7ba4f23](https://github.com/cds-snc/ai-answers/commit/7ba4f23badee4f14df7bfde08e4e27db8bc97ef1))
* cleanup ([18b26cd](https://github.com/cds-snc/ai-answers/commit/18b26cd91ab8c3d749688941e7c786bdc978a95f))
* fix hover/focus ([0526799](https://github.com/cds-snc/ai-answers/commit/0526799aea3e44aac8e45a40e97876dc2060cc45))

## [1.73.0](https://github.com/cds-snc/ai-answers/compare/v1.72.0...v1.73.0) (2025-12-30)


### Features

* cleanup dashboard ([23ad497](https://github.com/cds-snc/ai-answers/commit/23ad49739a3d91ab5e23dde4a5864a116d7bf862))
* css ([ab9f485](https://github.com/cds-snc/ai-answers/commit/ab9f4852fffee495334cc9dfdf7d76b6bf11ad11))
* css ([c0a30fe](https://github.com/cds-snc/ai-answers/commit/c0a30fed6bcc69fb8e4cbf7190ff86fc02b9cc8a))
* translation for labels ([6001db3](https://github.com/cds-snc/ai-answers/commit/6001db3f9644cf4a8f0c1ff595c885ae81f023e0))
* translation for labels in filter table ([3a0c014](https://github.com/cds-snc/ai-answers/commit/3a0c0144d7df161440086ea8456e9f31610c0ac7))

## [1.72.0](https://github.com/cds-snc/ai-answers/compare/v1.71.0...v1.72.0) (2025-12-30)


### Features

* Alt colours in filter admin ([30704ab](https://github.com/cds-snc/ai-answers/commit/30704aba0e6fae35d2c54aac88d4bcc3d2bf7a95))
* css weird ([8c7d465](https://github.com/cds-snc/ai-answers/commit/8c7d465bfc5cc3f6d95fe49af8f965055052d926))

## [1.71.0](https://github.com/cds-snc/ai-answers/compare/v1.70.9...v1.71.0) (2025-12-29)


### Features

* admin filter improvements ([617b38e](https://github.com/cds-snc/ai-answers/commit/617b38e0ea49593bfb342a55ec55ad108477c8ee))
* admin filter table improvements ([d8a3541](https://github.com/cds-snc/ai-answers/commit/d8a354124e4faae18ec55036d970c268d00607f9))
* changes to right file ([23675c1](https://github.com/cds-snc/ai-answers/commit/23675c14b82baabf1ef1cae7dfe7b2aec9076de1))
* cleanup ([7c1ec25](https://github.com/cds-snc/ai-answers/commit/7c1ec25d22f90dd0cef1a0324b08b587556dd0c4))
* css ([1b66b74](https://github.com/cds-snc/ai-answers/commit/1b66b74b930e63e440e9ea88066c1bd86119a2ee))
* css ([8560989](https://github.com/cds-snc/ai-answers/commit/8560989ef28af93fb65641f6aebe11df2e29ba65))
* css ([f3b4174](https://github.com/cds-snc/ai-answers/commit/f3b4174f9f5630c15f90cb09b55352f5b310a89e))
* fix css ([8994337](https://github.com/cds-snc/ai-answers/commit/89943377339ae81f47f8cfa07e2a21a380cbafd1))
* pills ([92e300e](https://github.com/cds-snc/ai-answers/commit/92e300ea0a3cdce7c362f38f8bee027f2034b9b5))
* reduce contrast ([aa1a965](https://github.com/cds-snc/ai-answers/commit/aa1a965a36d394fb4ff9300a8236ae03db56ad51))
* rmv ([5a7a9a4](https://github.com/cds-snc/ai-answers/commit/5a7a9a4f72dd495a3ba4d8b9f72553a5c73e974a))
* spacing ([887229e](https://github.com/cds-snc/ai-answers/commit/887229ec7e2d14f4060369f51efa963f4e3b41b8))
* spacing ([5bb89e8](https://github.com/cds-snc/ai-answers/commit/5bb89e80f049072c4eb077533fe71ddb1aace59b))
* spacing ([98dbdc3](https://github.com/cds-snc/ai-answers/commit/98dbdc3a95683835a68ca3b7244bba91791785f8))
* spacing ([6e9482b](https://github.com/cds-snc/ai-answers/commit/6e9482bccb27ff85d3bbfe48917f1ac8c00c203a))
* test ([e2a622b](https://github.com/cds-snc/ai-answers/commit/e2a622b1384bea8b05355142d18582957b172283))
* tighten fonts ([a6efc4d](https://github.com/cds-snc/ai-answers/commit/a6efc4d18bcf74da307d2bb55968d5ca58be5249))
* wrong css link ([a35bc31](https://github.com/cds-snc/ai-answers/commit/a35bc3196f882fe50e42c30e1680ad004ce42a10))

## [1.70.9](https://github.com/cds-snc/ai-answers/compare/v1.70.8...v1.70.9) (2025-12-23)


### Bug Fixes

* clear up access codes ([560412a](https://github.com/cds-snc/ai-answers/commit/560412aa111d25bc7b9599dd3d75ec04292dd04f))
* missing mailing address ([f4ca219](https://github.com/cds-snc/ai-answers/commit/f4ca2195dbd4e393c9326188d2f7bac268688fba))
* optimize scenarios and download tool use ([7251214](https://github.com/cds-snc/ai-answers/commit/72512141a3c8e43f241d744f528c9eb9e6e9fd33))
* per Udit Kumar input ([463d27d](https://github.com/cds-snc/ai-answers/commit/463d27dd48469c2dea5556576269ff35372f34b1))
* tbs calendar ([4f43fd9](https://github.com/cds-snc/ai-answers/commit/4f43fd9362a807cdae714d53f4c68877a93e5a16))

## [1.70.8](https://github.com/cds-snc/ai-answers/compare/v1.70.7...v1.70.8) (2025-12-19)


### Bug Fixes

* isc issue status cards ([f97e6d5](https://github.com/cds-snc/ai-answers/commit/f97e6d53c3c40d74da44151eca6e6e82e36b903b))
* isc issue status cards -  ([9864e37](https://github.com/cds-snc/ai-answers/commit/9864e3710e83ef9f2dba2ea66fc05720e070265d))
* tweak re photo ([f63c12b](https://github.com/cds-snc/ai-answers/commit/f63c12b8bbda1ef35c04e9b3ad51f3ad6f10ab0a))

## [1.70.7](https://github.com/cds-snc/ai-answers/compare/v1.70.6...v1.70.7) (2025-12-18)


### Bug Fixes

* copy/pasta error ([679b964](https://github.com/cds-snc/ai-answers/commit/679b964d83a481d0418173f4e1c5f2bd9c711856))
* date tweaks ([2288922](https://github.com/cds-snc/ai-answers/commit/2288922f6fa436da460c3806c947877c5a2af00b))
* optimize chat loading speed by refining document count retrieval and query execution ([a7c3649](https://github.com/cds-snc/ai-answers/commit/a7c36491b95c4a1d5f614e6732eaf86475bcc713))
* optimize chat loading speed by refining document count retrieval… ([de1d803](https://github.com/cds-snc/ai-answers/commit/de1d803a4795429db0734bd5489bf9ac1c81a927))

## [1.70.6](https://github.com/cds-snc/ai-answers/compare/v1.70.5...v1.70.6) (2025-12-18)


### Bug Fixes

* enhance chat loading speed by optimizing date handling and timez… ([4719f5f](https://github.com/cds-snc/ai-answers/commit/4719f5ffeeb8f7711670b60db51d7c1a0b26f58b))
* enhance chat loading speed by optimizing date handling and timezone support ([fef4063](https://github.com/cds-snc/ai-answers/commit/fef406380a4db6b04c72f63295e767e2c4a2110c))

## [1.70.5](https://github.com/cds-snc/ai-answers/compare/v1.70.4...v1.70.5) (2025-12-17)


### Bug Fixes

* enhance chat loading speed by optimizing database lookups and query structure ([a4ced08](https://github.com/cds-snc/ai-answers/commit/a4ced08d379d8a8629c61528c195e3f5d909000c))
* improve chat loading speed by optimizing query parameters ([5195137](https://github.com/cds-snc/ai-answers/commit/51951376e0cf1917a922fb49f755ae86a4fe7088))
* improve chat loading speed by optimizing query parameters ([5744464](https://github.com/cds-snc/ai-answers/commit/574446461fa10a99b4f706a52c2e6541779b5b49))
* optimize chat loading speed by refining query handling and filters ([8af3f30](https://github.com/cds-snc/ai-answers/commit/8af3f3066dd341bd7b7731276d0ec58ba6c68b92))

## [1.70.4](https://github.com/cds-snc/ai-answers/compare/v1.70.3...v1.70.4) (2025-12-17)


### Miscellaneous Chores

* update localization files for English and French ([524ec19](https://github.com/cds-snc/ai-answers/commit/524ec19aaec2c331d19bec4ad520a62e809bfad9))
* update localization files for English and French ([c5b5eb1](https://github.com/cds-snc/ai-answers/commit/c5b5eb1686b00c2c06c720c7e2ed3f8e33611062))

## [1.70.3](https://github.com/cds-snc/ai-answers/compare/v1.70.2...v1.70.3) (2025-12-17)


### Bug Fixes

* additional earnings ([c9c1ce3](https://github.com/cds-snc/ai-answers/commit/c9c1ce332739f2bf82268ef878315c0944449af8))
* EI prompt updates ([2442e48](https://github.com/cds-snc/ai-answers/commit/2442e48277605c26bcc67ab5e2da2686833332af))
* EI prompt updates ([03ac6d9](https://github.com/cds-snc/ai-answers/commit/03ac6d92888801b45a88aadb1c0956baba5acd09))
* reduce token load ([268191b](https://github.com/cds-snc/ai-answers/commit/268191b9879db633c560f076f11fda0d302d58c4))
* temp password issue ([6abdb13](https://github.com/cds-snc/ai-answers/commit/6abdb13064eb8f44fa4676898bd75db6394b835d))
* tweak payment dates section ([87d2d73](https://github.com/cds-snc/ai-answers/commit/87d2d7303c2295625170855d88465e6023fb9679))

## [1.70.2](https://github.com/cds-snc/ai-answers/compare/v1.70.1...v1.70.2) (2025-12-16)


### Bug Fixes

* enhance user email logging functionality ([3a96f85](https://github.com/cds-snc/ai-answers/commit/3a96f85867035c4c909914004f683874c0081f10))
* improve user email logging functionality ([cdede33](https://github.com/cds-snc/ai-answers/commit/cdede33b03117b20399dd96d07f434235502138c))
* improve user email logging functionality ([2471dae](https://github.com/cds-snc/ai-answers/commit/2471daedf831e02a3b173a0b15e7dd3880430724))

## [1.70.1](https://github.com/cds-snc/ai-answers/compare/v1.70.0...v1.70.1) (2025-12-16)


### Bug Fixes

* resolve batch restart error ([47292f3](https://github.com/cds-snc/ai-answers/commit/47292f337654ac2d01af00a87f06219b6c1663cb))
* resolve batch restart error ([585603a](https://github.com/cds-snc/ai-answers/commit/585603a2e0778440778a02875fa69dfedf670dbd))
* resolve race condition in scenario handling ([efa7e7c](https://github.com/cds-snc/ai-answers/commit/efa7e7c65114a51a3c98906ff14a5b429a20c4ca))
* resolve race condition in scenario handling ([48314ef](https://github.com/cds-snc/ai-answers/commit/48314efeaf0b366c6482ab3af44bdbbaee6b48ff))
* update user email logging functionality ([a144bcc](https://github.com/cds-snc/ai-answers/commit/a144bcc8ca9fa77feea4126f86639c6359661341))
* update user email logging functionality ([8d4edc5](https://github.com/cds-snc/ai-answers/commit/8d4edc50115b7a0a2e736b7cdbe49d3733fda84e))

## [1.70.0](https://github.com/cds-snc/ai-answers/compare/v1.69.1...v1.70.0) (2025-12-15)


### Features

* add beta to title ([a0c007b](https://github.com/cds-snc/ai-answers/commit/a0c007b9aa6a7de36bdf417ddb5b0abff5431f99))
* add beta to title ([6d99c94](https://github.com/cds-snc/ai-answers/commit/6d99c9438fc83179dc9ccd62dfa34d089d8ca03b))
* enhance categorizeExpertFeedback and filtering functions for improved score handling ([da11152](https://github.com/cds-snc/ai-answers/commit/da111520f0f532ccf65e1b2bba397478948c861d))
* enhance chat dashboard with AI evaluation and filtering capabilities ([9453238](https://github.com/cds-snc/ai-answers/commit/9453238f33e4f9f50fafbc143bf0236f5b8fff58))
* enhance EvalDashboard with new filter handling and refactor filter logic ([476c5f4](https://github.com/cds-snc/ai-answers/commit/476c5f4d82b2a8fcc7b772ca8c457d473563d92e))
* fix metadata, browser crawl for noindex, missing locale en ([59e2b4d](https://github.com/cds-snc/ai-answers/commit/59e2b4d9c58931dee0bc55acd97b6f43b959e14b))
* implement FilterPanelV2 with new filtering capabilities and update backend logic ([aac6077](https://github.com/cds-snc/ai-answers/commit/aac607716af1c4e67a4da27bafb310189c7ddb61))
* implement numeric comparison rule ([6c4defb](https://github.com/cds-snc/ai-answers/commit/6c4defba94158b858b2a590f1e4ecd327693434f))
* implement numeric comparison rule ([0188612](https://github.com/cds-snc/ai-answers/commit/01886124de6e1898b31041b91414d009c87e60ee))
* integrate local storage management for filter panel state in ChatLogsDashboard ([27058f8](https://github.com/cds-snc/ai-answers/commit/27058f81da74eb6cdd7f11ae0a000463c0a86e6c))
* metadata ([a231e24](https://github.com/cds-snc/ai-answers/commit/a231e24e796feb26e13cb6f73195bba13398f6c5))


### Bug Fixes

* new filter panel ([0882507](https://github.com/cds-snc/ai-answers/commit/088250778f08f17898efd3353fe700b0a7f7e3da))
* trial3 issues ([823ad20](https://github.com/cds-snc/ai-answers/commit/823ad20e31facad38dd841edd29f415ead2db795))
* trial3 issues ([6f3ca33](https://github.com/cds-snc/ai-answers/commit/6f3ca33f34483abc0c5bf7a009a90f8f3b97c68d))
* update aggregation expressions to return null instead of $$REMOVE for DocumentDB compatibility ([343e033](https://github.com/cds-snc/ai-answers/commit/343e033b0d4af96c18758f29272c461dce658f5f))


### Code Refactoring

* remove FilterPanelV2 component to streamline filter management ([ca837d9](https://github.com/cds-snc/ai-answers/commit/ca837d96523ba1eb5fa9b9555caac39f6b5626c6))
* simplify query parameters and improve URL filtering logic in chat filters ([1ea4667](https://github.com/cds-snc/ai-answers/commit/1ea46670ab9ee32d63a5305bfd33aee2f969b87d))

## [1.69.1](https://github.com/cds-snc/ai-answers/compare/v1.69.0...v1.69.1) (2025-12-10)


### Bug Fixes

* prompt EI always apply ([56589c9](https://github.com/cds-snc/ai-answers/commit/56589c9f38ea11525c61d85f5f46388a093f371c))
* prompt EI always apply ([822a7e7](https://github.com/cds-snc/ai-answers/commit/822a7e7ae246f3d66e5b2a6324ae799a6f55744f))

## [1.69.0](https://github.com/cds-snc/ai-answers/compare/v1.68.3...v1.69.0) (2025-12-09)


### Features

* date ([e767ca3](https://github.com/cds-snc/ai-answers/commit/e767ca343a81b5f556c31658529c5b78a3dedf37))
* date and time ([c504865](https://github.com/cds-snc/ai-answers/commit/c5048654cae54081710ffd779d80448a524e6144))
* date styles ([87ce1f9](https://github.com/cds-snc/ai-answers/commit/87ce1f99504e89ce4044b2391be767b648a84f3c))
* enhance Adobe Data Layer tracking with additional identifiers ([c47b44c](https://github.com/cds-snc/ai-answers/commit/c47b44c6ab3fd6c5db579134288ee7c12a90ecaa))
* enhance Adobe Data Layer tracking with additional identifiers ([13e98bd](https://github.com/cds-snc/ai-answers/commit/13e98bda969083b0f23c8785e53c264b098c80a0))
* enhance ExpertFeedbackPanel to support English question and sentence display ([1775277](https://github.com/cds-snc/ai-answers/commit/1775277d8189209db3394de235de05794297333e))
* fix class ([8243780](https://github.com/cds-snc/ai-answers/commit/8243780818421e39ac2217fc7f81423341dabc06))
* implement gating for similar-answer check based on prior AI replies and add unit tests ([ae13236](https://github.com/cds-snc/ai-answers/commit/ae13236819970b0c17ee48a2f9e260670513738e))
* introduce ChatAppContainer and ChatOptions components for chat functionality ([f8ac32d](https://github.com/cds-snc/ai-answers/commit/f8ac32d49a5939c649eddaa79a3d973d000d5fa8))
* sanitize question inputs and update recencyDays default value ([91fc734](https://github.com/cds-snc/ai-answers/commit/91fc734b13d48aad9276f98dc157c2f7fb1f0073))
* table text size ([1c71cad](https://github.com/cds-snc/ai-answers/commit/1c71cad9d0245a6b828cb55acfb4083fed7b2016))
* table text size, add date and time ([219ac12](https://github.com/cds-snc/ai-answers/commit/219ac128651d43923964f7730a907c2f243cad4b))


### Bug Fixes

* hide search provider selection in ChatOptions and set Google as default ([d91fa6b](https://github.com/cds-snc/ai-answers/commit/d91fa6bc3ffe5774e8dbfbca339348c2d7e13c07))
* increase maxTokens for Ranker and Azure agents and update model configuration ([ab3e2ec](https://github.com/cds-snc/ai-answers/commit/ab3e2ecabb05e72c65cafc9809ff02e7821543ea))
* normalize Set-Cookie header to apply parent domain for session cookies ([9b9a4b3](https://github.com/cds-snc/ai-answers/commit/9b9a4b31e1c30b23b4bb505da42e7e543b0c8cf7))
* set cookie domain based on parent domain in session middleware ([40572a1](https://github.com/cds-snc/ai-answers/commit/40572a1488e5806f87bca74abf81103898781193))
* set cookie domain based on parent domain in session middleware ([7800df3](https://github.com/cds-snc/ai-answers/commit/7800df31a49c6c706aee33548b7466d859dc4106))
* set default value for workflow selection in ChatOptions ([d12f7a8](https://github.com/cds-snc/ai-answers/commit/d12f7a8b3626da7f21391282aa65c9e17088c156))
* update AI selection handling in ChatOptions to hide provider selection and set default values ([20baecd](https://github.com/cds-snc/ai-answers/commit/20baecdddaa3988a64383225a3b1c5aa7b947809))
* update Set-Cookie header to ensure domain-scoped cookies are correctly set ([2e28235](https://github.com/cds-snc/ai-answers/commit/2e28235781129c4817cf3eeea505030478cb1f9e))

## [1.68.3](https://github.com/cds-snc/ai-answers/compare/v1.68.2...v1.68.3) (2025-12-05)


### Bug Fixes

* enhance chatId handling in session middleware with validation an… ([03f7d36](https://github.com/cds-snc/ai-answers/commit/03f7d3657882de177e8bf7067b302059ce64a106))
* enhance chatId handling in session middleware with validation and error logging ([f5841df](https://github.com/cds-snc/ai-answers/commit/f5841dffaa26806d519ca23c7c08c560899dadb2))
* streamline chatId handling in session middleware with improved logging and removal of redundant checks ([48b217b](https://github.com/cds-snc/ai-answers/commit/48b217ba69667d540e952ab3b4bd26e71e733f95))

## [1.68.2](https://github.com/cds-snc/ai-answers/compare/v1.68.1...v1.68.2) (2025-12-04)


### Bug Fixes

* change conditional ([99c6252](https://github.com/cds-snc/ai-answers/commit/99c6252e9f3bd8adc491f5d981bfee91ef5b4b17))
* remove unnecessary assignment in AnswerService for not-gc answer type ([32fa30c](https://github.com/cds-snc/ai-answers/commit/32fa30cdd36bc74321422b32354bee906641208f))
* remove unnecessary assignment in AnswerService for not-gc answer… ([48804bc](https://github.com/cds-snc/ai-answers/commit/48804bcb0d2efd94b16d371cfc28d031ac2d58b3))

## [1.68.1](https://github.com/cds-snc/ai-answers/compare/v1.68.0...v1.68.1) (2025-12-04)


### Bug Fixes

* malformed xml ([02db661](https://github.com/cds-snc/ai-answers/commit/02db6615fe8442d3baf4c0ac68381dc44405d84d))
* malformed xml ([52f7436](https://github.com/cds-snc/ai-answers/commit/52f7436da91658263e392100ec611403e68abe13))

## [1.68.0](https://github.com/cds-snc/ai-answers/compare/v1.67.0...v1.68.0) (2025-12-04)


### Features

* custom tooltip ([082c702](https://github.com/cds-snc/ai-answers/commit/082c70298d4acb81cee3ef10c6332bbf7ed3dd14))
* custom validity ([015ade0](https://github.com/cds-snc/ai-answers/commit/015ade01dcd95a4e60ae71bda8188ab55e8acdbd))
* fr ([13f85b8](https://github.com/cds-snc/ai-answers/commit/13f85b8c281ebfa2dc8c991216579136976d4142))
* fr for tooltip ([52e8085](https://github.com/cds-snc/ai-answers/commit/52e8085bfd716cb8f742b1de226a89df6a0b4cc4))
* fr meta ([4195dbd](https://github.com/cds-snc/ai-answers/commit/4195dbd60578916991fa8ce984f814688ad7e37a))
* fr meta ([917f7ac](https://github.com/cds-snc/ai-answers/commit/917f7acd492bdce1cfe326f45aa2652f87e9179b))
* javascript message fr ([d134716](https://github.com/cds-snc/ai-answers/commit/d134716a4bb61fcde2f124a444ccd9264380c8e9))
* more missing metadata ([b311a24](https://github.com/cds-snc/ai-answers/commit/b311a24c1a25537d796e81961c70db6f36cb2f0e))
* rmv tooltip - didn't work ([4e1cf42](https://github.com/cds-snc/ai-answers/commit/4e1cf426eb7fc8a2e06151a59e4e9be93c773564))
* safeT ([55cb466](https://github.com/cds-snc/ai-answers/commit/55cb466a44ff55d5a16a01576d1f18c5a54e3300))
* tooltip fr ([97c6f03](https://github.com/cds-snc/ai-answers/commit/97c6f035350cd0a7957d82c6a942262948222585))
* tooltip fr ([f3e0e90](https://github.com/cds-snc/ai-answers/commit/f3e0e9025f103243172cd4d294eb105400d3e1af))
* update lang tag ([4a99ccb](https://github.com/cds-snc/ai-answers/commit/4a99ccb46c9af80033b4b8c0961557f24c764e9f))

## [1.67.0](https://github.com/cds-snc/ai-answers/compare/v1.66.5...v1.67.0) (2025-12-03)


### Features

* debug ([45dfc16](https://github.com/cds-snc/ai-answers/commit/45dfc16bcd6134bd8221c25db23f0d8ec3941044))
* debugger ([6a77510](https://github.com/cds-snc/ai-answers/commit/6a7751040020b357dbf8cc657a7801544d3e5ff4))
* json ([4db1cda](https://github.com/cds-snc/ai-answers/commit/4db1cda77099c8a75916efc625ef0cfa25d109b6))
* referringURL admin ([271ed36](https://github.com/cds-snc/ai-answers/commit/271ed3600f0dc2869d78560c8cad703351775019))
* referringURL admin ([ff1a140](https://github.com/cds-snc/ai-answers/commit/ff1a140c4e2ccbb3912a60957fe5acceca06bf8c))
* rmv debug ([88b1369](https://github.com/cds-snc/ai-answers/commit/88b13691503ace5c072275ecb1e0b302d075cd39))
* rmv space ([54712ee](https://github.com/cds-snc/ai-answers/commit/54712eebe90dc43b6e5e3e0b493f1b718916dff9))
* rmv text ([9d735dc](https://github.com/cds-snc/ai-answers/commit/9d735dcd4c140d915093608a829ab1b6a55b6524))
* styling ([244371b](https://github.com/cds-snc/ai-answers/commit/244371be625ef47e0e4a1ee9e70e162cb25d994b))


### Bug Fixes

* better tagging of not-gc ([b43ed91](https://github.com/cds-snc/ai-answers/commit/b43ed91610b15c83cfba0942d20e39cd03d2cd36))
* better tagging of not-gc ([3bc232d](https://github.com/cds-snc/ai-answers/commit/3bc232d06363ef54189488367ac94ef59568a68a))
* race condition with saving chatid and saving the sesison maxAge ([e5dd982](https://github.com/cds-snc/ai-answers/commit/e5dd9822883f27a06759510b07eaf1cf5575ed58))
* race condition with saving chatid and saving the sesison maxAge ([95734dc](https://github.com/cds-snc/ai-answers/commit/95734dc383c6d16da8db6e584927398c87f75abe))

## [1.66.5](https://github.com/cds-snc/ai-answers/compare/v1.66.4...v1.66.5) (2025-12-02)


### Bug Fixes

* prevent caching for API responses ([1db7d91](https://github.com/cds-snc/ai-answers/commit/1db7d91bedd88da1d7cbf78ae3346c3208deec4c))
* prevent caching for API responses ([e5af838](https://github.com/cds-snc/ai-answers/commit/e5af8381f8420bff6e38d9df79c98dd6380dda49))

## [1.66.4](https://github.com/cds-snc/ai-answers/compare/v1.66.3...v1.66.4) (2025-12-02)


### Bug Fixes

* handle special case for no answer found on Government of Canada websites ([46c50ae](https://github.com/cds-snc/ai-answers/commit/46c50ae9d1d32a3f82b47a8f0ae9412321613669))
* implement retry logic for session reload with exponential backoff ([261fb58](https://github.com/cds-snc/ai-answers/commit/261fb585d32260c2ed6eedd1159ec8c48108d5a7))
* implement retry logic for session reload with exponential backoff ([334fc14](https://github.com/cds-snc/ai-answers/commit/334fc1430decd8b84404fe130b28c0a1e906a720))

## [1.66.3](https://github.com/cds-snc/ai-answers/compare/v1.66.2...v1.66.3) (2025-12-02)


### Bug Fixes

* enhance client referrer handling to exclude same-site referrals ([add568c](https://github.com/cds-snc/ai-answers/commit/add568ce1bea1515e27256c89c86f862e700681b))
* enhance client referrer handling to exclude same-site referrals ([21964c1](https://github.com/cds-snc/ai-answers/commit/21964c138ce421257b5d2d46f9c275f84eae93ed))
* tbs issue ([cf463ee](https://github.com/cds-snc/ai-answers/commit/cf463ee6cfdb104e34339293de8fafd5301b1cad))

## [1.66.2](https://github.com/cds-snc/ai-answers/compare/v1.66.1...v1.66.2) (2025-12-01)


### Bug Fixes

* set index option to false for static file serving ([1c5941e](https://github.com/cds-snc/ai-answers/commit/1c5941e82a42b838438427ac4e862766747a3541))
* set index option to false for static file serving ([0c7ca26](https://github.com/cds-snc/ai-answers/commit/0c7ca266e16165c64ebb38973e3c5e6c18f951eb))

## [1.66.1](https://github.com/cds-snc/ai-answers/compare/v1.66.0...v1.66.1) (2025-12-01)


### Bug Fixes

* add availability endpoint for chat session ([3a0d54c](https://github.com/cds-snc/ai-answers/commit/3a0d54cd5b55989a8827e3dbe58ee063e3d5f281))
* add availability endpoint for chat session ([a1ce313](https://github.com/cds-snc/ai-answers/commit/a1ce313a6fd062c67739d775f5964c3a4534277d))

## [1.66.0](https://github.com/cds-snc/ai-answers/compare/v1.65.2...v1.66.0) (2025-12-01)


### Features

* Add authenticated session TTL setting to session management ([24a83dc](https://github.com/cds-snc/ai-answers/commit/24a83dc70221ba47e0c9bb11491c2d4f59300407))
* Add bot detection middleware to block requests from known bots ([8af0f32](https://github.com/cds-snc/ai-answers/commit/8af0f3270f8c1f3420bb513d5b27275da6352264))
* Add bot fingerprint presence middleware to ensure visitorId in session ([d7ddb6e](https://github.com/cds-snc/ai-answers/commit/d7ddb6e9129a8d0a008e0d64874dda1ac19a11ac))
* add comprehensive authentication, chat graph execution, context search, and various chat utility APIs. ([2955a33](https://github.com/cds-snc/ai-answers/commit/2955a3305925aaa199ae98b71b133bfc2519f6b0))
* Add express-session and connect-mongo for session management ([a8f51a6](https://github.com/cds-snc/ai-answers/commit/a8f51a6bd1c743374cdb55eef5cd440b33d5f293))
* Add general settings section to settings page and localization files ([675cfbd](https://github.com/cds-snc/ai-answers/commit/675cfbd8a97b64044127657f3f4bb92052ebd6b7))
* Add metrics store type options (memory | mongo) to settings and update localization ([2a819c2](https://github.com/cds-snc/ai-answers/commit/2a819c25c1dd157cc013b7dce43da8f094a828c2))
* Add rate limiter middleware for session management ([9a695ae](https://github.com/cds-snc/ai-answers/commit/9a695ae870bc7cb569a682fd786ad6793d7c8c14))
* Add rate limiter snapshot tracking to session and metrics services ([e875ab1](https://github.com/cds-snc/ai-answers/commit/e875ab12fbf4d723a21f016314f432d7d42f10fb))
* Add session cookie max age setting to SettingsPage and localization files ([a7af780](https://github.com/cds-snc/ai-answers/commit/a7af78012837d748cb920f8a97d3dddd5ef28747))
* Add session store type options (memory | mongo) to settings and localization ([ee8079b](https://github.com/cds-snc/ai-answers/commit/ee8079bc0bfc56c29ee7c5ce5caa061a7c4d17b6))
* Allow fingerprinting endpoint to bypass visitorId check for session initialization ([8b1a071](https://github.com/cds-snc/ai-answers/commit/8b1a0715c3580e2f8f3051c1d83ce8df9848b40f))
* Enhance rate limiter middleware with dynamic configuration and reset capabilities ([6bd45a8](https://github.com/cds-snc/ai-answers/commit/6bd45a8e9d438269a2b39a374b76289b26afcae9))
* Enhance rate limiter to use existing mongoose connection and add health check endpoint ([2ab0c0f](https://github.com/cds-snc/ai-answers/commit/2ab0c0f1b511d042e6bc3838047145a1dca56504))
* Enhance session authentication checks to include passport user information ([f815bd6](https://github.com/cds-snc/ai-answers/commit/f815bd6585a8def1786cba17f0631f93de9def69))
* Enhance session middleware with dynamic TTL handling and reset capability ([de421b9](https://github.com/cds-snc/ai-answers/commit/de421b994cfcd5fe5dc66e920a517479fe707d1f))
* Implement bot detection middleware using bot-detector for enhanced bot detection ([d246057](https://github.com/cds-snc/ai-answers/commit/d246057febe613f7782f99b8827dc40db23b0f39))
* implement comprehensive session management with persistence, metrics, and rate limiting for chat and batch operations. ([ef01cdd](https://github.com/cds-snc/ai-answers/commit/ef01cdd53718ff4cc37336b9857bb7bb4e1ec8bc))
* Implement comprehensive user authentication and authorization with login, logout, signup, 2FA, and session-based middleware. ([49acbe3](https://github.com/cds-snc/ai-answers/commit/49acbe3c616f1e6c1aa2e63eca5a0272371d6530))
* Implement core application services, authentication, session ma… ([c2dc71f](https://github.com/cds-snc/ai-answers/commit/c2dc71fe0625900bfed095c4590b867651a1318c))
* Implement session availability check and active session count retrieval ([a9d2273](https://github.com/cds-snc/ai-answers/commit/a9d2273519dc3c755eb24da08d79026e205ee3b5))
* Implement session availability checks and error handling in chat components ([7a4074d](https://github.com/cds-snc/ai-answers/commit/7a4074df91655146c57fdbf1565c148459aa75a7))
* Implement session management middleware with configurable settings and hot-rebuild support ([ef4e84e](https://github.com/cds-snc/ai-answers/commit/ef4e84e5e5d6ce1f9fca998915d8a407c8851fa3))
* Implement user authentication with login, logout, signup, 2FA, and session management. ([1c5807c](https://github.com/cds-snc/ai-answers/commit/1c5807cf8c64e64beb81a37b4c099956b400690c))
* Implement user authentication with signup, login, logout, 2FA, and session management. ([b8a073a](https://github.com/cds-snc/ai-answers/commit/b8a073a7f9d565c50ad16d4e749c5aadee256bfa))
* Implement visitor fingerprinting with FingerprintJS and session integration ([f453700](https://github.com/cds-snc/ai-answers/commit/f45370091e5997f95fa9341725b135ce0c08663a))
* Persist chatId in session and update visitorId assignment in session middleware ([d302ce0](https://github.com/cds-snc/ai-answers/commit/d302ce018a4576c82bd684ef953001ba0daa9844))
* Preserve visitorId across session regeneration in login and 2FA handlers; force reload to signin on logout ([38ae50d](https://github.com/cds-snc/ai-answers/commit/38ae50dd1541826495938a3de0471e98a0d4f7ec))
* Refactor rate limiting settings into a dedicated section in the settings page and update localization files ([3337b48](https://github.com/cds-snc/ai-answers/commit/3337b4826e5dfdaf93b706e8556dd016183f1c78))
* Refactor session management by replacing SessionManagementService with ChatSessionService and ChatSessionMetricsService ([c0c4091](https://github.com/cds-snc/ai-answers/commit/c0c40913e60fc34ec8b9001f694c5b6b3b3bfdc5))
* Remove session cleanup interval settings from the SettingsPage ([1ee1f42](https://github.com/cds-snc/ai-answers/commit/1ee1f4238a870e83c0550e19144e1d0a0df7c73d))
* Simplify chatId handling in session middleware and update rate limiter initialization ([a6fda08](https://github.com/cds-snc/ai-answers/commit/a6fda08b4b86016544df27c9d896ae474c400b54))
* Update authentication check in rate limiter middleware to support user object ([04f9932](https://github.com/cds-snc/ai-answers/commit/04f9932f15202930efd6fb99ed59228ea8b9caff))
* Update default session TTL to 10 minutes and adjust related settings in ChatSessionService ([5790c7c](https://github.com/cds-snc/ai-answers/commit/5790c7c1a19f202da039d892a7b72d99e01474ca))
* Update rate limiter persistence settings and localization for improved clarity ([9fbcba3](https://github.com/cds-snc/ai-answers/commit/9fbcba3fc03c571627f93653350a68465b45b44d))
* Update session availability checks to use session ID for improved accuracy ([7cb1fd7](https://github.com/cds-snc/ai-answers/commit/7cb1fd7126a0612cace09dfdf8a900a1c0cb1150))
* Update session management to dynamically adjust TTL and cleanup interval based on settings ([d4ffee8](https://github.com/cds-snc/ai-answers/commit/d4ffee80b98e369bdcebf16039843c71ca02ea57))


### Bug Fixes

* about ([c06cf61](https://github.com/cds-snc/ai-answers/commit/c06cf61ae0ac9243313cc7f6dd9b65b9550483da))
* Adjust bot fingerprint presence check to allow undefined URLs ([fcc9db4](https://github.com/cds-snc/ai-answers/commit/fcc9db473eb73c9a07f9816f96377f885df385fd))
* Await session save to ensure proper persistence of visitorId ([3310bdc](https://github.com/cds-snc/ai-answers/commit/3310bdce12ecf8b11b45cc5ce62fc3bf703632d6))
* Change send button type to prevent default form submission behavior ([49cabca](https://github.com/cds-snc/ai-answers/commit/49cabca4df616ff7341179298a258cb61af9a93f))
* Clean up formatting and improve session middleware configuration ([275d20d](https://github.com/cds-snc/ai-answers/commit/275d20d6f23770d0a36298dd8bbb30c1a3d6dd87))
* dates issue ([0049c63](https://github.com/cds-snc/ai-answers/commit/0049c63137a9bffd123e4adc456f4c805659d61e))
* dates status banner ([9fc1a5c](https://github.com/cds-snc/ai-answers/commit/9fc1a5c021560b9828a4b1a74314ec5312569f1b))
* Disable secure cookie setting for development environment ([cbc1f4b](https://github.com/cds-snc/ai-answers/commit/cbc1f4b74a7ca03e119503dc1fee9ced089a152e))
* Enable bot detection middleware and initialize rate limiter in session management ([8f6890c](https://github.com/cds-snc/ai-answers/commit/8f6890cc47d94841200f724de09b81beceaff838))
* Enable saveUninitialized option in session middleware and comment out rate limiter initialization ([f530310](https://github.com/cds-snc/ai-answers/commit/f53031037d2ef6ceb3b437b3e2093d4448a56d5d))
* Enhance chatId validation by reloading session if necessary ([a34ccf7](https://github.com/cds-snc/ai-answers/commit/a34ccf7db56522c99b02a62f64729acde6427302))
* Enhance cookie domain handling to prevent issues with preview environments ([9c6bbf1](https://github.com/cds-snc/ai-answers/commit/9c6bbf1287e6786fb9ab3feaa780908ac84e0ffd))
* Enhance getParentDomain function to prevent setting parent domain for known preview/cloud provider hostnames ([1e04c86](https://github.com/cds-snc/ai-answers/commit/1e04c862cd5eebbb28d4beaa2f7765607191ea0f))
* Enhance session middleware to dynamically apply cookie domain and maxAge settings ([aa5a78b](https://github.com/cds-snc/ai-answers/commit/aa5a78b58a3e349ef9e74cbdfc4fea0819e89277))
* Ensure database connection before saving chatId in session middleware ([efa0586](https://github.com/cds-snc/ai-answers/commit/efa0586cc789ac9b7b05af7124db93624a879458))
* Ensure database connection in Lambda environment before saving chat IDs ([9617fe7](https://github.com/cds-snc/ai-answers/commit/9617fe779b216db89509904f82032a7d89efd59f))
* Improve chatId validation by adding session store lookup and refactoring reload logic ([8f26b9e](https://github.com/cds-snc/ai-answers/commit/8f26b9ef6eafd1725d82b31641c81e59f8ed5677))
* Improve error message for session middleware when adding ChatId ([c68a629](https://github.com/cds-snc/ai-answers/commit/c68a6294592dfb6c12284a42afd782a0e49962be))
* Remove base URL handling from session middleware and adjust trust proxy settings ([8d3376c](https://github.com/cds-snc/ai-answers/commit/8d3376c225e0b2293fe5b266dee52beda7965f27))
* Remove base URL state and related handlers from SettingsPage component ([b556dc1](https://github.com/cds-snc/ai-answers/commit/b556dc1ed895274df5d9b3431fe452450dcfd26d))
* Remove heuristic to avoid setting parent domain for known preview/cloud provider hostnames in cookie utility ([f6c152e](https://github.com/cds-snc/ai-answers/commit/f6c152ea293f55f264bcfdab38e36726869edc6b))
* Remove redundant database connection check in session middleware ([a8a6fc6](https://github.com/cds-snc/ai-answers/commit/a8a6fc6af8eb61d2be7c8aa392f5750705962886))
* Remove unnecessary database connection check in session middleware ([4c3fac3](https://github.com/cds-snc/ai-answers/commit/4c3fac3048d211b81a3bf219669b24f08d89be6d))
* Restore bot fingerprint presence check in middleware ([f5a4864](https://github.com/cds-snc/ai-answers/commit/f5a4864da4d20298c7bc0c78605a73bb27c65fdb))
* Scope bot-related middleware to '/api' route ([65c9585](https://github.com/cds-snc/ai-answers/commit/65c95859827ab0aac84b964bc37a32a4a6390796))
* Scope bot-related middleware to '/api' route ([8d07083](https://github.com/cds-snc/ai-answers/commit/8d070835dbb2f3fa684039932d733c0f004829df))
* Trust proxy setting for AWS Lambda environments ([673ae70](https://github.com/cds-snc/ai-answers/commit/673ae70f39dbd1b280ba31b06ed55f9261af671a))
* Update AI provider setting from 'openai' to 'azure' in ChatAppContainer ([ec91ac3](https://github.com/cds-snc/ai-answers/commit/ec91ac3b59ba52310a49cb116b7b47a3be955b9c))
* Update default rate limiter persistence from 'memory' to 'mongo' ([b4fbafb](https://github.com/cds-snc/ai-answers/commit/b4fbafb7cdcc0cc34e2c8d4296873ab197905861))
* Update default session store from 'memory' to 'mongo' in session middleware configuration ([3c9c92c](https://github.com/cds-snc/ai-answers/commit/3c9c92caf09abe23c13ed0408454c678fac78063))
* Update MongoDB session store to use dbConnect for client promise ([3c77a10](https://github.com/cds-snc/ai-answers/commit/3c77a10c57964d570cb78c582f7e5402ec838260))
* Update session middleware to conditionally set cookie domain based on dynamic domain resolution ([329029d](https://github.com/cds-snc/ai-answers/commit/329029d63923eaadb9510b5ad91a5caaacd143cc))
* Update session middleware to dynamically determine secure cookie setting and enhance rate limiter configuration ([7e2d0e9](https://github.com/cds-snc/ai-answers/commit/7e2d0e98ea68c424a675cb49051572bd4298e61c))
* Update session middleware to dynamically set cookie domain and adjust trust proxy settings ([ddf5e55](https://github.com/cds-snc/ai-answers/commit/ddf5e555a76ec51a21d88164df680598d29a9c62))
* Update signin redirection to use full page navigation for better reload handling ([076f6b5](https://github.com/cds-snc/ai-answers/commit/076f6b56989aef10d0b0945bf68eba3c951151f0))


### Code Refactoring

* Clean up imports in session management and authentication files ([00ac381](https://github.com/cds-snc/ai-answers/commit/00ac381ea02350fae5eb2227c90f2ab8fc586fa0))
* remove unused refresh token logic and simplify session handling ([e6ef717](https://github.com/cds-snc/ai-answers/commit/e6ef71701390ed00c4eac6d9785ab0fbf0d8e5a3))
* Update API endpoint paths for authentication and adjust session export in chat session handler ([34c79e9](https://github.com/cds-snc/ai-answers/commit/34c79e96653308630b41612c97de46eef6c4925c))
* Update session middleware to improve TTL handling and authentication logic ([0e99e34](https://github.com/cds-snc/ai-answers/commit/0e99e341df8fd2ea1b6c9340b467215481b0d916))

## [1.65.2](https://github.com/cds-snc/ai-answers/compare/v1.65.1...v1.65.2) (2025-11-28)


### Bug Fixes

* cra-clean up all ([6e5eb2c](https://github.com/cds-snc/ai-answers/commit/6e5eb2ca78bce46abf07680ada9eab279f8fd7c2))
* cra-clean up all ([f96b4da](https://github.com/cds-snc/ai-answers/commit/f96b4da9c8b5a70f428c5a0e9705c0f19af88eda))
* refactor dept list ([0a05328](https://github.com/cds-snc/ai-answers/commit/0a053287262b0cffd48f2c2829f98d086217a14f))
* refactor dept list - Tested - found dept ([9161914](https://github.com/cds-snc/ai-answers/commit/9161914521a4e5239397720132aa9ea97aeee83d))

## [1.65.1](https://github.com/cds-snc/ai-answers/compare/v1.65.0...v1.65.1) (2025-11-27)


### Bug Fixes

* ISC-scenario-guarantor ([c6f25ee](https://github.com/cds-snc/ai-answers/commit/c6f25eea9dfe8b609da849250d1c19ee3058d138))
* more translations and PII ([0efbede](https://github.com/cds-snc/ai-answers/commit/0efbede32d479f587e0f8b40559543ae5087ad6d))
* trial-prompt-issues ([391f712](https://github.com/cds-snc/ai-answers/commit/391f71293a705ff31ee632e6b485eb9a56cdcb94))
* trial-prompt-issues ([b855f17](https://github.com/cds-snc/ai-answers/commit/b855f17bc2ae3422c789b22a9d4b1abba8fa50b9))

## [1.65.0](https://github.com/cds-snc/ai-answers/compare/v1.64.0...v1.65.0) (2025-11-26)


### Features

* force infra change to take new Analytics prod url ([c428a54](https://github.com/cds-snc/ai-answers/commit/c428a54d13cc24ec4cba96e14b4dbadcb3275345))
* force infra change to take new Analytics prod url ([58907f8](https://github.com/cds-snc/ai-answers/commit/58907f8a043d528d2d9c8678b796aab8f5fed4b7))

## [1.64.0](https://github.com/cds-snc/ai-answers/compare/v1.63.0...v1.64.0) (2025-11-25)


### Features

* implement cookie utility functions for secure cookie handling a… ([0a8f31d](https://github.com/cds-snc/ai-answers/commit/0a8f31dedbf33a0f9ab4e74b52fb135f0963b045))
* implement cookie utility functions for secure cookie handling across subdomains ([5420e6b](https://github.com/cds-snc/ai-answers/commit/5420e6b800ee46a3621da482c7c75221e04717f3))


### Bug Fixes

* add early retirement section ([f82c6b3](https://github.com/cds-snc/ai-answers/commit/f82c6b37e4ec4195911ce3953ab7fc087aa48e38))
* add early retirement section ([bcb6968](https://github.com/cds-snc/ai-answers/commit/bcb69689847a7241418196a925cfe6bbdad97471))

## [1.63.0](https://github.com/cds-snc/ai-answers/compare/v1.62.0...v1.63.0) (2025-11-25)


### Features

* Add API endpoints for expert feedback management, public evaluation listings, detailed chat retrieval, and server-side logging, with enhanced authentication. ([272f0d0](https://github.com/cds-snc/ai-answers/commit/272f0d00e28a2d9ce4e174fca7994b170e1646dd))
* add authentication, evaluation, expert feedback APIs, and server infrastructure ([993fae5](https://github.com/cds-snc/ai-answers/commit/993fae59b8704598f5ea2af32cef2b303a272533))
* add batch chatId registration endpoint and integrate with batch processing ([05d206b](https://github.com/cds-snc/ai-answers/commit/05d206b02306e4a4aa3ce54587b850b1af1ba584))
* add batch chatId registration endpoint and integrate with batch… ([32bc3f4](https://github.com/cds-snc/ai-answers/commit/32bc3f43ec2e5f1efefed5317fbbc245e6f7d1d5))
* Add comprehensive authentication, evaluation, and feedback API endpoints and server setup. ([0f27f8c](https://github.com/cds-snc/ai-answers/commit/0f27f8c76cd6722781023c47356e89aa6bae335a))
* add expert feedback API endpoint and UI component for response evaluation. ([38c44b4](https://github.com/cds-snc/ai-answers/commit/38c44b4c9170169b45aa3190b4288f48eca91572))
* add model data localization in English and French ([a6cefde](https://github.com/cds-snc/ai-answers/commit/a6cefde338a24fe7abaecc3a1de1b56b71096a78))
* Add new chat API endpoints for translation, context, language detection, graph execution, messaging, PII, and reporting. ([479ae64](https://github.com/cds-snc/ai-answers/commit/479ae64069ec6405d19af92d25aaec7661eeaca4))
* Add new services, pages, and a chat workflow for session, database, and user management. ([70709be](https://github.com/cds-snc/ai-answers/commit/70709be52fcbf77e5953f43228e6dd33c1297923))
* add rules for refactoring and testing to .gitignore ([b354c93](https://github.com/cds-snc/ai-answers/commit/b354c93edef05bc4350271bcad68fa6bc7e68ecd))
* Add UsersPage component to display and manage user accounts with editable roles and statuses. ([6a067d8](https://github.com/cds-snc/ai-answers/commit/6a067d88ca8d30d203eeba2a2848c1bba142519a))
* add utility to get session bypass headers for authenticated admin users. ([69a55c2](https://github.com/cds-snc/ai-answers/commit/69a55c2c1b380adb6bd19ca29a6a58cb819b4bd5))
* build system prompt server-side and update request handling in API endpoints ([3187811](https://github.com/cds-snc/ai-answers/commit/3187811ad30a136fab975b1747f9e2f3ae9226d2))
* enhance evaluation details and translation support in chat view ([5e23f32](https://github.com/cds-snc/ai-answers/commit/5e23f3277a2b3369f3430acc71fdc48a030f950f))
* Implement advanced session management with rate limiting and capacity, add session middleware, a Users page, and a chat graph run API endpoint. ([f524495](https://github.com/cds-snc/ai-answers/commit/f52449506ed0b48abfde56f46588d80e3968fbcc))
* Implement comprehensive authentication, evaluation, and feedback management systems with new API endpoints and services. ([d56c13e](https://github.com/cds-snc/ai-answers/commit/d56c13e8d719a0d901b712d3b55417bca85e8bc7))
* Implement comprehensive user authentication with JWT, cookie-based sessions, and 2FA verification. ([49409ae](https://github.com/cds-snc/ai-answers/commit/49409ae1ab8cdaf10552a82fb8ff0b707801d7d6))
* Implement core AI chat functionality including answer processing, data persistence, and session management. ([ae33532](https://github.com/cds-snc/ai-answers/commit/ae3353292aa51472f373906ba1472e946277e0c9))
* implement core chat system with session management, graph execution, and interaction persistence APIs. ([7448fa5](https://github.com/cds-snc/ai-answers/commit/7448fa573f3bbd325d4a56903328495ebd100c45))
* Implement expert feedback functionality with new model and component, and add French and English localization. ([0091ab8](https://github.com/cds-snc/ai-answers/commit/0091ab8f7d1d94d18aba31c2842dca075eae300a))
* Implement initial backend server with API routes, middleware, and authentication. ([88b1675](https://github.com/cds-snc/ai-answers/commit/88b1675820e95723d6a675e2b6c712d9c6266dd6))
* Implement new chat system with context handling, message processing, and various API endpoints. ([a21581a](https://github.com/cds-snc/ai-answers/commit/a21581a7cecb4cb79d7759c2df1d30dcac3a7a6d))
* Implement server-side authentication middleware for JWT and client-side role-based route protection components. ([e73863c](https://github.com/cds-snc/ai-answers/commit/e73863ce674ad2adac1ef31b32b9fb234b1b0f6a))
* Implement session management middleware with JWTs, cookies, and bot detection, and create a Users page. ([9ff7f70](https://github.com/cds-snc/ai-answers/commit/9ff7f704981ccd19b6357ab97f8eb00826fd0db4))
* Implement session management, authentication, streaming chat graph API, and a users page. ([17305e6](https://github.com/cds-snc/ai-answers/commit/17305e65c4f4989340130ec5a708ccc839a9e4c3))
* Implement updated authentication system with user roles, 2FA, and new API endpoints for evaluation and feedback management. ([627a296](https://github.com/cds-snc/ai-answers/commit/627a29684715884f2be001479bf4d1ec2045be49))
* introduce core AI answer services, multi-provider API integrations, and administrative pages. ([08f1c55](https://github.com/cds-snc/ai-answers/commit/08f1c558ca4a7039f3caf46df74914ca0f9f035a))
* move context system prompt to agents/prompts and update imports ([34beadf](https://github.com/cds-snc/ai-answers/commit/34beadf258f2d7849771bcb7b8980f67e03c00e6))
* move context system prompt to agents/prompts and update imports ([25eaeb2](https://github.com/cds-snc/ai-answers/commit/25eaeb28bb82de4049d776c93f6e3efdd578f96b))
* Remove deprecated chat-session endpoint and update related documentation ([b33d7ac](https://github.com/cds-snc/ai-answers/commit/b33d7ac7fa3324a77753d51138d268bfa13758bd))
* Replace deprecated chat-session endpoint with chat-session-info and update related references ([fb7c0e4](https://github.com/cds-snc/ai-answers/commit/fb7c0e4e8df746dd7cb23a5e5a7749fc843349b1))
* update context directory resolution and add fallback MongoDB URI for documentation generator ([19a0c1d](https://github.com/cds-snc/ai-answers/commit/19a0c1d5c50ae152f0874cad00946082d49b53f9))
* update file paths to use server-side copies in extract_domains and generate-system-prompt-documentation scripts ([cec6dc6](https://github.com/cds-snc/ai-answers/commit/cec6dc611a6c211de5bf77bdfcf2640d02dd8e11))
* update import paths for scenarios to use new directory structure ([59b7d05](https://github.com/cds-snc/ai-answers/commit/59b7d051370566bdddb6f41e8706d0f2107d5d16))


### Bug Fixes

* docs-shoot-scenarios ([a43c6cd](https://github.com/cds-snc/ai-answers/commit/a43c6cd241ccba20eab18a4c3032b19468d4da4c))
* docs-shoot-scenarios ([694088d](https://github.com/cds-snc/ai-answers/commit/694088da7a1a73b79382271be0a1bc4be33bac69))
* enhance cookie security settings and update localization for set… ([cf75926](https://github.com/cds-snc/ai-answers/commit/cf7592621c0f22eb67aa074708c8c11f536c1483))
* enhance cookie security settings and update localization for settings page ([f7b14b5](https://github.com/cds-snc/ai-answers/commit/f7b14b5db76055de803a14ff172484092fa44f9a))
* Enhance security by managing chatId server-side and updating related handlers ([debf4ca](https://github.com/cds-snc/ai-answers/commit/debf4ca10666c200395c10f294864f219b48043a))
* Enhance session metrics tracking and normalize creditsLeft for session-level visibility ([28cff3e](https://github.com/cds-snc/ai-answers/commit/28cff3e75c6ec18c4a15e5c5fdcf655a22bbbd2b))
* more clean up ([3f2729d](https://github.com/cds-snc/ai-answers/commit/3f2729d8880d99e412b6bf528c52c53129e052f2))
* more updates ([db5191c](https://github.com/cds-snc/ai-answers/commit/db5191cf4263ca4b1d922d82f1fe049fcf10718c))
* more-docs ([3873360](https://github.com/cds-snc/ai-answers/commit/3873360ab30efc7d01a93f7adf18e11df7afe711))
* readme architecture ([2f546e3](https://github.com/cds-snc/ai-answers/commit/2f546e37e96891d3bc629eea99efd0b52d7f86a4))
* Update authentication response and clean up session handling for improved security ([30d93d9](https://github.com/cds-snc/ai-answers/commit/30d93d9cc8d6bf82a24abfa75ffc163153f49aed))
* update context handling to include language in requests and improve system prompt loading ([bfa3858](https://github.com/cds-snc/ai-answers/commit/bfa3858c9856224201e75e7612923928e7caeeb6))
* update system card ([357eee4](https://github.com/cds-snc/ai-answers/commit/357eee4c33439aebdec7aa82b1917ede0b208c39))


### Code Refactoring

* remove unused context agent imports from server.js ([d51c887](https://github.com/cds-snc/ai-answers/commit/d51c887786fff71a10d230e795f887ee13d05f59))
* remove unused context agent imports from server.js ([6c37591](https://github.com/cds-snc/ai-answers/commit/6c37591a503c1d84be09ad1c33a885c16cb930bf))
* Update chat report handler to improve export structure and maintainability ([b7587ec](https://github.com/cds-snc/ai-answers/commit/b7587ec4e9d2b068b9dc9bdcb578529a67a8c82c))

## [1.62.0](https://github.com/cds-snc/ai-answers/compare/v1.61.1...v1.62.0) (2025-11-20)


### Features

* scroll on short messages ([7f8b931](https://github.com/cds-snc/ai-answers/commit/7f8b931107ac23a8a1f01683bb7c9b3d8c803065))

## [1.61.1](https://github.com/cds-snc/ai-answers/compare/v1.61.0...v1.61.1) (2025-11-19)


### Bug Fixes

* cra and follow-up ([235e326](https://github.com/cds-snc/ai-answers/commit/235e326c31dd574f0385b6cc0e2b12704a7afdd6))
* cra cuts ([f0e44ec](https://github.com/cds-snc/ai-answers/commit/f0e44ec14086293e8ab377c50ba1232bfbce9fda))
* fin and cds ([590789b](https://github.com/cds-snc/ai-answers/commit/590789b4f5b11c122ba9f922c97edd1e8e7fc5fc))
* ircc direct deposit ([01b53d5](https://github.com/cds-snc/ai-answers/commit/01b53d5b940f186218f98f69dbecd85516464b0b))

## [1.61.0](https://github.com/cds-snc/ai-answers/compare/v1.60.1...v1.61.0) (2025-11-19)


### Features

* fix conflict ([2e98b4c](https://github.com/cds-snc/ai-answers/commit/2e98b4c61b0c19dfe63234814b12f4d97e0bb170))
* scroll ([574411b](https://github.com/cds-snc/ai-answers/commit/574411b5888f0a555f3cef0de18752df8e0993a6))
* scroll css ([f7af0c4](https://github.com/cds-snc/ai-answers/commit/f7af0c4705eacac367fde58fb5f188594929e7b9))

## [1.60.1](https://github.com/cds-snc/ai-answers/compare/v1.60.0...v1.60.1) (2025-11-18)


### Bug Fixes

* cds repo ([6433604](https://github.com/cds-snc/ai-answers/commit/64336041a2c5675693c728b8967d490f8c426208))
* remove feedback survey links ([0128106](https://github.com/cds-snc/ai-answers/commit/0128106417a664d89188dd830bc637525f02007a))
* remove feedback survey links ([a70fe73](https://github.com/cds-snc/ai-answers/commit/a70fe73f1b0095a195132d213d17035b428dc5e0))

## [1.60.0](https://github.com/cds-snc/ai-answers/compare/v1.59.1...v1.60.0) (2025-11-17)


### Features

* Add Evaluation Dashboard and Admin Navigation Link ([828dbd4](https://github.com/cds-snc/ai-answers/commit/828dbd47d16e4e11a6757ea7b1f63b4e9d22d40f))
* **database:** update import functionality to support multi-collection selection and improved chunk handling ([22227f4](https://github.com/cds-snc/ai-answers/commit/22227f439770ceb2aaf80e66dd2f4c49f8a4740f))
* enhance findSimilarEmbeddingsWithFeedback to record matched interaction and chat IDs ([caa1b77](https://github.com/cds-snc/ai-answers/commit/caa1b77773eb4741789eeb2dc807c52fe56feadd))
* **eval-dashboard:** enhance search functionality and add column filters ([9cb3151](https://github.com/cds-snc/ai-answers/commit/9cb3151e6730d8980d4c3c7f9e23f1283d9099eb))
* **eval-page:** add evaluation metrics summary and refresh functionality ([22227f4](https://github.com/cds-snc/ai-answers/commit/22227f439770ceb2aaf80e66dd2f4c49f8a4740f))
* **evaluation:** enhance evaluation process with detailed stage tracking and metrics ([22227f4](https://github.com/cds-snc/ai-answers/commit/22227f439770ceb2aaf80e66dd2f4c49f8a4740f))
* **integrity-checks:** add API endpoint and UI for database integrit… ([04ff4d4](https://github.com/cds-snc/ai-answers/commit/04ff4d448a89e934bc9fcc0326c50109dd5199bb))
* **integrity-checks:** add API endpoint and UI for database integrity checks ([518d71b](https://github.com/cds-snc/ai-answers/commit/518d71bf91022137332faf789b04deb2aa2b28c8))
* **logging:** improve logging structure and add stage recording for evaluations ([22227f4](https://github.com/cds-snc/ai-answers/commit/22227f439770ceb2aaf80e66dd2f4c49f8a4740f))


### Bug Fixes

* **eval-panel:** display no-match reasons and stage timeline in evaluation results ([22227f4](https://github.com/cds-snc/ai-answers/commit/22227f439770ceb2aaf80e66dd2f4c49f8a4740f))


### Miscellaneous Chores

* **deps:** bump js-yaml from 3.14.1 to 3.14.2 ([47481ad](https://github.com/cds-snc/ai-answers/commit/47481adf25790c37edcb3a0266c0c314fb36d5be))
* **deps:** bump js-yaml from 3.14.1 to 3.14.2 ([739541e](https://github.com/cds-snc/ai-answers/commit/739541e16f922a3bd1b80bee54c314f556d9b5dc))

## [1.59.1](https://github.com/cds-snc/ai-answers/compare/v1.59.0...v1.59.1) (2025-11-16)


### Bug Fixes

* add another paragraph ([824b055](https://github.com/cds-snc/ai-answers/commit/824b0559f6151f84100983021fc1f3cf731e045d))
* more edits ([29558e4](https://github.com/cds-snc/ai-answers/commit/29558e47fcd3a80875a8143f76b0758dcd1432a8))

## [1.59.0](https://github.com/cds-snc/ai-answers/compare/v1.58.9...v1.59.0) (2025-11-13)


### Features

* enhance citation handling and analytics integration in ChatAppC… ([d559250](https://github.com/cds-snc/ai-answers/commit/d55925009bd705d5f494cc4e436d63d7c6ac43a2))
* enhance citation handling and analytics integration in ChatAppContainer ([7f7408f](https://github.com/cds-snc/ai-answers/commit/7f7408fab57cf45acb86f287cb1c84e291d6571f))
* update Adobe Analytics integration to append pageBottom script … ([aca1046](https://github.com/cds-snc/ai-answers/commit/aca1046462f6c55f8d241986688a7ce88ea27039))
* update Adobe Analytics integration to append pageBottom script after load event ([4e264f4](https://github.com/cds-snc/ai-answers/commit/4e264f4585fe31671d9c34a0ca7a26bb07f1f876))
* update Adobe Data Layer tracking for citation clicks with custom structure ([94332fa](https://github.com/cds-snc/ai-answers/commit/94332fa0484506a5c924992d50b87062eb30892d))


### Bug Fixes

* restore Adobe Analytics script in index.html ([f39640b](https://github.com/cds-snc/ai-answers/commit/f39640b7a44e7a8b6a421e0ccee9aa0a63424f87))
* update system prompt for new partners ([49e9bf1](https://github.com/cds-snc/ai-answers/commit/49e9bf134e5273880766ddef36eb47837802d9f6))

## [1.58.9](https://github.com/cds-snc/ai-answers/compare/v1.58.8...v1.58.9) (2025-11-13)


### Code Refactoring

* remove unused isLoadingSiteStatus state from HomePage compo… ([ca408e7](https://github.com/cds-snc/ai-answers/commit/ca408e7459b561cc661589af122804e1505cc2ad))

## [1.58.8](https://github.com/cds-snc/ai-answers/compare/v1.58.7...v1.58.8) (2025-11-12)


### Bug Fixes

* about and isc ([3edc440](https://github.com/cds-snc/ai-answers/commit/3edc440ee04de4fd38525a9b83ba81d9c1411626))
* about and isc ([7275db5](https://github.com/cds-snc/ai-answers/commit/7275db552911f83de658567d1868ddf9e2412622))
* contact section ([f0c1ac2](https://github.com/cds-snc/ai-answers/commit/f0c1ac27918fb73cf42eb9a04dae1d15bb5d3090))
* needed separate sentence ([0c058e5](https://github.com/cds-snc/ai-answers/commit/0c058e5ad18e752c825009144a0c338e4a4b5d42))
* typo ([66f1e8c](https://github.com/cds-snc/ai-answers/commit/66f1e8cb5b418c21f80a768af81eecbb8ba1d65a))

## [1.58.7](https://github.com/cds-snc/ai-answers/compare/v1.58.6...v1.58.7) (2025-11-11)


### Bug Fixes

* add docs about tool usage ([bcae53e](https://github.com/cds-snc/ai-answers/commit/bcae53e3886a102e02349037629e8eaf012aaead))
* scenario tweaks and about link ([d551a28](https://github.com/cds-snc/ai-answers/commit/d551a28f33f9b81aa92be4c304acb6fc19398929))
* scenario tweaks and about link ([6ee2b16](https://github.com/cds-snc/ai-answers/commit/6ee2b161e81e2215184c011dfc6105c557ee941f))
* tighten up spacing ([866906f](https://github.com/cds-snc/ai-answers/commit/866906f5a90b54750da0ede63baca2500c11b1d7))

## [1.58.6](https://github.com/cds-snc/ai-answers/compare/v1.58.5...v1.58.6) (2025-11-08)


### Miscellaneous Chores

* update database connection options for improved performance ([f980ade](https://github.com/cds-snc/ai-answers/commit/f980adebef7a357a63b326038b29e6b8921f2b32))


### Code Refactoring

* add export limit state to DatabasePage for better control over data exports ([ddcebe2](https://github.com/cds-snc/ai-answers/commit/ddcebe22c168f158a039b9bc2ea7d37cc1aae17d))
* simplify table counts retrieval by using mongoose.models instead of hard-coded model list ([f9aa2ce](https://github.com/cds-snc/ai-answers/commit/f9aa2ceee6979449470ca08da2122686f03e0107))

## [1.58.5](https://github.com/cds-snc/ai-answers/compare/v1.58.4...v1.58.5) (2025-11-06)


### Bug Fixes

* isc ([3bed3f6](https://github.com/cds-snc/ai-answers/commit/3bed3f6343f75f8bbff7d5caecf64d4df64f33df))
* isc-scenario ([fad78e8](https://github.com/cds-snc/ai-answers/commit/fad78e812ba02fc72eca50dc7c333318d8536505))

## [1.58.4](https://github.com/cds-snc/ai-answers/compare/v1.58.3...v1.58.4) (2025-11-05)


### Bug Fixes

* about and date ([370ca19](https://github.com/cds-snc/ai-answers/commit/370ca1904ff808272f95ca3790a4ce54e4890142))
* about and date ([32a8242](https://github.com/cds-snc/ai-answers/commit/32a824280ef143e6f445fc523f2c6a275df7afde))
* blocking incorrectly ([133e2cb](https://github.com/cds-snc/ai-answers/commit/133e2cb6336d28a1c5feaa9fc686148571f8983d))
* blocking incorrectly ([b516d2b](https://github.com/cds-snc/ai-answers/commit/b516d2bf6a7837ae32589fbdd48ba52468d2d70e))
* levels ([ded7737](https://github.com/cds-snc/ai-answers/commit/ded7737dd4cc220d83a3b811e5a8607e4e45ea53))
* levels ([63a0219](https://github.com/cds-snc/ai-answers/commit/63a0219cbcbbd4037df398618468b2effdfe1487))
* many tweaks and a typo ([6e8c55d](https://github.com/cds-snc/ai-answers/commit/6e8c55d254499ba57374dacd3533b8b7354afb31))
* many tweaks and a typo ([bf31b45](https://github.com/cds-snc/ai-answers/commit/bf31b45430fb856fe5ba01e2fa2d123c24321dd0))
* typo ([9c1137b](https://github.com/cds-snc/ai-answers/commit/9c1137b35bb6052498c194dbe11473dbbab7f0a3))
* typo paragraph break ([ef52ba5](https://github.com/cds-snc/ai-answers/commit/ef52ba5ab339e3721e7cd75b469a4227c4aa6eff))

## [1.58.3](https://github.com/cds-snc/ai-answers/compare/v1.58.2...v1.58.3) (2025-11-04)


### Bug Fixes

* add budget to scenarios all ([e9b59ac](https://github.com/cds-snc/ai-answers/commit/e9b59ac4a72696f92426e96955a6e126e43021e4))
* change to past tense ([b0e01bd](https://github.com/cds-snc/ai-answers/commit/b0e01bdf60d8dc5cccb72ca34e1113db6a8ac459))

## [1.58.2](https://github.com/cds-snc/ai-answers/compare/v1.58.1...v1.58.2) (2025-11-04)


### Bug Fixes

* context ([62c262a](https://github.com/cds-snc/ai-answers/commit/62c262a0efbfdafa6fb701cb92337254adb6875d))
* context ([c1f9f7a](https://github.com/cds-snc/ai-answers/commit/c1f9f7a1400ebeba9eb46b0e182bb7bb1cc313b2))

## [1.58.1](https://github.com/cds-snc/ai-answers/compare/v1.58.0...v1.58.1) (2025-11-04)


### Bug Fixes

* urls ([02bfc15](https://github.com/cds-snc/ai-answers/commit/02bfc15bc3bed579f00d653c7e92e3a94eed3cac))

## [1.58.0](https://github.com/cds-snc/ai-answers/compare/v1.57.0...v1.58.0) (2025-11-04)


### Features

* make about page ([ae89ec0](https://github.com/cds-snc/ai-answers/commit/ae89ec0cb76df37a75a444dff94d2d0d83d4e442))
* make about page ([f6b6b02](https://github.com/cds-snc/ai-answers/commit/f6b6b0221539650fe20e108f23ea6007a4d3faa8))


### Bug Fixes

* aboutpage ([75dab38](https://github.com/cds-snc/ai-answers/commit/75dab3860b56389e4bbad78900a924885ef5b05a))
* add breadcrumb ([d0f4a8d](https://github.com/cds-snc/ai-answers/commit/d0f4a8d532f0999b8e961cf412291f62bcce5b53))
* budget ([c135d2a](https://github.com/cds-snc/ai-answers/commit/c135d2a66f808c6ca21d89f3e595ec30de397425))
* budget ([4f2ea95](https://github.com/cds-snc/ai-answers/commit/4f2ea95d97eecd4dc11cdcefe8906758535c893e))
* more renovation ([7050e83](https://github.com/cds-snc/ai-answers/commit/7050e8394f2c0b55a06c9fc6324329ed3adda560))

## [1.57.0](https://github.com/cds-snc/ai-answers/compare/v1.56.1...v1.57.0) (2025-11-03)


### Features

* pass englishAnswer to log file ([4750a56](https://github.com/cds-snc/ai-answers/commit/4750a56b050e313f5ed0719d84c9a9d83b307cbc))
* pass englishAnswer to log file ([be5cccd](https://github.com/cds-snc/ai-answers/commit/be5cccd9e2cf309de67b8ad276b89a0e03a77893))


### Bug Fixes

* serve Adobe Analytics URL via runtime config endpoint ([2502e27](https://github.com/cds-snc/ai-answers/commit/2502e27334ac4a7fe8b23ed483b2d8da178a9880))
* serve Adobe Analytics URL via runtime config endpoint ([b6b1b62](https://github.com/cds-snc/ai-answers/commit/b6b1b62f67695b9d6dacf417cb105946a52c14f3))

## [1.56.1](https://github.com/cds-snc/ai-answers/compare/v1.56.0...v1.56.1) (2025-11-03)


### Bug Fixes

* simplify answer formatting logic by removing targetTurnIndex and ensuring correct interaction selection ([56f762a](https://github.com/cds-snc/ai-answers/commit/56f762aa7004775356b5350f00d15f8c18a4bf00))
* simplify answer formatting logic by removing targetTurnIndex and… ([2cc81b1](https://github.com/cds-snc/ai-answers/commit/2cc81b148021137d39ffa4c88ecc18eab0498c55))

## [1.56.0](https://github.com/cds-snc/ai-answers/compare/v1.55.1...v1.56.0) (2025-11-03)


### Features

* add support for instant-match identifiers in chat interactions and responses ([459bc93](https://github.com/cds-snc/ai-answers/commit/459bc93f85f454181bb5158bc0c435dd8d5aafd1))

## [1.55.1](https://github.com/cds-snc/ai-answers/compare/v1.55.0...v1.55.1) (2025-10-31)


### Bug Fixes

* add partners and update all docs to reflect ([b11f282](https://github.com/cds-snc/ai-answers/commit/b11f282bafe198fd4750f405c3eead9efc773077))
* add partners and update all docs to reflect - merge to test in sandbox ([7259e12](https://github.com/cds-snc/ai-answers/commit/7259e12d57463297c0b9037d8c4b6959c94655c8))
* instruct to use download tool ([a223364](https://github.com/cds-snc/ai-answers/commit/a223364068ec9908db053fc777ae31d1961cac49))
* tweak fin scenario ([ae93f75](https://github.com/cds-snc/ai-answers/commit/ae93f7597d84ff067100b51b40dc4f23b1a172c4))

## [1.55.0](https://github.com/cds-snc/ai-answers/compare/v1.54.0...v1.55.0) (2025-10-31)


### Features

* implement password reset functionality with email verification ([3667079](https://github.com/cds-snc/ai-answers/commit/3667079da216b9c70ebec70793775b226c8c94d2))
* implement password reset functionality with email verification ([884852b](https://github.com/cds-snc/ai-answers/commit/884852b51ba564f4158fb41db61b4841e1f1c9e8))


### Bug Fixes

* add account number ([8d99b09](https://github.com/cds-snc/ai-answers/commit/8d99b098bd6147138cf39a8f4f3316b1a2cafc3c))
* add first nation and building name exclusions ([60ff003](https://github.com/cds-snc/ai-answers/commit/60ff003ffc1a0d27cd94274da22b2ad7748ba27c))
* cut again and simplify ([e12f8c3](https://github.com/cds-snc/ai-answers/commit/e12f8c33c869f356b7135a4ac68db56c09611662))
* let verification code go through ([ca6062d](https://github.com/cds-snc/ai-answers/commit/ca6062d438a585194c6db1e28930c844e4474f41))
* PII name elected officials news ([741056c](https://github.com/cds-snc/ai-answers/commit/741056cd68745c779eef874f4886befd8c1b8194))
* simplify PII Agent prompt for MINI ([3d01f5a](https://github.com/cds-snc/ai-answers/commit/3d01f5a70cf04783d1e3fb1b78286bd9cb0aed6c))
* simplify PII Agent prompt for MINI ([9b87890](https://github.com/cds-snc/ai-answers/commit/9b87890c82b065c72559cee513cddcc301ae9c1b))
* test set for redactions ([435719e](https://github.com/cds-snc/ai-answers/commit/435719e80d18a6811ca5b0f5b74d55abb98cbccb))


### Code Refactoring

* remove legacy email OTP fields and cleanup reset artifacts ([703dcc3](https://github.com/cds-snc/ai-answers/commit/703dcc3b8a183707f80b393795e7a74c20df7207))

## [1.54.0](https://github.com/cds-snc/ai-answers/compare/v1.53.0...v1.54.0) (2025-10-29)


### Features

* feedback ([6e922f6](https://github.com/cds-snc/ai-answers/commit/6e922f66f671a1702145f81e99cb52b25b6a16dc))
* feedback ([666bddc](https://github.com/cds-snc/ai-answers/commit/666bddc2b24f543220e5e9e5b9b1db24b9bef913))
* feedback ([2573de1](https://github.com/cds-snc/ai-answers/commit/2573de13ca9afae4eee2bb70fe2f8e9ed426deb9))
* feedback ([e017906](https://github.com/cds-snc/ai-answers/commit/e0179067b545ddfd2382299ab13f3f3ae2f93039))
* feedback ([b12aa24](https://github.com/cds-snc/ai-answers/commit/b12aa24625a1bed00d5b8d2e09ed0fa1e6eca29f))
* feedback ([035cefc](https://github.com/cds-snc/ai-answers/commit/035cefc119a7bc6e4c4c0769d375e07968869bdf))
* feedback ([1270276](https://github.com/cds-snc/ai-answers/commit/12702760a630cb30ba9e8f7f157b6555ea9db9c6))
* feedback ([964717a](https://github.com/cds-snc/ai-answers/commit/964717a45dd876e9481fe87349de9cd6cb371909))
* feedback ([5a179e6](https://github.com/cds-snc/ai-answers/commit/5a179e6c1760e209f341f3959b55825e2392c5f2))
* feedback ([cad1669](https://github.com/cds-snc/ai-answers/commit/cad16695d4321fee707ecd492c1b444b13f7dbc4))
* feedback ([1541cb8](https://github.com/cds-snc/ai-answers/commit/1541cb8f287c444b1ac469c73a6375116c0838aa))
* feedback ([949d56c](https://github.com/cds-snc/ai-answers/commit/949d56ca5062e4ca3c059e656d17cefe889da66a))
* fix missing translation ([5ddc559](https://github.com/cds-snc/ai-answers/commit/5ddc559d52c4fd4eb04ef6a29329cc836d653295))


### Bug Fixes

* feedback section ([2c33783](https://github.com/cds-snc/ai-answers/commit/2c337832f4762a6e9c20534263fefa855c59edf8))

## [1.53.0](https://github.com/cds-snc/ai-answers/compare/v1.52.1...v1.53.0) (2025-10-29)


### Features

* enhance expert feedback integration with totalScore filtering ([9b6bcc4](https://github.com/cds-snc/ai-answers/commit/9b6bcc435a903514de34066caaf0c4412ab69829))


### Bug Fixes

* remove generateContext from tools list ([ba273b1](https://github.com/cds-snc/ai-answers/commit/ba273b1b0a14a3f41def93be9fe3846699c33d7c))
* remove generateContext tool call ([a44dd1d](https://github.com/cds-snc/ai-answers/commit/a44dd1d6751f719d54b9269b50782af1419e052e))


### Miscellaneous Chores

* clean up code structure and improve readability in DefaultWithVector ([303ffbe](https://github.com/cds-snc/ai-answers/commit/303ffbe418f5e7962bb9e583a063fd9997d5b763))
* **deps:** bump playwright from 1.55.0 to 1.56.1 ([bbc8ab2](https://github.com/cds-snc/ai-answers/commit/bbc8ab2308aa37823e7e653fd99b14e33d61c207))


### Code Refactoring

* streamline context derivation logic in DefaultWorkflow ([676fdcc](https://github.com/cds-snc/ai-answers/commit/676fdcc87aa77a259f07b869d9f9d25a3dbe1d95))
* streamline context derivation logic in DefaultWorkflow ([62ed32f](https://github.com/cds-snc/ai-answers/commit/62ed32fe12a8ad43e7aa904eb381385185ffaf4e))

## [1.52.1](https://github.com/cds-snc/ai-answers/compare/v1.52.0...v1.52.1) (2025-10-29)


### Bug Fixes

* calculation errors labels and data table ([d3731b8](https://github.com/cds-snc/ai-answers/commit/d3731b892e80fae5f033ce5d14adac7c48445586))
* metrics dashboard - test in sandbox ([4e1e26c](https://github.com/cds-snc/ai-answers/commit/4e1e26c6f178068eca4026a2054d2c0c61eb2495))

## [1.52.0](https://github.com/cds-snc/ai-answers/compare/v1.51.11...v1.52.0) (2025-10-28)


### Features

* add DefaultAlwaysContext workflow and update related components ([35bbd24](https://github.com/cds-snc/ai-answers/commit/35bbd24c4328e0afea8778877a089724349348fd))
* add DefaultAlwaysContext workflow and update related components ([f83e086](https://github.com/cds-snc/ai-answers/commit/f83e0863c327671c844d8d77736146bddf074543))


### Miscellaneous Chores

* update query rewrite strategy for improved handling of translation data ([3841216](https://github.com/cds-snc/ai-answers/commit/38412165cbcdb2bbe3fa861318e53d9dd6961d49))

## [1.51.11](https://github.com/cds-snc/ai-answers/compare/v1.51.10...v1.51.11) (2025-10-28)


### Bug Fixes

* html decode from answer ([a5cba6d](https://github.com/cds-snc/ai-answers/commit/a5cba6d72e68418ab093b89c483bf8c35cfb9239))
* html decode from answer ([b667984](https://github.com/cds-snc/ai-answers/commit/b667984ebdbda1692bb67abdc322f6f7ef54379c))

## [1.51.10](https://github.com/cds-snc/ai-answers/compare/v1.51.9...v1.51.10) (2025-10-27)


### Code Refactoring

* enhance traceability by including chatId in logging and res… ([1ed0481](https://github.com/cds-snc/ai-answers/commit/1ed04813dbf3de6e22a5bf7d0e021eaf22fbeaac))
* enhance traceability by including chatId in logging and response payloads ([2bd5120](https://github.com/cds-snc/ai-answers/commit/2bd51202317e10ea57beca5342c167889b035dc0))

## [1.51.9](https://github.com/cds-snc/ai-answers/compare/v1.51.8...v1.51.9) (2025-10-27)


### Bug Fixes

* add ISED NRCan ECCC partner departments ([cc9f6cf](https://github.com/cds-snc/ai-answers/commit/cc9f6cf387bb3c675bd6c6b15fc13cbf31a697f9))
* prompts based on trial issues ([f28177f](https://github.com/cds-snc/ai-answers/commit/f28177f9ac9da07b1273ace8b97ca334e99d503a))
* prompts based on trial issues ([2f07e32](https://github.com/cds-snc/ai-answers/commit/2f07e32bea616044e5696e1cf060cf54c4f32647))

## [1.51.8](https://github.com/cds-snc/ai-answers/compare/v1.51.7...v1.51.8) (2025-10-24)


### Bug Fixes

* add page language column to datatable ([8ac3125](https://github.com/cds-snc/ai-answers/commit/8ac3125327fcf8660190764cac3218b70418ce79))
* add page language column to datatable ([58e74b9](https://github.com/cds-snc/ai-answers/commit/58e74b91d792d8644e1a699d7edc58a1c0e7325b))
* try again = get chat from chat model ([ddbbe66](https://github.com/cds-snc/ai-answers/commit/ddbbe660f0479341d5ec18373f97790747e3f297))
* try again = get chat from chat model ([59f625d](https://github.com/cds-snc/ai-answers/commit/59f625dc5563ce7ca72d32c886d0138838f54116))

## [1.51.7](https://github.com/cds-snc/ai-answers/compare/v1.51.6...v1.51.7) (2025-10-24)


### Bug Fixes

* filter for user type wasn't working ([0486965](https://github.com/cds-snc/ai-answers/commit/0486965fef264ed5f631b2e41c34ffbb235ea5ec))
* referring url wasn't displaying ([d9ca8bb](https://github.com/cds-snc/ai-answers/commit/d9ca8bbe865de209b90410b3c510e4ac52cf5ae8))
* update overview and steps ([4ebd1ed](https://github.com/cds-snc/ai-answers/commit/4ebd1ed9b3178c012dea21245a54d1daf085b338))
* view chat in original page language ([7289406](https://github.com/cds-snc/ai-answers/commit/7289406e0e0c504c57ec945c6d4db94d27e34a59))
* view chat in original page language ([e003f8b](https://github.com/cds-snc/ai-answers/commit/e003f8b87f5e5d1abe26b199b5c6f1cdf64aeab1))

## [1.51.6](https://github.com/cds-snc/ai-answers/compare/v1.51.5...v1.51.6) (2025-10-23)


### Bug Fixes

* update script and doc ([afc93d9](https://github.com/cds-snc/ai-answers/commit/afc93d9b094381bc595c6317fba201b4a1a996b5))
* update script and doc ([ef46af4](https://github.com/cds-snc/ai-answers/commit/ef46af4682f940415249c108af9e08bbdc90c044))

## [1.51.5](https://github.com/cds-snc/ai-answers/compare/v1.51.4...v1.51.5) (2025-10-23)


### Bug Fixes

* update to reflect CRA changes ([1db969f](https://github.com/cds-snc/ai-answers/commit/1db969fc68d2eee4f87a3054a8f6c28c50e5dfb4))
* update to reflect CRA changes ([3e8041e](https://github.com/cds-snc/ai-answers/commit/3e8041e3e98ca99048edcbc625602e9418bc1ffa))

## [1.51.4](https://github.com/cds-snc/ai-answers/compare/v1.51.3...v1.51.4) (2025-10-23)


### Bug Fixes

* fallback to creator email removed ([07b59ed](https://github.com/cds-snc/ai-answers/commit/07b59ed23ebaa84e741d35dcbb874b9164d4ab3e))
* remove publicEval replace with filter ([e14a3fa](https://github.com/cds-snc/ai-answers/commit/e14a3fa82e721136ebb71dbff4642dc03e3d5ae3))

## [1.51.3](https://github.com/cds-snc/ai-answers/compare/v1.51.2...v1.51.3) (2025-10-22)


### Bug Fixes

* admin and AA ([be7ecc8](https://github.com/cds-snc/ai-answers/commit/be7ecc861983a912a96da078915aa4fe9f2b0620))

## [1.51.2](https://github.com/cds-snc/ai-answers/compare/v1.51.1...v1.51.2) (2025-10-22)


### Bug Fixes

* add google searches ([3c5a7c9](https://github.com/cds-snc/ai-answers/commit/3c5a7c9f8b6278fa8c031dba3a096e435d66a06b))
* prompt and doc ([5043128](https://github.com/cds-snc/ai-answers/commit/504312898dc3577f5aa4ef2dfcd1ab2a44bfca1f))
* prompt script ([fc7a71d](https://github.com/cds-snc/ai-answers/commit/fc7a71dda9a8d2ef567fb25b76e524c1bdb0abfa))

## [1.51.1](https://github.com/cds-snc/ai-answers/compare/v1.51.0...v1.51.1) (2025-10-21)


### Bug Fixes

* add-tbs ([b5cfe9b](https://github.com/cds-snc/ai-answers/commit/b5cfe9b938e660ffdef991bdee3871549e56ae50))
* sin ([4b78501](https://github.com/cds-snc/ai-answers/commit/4b785012ca17f1532a96ed67c0b382074b36fc32))
* update docs ([41b995d](https://github.com/cds-snc/ai-answers/commit/41b995d0a516b6f856f1b8225791d614532b3371))

## [1.51.0](https://github.com/cds-snc/ai-answers/compare/v1.50.0...v1.51.0) (2025-10-21)


### Features

* system-prompt-docs ([00be0fa](https://github.com/cds-snc/ai-answers/commit/00be0fad74379b47d98f14765ea22fd5057f85bd))


### Bug Fixes

* add more prompt bits ([50735f2](https://github.com/cds-snc/ai-answers/commit/50735f2448f04ac4f140efdb8d987e15f590913f))
* add more prompt bits ([0a36852](https://github.com/cds-snc/ai-answers/commit/0a368529179145990e0a5f1e696f0ad3b438c077))
* remove-dept0-list ([40de650](https://github.com/cds-snc/ai-answers/commit/40de650aa4e3f246c68552327c177a6900e2283e))

## [1.50.0](https://github.com/cds-snc/ai-answers/compare/v1.49.0...v1.50.0) (2025-10-20)


### Features

* add dummy variable to trigger CI workflow ([baba397](https://github.com/cds-snc/ai-answers/commit/baba397957394c9738a6318c54b92fbdac80ec8b))
* add dummy variable to trigger CI workflow ([a241bdb](https://github.com/cds-snc/ai-answers/commit/a241bdbc6608fc8ee2eff6b793e29a0a4d61f11d))
* add support for translation_context in translation requests ([724285a](https://github.com/cds-snc/ai-answers/commit/724285a71fe3f4210bc64eefc6aa86284a67c4f2))
* enhance interaction retrieval to include expert feedback and never stale logic ([2dbe083](https://github.com/cds-snc/ai-answers/commit/2dbe083035f14c147367d90e0616c0ea42224bee))
* enhance translation functionality with context support ([1302656](https://github.com/cds-snc/ai-answers/commit/1302656b1590fbddfabe5b3baa4ca82f30783895))
* implement default workflow settings and update local storage ha… ([ddce375](https://github.com/cds-snc/ai-answers/commit/ddce3759918cd5216e65e1b1c69ae84e38eac9a5))
* implement default workflow settings and update local storage handling ([ba0a9d0](https://github.com/cds-snc/ai-answers/commit/ba0a9d0503f30a01b74879aea630a928ba194189))
* implement feedback expert never stale functionality with API integration and UI toggle ([7e470fc](https://github.com/cds-snc/ai-answers/commit/7e470fc759870b741d6d2f12466cd262b4b8af56))
* integrate translation context and add request context management ([65312c6](https://github.com/cds-snc/ai-answers/commit/65312c69c19dd543d28a64b0f77ff011dfb93e16))


### Bug Fixes

* cra-scenario ([99dc3ba](https://github.com/cds-snc/ai-answers/commit/99dc3baf9d06bd05d2677d18fea713d2a313b2f4))
* en version of legal advice ([d88bbc7](https://github.com/cds-snc/ai-answers/commit/d88bbc7fa598f836d82da131ffdd63b25bfe5aa4))
* extra period ([30f89b7](https://github.com/cds-snc/ai-answers/commit/30f89b75c54278fa8d9402eaba0cabfc2fe9b025))
* json labels ([5c03ad8](https://github.com/cds-snc/ai-answers/commit/5c03ad86e318ed81b166b92487e0d1c55086f086))
* json labels ([61a2d3c](https://github.com/cds-snc/ai-answers/commit/61a2d3c4858a1cc99e435ac7b0937c2b8f905754))
* legal advice ([afccce1](https://github.com/cds-snc/ai-answers/commit/afccce1f7c6500c1821f53341e74d4bd0a7c09d3))
* missed one ([ce33a8f](https://github.com/cds-snc/ai-answers/commit/ce33a8f62a99ed898b494971d6039a96c96fd646))
* not-gc ([c8656bb](https://github.com/cds-snc/ai-answers/commit/c8656bb69c700f132613633cc0dea0a0474cff20))
* prevent session reporting for unauthorized users ([a59b5b7](https://github.com/cds-snc/ai-answers/commit/a59b5b7cd2ad36196b205dd635d265e2f24c11ec))
* referring-confusion ([26bb20f](https://github.com/cds-snc/ai-answers/commit/26bb20fd5f415819457a69d76e5b31f1e8eda3ad))
* remove unsupported department check from handler ([1c9d58b](https://github.com/cds-snc/ai-answers/commit/1c9d58b1e81b16414394e04f4280ed3e26c9738c))
* search-prompt ([1768281](https://github.com/cds-snc/ai-answers/commit/1768281c5a84d284babe47d228d12645b9ebef1b))

## [1.49.0](https://github.com/cds-snc/ai-answers/compare/v1.48.2...v1.49.0) (2025-10-16)


### Features

* add-chatID-search to data table ([0c26ca0](https://github.com/cds-snc/ai-answers/commit/0c26ca08afe34a2076992c997452585cfda6e018))
* add-chatID-search to data table ([9d4c39d](https://github.com/cds-snc/ai-answers/commit/9d4c39d95c02560b2eda1ebcd1a5d30171dc0cde))


### Bug Fixes

* add to locales files ([add106d](https://github.com/cds-snc/ai-answers/commit/add106da159398354f42bc992228330eb613e2f4))

## [1.48.2](https://github.com/cds-snc/ai-answers/compare/v1.48.1...v1.48.2) (2025-10-16)


### Bug Fixes

* consistent french terminology ([7338c98](https://github.com/cds-snc/ai-answers/commit/7338c9863da1706905aa02a828add1b374b0d981))
* eval vs feedback ([ed6536c](https://github.com/cds-snc/ai-answers/commit/ed6536c4ad4f540835e12587fa64275cb48a97dd))
* hc scenario ([5ecf8af](https://github.com/cds-snc/ai-answers/commit/5ecf8af9d5e98635c3b1efb9c524ee2f15a16f62))
* try to fix health provincial issue ([8b33ce1](https://github.com/cds-snc/ai-answers/commit/8b33ce168228512ec28508581efab487dda317cd))

## [1.48.1](https://github.com/cds-snc/ai-answers/compare/v1.48.0...v1.48.1) (2025-10-16)


### Bug Fixes

* prompt and locales ([4ee5572](https://github.com/cds-snc/ai-answers/commit/4ee557217aa108e280af55bff16cde323a304bc1))
* prompt and locales ([2e1b260](https://github.com/cds-snc/ai-answers/commit/2e1b26023e960861bf71eb139cc2ce39fffd5390))

## [1.48.0](https://github.com/cds-snc/ai-answers/compare/v1.47.0...v1.48.0) (2025-10-15)


### Features

* Split SSM parameter fetching into two batches to handle AWS limits ([fff56e3](https://github.com/cds-snc/ai-answers/commit/fff56e3f051cf484adc86c2b9283501a0ede81d8))
* Split SSM parameter fetching into two batches to handle AWS limits ([bfc8b9c](https://github.com/cds-snc/ai-answers/commit/bfc8b9c0353e38bcf823976966566f489a115755))


### Bug Fixes

* hybrid-work section ([7a1ca2c](https://github.com/cds-snc/ai-answers/commit/7a1ca2cd1f76b7f1ed6aaf4aa3530cf0dfa866be))
* locale-fixes ([b2821fa](https://github.com/cds-snc/ai-answers/commit/b2821fa93064f001828fa6d27fb9a142fd9c19e4))
* locale-fixes ([f84487c](https://github.com/cds-snc/ai-answers/commit/f84487c0bfd547c13b0b0ca0bb85617bb217ab95))
* move all into new step 2 ([e6d0571](https://github.com/cds-snc/ai-answers/commit/e6d0571a1f041d3a1c03e0bfcfdb5e2d7dbf4595))
* move temporary changes into section ([4d19c57](https://github.com/cds-snc/ai-answers/commit/4d19c57553c28decf9fe3aa445c1f50f857d6119))
* move-clarifying-question-check ([dc1f53c](https://github.com/cds-snc/ai-answers/commit/dc1f53c3a7dafd4defc5c792960916a7cb2e736e))
* step numbers ([fbccd1a](https://github.com/cds-snc/ai-answers/commit/fbccd1ae6940a2ab2d9ab128884866477931e92b))

## [1.47.0](https://github.com/cds-snc/ai-answers/compare/v1.46.1...v1.47.0) (2025-10-14)


### Features

* Add GC Notify API key support across Lambda functions and Terraform configurations ([6a84885](https://github.com/cds-snc/ai-answers/commit/6a848859d137c53575bcffd9cbb95a68e3bd46c8))
* Add two-step verification support in login flow ([1106529](https://github.com/cds-snc/ai-answers/commit/110652988a7c589d344c84d6b5534ec68c630a0b))
* Disable two-factor authentication by default in settings ([9dfb58c](https://github.com/cds-snc/ai-answers/commit/9dfb58c6f2c6af21f36d259454e5bd83a04dd92f))
* Disable two-factor authentication by default in settings ([05ff867](https://github.com/cds-snc/ai-answers/commit/05ff8672242c708ffe69396fb475b8f64b938a04))
* Implement two-factor authentication settings and logic across authentication flows ([ecc1ae3](https://github.com/cds-snc/ai-answers/commit/ecc1ae3a9bbc26c62b7bf9d74f0ca9a928947088))
* Refactor PR review workflow to include Terraform apply step and environment variables ([198eb67](https://github.com/cds-snc/ai-answers/commit/198eb6784b95f343738da0889945d4f6aa53c966))
* Remove Terraform apply step from PR review workflow ([be12769](https://github.com/cds-snc/ai-answers/commit/be12769adbbcb5854800df48886a18f031729c0b))
* Remove Terraform apply step from PR review workflow ([2b85a47](https://github.com/cds-snc/ai-answers/commit/2b85a475405006538305582ea6147c17bfd73d60))

## [1.46.1](https://github.com/cds-snc/ai-answers/compare/v1.46.0...v1.46.1) (2025-10-09)


### Bug Fixes

* add check in step 3 ([1a092c7](https://github.com/cds-snc/ai-answers/commit/1a092c7ed65751d0d476c89029fea2ee07e44d95))
* prompt-clarifying-question-section ([b20e46d](https://github.com/cds-snc/ai-answers/commit/b20e46daf3eef971ae2a014d77a00f1e4d158fcf))
* remove fr words ([bdac1d7](https://github.com/cds-snc/ai-answers/commit/bdac1d7a6a7b749923041bc226a5a59289980fce))
* remove fr words ([8827735](https://github.com/cds-snc/ai-answers/commit/8827735aace5d6db32e1cb0f1df340e56c212331))

## [1.46.0](https://github.com/cds-snc/ai-answers/compare/v1.45.0...v1.46.0) (2025-10-08)


### Features

* Add overrideUserId parameter to workflows and update related functions; create scenario override test steps ([81f3362](https://github.com/cds-snc/ai-answers/commit/81f336239c3a12a51ec36167670cca529d03e1b0))
* Add overrideUserId support across workflows and services for scenario overrides ([d134923](https://github.com/cds-snc/ai-answers/commit/d1349237402e4493368095e3ac541d4b43be2404))
* Add scenario override handler and integrate with server routes ([ed78409](https://github.com/cds-snc/ai-answers/commit/ed78409a02f74a8edd683057e0a375741076c4ae))
* Add scenario overrides navigation link in AdminPage and update locale files ([16b696d](https://github.com/cds-snc/ai-answers/commit/16b696d672e3d17a315e703ad249ab6020a59690))
* Add ScenarioOverridesPage and integrate routing for scenario overrides ([211dc0c](https://github.com/cds-snc/ai-answers/commit/211dc0cc70ef6fd7c4fcd6e89eeb930c96d15df4))
* Enhance loadSystemPrompt to support scenario overrides and improve logging ([e39be5c](https://github.com/cds-snc/ai-answers/commit/e39be5cb48bd7662baa988080f8f4d4e94400a41))
* Implement ScenarioOverride model and service with caching and CRUD operations ([54943c6](https://github.com/cds-snc/ai-answers/commit/54943c6058e682f6e9aef52971594611cf6f637a))
* Implement session bypass functionality with admin role check and integrate into services ([647a4f2](https://github.com/cds-snc/ai-answers/commit/647a4f2c60c959f9e8b97dfd713f6d47bf50a408))
* Integrate AuthService for user ID retrieval and enhance message preparation with scenario overrides ([c0905a1](https://github.com/cds-snc/ai-answers/commit/c0905a1298f7573a81f0058eb51c3c6c71437722))
* Refactor ScenarioOverrideClient to ScenarioOverrideService and update related imports and usages ([9267edd](https://github.com/cds-snc/ai-answers/commit/9267edd0369058cb861dd44077c50db1fa884c03))
* Update version to 1.0.0 and add 'diff' dependency; remove setupProxy.js ([8263a9f](https://github.com/cds-snc/ai-answers/commit/8263a9ff74547cd9a1ed2be07af94748adf3d0bb))


### Bug Fixes

* edit-locales ([558680f](https://github.com/cds-snc/ai-answers/commit/558680f22469404fbf837edeb22b8455cb48b1ac))
* remove kill ([f5498f4](https://github.com/cds-snc/ai-answers/commit/f5498f409b48e0cd595250301f48b734099661f2))
* remove murdered ([3f51141](https://github.com/cds-snc/ai-answers/commit/3f5114197db87a0e9b1c24f14e6e207caa85961e))
* remove-shot-from-threatwords ([a88f873](https://github.com/cds-snc/ai-answers/commit/a88f873093f044904ba308dd92e3a4c07e875d1b))
* remove-shot-from-threatwords ([54ab53c](https://github.com/cds-snc/ai-answers/commit/54ab53cc296526d5681bf224ce5309ae96ef4894))

## [1.45.0](https://github.com/cds-snc/ai-answers/compare/v1.44.0...v1.45.0) (2025-10-06)


### Features

* Add domain extraction and filtering script for programmable search ([9dc224e](https://github.com/cds-snc/ai-answers/commit/9dc224eed44a9789594bccf1f5bdcf70a9c8cda0))
* Set default language based on hostname prefix for improved localization ([5827cfb](https://github.com/cds-snc/ai-answers/commit/5827cfbce525ce8f1508fabe232ba39cb423a1dd))


### Miscellaneous Chores

* Update logs schema for improved logging structure and performance ([d58a9bd](https://github.com/cds-snc/ai-answers/commit/d58a9bdc684789c3d1b07f77a5ce3fb3dd129816))
* Update logs schema for improved logging structure and performance ([a34d7ec](https://github.com/cds-snc/ai-answers/commit/a34d7ecd4d28b9389b76b91d411c846f27dd3969))

## [1.44.0](https://github.com/cds-snc/ai-answers/compare/v1.43.0...v1.44.0) (2025-10-02)


### Features

* Enhance session management by integrating fingerprintKey for session registration and reuse, improving session tracking and security ([6db62e6](https://github.com/cds-snc/ai-answers/commit/6db62e6b65874b9b99410de7a28fbcd5303ee7d3))
* Enhance session management to associate multiple chatIds with e… ([ad90896](https://github.com/cds-snc/ai-answers/commit/ad90896553446fbcee3525bfe67f7d98f66e1ccf))
* Enhance session management to associate multiple chatIds with existing sessions for improved tracking ([863da95](https://github.com/cds-snc/ai-answers/commit/863da95934b7697f0c16f6a664b1c2840a378d7b))

## [1.43.0](https://github.com/cds-snc/ai-answers/compare/v1.42.0...v1.43.0) (2025-09-29)


### Features

* Add new debug configuration for simultaneous server and Chrome debugging ([0558ed5](https://github.com/cds-snc/ai-answers/commit/0558ed571fb9779673289569d633bb5921e03918))
* Add session settings management with configurable TTL, cleanup interval, rate limits, and max active sessions ([e12b0e7](https://github.com/cds-snc/ai-answers/commit/e12b0e721fc7afa97267255dfa6dad1b28331bf5))
* Enhance session management by adding chatId to session registration and improving session retrieval logic ([31a2f8b](https://github.com/cds-snc/ai-answers/commit/31a2f8b4f005f8a4700ccb2f2a6ee8ceb3e5d1db))
* Enhance session reporting with error type tracking and add session metrics service ([34c9f20](https://github.com/cds-snc/ai-answers/commit/34c9f2064dc2f326acdf5f878b2b0079a837e759))
* Implement chat session availability endpoint and integrate with SessionService for site and session status checks ([1a5537c](https://github.com/cds-snc/ai-answers/commit/1a5537c5c26797dbf85ce030ddd467c8004d3c3a))
* Implement deterministic browser fingerprint utility with caching and async computation ([3c102e1](https://github.com/cds-snc/ai-answers/commit/3c102e1a278385adddefa66fef18440fad020e61))
* Implement in-memory session management with credit-based rate limiting and session tracking ([69afadf](https://github.com/cds-snc/ai-answers/commit/69afadfd4fa7421235ad19717d2cdb26e2fbf198))
* Implement proxy middleware for API requests to backend server ([0558ed5](https://github.com/cds-snc/ai-answers/commit/0558ed571fb9779673289569d633bb5921e03918))
* Integrate session handling into API endpoints with session middleware ([94d6517](https://github.com/cds-snc/ai-answers/commit/94d6517dddcf7b2ca9e6424192442ff312f97688))
* Support multiple chatIds per session in SessionManagementService and update fingerprint utility for enhanced uniqueness ([318c45e](https://github.com/cds-snc/ai-answers/commit/318c45e6d9293827060ac07eb32961204886988d))
* Update localization strings for improved clarity and consistency ([a66694d](https://github.com/cds-snc/ai-answers/commit/a66694d924a3963ec85ff98450a29fb1fdf380d4))
* Update session management to use credits instead of tokens and enhance localization for rate limits ([0116f2a](https://github.com/cds-snc/ai-answers/commit/0116f2ab15a9ae122211e373976560ae5753f1f2))


### Styles

* Improve code formatting and consistency in SessionManagementService ([7632f60](https://github.com/cds-snc/ai-answers/commit/7632f6097c3aa90d0e5fec41d9e50a94d9c350cb))


### Miscellaneous Chores

* Update localization files for improved clarity and consistency ([fd2dcda](https://github.com/cds-snc/ai-answers/commit/fd2dcda5934318dd88d63e48c847d1fc9edeadb1))


### Code Refactoring

* Simplify API URL handling to support development proxy ([0558ed5](https://github.com/cds-snc/ai-answers/commit/0558ed571fb9779673289569d633bb5921e03918))
* Simplify session management initialization by removing settings caching and loading defaults directly ([339fac6](https://github.com/cds-snc/ai-answers/commit/339fac6c02736bcb9f0bc38dfc11bdeb2e0aafc9))

## [1.42.0](https://github.com/cds-snc/ai-answers/compare/v1.41.0...v1.42.0) (2025-09-25)


### Features

* Add filter handling functionality in ChatDashboardPage ([a897c1f](https://github.com/cds-snc/ai-answers/commit/a897c1fa8782fb1b1029e006e2db9a261c2db02f))
* Add filter handling functionality in ChatDashboardPage ([241b9a2](https://github.com/cds-snc/ai-answers/commit/241b9a2f8e42e1b57107ddca0c9a73925fc9ee47))
* Enhance chat dashboard with pagination support, creator email d… ([e6ba590](https://github.com/cds-snc/ai-answers/commit/e6ba5908d9ae2fa1cfbf7cae1c4d163d5a586cc7))
* Enhance chat dashboard with pagination support, creator email display, and localization updates ([2793a86](https://github.com/cds-snc/ai-answers/commit/2793a8669f6629a0cdead08f83e820398bc72fae))
* Implement local storage management for table state in ChatDashboardPage ([e014d50](https://github.com/cds-snc/ai-answers/commit/e014d50cf1735a0b277c5fb491724a4ec7ebca03))

## [1.41.0](https://github.com/cds-snc/ai-answers/compare/v1.40.0...v1.41.0) (2025-09-23)


### Features

* Enhance chat dashboard with expert email integration and localization updates ([b7eaf14](https://github.com/cds-snc/ai-answers/commit/b7eaf14cf0616d638b8961b9dffe1be857848729))
* Update logging functionality in ChatViewer with refresh state management and localization improvements ([b24688a](https://github.com/cds-snc/ai-answers/commit/b24688ab9919b7cbe22d0538260af81a50e77e5e))


### Miscellaneous Chores

* Review and update test instructions for ask-a-question feature ([332ccce](https://github.com/cds-snc/ai-answers/commit/332ccce919166cfed502365feb3176a241a11d5d))

## [1.40.0](https://github.com/cds-snc/ai-answers/compare/v1.39.0...v1.40.0) (2025-09-22)


### Features

* Implement chat session handler with JWT token generation and se… ([f0b252c](https://github.com/cds-snc/ai-answers/commit/f0b252cd9ff1ba2d1f22a0acc0e81116ab83aac1))

## [1.39.0](https://github.com/cds-snc/ai-answers/compare/v1.38.0...v1.39.0) (2025-09-22)


### Features

* Add context, PII checking, short query validation, and translation services ([403a8d6](https://github.com/cds-snc/ai-answers/commit/403a8d66697faa86c7c78a24661a2f78929dd42d))
* Add support for DefaultWithVectorGraph workflow in ChatOptions and ChatWorkflowService ([4baa7d5](https://github.com/cds-snc/ai-answers/commit/4baa7d538fc315c24cf4f67b60b7936c8386cbee))
* Implement DefaultWithVectorGraph and related services for enhanced chat workflows ([23fcebd](https://github.com/cds-snc/ai-answers/commit/23fcebda755829ad41fecf025c571c9c9e374b45))
* Implement RedactionService with profanity, threat, and manipulation pattern handling ([eff2a06](https://github.com/cds-snc/ai-answers/commit/eff2a060b6258cee3266ab5b2fca34a2e344a367))

## [1.38.0](https://github.com/cds-snc/ai-answers/compare/v1.37.4...v1.38.0) (2025-09-22)


### Features

* Implement fallback comparison check for interaction evaluations ([6dd5a3f](https://github.com/cds-snc/ai-answers/commit/6dd5a3f680565d1e00b28c9f47605eb63b2af9bc))
* Implement localStorage persistence for filter panel state ([f1999de](https://github.com/cds-snc/ai-answers/commit/f1999deec02bae9e25bedcba5aa12c7d185688d3))


### Bug Fixes

* Correct indentation in loadSettings function and ensure proper loading of provider and logChats settings ([89a6d50](https://github.com/cds-snc/ai-answers/commit/89a6d50e6eadf4ba6e94039cc93c80c84403f69e))
* Ensure EvalPanel displays correctly in review mode ([bc0cb7f](https://github.com/cds-snc/ai-answers/commit/bc0cb7f1df81e26e74b1409ff063f7be01759186))
* Handle missing interactionId and chatId errors in eval-run handler ([7ac868f](https://github.com/cds-snc/ai-answers/commit/7ac868f8bf44c39d788d29dcc96cb3f26bbceca7))


### Code Refactoring

* Remove unused props from EvalPanel, ExpertFeedbackPanel, and PublicFeedbackPanel components ([3a860f6](https://github.com/cds-snc/ai-answers/commit/3a860f6ba78a75620abbe002c43471cfed6de6b6))

## [1.37.4](https://github.com/cds-snc/ai-answers/compare/v1.37.3...v1.37.4) (2025-09-18)


### Bug Fixes

* more-deletions ([c92da91](https://github.com/cds-snc/ai-answers/commit/c92da911e04aa8d3b0ac98f7a61e253762ff1222))
* more-deletions ([c395ae8](https://github.com/cds-snc/ai-answers/commit/c395ae8cc32245fc94f5c335069a9bc41b40abf1))
* news-add-readme ([cfe7dfe](https://github.com/cds-snc/ai-answers/commit/cfe7dfe6f7d91776d8fb149d9697a49f7f239fc1))
* news-add-readme ([9673936](https://github.com/cds-snc/ai-answers/commit/967393662ca33c5b6e7c86f90dbe4591646c4034))
* typos etc ([8df9888](https://github.com/cds-snc/ai-answers/commit/8df9888feecf0210e881a752f62f9beb1f9124d8))

## [1.37.3](https://github.com/cds-snc/ai-answers/compare/v1.37.2...v1.37.3) (2025-09-17)


### Bug Fixes

* providing citation based on question language ([fd512ed](https://github.com/cds-snc/ai-answers/commit/fd512ed4d03b4b7244bb9901532254f1006c3747))
* providing citation based on question language ([bc30223](https://github.com/cds-snc/ai-answers/commit/bc302239c530cdd718c7323102d0c7ef92b01230))

## [1.37.2](https://github.com/cds-snc/ai-answers/compare/v1.37.1...v1.37.2) (2025-09-17)


### Bug Fixes

* prevent-redaction-of-number mentions ([9bad210](https://github.com/cds-snc/ai-answers/commit/9bad210cf8e0c6ce86fc84387a6ea7edb6271e4f))
* prevent-redaction-of-number mentions ([4c341d3](https://github.com/cds-snc/ai-answers/commit/4c341d310ea8b0c0d2a74bdcfcc5b0a366e73340))


### Code Refactoring

* enhance batch processing statistics handling and logging ([c7c0cca](https://github.com/cds-snc/ai-answers/commit/c7c0ccac20d9f30e04d6114ad5b5cc6dcde5e7e9))
* enhance batch processing statistics handling and logging ([6a97ee2](https://github.com/cds-snc/ai-answers/commit/6a97ee2cf0cb98f863694bfeaab68679cc06e335))

## [1.37.1](https://github.com/cds-snc/ai-answers/compare/v1.37.0...v1.37.1) (2025-09-17)


### Code Refactoring

* remove async/await from feedback handling for improved perf… ([132a878](https://github.com/cds-snc/ai-answers/commit/132a878b2cdaeafcb244f12399b9f5e3ee09e817))
* remove async/await from feedback handling for improved performance ([29e734e](https://github.com/cds-snc/ai-answers/commit/29e734e7a0401a76dc1a9ed0771b902e3622c22b))

## [1.37.0](https://github.com/cds-snc/ai-answers/compare/v1.36.0...v1.37.0) (2025-09-15)


### Features

* add debug logging for language path computation and host prefix detection ([4a34188](https://github.com/cds-snc/ai-answers/commit/4a34188f3caa6b332942fd31bcb20c1af2b24e4f))
* add debug logging for language path computation and host prefix… ([e08367d](https://github.com/cds-snc/ai-answers/commit/e08367d224a5345c26bff99dc423945b128041ab))
* add provider options for OpenAI and Azure in settings ([dcf9c71](https://github.com/cds-snc/ai-answers/commit/dcf9c71f25c5a87c621d8d4ac6aed22fa041e3ee))
* add review mode handling to EvalPanel for improved functionality ([983e791](https://github.com/cds-snc/ai-answers/commit/983e79164867baa6f04b2907d0343d730c05d73f))
* enhance feedback panels and localization for improved user experience ([0a08f55](https://github.com/cds-snc/ai-answers/commit/0a08f55be2f6a3a914b8a0d7d299c8c40b540459))
* enhance language path handling and computation for alternate la… ([1af7bdf](https://github.com/cds-snc/ai-answers/commit/1af7bdfb94a2bb86e877117e67a451c9858306af))
* enhance language path handling and computation for alternate language href ([e39e61c](https://github.com/cds-snc/ai-answers/commit/e39e61c62da43dc44891915ddf6c8d0f188e68dc))
* implement expert feedback deletion functionality ([132a154](https://github.com/cds-snc/ai-answers/commit/132a1540abe0dfbb14fec1790a9e1b7c5f7bac6e))
* replace button with GcdsButton for improved UI consistency ([705203b](https://github.com/cds-snc/ai-answers/commit/705203b2d17ee9205a90d9844f65c37bcefda15e))


### Bug Fixes

* news-interac-service-name ([e30c6bb](https://github.com/cds-snc/ai-answers/commit/e30c6bbfa0026f98b538bcf75d97316b400fd366))
* news-interac-service-name ([fbabaf8](https://github.com/cds-snc/ai-answers/commit/fbabaf819dfaf67e4f211739810d3020b891276a))
* update feedback options for improved clarity ([760af41](https://github.com/cds-snc/ai-answers/commit/760af4138416a1734f59eb75dac4ea84cdd07806))


### Miscellaneous Chores

* **deps:** bump axios from 1.11.0 to 1.12.0 ([bceabf4](https://github.com/cds-snc/ai-answers/commit/bceabf44d3b70e7e7ff34f681523edc7b6b415af))

## [1.36.0](https://github.com/cds-snc/ai-answers/compare/v1.35.3...v1.36.0) (2025-09-11)


### Features

* add input tokens to metrics dashboard ([ef29e39](https://github.com/cds-snc/ai-answers/commit/ef29e3998180d716f910bfde802f9f9ed4ded6b9))
* add input tokens to metrics dashboard ([30e1ec9](https://github.com/cds-snc/ai-answers/commit/30e1ec9f2d16fdfb43b23ca54e23cba5584e7840))
* enhance role-based access for ChatOptions component ([47795e4](https://github.com/cds-snc/ai-answers/commit/47795e4b937b718ebd3809d44e30a1056ee5d678))
* enhance role-based access for ChatOptions component ([d252e4a](https://github.com/cds-snc/ai-answers/commit/d252e4ab4d4601cf013d2ad60155c299dfad1fd8))


### Bug Fixes

* include all tokens from context and answer ([475f5df](https://github.com/cds-snc/ai-answers/commit/475f5df305108d80ae246928ab3721f7afb9d9e6))

## [1.35.3](https://github.com/cds-snc/ai-answers/compare/v1.35.2...v1.35.3) (2025-09-11)


### Bug Fixes

* clean up all logging of download plans etc ([799d25e](https://github.com/cds-snc/ai-answers/commit/799d25eaefef606fe926fa1c43aa9abb251f5465))
* refine-checkUrl use comment out pipeline ([74a1162](https://github.com/cds-snc/ai-answers/commit/74a1162b45003fb2bc342c14e554349b74bb382e))
* remove download plan ([1e7987b](https://github.com/cds-snc/ai-answers/commit/1e7987b858a218a7e0346b1eb3d7c59268757e28))
* remove logging ([f063a8d](https://github.com/cds-snc/ai-answers/commit/f063a8dabd71514f0f9775a16bc220608a565ccb))
* remove logging of things that no longer exist ([821fc9c](https://github.com/cds-snc/ai-answers/commit/821fc9c7e8496bc8c6fa5adecb243117516245e5))
* still-faking-download-plan ([b22e71b](https://github.com/cds-snc/ai-answers/commit/b22e71b355b3f5810d93fa82c3c3821c99d972de))

## [1.35.2](https://github.com/cds-snc/ai-answers/compare/v1.35.1...v1.35.2) (2025-09-10)


### Bug Fixes

* eslint ([2213a0c](https://github.com/cds-snc/ai-answers/commit/2213a0ca57bee81114e9d949cfecb2db55ddd61a))
* mrl and download ([0698e31](https://github.com/cds-snc/ai-answers/commit/0698e3183869d8c43f3e2fa683bf3f88c5c5c29e))
* mrl and download ([7441855](https://github.com/cds-snc/ai-answers/commit/7441855a8928e50d9bbdb4eebf00b1c81e45af55))


### Miscellaneous Chores

* **deps:** bump vite from 7.1.3 to 7.1.5 ([7abc3ff](https://github.com/cds-snc/ai-answers/commit/7abc3ff24b0d3c5648ba35f17517d2dc064a8a1b))
* **deps:** bump vite from 7.1.3 to 7.1.5 ([38547e6](https://github.com/cds-snc/ai-answers/commit/38547e6155f644bec828ab94190e6423a4e1bc9c))
* update dependencies and improve package.json ([b530ee9](https://github.com/cds-snc/ai-answers/commit/b530ee9b1dd6bec853bc11395bd7e1fdaced14b2))

## [1.35.1](https://github.com/cds-snc/ai-answers/compare/v1.35.0...v1.35.1) (2025-09-09)


### Bug Fixes

* add-FR-link to docs ([78c1ca6](https://github.com/cds-snc/ai-answers/commit/78c1ca61cecb58daeae7294029ac005c6cc059c3))
* add-FR-link to docs ([2a4b35b](https://github.com/cds-snc/ai-answers/commit/2a4b35b665428e1b8980c4a880d5e8d927245d5e))
* get-downloads-working-again ([8d0dae5](https://github.com/cds-snc/ai-answers/commit/8d0dae524a0fe4374f62f5ecffa8d35b336382f4))
* get-downloads-working-again ([9afaec9](https://github.com/cds-snc/ai-answers/commit/9afaec9c292614744ec22e99e59c941e7f615376))
* increase default max tokens limit in downloadWebPage function ([3e7b10e](https://github.com/cds-snc/ai-answers/commit/3e7b10e38887e59f0d8b4bde27d6a8bc5e510151))
* update log message for Azure OpenAI context agent and improve downloadWebPage tool description ([a1554aa](https://github.com/cds-snc/ai-answers/commit/a1554aaecb3d33019e5f22286310adaa98b14a21))


### Miscellaneous Chores

* clean up AnswerService.js file structure and comments ([c93bc6e](https://github.com/cds-snc/ai-answers/commit/c93bc6e32419acfc9ee4f64f784511e9386e4b45))


### Code Refactoring

* remove userMessagePreview from logging in validation for De… ([f59a69f](https://github.com/cds-snc/ai-answers/commit/f59a69fdd0a7169436a643592b8da22c30e30954))
* remove userMessagePreview from logging in validation for DefaultWorkflow and DefaultWithVector ([7feb96a](https://github.com/cds-snc/ai-answers/commit/7feb96abcc9e061c95d1aa69503187ee7fa1db24))

## [1.35.0](https://github.com/cds-snc/ai-answers/compare/v1.34.1...v1.35.0) (2025-09-08)


### Features

* add chat translation handler and update ChatWorkflowService for translation support ([0136976](https://github.com/cds-snc/ai-answers/commit/0136976163450a93764852f3dfd061554f36249c))
* add helper function to normalize language codes and enhance translation logic ([87f266c](https://github.com/cds-snc/ai-answers/commit/87f266ccf75d8e78eebf07a3b4a31cc4b849c2f9))
* enhance AnswerService and ContextService for improved translation handling and context management ([e1b3321](https://github.com/cds-snc/ai-answers/commit/e1b3321a127a5e0afd97166d380b8e31ae5c914e))
* enhance buildShortCircuitPayload to include detailed citation and context information for improved response handling ([ae859c1](https://github.com/cds-snc/ai-answers/commit/ae859c1119363702fc5938f5b69469a0c320ba3d))
* enhance checkSimilarAnswer to normalize conversation history and improve user message handling ([a0de6dc](https://github.com/cds-snc/ai-answers/commit/a0de6dc037b26336f5b09a26243061297d3fb782))
* enhance logging in DefaultWorkflow and DefaultWithVector for validation, redaction, and translation processes ([680982c](https://github.com/cds-snc/ai-answers/commit/680982c2ea911d0042751551efb527564ab2fc87))
* implement piiStrategy and queryRewriteStrategy for handling PII and query rewriting ([6bfb24b](https://github.com/cds-snc/ai-answers/commit/6bfb24b285ffc4a682274053a1a24b529a9078da))
* implement translation and query rewrite strategies in chat and search handlers ([f4674c2](https://github.com/cds-snc/ai-answers/commit/f4674c28c12402e78080df6b32c0fda5c74fdf68))
* log total response time for short-circuit responses in DefaultWithVector ([5aa3a1f](https://github.com/cds-snc/ai-answers/commit/5aa3a1f1574e905464dd4ad4d5232fee23d7b692))
* refactor DefaultWithVector to streamline context handling and improve short-circuit response logic ([edaac2f](https://github.com/cds-snc/ai-answers/commit/edaac2fdf9ec0899e36f46a578cf4c93f614d843))
* update chat-similar-answer and DefaultWithVector to support pageLanguage and detectedLanguage for improved translation handling ([8b8b6f0](https://github.com/cds-snc/ai-answers/commit/8b8b6f0e6963291a3418f422c88e7448760b157e))


### Bug Fixes

* phone and isc treaty table issues ([a9299a5](https://github.com/cds-snc/ai-answers/commit/a9299a5aa0075eedebe929ea3a98f8d5ecfad414))
* phone and isc treaty table issues ([05e05b5](https://github.com/cds-snc/ai-answers/commit/05e05b5c169c6a514d88eeb7cb9727e46288c636))
* update processRedaction call to include chatId and selectedAI parameters ([61b2155](https://github.com/cds-snc/ai-answers/commit/61b2155eb3b1b6696670eaf14a3de1692ea5a4eb))


### Miscellaneous Chores

* update AgentFactory.js with minor adjustments for consistency ([25dcc58](https://github.com/cds-snc/ai-answers/commit/25dcc5843f3fa4cacd4483d363ef0b9ba0e09d7f))
* update comments for clarity in agenticBase.js ([5692493](https://github.com/cds-snc/ai-answers/commit/56924930a976b32f53004f5adf59d01b83a16f3a))


### Code Refactoring

* clean up unused variables and improve code readability in ChatAppContainer ([3d75d2b](https://github.com/cds-snc/ai-answers/commit/3d75d2be082213ff7eeba7d8194a8f4ce8348ff5))
* update prompts for clarity and consistency in language handling ([4806fb5](https://github.com/cds-snc/ai-answers/commit/4806fb5df2989adfc915ee72b4a5ea4b8debf1e8))

## [1.34.1](https://github.com/cds-snc/ai-answers/compare/v1.34.0...v1.34.1) (2025-09-04)


### Bug Fixes

* ei-phone-number ([d1ebbfe](https://github.com/cds-snc/ai-answers/commit/d1ebbfedcc0c6272642843dc4adae68381301beb))
* EI-phone-number ([6634148](https://github.com/cds-snc/ai-answers/commit/6634148a0b1f2c4ee30f0c19fd1b2fe675f72a01))
* isc-treaties ([588cbc9](https://github.com/cds-snc/ai-answers/commit/588cbc9ffa29fd2b20938b12a7c35a4b5b847f75))
* prompts-add-HC ([70ca1e7](https://github.com/cds-snc/ai-answers/commit/70ca1e774bd8227387b64536945060492fe2933d))
* update-docs-for-pipeline-changes ([66a07cc](https://github.com/cds-snc/ai-answers/commit/66a07ccc8c644421a00bd362b6ca8eb68109792d))

## [1.34.0](https://github.com/cds-snc/ai-answers/compare/v1.33.0...v1.34.0) (2025-09-04)


### Features

* add tests for chat deletion and partner/admin middleware; refactor delete chat endpoint ([ade6b76](https://github.com/cds-snc/ai-answers/commit/ade6b7695e5eb83cb38fff1cde090abe00d384de))
* implement delete chat endpoint with authentication and error handling ([5823375](https://github.com/cds-snc/ai-answers/commit/5823375c58ac539203d58da9e8c054a52ecba207))
* implement user logout functionality and enhance token management ([eae0b15](https://github.com/cds-snc/ai-answers/commit/eae0b150b9a21122b5372115c71227076f1152d6))
* implement user logout functionality and enhance token management ([491b5b7](https://github.com/cds-snc/ai-answers/commit/491b5b7cd1ac1db68eac51e88b8479cd2fc6c7ff))


### Bug Fixes

* clarify-PI-redaction-rules ([15853c8](https://github.com/cds-snc/ai-answers/commit/15853c89a0143f3054feb49a9f4e3998c3d939c7))
* clarify-PI-redaction-rules ([9099289](https://github.com/cds-snc/ai-answers/commit/90992899228cdf4e733707052da6f3153a4cd536))
* documentation-use-PI ([1bbbe51](https://github.com/cds-snc/ai-answers/commit/1bbbe51b3afc4a5ef7b924cb80c2885bcf6c27aa))
* phone numbers formatted only ([cb9392d](https://github.com/cds-snc/ai-answers/commit/cb9392d551ccf472faa60168dbabbe15c4fd0a47))
* phone-redaction-french-docs ([a810758](https://github.com/cds-snc/ai-answers/commit/a8107581fc5761d0ffe9e227b001f6e88015949c))


### Code Refactoring

* lint and bug fix for partner delete expert eval ([b00a251](https://github.com/cds-snc/ai-answers/commit/b00a2518dab15927fc3f3b934f161067c3fd3467))
* lint and bug fix for partner delete expert eval ([9c44e69](https://github.com/cds-snc/ai-answers/commit/9c44e696690cbb758def413ca68c5b9fb2255d78))
* remove unused imports and update ChatWorkflowService import syntax ([2847ae2](https://github.com/cds-snc/ai-answers/commit/2847ae21df6fbe49ddf6f991a22beb38dc886006))

## [1.33.0](https://github.com/cds-snc/ai-answers/compare/v1.32.0...v1.33.0) (2025-09-01)


### Features

* add adobe analytics to index ([6ab9391](https://github.com/cds-snc/ai-answers/commit/6ab93915966496d31a934a5c47e5076a904cf047))
* implement PII check endpoint and integrate PII detection in workflows ([73929d6](https://github.com/cds-snc/ai-answers/commit/73929d685f4413ce50d4ea6fb487830f66330a11))


### Bug Fixes

* redaction-catching-form-numbers ([897a715](https://github.com/cds-snc/ai-answers/commit/897a715218b86975d32df837040c32aa2530a77c))
* remove number redaction ([4cf4d4d](https://github.com/cds-snc/ai-answers/commit/4cf4d4d93abb74fd6e2ed2b571390b91872e9957))
* remove-country-as-PII ([52dbf6a](https://github.com/cds-snc/ai-answers/commit/52dbf6a0bb91b20b3bec956d19a0d8db5ed67d29))
* remove-country-as-PII - revise prompt to not catch other information that is not personally identifying ([009b897](https://github.com/cds-snc/ai-answers/commit/009b897ecc88f7cd765d5b3dffa719e9219a3317))


### Code Refactoring

* update batch handling to use _id instead of batchId for con… ([a32c202](https://github.com/cds-snc/ai-answers/commit/a32c202825bee5877371020058224c8fa630ca6e))
* update batch handling to use _id instead of batchId for consistency ([d6fe2a2](https://github.com/cds-snc/ai-answers/commit/d6fe2a2e4a3be47adfeae355bae2121d2b32c8e4))

## [1.32.0](https://github.com/cds-snc/ai-answers/compare/v1.31.0...v1.32.0) (2025-08-28)


### Features

* add workflow handling to batch processing and UI components ([1932c38](https://github.com/cds-snc/ai-answers/commit/1932c38f952f296d675e3ce0ad62e8306658a2de))
* add workflow handling to batch processing and UI components ([cd1719a](https://github.com/cds-snc/ai-answers/commit/cd1719ac78d35f0e0bd6c426ed0ee8b68ec16440))
* increase default concurrency for batch processing to improve performance ([b5dcfbd](https://github.com/cds-snc/ai-answers/commit/b5dcfbdf3cc7dccf394f924bec6da7c4705c28d3))

## [1.31.0](https://github.com/cds-snc/ai-answers/compare/v1.30.0...v1.31.0) (2025-08-27)


### Features

* enhance PII detection and redaction process in search agent workflow ([28b109a](https://github.com/cds-snc/ai-answers/commit/28b109a2301ab35d58cbaf8f33a0aacf9942bcd8))
* enhance search and workflow services with PII handling and status update improvements ([b2857a2](https://github.com/cds-snc/ai-answers/commit/b2857a2cd01904e34e197ed7103d6901bbb9fd44))
* implement query and PII handling agent with associated prompt a… ([3ffabfc](https://github.com/cds-snc/ai-answers/commit/3ffabfc5705514f5a09495fb6a117f7534a68cf1))
* implement query and PII handling agent with associated prompt and service integration ([225133d](https://github.com/cds-snc/ai-answers/commit/225133d2dacb5d1ba88e90ab5134728fad4b3c58))


### Bug Fixes

* abbreviation canada post ([e60e371](https://github.com/cds-snc/ai-answers/commit/e60e371a4ce64217bad53b8839a333790604bd46))
* downloadWebPage ([219cb13](https://github.com/cds-snc/ai-answers/commit/219cb1374570aafc2bbf5f87d1d95090c49bc18e))
* downloadWebPage ([a4d01f4](https://github.com/cds-snc/ai-answers/commit/a4d01f495e7f1cae0e270b157cfc9e3dfc82f85b))
* is_GC for canada post question ([daf33b3](https://github.com/cds-snc/ai-answers/commit/daf33b325d92eec61055fc6f5e2a7879254ef8d0))
* reduce length of outputs for downloads ([5877fbd](https://github.com/cds-snc/ai-answers/commit/5877fbd7d1a8e0ea73436a04780c9a13402a3964))


### Miscellaneous Chores

* update search agent prompt file for consistency and clarity ([6dbe07d](https://github.com/cds-snc/ai-answers/commit/6dbe07ddbdc52e81291985e0ca236a67a7f2a720))

## [1.30.0](https://github.com/cds-snc/ai-answers/compare/v1.29.9...v1.30.0) (2025-08-26)


### Features

* add 'Back to Admin' button in admin dashboard for better navigation ([4a4c6e6](https://github.com/cds-snc/ai-answers/commit/4a4c6e630cbb43b4f01cc6bd677cb62e96f7134a))
* add onBatchSaved callback to BatchUpload for immediate list refresh ([85093a4](https://github.com/cds-snc/ai-answers/commit/85093a42108bb05d973a263f5a6ea7c1c8a0bea7))
* add processing state and user feedback during batch upload ([68b7ddb](https://github.com/cds-snc/ai-answers/commit/68b7ddb9a00fbc90530d3c488ae0f25456f02058))
* enhance action buttons in BatchList with delete functionality and improved layout ([7914474](https://github.com/cds-snc/ai-answers/commit/7914474d4eb82876bece22c11c3f6775121fa120))
* fix message ([142d7a9](https://github.com/cds-snc/ai-answers/commit/142d7a918789889b682b3f80f6ba6e7a74cebf02))
* fix message ([544e5fa](https://github.com/cds-snc/ai-answers/commit/544e5fa21bb7bdc188c7e5990aae2e65c7eac826))
* implement batch deletion handler with related item and chat cleanup ([dcd0e18](https://github.com/cds-snc/ai-answers/commit/dcd0e186d66b333a5b57749d810e86d884974420))
* implement batch processing API with upsert and retrieval functionalities ([437539b](https://github.com/cds-snc/ai-answers/commit/437539bcc1c5bc9c24ce28c28afc7a0b1135fe76))


### Bug Fixes

* correct feedback messages for clarity and consistency in English and French locales ([13da36e](https://github.com/cds-snc/ai-answers/commit/13da36e873c949a9de296ff5b0c37845f75d3f09))
* enhance CSV requirements descriptions for clarity in English and French locales ([72fc607](https://github.com/cds-snc/ai-answers/commit/72fc607eecee0c11586218db32bd83a8a654e95c))


### Miscellaneous Chores

* **deps:** bump form-data from 4.0.1 to 4.0.4 in /server ([0b72e42](https://github.com/cds-snc/ai-answers/commit/0b72e4202a53cf82fbe6bbe0801beaeec39e9c4c))


### Code Refactoring

* add batchId support to chat logs handler for filtering by batch ([b9c3ab2](https://github.com/cds-snc/ai-answers/commit/b9c3ab23a364a8b222a3049dfd43cb12d3aaab35))
* add BatchItem model to table counts handler ([8375275](https://github.com/cds-snc/ai-answers/commit/83752758619c99d687fb9d641396b26e799016f7))
* clean up package.json dependencies formatting ([0f38451](https://github.com/cds-snc/ai-answers/commit/0f384517819fad38ceac8fb9516dd723be93da4b))
* clean up package.json dependencies formatting ([62ffc29](https://github.com/cds-snc/ai-answers/commit/62ffc29b074c37262e3d1b56303d745b2124a373))
* enhance CSV processing to retain only necessary fields and update URL handling ([1736536](https://github.com/cds-snc/ai-answers/commit/1736536360a620cefeb5833f3b01bb6a7cfd021b))
* implement delete all batches functionality with confirmation dialog ([693605d](https://github.com/cds-snc/ai-answers/commit/693605ddab1e7e37f14de23f92eea7740fe81bf1))
* remove batch processing methods from AnswerService and ContextService ([bff27d5](https://github.com/cds-snc/ai-answers/commit/bff27d5f1f4f65c0259bd1cb5677d5a22ae623c9))
* remove batch processing methods from DataStoreService ([85112cf](https://github.com/cds-snc/ai-answers/commit/85112cf4c7098e2f9861955fc3bc6ad1003c1efe))
* remove ChatPipelineService and update documentation for deployment and service usage ([a473710](https://github.com/cds-snc/ai-answers/commit/a473710c49615175da7b46adaa0c5f6ab4a48ce2))
* remove deprecated Anthropics batch processing endpoints ([1c3dcbe](https://github.com/cds-snc/ai-answers/commit/1c3dcbef2434e43f1f7d14e6df924a41a137cf47))
* remove deprecated Azure and OpenAI batch handling endpoints ([7f6db1f](https://github.com/cds-snc/ai-answers/commit/7f6db1fc7b774fdf064d58bf0207e20aa53bc660))
* remove exportBatchResults method to streamline export functionality ([12e3211](https://github.com/cds-snc/ai-answers/commit/12e32116867e85e156a88c76e4bf4e5e97ad181a))
* reorganize batch API endpoints and update localization strings for clarity ([3c585ce](https://github.com/cds-snc/ai-answers/commit/3c585ce5f2b3aaf6c073b5ddf4bb99130d5b8bb5))
* replace ChatPipelineService with ChatWorkflowService and add DefaultWorkflow implementation ([45d9963](https://github.com/cds-snc/ai-answers/commit/45d99635323f6c2260cb7fc84e3313c4c8dad56c))
* update AI service label to Azure OpenAI in English and French locales ([152c0ba](https://github.com/cds-snc/ai-answers/commit/152c0baa3a5d57a96623ae4e496ac582fd361d9d))
* update Batch schema to change default status and remove batchId field ([8c92b2a](https://github.com/cds-snc/ai-answers/commit/8c92b2acf87c774fffcfc802e377f0c28dc05092))
* update Batch schema to set default status and add BatchItem model ([93f2b36](https://github.com/cds-snc/ai-answers/commit/93f2b36c9ebcd9a1edf868f983d093c262511bf0))
* update CSV input fields and add delete option in English and French locales ([ab504e5](https://github.com/cds-snc/ai-answers/commit/ab504e5bb063fc07c39c55644bee102b27a8ce49))

## [1.29.9](https://github.com/cds-snc/ai-answers/compare/v1.29.8...v1.29.9) (2025-08-15)


### Bug Fixes

* initialize VectorService in worker to ensure proper functionality ([e6ca535](https://github.com/cds-snc/ai-answers/commit/e6ca53534f3c3d419e115a8b2da23a840da772bf))
* initialize VectorService in worker to ensure proper functionality ([ef96f96](https://github.com/cds-snc/ai-answers/commit/ef96f9622ae4c5b2e1bbd5297b96a51f7f711eb3))

## [1.29.8](https://github.com/cds-snc/ai-answers/compare/v1.29.7...v1.29.8) (2025-08-15)


### Bug Fixes

* add Vitest debugging configuration and implement tests for URL v… ([e679bc6](https://github.com/cds-snc/ai-answers/commit/e679bc6d46e791b5df44f4bcf19550412a54b164))
* remove unused deploymentMode variable from evaluation processing ([18ed519](https://github.com/cds-snc/ai-answers/commit/18ed51991f8a453ccffed9e732329b99dbc6b9d3))

## [1.29.7](https://github.com/cds-snc/ai-answers/compare/v1.29.6...v1.29.7) (2025-08-15)


### Bug Fixes

* update Fargate CPU allocation for production environment ([a948624](https://github.com/cds-snc/ai-answers/commit/a948624b984d8f017aadb65d74e21a5a10ec73e3))
* update Fargate CPU allocation for production environment ([8a27b1a](https://github.com/cds-snc/ai-answers/commit/8a27b1ab43508988d3a2cb7a62a0f97dc68fd666))

## [1.29.6](https://github.com/cds-snc/ai-answers/compare/v1.29.5...v1.29.6) (2025-08-14)


### Bug Fixes

* add comment to selectedAI state initialization for clarity ([a2d6dca](https://github.com/cds-snc/ai-answers/commit/a2d6dcaeabd128530c321bb190a614fa982b0cec))
* add ForceRefresh tag to load balancer resources for consistency ([e8a8ea2](https://github.com/cds-snc/ai-answers/commit/e8a8ea25309564fb73d054bfb44f374b7f7f898c))
* add loading state management to prevent multiple announcements ([43b2c20](https://github.com/cds-snc/ai-answers/commit/43b2c207e2042fa869fe50ac7c6bf9c8da1a41e6))
* add loading state management to prevent multiple announcements ([d2d5939](https://github.com/cds-snc/ai-answers/commit/d2d5939797e84abb0fb134225a59ab4440b65333))
* align formatting of CostCentre tag in load balancer resources ([48a70d3](https://github.com/cds-snc/ai-answers/commit/48a70d353b505fe0202c277380079f1e82e2a918))

## [1.29.5](https://github.com/cds-snc/ai-answers/compare/v1.29.4...v1.29.5) (2025-08-14)


### Bug Fixes

* add missing tags to the HTTPS listener rule for consistency ([0a1116c](https://github.com/cds-snc/ai-answers/commit/0a1116c0858f8769583ef0f88b76220f623aba87))
* always include alternate domain in SANs and adjust listener rule for all environments ([12f9804](https://github.com/cds-snc/ai-answers/commit/12f980428c8a0e6b73f550abee5561bde4108c2f))
* conditionally include alternate domain in SANs and listener rule for production ([e639ea1](https://github.com/cds-snc/ai-answers/commit/e639ea18247ef67e923050c57a3ec4b77b59aa59))
* enhance load balancer configuration for alternate domain support ([6813bf6](https://github.com/cds-snc/ai-answers/commit/6813bf67bb62dcf3b40b81bbee6922a710a351c7))
* enhance load balancer configuration for alternate domain support ([f349108](https://github.com/cds-snc/ai-answers/commit/f3491085eb775a535e5a23a2d72a4ecdf7b70cba))
* increase evalBatchProcessingDuration to 30 seconds and set evalConcurrency to 3 ([fd7bf1b](https://github.com/cds-snc/ai-answers/commit/fd7bf1b7ed02f597e4d1a9c3559cf66bdd8df79e))
* refactor evaluation interaction handling to conditionally initialize worker pool based on deployment mode ([ba7e41f](https://github.com/cds-snc/ai-answers/commit/ba7e41fd8121c129638c23765a870e98b79ac859))
* remove deprecated variables and clean up inputs.tf for clarity ([9e28f4e](https://github.com/cds-snc/ai-answers/commit/9e28f4eb6eb6330c26b04e937c0d2f9e626b9f82))
* resolve new zone vs primary ([996897b](https://github.com/cds-snc/ai-answers/commit/996897bd6e8cf71cabf3ced0f8fadf031aabbf50))
* resolve new zone vs primary ([b738d3c](https://github.com/cds-snc/ai-answers/commit/b738d3c81e953bc6f4c23c4de77140a5a1a2fa88))
* standardize formatting in alternate domain A record for clarity ([fb60035](https://github.com/cds-snc/ai-answers/commit/fb600352c44cf708774ac8925b0e8caa34d1d48e))
* standardize formatting of tags in HTTPS listener rule for consistency ([8e228fa](https://github.com/cds-snc/ai-answers/commit/8e228fa6d2844d566854aedcdc9ac497d49379be))
* standardize variable descriptions in inputs.tf for clarity ([b111e28](https://github.com/cds-snc/ai-answers/commit/b111e28eff3f0e77c635b7a1daf3f856ff31afe1))
* update Fargate resource limits for production environment and paralellizer eval system ([1496a63](https://github.com/cds-snc/ai-answers/commit/1496a63406f9700c6ed3c13db15a389b6e7eb1c8))

## [1.29.4](https://github.com/cds-snc/ai-answers/compare/v1.29.3...v1.29.4) (2025-08-14)


### Bug Fixes

* refactor tags to use merge function for consistency across resources ([fc57da6](https://github.com/cds-snc/ai-answers/commit/fc57da6ec67eb2041ae89feb3557a84c94418a98))
* remove unused environment and tagging variables from inputs.tf ([1521237](https://github.com/cds-snc/ai-answers/commit/1521237b913cfdfcc029c1f632623f1116207867))
* update AI selection to OpenAI and add optional French zone ID for Route53 configurations ([ada50d1](https://github.com/cds-snc/ai-answers/commit/ada50d1ddf241de5cb0083e1f78f31cbedc16f43))
* update french_zone_id assignment to use local variable for consi… ([1ddf34b](https://github.com/cds-snc/ai-answers/commit/1ddf34b75a1dd971a08d5a595e7547d0ddea55f2))
* update french_zone_id assignment to use local variable for consistency ([d7a3d4a](https://github.com/cds-snc/ai-answers/commit/d7a3d4a033c5cc1dabdd4c983245f7c3f490e875))
* update Route53 configurations for reponses-ia zone and adjust AC… ([cfd9f22](https://github.com/cds-snc/ai-answers/commit/cfd9f2259a5604693c5cac7d546113d694fa9ef7))
* update Route53 configurations for reponses-ia zone and adjust ACM certificate validation ([21144f0](https://github.com/cds-snc/ai-answers/commit/21144f002c22c65f4fe7d65b9ecb7b34f30e9e9a))
* update Route53 zone ID logic for certificate validation ([7cd7f4d](https://github.com/cds-snc/ai-answers/commit/7cd7f4d7e63b0a3f5017ddf9baa0006dd6fddd89))

## [1.29.3](https://github.com/cds-snc/ai-answers/compare/v1.29.2...v1.29.3) (2025-08-13)


### Bug Fixes

* add CNAME record for reponses-ia in Route53 configuration ([8dd9256](https://github.com/cds-snc/ai-answers/commit/8dd92564a75ec8d6743d8634272dc9bb9b9eb08d))
* delete-unused-files ([4fb1477](https://github.com/cds-snc/ai-answers/commit/4fb14772f7ec064377281a3e1d0bae2aa2fb3982))
* delete-unused-files ([fe9ceae](https://github.com/cds-snc/ai-answers/commit/fe9ceae3a7669c916765704c76cb65890ad4654d))
* remove unused Route53 zone data and clean up ACM certificate resource ([81951f3](https://github.com/cds-snc/ai-answers/commit/81951f3ba8d24d2dba91b72da62dde46c6a43cf1))
* update Route53 record to use selected zone data for certificate … ([9128e56](https://github.com/cds-snc/ai-answers/commit/9128e5628c25f32238f1596e2053b3072d1941ec))
* update Route53 record to use selected zone data for certificate validation ([c44c6d4](https://github.com/cds-snc/ai-answers/commit/c44c6d41c21e16e08947a6723b31c032f21a4b3d))

## [1.29.2](https://github.com/cds-snc/ai-answers/compare/v1.29.1...v1.29.2) (2025-08-13)


### Bug Fixes

* add force_apply tag to ACM certificate resource ([c05db4c](https://github.com/cds-snc/ai-answers/commit/c05db4c3dccf98ee17b85914c88c128c74a34028))
* add force_apply tag to ACM certificate resource ([379fabd](https://github.com/cds-snc/ai-answers/commit/379fabd74cfcc4d486234f139347bdf08da1c65e))
* add san input to the root configuration ([495b9a4](https://github.com/cds-snc/ai-answers/commit/495b9a4507a83e8315c9c5ce348f25b618ab86a0))
* adjust formatting of CostCentre tag in ACM certificate resource ([3b2a322](https://github.com/cds-snc/ai-answers/commit/3b2a3223eb5e1766e41ce6fce7bc20e38d44b840))

## [1.29.1](https://github.com/cds-snc/ai-answers/compare/v1.29.0...v1.29.1) (2025-08-13)


### Bug Fixes

* remove incorrect dependency 'moongoose' from package.json and package-lock.json ([0b0938e](https://github.com/cds-snc/ai-answers/commit/0b0938eb22239bce94a06444a8115f7b399d7872))


### Miscellaneous Chores

* update dependencies and add new packages ([1704b19](https://github.com/cds-snc/ai-answers/commit/1704b193b7c372b5d7073818aef030a3f0eaabe9))
* update dependencies and add new packages ([b494432](https://github.com/cds-snc/ai-answers/commit/b494432eaff51f36532df5432d228fd69550dff2))

## [1.29.0](https://github.com/cds-snc/ai-answers/compare/v1.28.0...v1.29.0) (2025-08-13)


### Features

* container fix ([bbefdd2](https://github.com/cds-snc/ai-answers/commit/bbefdd2295be9bcea384bb84c8d4afe9249c01a8))


### Bug Fixes

* ensure citation score defaults to 25 when not provided ([468a7c9](https://github.com/cds-snc/ai-answers/commit/468a7c9c3dfd0c54bc1a7adabe09b25e0b9c4a16))
* ensure citation score defaults to 25 when not provided ([9cd6b16](https://github.com/cds-snc/ai-answers/commit/9cd6b168c56d32cdc1f3713972a26b9152368985))


### Code Refactoring

* remove unused auth expiration checker setup ([abe08aa](https://github.com/cds-snc/ai-answers/commit/abe08aacdf7836fe7ce817432abe0b17d3b820ec))

## [1.28.0](https://github.com/cds-snc/ai-answers/compare/v1.27.1...v1.28.0) (2025-08-12)


### Features

* add citation match traceability fields to evaluation schema and worker ([4f79c55](https://github.com/cds-snc/ai-answers/commit/4f79c559fc2bb131812209bc4ca85229affcf08d))
* add debug logging for similarity calculations in sentence and QA search methods ([c95a653](https://github.com/cds-snc/ai-answers/commit/c95a6534e6b40506762339a878dfcaf110e71dcc))
* add debug logging for sorted similarity lists in search methods of DocDBVectorService ([832d120](https://github.com/cds-snc/ai-answers/commit/832d120fe8306e91af0c5d664004c2dc165fc9e0))
* add debug logging to getStats method in DocDBVectorService ([05298dd](https://github.com/cds-snc/ai-answers/commit/05298ddd3c9d51a64979db20e478555133c61709))
* add detailed statistics retrieval in DocDBVectorService ([743dda0](https://github.com/cds-snc/ai-answers/commit/743dda0f972ec02f1634a626fa20d75754155295))
* add expert and public feedback persistence handlers and components - persist expert email on feedback, and add security measures between the two ([237cfd5](https://github.com/cds-snc/ai-answers/commit/237cfd5bc9bd1084e0858ceebfd9b1ea08ca5e77))
* add logging chats to database setting and update logging behavior ([bb10292](https://github.com/cds-snc/ai-answers/commit/bb10292fe989fe4b9b4f9303543a2155a7ac0f92))
* add logging chats to database setting and update logging behavior ([42ece72](https://github.com/cds-snc/ai-answers/commit/42ece722393d61fed0acbdc5d948560d42018e75))
* add partner dashboard titles and menu to French localization ([f54f9d2](https://github.com/cds-snc/ai-answers/commit/f54f9d22f6e63b524a372260645a2d6108800394))
* add support for secondary hostname in ALB listener rules for pr… ([2962701](https://github.com/cds-snc/ai-answers/commit/2962701bc3ffe42fdc9b145c7f24a79d9f4857ec))
* add support for secondary hostname in ALB listener rules for production ([80ab584](https://github.com/cds-snc/ai-answers/commit/80ab584d52b01697878976f9b5ff47c8d01b5bca))
* enhance AdminPage and MetricsPage with role-based content and routing ([9dd4e54](https://github.com/cds-snc/ai-answers/commit/9dd4e54f6691d32585b27e749e597cc5df871fb8))
* enhance DocDBVectorService to include expert feedback in search results and improve similarity scoring ([a1dc33b](https://github.com/cds-snc/ai-answers/commit/a1dc33b117da1f325f41115b58f41d1163f9d37c))
* Enhance Embedding and Vector Services with Sentence Embeddings ([e4f4cbb](https://github.com/cds-snc/ai-answers/commit/e4f4cbb29f74df79ae2039dccb52a92c77c5514c))
* enhance findSimilarEmbeddingsWithFeedback and createEvaluation with expert feedback logging and similarity thresholding ([0c6b394](https://github.com/cds-snc/ai-answers/commit/0c6b394b5427c1fc13eb51bd7255475a863c1774))
* enhance IMVectorService with expert feedback filtering and search thresholding ([48847ab](https://github.com/cds-snc/ai-answers/commit/48847ab4a5df7a6debe161531637144b27fcbd4e))
* implement findSimilarChats method for enhanced chat similarity search ([ff6e436](https://github.com/cds-snc/ai-answers/commit/ff6e43694e6256b91a66a9d5476da89001aa284c))
* implement settings handler and public settings retrieval ([d78be0f](https://github.com/cds-snc/ai-answers/commit/d78be0fb6354df078abcea691b0b07f638b5bc5f))
* implement settings handler and public settings retrieval ([152020f](https://github.com/cds-snc/ai-answers/commit/152020ffdc4afd47b12209db2f92216a89e1b7f5))
* log context agent call with message payload ([e0ed6e8](https://github.com/cds-snc/ai-answers/commit/e0ed6e821d6b2b71be75512c01a0e8ee20226494))
* log context agent call with message payload ([51bdedd](https://github.com/cds-snc/ai-answers/commit/51bdeddf3a85d586ab0c3ce3692989498a7c2a8e))
* log embedding dimensions upon successful creation ([8a61bf1](https://github.com/cds-snc/ai-answers/commit/8a61bf17364dc5ad469cd4ca21a7143967560551))
* save evaluation record after creation in createEvaluation function ([2141616](https://github.com/cds-snc/ai-answers/commit/2141616425049769ef9499e554b704888005aed9))
* save evaluation record after creation in createEvaluation function ([fa65b76](https://github.com/cds-snc/ai-answers/commit/fa65b76b400486cf4f8a4719747215f3acc716d2))
* update protected routes to allow partner access for admin-related pages ([d2c4528](https://github.com/cds-snc/ai-answers/commit/d2c45280031c70e37d4dd10cfa8f07fe4c7bb5b2))


### Bug Fixes

* change preCheck default to false and update vector validation queries ([c2cff84](https://github.com/cds-snc/ai-answers/commit/c2cff84bc7536dc7f5fa1864a046490744a57b81))
* change preCheck default to true in DocDBVectorService constructor ([6aabca1](https://github.com/cds-snc/ai-answers/commit/6aabca134867874fe5d1601ac5e629b9f459fe9b))
* improve logging format for agent search completion in ContextSer… ([b667650](https://github.com/cds-snc/ai-answers/commit/b667650593df458477d20f49875a35b6b9b61ed7))
* improve logging format for agent search completion in ContextService ([d0dd8dd](https://github.com/cds-snc/ai-answers/commit/d0dd8dd76c7ed1648ec8618a4fe739b749424fab))
* pass referring url for context of search query ([21a02d9](https://github.com/cds-snc/ai-answers/commit/21a02d97329dfe9a48ad8562a56fb75907a40041))
* remove admin middleware from chat handler and public evaluation list ([4b10e8f](https://github.com/cds-snc/ai-answers/commit/4b10e8f831ad8f233d068f64dc3b705fe57896a0))
* remove admin middleware from chat logs handler ([c62949c](https://github.com/cds-snc/ai-answers/commit/c62949cb996ed8f686e1a4d84dd3db20b738ecc8))
* remove immigration expando ([d0ff03f](https://github.com/cds-snc/ai-answers/commit/d0ff03f5a08543ade16b9689a359da567b30a786))
* remove immigration expando ([4d93f32](https://github.com/cds-snc/ai-answers/commit/4d93f320b3553ee89a69be4ba67ab11e1278822b))
* restrict roles in RoleBasedContent to 'admin' only ([0f73fdd](https://github.com/cds-snc/ai-answers/commit/0f73fdd7b81a73d2b917a72bb9c6cc4affc94e4b))
* simplify getDefaultRouteForRole logic for admin and partner roles ([c2e1c77](https://github.com/cds-snc/ai-answers/commit/c2e1c77da488db0e5c90a533ad61a109a1382b3c))
* update Azure OpenAI API version to 2024-02-01 ([2842c63](https://github.com/cds-snc/ai-answers/commit/2842c638aea975f6c4469230fada3cee86f2905b))
* update dimensions for text-embedding models to 2000 ([80ca2fb](https://github.com/cds-snc/ai-answers/commit/80ca2fbcc9b08ae6d4202c153b63edb6465a9cb8))
* update gitignore ([c0eb5a2](https://github.com/cds-snc/ai-answers/commit/c0eb5a27b546105d02a5bfddb63ae675629bdbb2))
* update gitignore ([069dd4c](https://github.com/cds-snc/ai-answers/commit/069dd4c6189d7864c616061ba3caf1c4c51047b6))
* update model configurations for createSearchAgent and improve logging in ContextService ([42bf9f5](https://github.com/cds-snc/ai-answers/commit/42bf9f5e1be04037ee83f99378f9dec91469029a))
* used CDS context when CRA was mentioned ([e14b636](https://github.com/cds-snc/ai-answers/commit/e14b6368a18a6c7d3578341dd233f51f18bde298))
* used CDS context when CRA was mentioned ([b56fc98](https://github.com/cds-snc/ai-answers/commit/b56fc988e05d7350944dcbf7f3d4ce4a5b34e322))


### Code Refactoring

* enhance embedding handling and improve service structure ([b2217d2](https://github.com/cds-snc/ai-answers/commit/b2217d25ee53bfa48b7a77c637022a19904a63cc))
* enhance logging and improve filterQuery default in DocDBVectorService constructor ([313266c](https://github.com/cds-snc/ai-answers/commit/313266c785e6a4672c417746c9419fe0f77399c5))
* enhance precheck logic for vector types and dimensions in DocDBVectorService ([338c992](https://github.com/cds-snc/ai-answers/commit/338c9921b16b3c608f739448d80c769c8452acba))
* improve error handling and response structure in vectorStatsHandler ([f8608ce](https://github.com/cds-snc/ai-answers/commit/f8608cecad13a65b68770079b0fd5b3c3e8e5c56))
* optimize deleteEvaluations method to handle time filters and autoEval interactions ([3aa6a4e](https://github.com/cds-snc/ai-answers/commit/3aa6a4e24996da77ab147509c6576fc98a70af52))
* optimize interaction logging and evaluation process based on deployment mode ([57258a5](https://github.com/cds-snc/ai-answers/commit/57258a522137391cbefaf3e94a3ed3a38eadf7f4))
* remove filterQuery parameter from constructor and update base query to use interaction IDs with expert feedback ([67c85d0](https://github.com/cds-snc/ai-answers/commit/67c85d0d715f63e7431866f3091454a8a37a8e2f))
* remove filterQuery parameter from constructor and update initialization logic to use interaction IDs ([d3ef832](https://github.com/cds-snc/ai-answers/commit/d3ef8328d73995253fb34fa5e5e051340a28f701))
* remove legacy sentenceEmbeddings field from embedding schema ([8e46aae](https://github.com/cds-snc/ai-answers/commit/8e46aaed823bf6e9d874e25baef08fe1c19c8284))
* remove unused filterQuery parameter from constructor ([d00e793](https://github.com/cds-snc/ai-answers/commit/d00e79330c3c8782d53e704ad10a3abfe0f2a359))
* rename DocDBVectorService to IMVectorService and enhance embedding handling ([29716df](https://github.com/cds-snc/ai-answers/commit/29716dfbfaad43495a8c00b9e499ed98571067de))
* rename IMVectorService to DocDBVectorService and enhance embedding handling ([136b5e5](https://github.com/cds-snc/ai-answers/commit/136b5e5b341852f86f3082b5669679c9d2ae86d9))
* simplify search method by extracting sentence and QA search logic into separate functions ([7e596fd](https://github.com/cds-snc/ai-answers/commit/7e596fdc75a1c0b287b8be0df308e2fc35580a1c))
* streamline search methods with enhanced logging and move stats calculations to getStats() ([62bb252](https://github.com/cds-snc/ai-answers/commit/62bb252285590c6b70e2810d666d6bb4ac140648))
* streamline vector index creation and enhance search method ([f227bb4](https://github.com/cds-snc/ai-answers/commit/f227bb4cfe94fac50e8a6888472e2cb2b04673f6))

## [1.27.1](https://github.com/cds-snc/ai-answers/compare/v1.27.0...v1.27.1) (2025-08-07)


### Bug Fixes

* add autoEval lookup and expertFeedback population to chat logs retrieval ([9643954](https://github.com/cds-snc/ai-answers/commit/9643954c3adff55f3c61e4381d47361917ee2b22))
* enhance chat log retrieval by adding answer and citation lookups ([8eadad0](https://github.com/cds-snc/ai-answers/commit/8eadad0ce7966be37376cf77992546a8f25bbf6a))
* enhance date parsing and validation in FilterPanel component ([b8cac8f](https://github.com/cds-snc/ai-answers/commit/b8cac8f5aec7a63f0f0e25f28036cd55b259ffec))

## [1.27.0](https://github.com/cds-snc/ai-answers/compare/v1.26.3...v1.27.0) (2025-08-07)


### Features

* branch previews ([66cf791](https://github.com/cds-snc/ai-answers/commit/66cf7913e87cd0ababc025b2a05617977dff8790))
* delete after 14 days instead of 21 ([760a6a4](https://github.com/cds-snc/ai-answers/commit/760a6a494d84a8309ef755f3a1b8fb6bf3ae0442))
* delete previous comments for review environment URL ([2830b9d](https://github.com/cds-snc/ai-answers/commit/2830b9db4b38773283f8f8b451c236653792ff06))
* remove renovate PR exclusion for cleanup workflow ([e079099](https://github.com/cds-snc/ai-answers/commit/e079099f801e9194c83072df52fd92114ccce5a9))


### Bug Fixes

* add retry mechanism to prevent Lambda deployment race condition ([5b09c44](https://github.com/cds-snc/ai-answers/commit/5b09c448570d0470d97be33f976c140a57377fa0))
* add retry mechanism to prevent Lambda deployment race condition ([f16f74f](https://github.com/cds-snc/ai-answers/commit/f16f74f0c3c237d4382f8c5017155b3a9c865cb7))
* critical fix leaked secrets from script. ([b6e5b93](https://github.com/cds-snc/ai-answers/commit/b6e5b93cb4c76107197d702e3725827c9ed485a4))
* delete since we want pr review envs for everything. ([d3d71dc](https://github.com/cds-snc/ai-answers/commit/d3d71dc99e3237384a8785610816bdee7fd515d7))
* dont leak secrets. ([9aaccb7](https://github.com/cds-snc/ai-answers/commit/9aaccb7eb99f85f95fe5363e64c9a1134a5915d3))
* remove error output var and call command directly. ([9ca7373](https://github.com/cds-snc/ai-answers/commit/9ca737398ff57217b18c06a887e49d25ecc4145b))
* remove step since the IAM role should always exist ([3c269cb](https://github.com/cds-snc/ai-answers/commit/3c269cb56ee9df96b42bf1a5a5d0510b6f5557a2))
* remove to prevent accidental secret disclosure in env vars. ([85a4f0d](https://github.com/cds-snc/ai-answers/commit/85a4f0d30f3dfcf913278fc4f7eec8e287349b10))
* this step should wait or fail. ([1ebfdf4](https://github.com/cds-snc/ai-answers/commit/1ebfdf46b2756f75e1f727dc4ef4fca9de273257))

## [1.26.3](https://github.com/cds-snc/ai-answers/compare/v1.26.2...v1.26.3) (2025-08-06)


### Bug Fixes

* enhance short query validation in ChatPipelineService and update user message count in ChatAppContainer ([854590c](https://github.com/cds-snc/ai-answers/commit/854590c90de4bd11992e6564b96aef8822b3f944))
* modify short query error handling to append messages instead of removing them ([34081e7](https://github.com/cds-snc/ai-answers/commit/34081e7db77848a96dea6888f3a40eca9591373a))
* refine userMessageId handling and enhance sentence count extraction in ChatInterface ([c022c2d](https://github.com/cds-snc/ai-answers/commit/c022c2db6e2f8440db2d652cc63ba50583988cba))
* streamline message rendering in ChatInterface and update userMessageId handling ([c4a5d5e](https://github.com/cds-snc/ai-answers/commit/c4a5d5e7aa41046dc328d424634b3035c0c8a266))
* update site status return value from 'unavailable' to 'available' ([7f4d7c3](https://github.com/cds-snc/ai-answers/commit/7f4d7c35a5c99a030e054c7e4086a06b1dbb7cfe))
* update site status return value to 'available' and simplify service status handling ([12f1eab](https://github.com/cds-snc/ai-answers/commit/12f1eab6007283f3bb5dd39c1f9a29b177385338))
* update userMessageId calculation for AI messages in ChatInterface ([7da3c5a](https://github.com/cds-snc/ai-answers/commit/7da3c5a14c653a0449264d4bbece9693849d944a))
* update userMessageId handling and improve sentence count extraction in ChatInterface ([6fad5c9](https://github.com/cds-snc/ai-answers/commit/6fad5c96240db7b2ba64b1738f83a64d37442b88))
* update userMessageId handling in ChatInterface and adjust parameters in processResponse ([cf99d6b](https://github.com/cds-snc/ai-answers/commit/cf99d6bfe5eaadba3a8bc2d787df957a081f2037))

## [1.26.2](https://github.com/cds-snc/ai-answers/compare/v1.26.1...v1.26.2) (2025-08-06)


### Bug Fixes

* finesse-search-query ([9bbf84e](https://github.com/cds-snc/ai-answers/commit/9bbf84e549cfde4ecc40e990e1a3769250f79ea1))
* finesse-search-query ([2389d72](https://github.com/cds-snc/ai-answers/commit/2389d726822edcded79d1f2dcef51e877db5b96f))
* improve handling of short user queries in chat pipeline ([d89b0a3](https://github.com/cds-snc/ai-answers/commit/d89b0a3ccd0e75dad9a4aef8c8a3504bcac287c2))
* improve handling of short user queries in chat pipeline ([2117eb5](https://github.com/cds-snc/ai-answers/commit/2117eb59101aa61c40df2fabf45d27784180dc3d))

## [1.26.1](https://github.com/cds-snc/ai-answers/compare/v1.26.0...v1.26.1) (2025-08-05)


### Bug Fixes

* example simplified ([e25182f](https://github.com/cds-snc/ai-answers/commit/e25182f78f8850aae5ba1e815cd3994c8627060c))
* update need-permit url ([e99a132](https://github.com/cds-snc/ai-answers/commit/e99a132b50fe9d1d8b4c22c1b263fa05c1efe338))

## [1.26.0](https://github.com/cds-snc/ai-answers/compare/v1.25.0...v1.26.0) (2025-08-05)


### Features

* enhance URL checking logic with HEAD request fallback and impro… ([93efe3d](https://github.com/cds-snc/ai-answers/commit/93efe3d978a4e8066557cc272f2441e63afad8d2))
* enhance URL checking logic with HEAD request fallback and improved error handling ([b233624](https://github.com/cds-snc/ai-answers/commit/b233624a5287ca670be493932e30d8a896199ba0))

## [1.25.0](https://github.com/cds-snc/ai-answers/compare/v1.24.0...v1.25.0) (2025-08-05)


### Features

* implement delete expert evaluation functionality with UI component ([aa4f8e6](https://github.com/cds-snc/ai-answers/commit/aa4f8e6d97bc199e6a3921cf0d2d5c6c25b7320d))

## [1.24.0](https://github.com/cds-snc/ai-answers/compare/v1.23.0...v1.24.0) (2025-08-05)


### Features

* implement branch deletion script for merged branches ([f790577](https://github.com/cds-snc/ai-answers/commit/f7905770af1477970f818410c7088cd09a5d801c))

## [1.23.0](https://github.com/cds-snc/ai-answers/compare/v1.22.0...v1.23.0) (2025-08-05)


### Features

* add log level filter to ChatViewer for improved log management ([d3fe837](https://github.com/cds-snc/ai-answers/commit/d3fe837d039e2c13cbd3780edc8ebdca0e0ea9a6))


### Bug Fixes

* update loadSystemPrompt to include chatId for improved logging ([5c595bd](https://github.com/cds-snc/ai-answers/commit/5c595bdb334b65159cfa0f83f1591cdf98bb1e26))

## [1.22.0](https://github.com/cds-snc/ai-answers/compare/v1.21.1...v1.22.0) (2025-08-01)


### Features

* add createSearchAgent for enhanced search capabilities using 4o-mini model ([e7f0026](https://github.com/cds-snc/ai-answers/commit/e7f00269fa77b616e5f594c5e965fe5b7d18747b))
* add search agent prompt for language translation and query formatting ([4b87c33](https://github.com/cds-snc/ai-answers/commit/4b87c33424995a60abcdd017a25fbbdabc9ff751))
* add searchQuery, translatedQuestion, and originalLang fields to context schema ([dca1dc2](https://github.com/cds-snc/ai-answers/commit/dca1dc2e9ec8282620071b0c4df8fe0ba6b98e3e))
* enhance search handler to integrate SearchAgentService for improved query processing ([1fa3b4a](https://github.com/cds-snc/ai-answers/commit/1fa3b4ab75164df50e1ba45f627820e02ba6b0d3))
* explicitly set new context fields in interaction handling ([974be8a](https://github.com/cds-snc/ai-answers/commit/974be8a943fb0520fef55239df2e4b4e8f64cc5e))
* extend contextSearch and deriveContext to include agentType and additional context fields ([18e4ab4](https://github.com/cds-snc/ai-answers/commit/18e4ab4476f52413125306ec96ae748e7aa26969))
* implement invokeSearchAgent function for handling search agent interactions ([3acdeb5](https://github.com/cds-snc/ai-answers/commit/3acdeb5ef5f8c3f68c9bf53ffbf69dd384aacfd8))


### Bug Fixes

* follow-on-context-ircc-rcmp ([f2f0ece](https://github.com/cds-snc/ai-answers/commit/f2f0eceba17570e21fd4287c806272b9d2c071b5))
* follow-on-context-ircc-rcmp ([b7926d4](https://github.com/cds-snc/ai-answers/commit/b7926d46f88cf15e36070c67792d2941f3d20d56))
* manipulation-names ([cfc1adf](https://github.com/cds-snc/ai-answers/commit/cfc1adf228b28a9b3ff1f8e59c99b304da5c84c1))
* manipulation-names ([cb9a652](https://github.com/cds-snc/ai-answers/commit/cb9a65258f67572f42d29a1ed894497902eec628))
* revert-to-original ([4a33d32](https://github.com/cds-snc/ai-answers/commit/4a33d321fb7ec82e44a78a076722515045135db5))


### Code Refactoring

* remove explicit setting of new context fields in interaction handling ([a91dc52](https://github.com/cds-snc/ai-answers/commit/a91dc524618a52342cae14497d557b852a920588))

## [1.21.1](https://github.com/cds-snc/ai-answers/compare/v1.21.0...v1.21.1) (2025-07-31)


### Bug Fixes

* add-CIRNAC-to-ISC-Scenarios ([0e90c5b](https://github.com/cds-snc/ai-answers/commit/0e90c5b6c216a8d0f66ac37a80cd6354560fd8e6))
* optimize evaluation deletion logic and improve expert feedback h… ([49121f1](https://github.com/cds-snc/ai-answers/commit/49121f19dc6e88eb3483686fc0a49d9d40fa574b))
* optimize evaluation deletion logic and improve expert feedback handling ([66dc31b](https://github.com/cds-snc/ai-answers/commit/66dc31be052ee13760f4837af07fbb67104d1d06))

## [1.21.0](https://github.com/cds-snc/ai-answers/compare/v1.20.0...v1.21.0) (2025-07-30)


### Features

* add User-Agent header to URL check requests ([9d7e630](https://github.com/cds-snc/ai-answers/commit/9d7e630dc90e04cf786c58edb6590ca499a8eae2))
* enhance expert feedback handling in QA match fallback ([422e8e6](https://github.com/cds-snc/ai-answers/commit/422e8e63932295dc202a9f31811c37e8697ab288))
* implement URL validation handler for Canada.ca domains and integrate with existing services ([c7ff67d](https://github.com/cds-snc/ai-answers/commit/c7ff67d8c026acfda40aff8ca02affe738c6473a))
* remove logging of the database connection string ([fdf0d5c](https://github.com/cds-snc/ai-answers/commit/fdf0d5cecf9e83600423b60e35e26a27efb8032e))


### Bug Fixes

* update search page URL pattern to allow query parameters in citation scoring ([fbc0cf9](https://github.com/cds-snc/ai-answers/commit/fbc0cf957333189f056149b1cda80d954c12e872))

## [1.20.0](https://github.com/cds-snc/ai-answers/compare/v1.19.1...v1.20.0) (2025-07-30)


### Features

* add support for deleting only empty evaluations and update related services ([02f68fc](https://github.com/cds-snc/ai-answers/commit/02f68fc7359748b28ab41d14dc2e72171b0dedfa))
* remove unused dbDeleteEvalsHandler import and endpoint ([1a0dee7](https://github.com/cds-snc/ai-answers/commit/1a0dee748846bcac39e350917a7ff431b4c9c26c))
* remove unused dbDeleteEvalsHandler import and endpoint ([579a114](https://github.com/cds-snc/ai-answers/commit/579a114b8ce170ec0d67144036220b286d6048b1))
* track initialization duration in IMVectorService and update logging ([7503a66](https://github.com/cds-snc/ai-answers/commit/7503a6660d54249723c717c5d41c644e63c8a409))
* update memory usage reporting and enhance stats retrieval in IMVectorService ([36e2888](https://github.com/cds-snc/ai-answers/commit/36e2888553daddabb0e0195a838507435b4cca76))
* update VectorService initialization to allow usage during startup ([de3ea29](https://github.com/cds-snc/ai-answers/commit/de3ea29be1038ef531e6ec97745f4d2ff22c2937))


### Bug Fixes

* hide feedback at start ([84904ec](https://github.com/cds-snc/ai-answers/commit/84904eca964b1011fc638a27b34cf40d9c540b9e))

## [1.19.1](https://github.com/cds-snc/ai-answers/compare/v1.19.0...v1.19.1) (2025-07-30)


### Bug Fixes

* add business benefits finder ([c4ab992](https://github.com/cds-snc/ai-answers/commit/c4ab9923c8a3ddadda3157020c7cc80ab573842d))
* add business benefits finder ([db187e1](https://github.com/cds-snc/ai-answers/commit/db187e17be83cb6d07215e696456fce12b78e955))
* department-context-bilingual ([990f12b](https://github.com/cds-snc/ai-answers/commit/990f12b3d63cb3b28de9bc974c03366443df3585))
* department-context-bilingual ([da32567](https://github.com/cds-snc/ai-answers/commit/da32567b89428298284a96068e83bb548194b39e))
* political questions in agenticBase ([da32567](https://github.com/cds-snc/ai-answers/commit/da32567b89428298284a96068e83bb548194b39e))

## [1.19.0](https://github.com/cds-snc/ai-answers/compare/v1.18.0...v1.19.0) (2025-07-29)


### Features

* Increase log fetch limit to 500 and add 'harmful' metric tracking ([3591566](https://github.com/cds-snc/ai-answers/commit/3591566a63b0fea55e6e1039ce4b34e8665ce85f))

## [1.18.0](https://github.com/cds-snc/ai-answers/compare/v1.17.0...v1.18.0) (2025-07-29)


### Features

* add concurrent initialization guard to VectorService classes ([5022fab](https://github.com/cds-snc/ai-answers/commit/5022fab71f901a7ae5374714695e0fe2d6041c2f))

## [1.17.0](https://github.com/cds-snc/ai-answers/compare/v1.16.0...v1.17.0) (2025-07-29)


### Features

* Enhance chat logs and metrics handling ([2acb313](https://github.com/cds-snc/ai-answers/commit/2acb3132abfd1365682a033a91e2a0cdc3e05969))
* Enhance chat logs and metrics handling ([7b330a4](https://github.com/cds-snc/ai-answers/commit/7b330a4570346e53f453e4428111a6d5275d39c4))

## [1.16.0](https://github.com/cds-snc/ai-answers/compare/v1.15.0...v1.16.0) (2025-07-29)


### Features

* add EndUserFeedbackSection component for displaying user feedba… ([58c5da7](https://github.com/cds-snc/ai-answers/commit/58c5da7a8234b772b0ee870e9adb5e313c21bc2e))

## [1.15.0](https://github.com/cds-snc/ai-answers/compare/v1.14.1...v1.15.0) (2025-07-28)


### Features

* add getSetting and setSetting methods to DataStoreService for improved settings management ([cfd8c36](https://github.com/cds-snc/ai-answers/commit/cfd8c36a272a312020d8b4d05103f907fe541513))
* add imvectordb dependency to package.json and package-lock.json ([5999766](https://github.com/cds-snc/ai-answers/commit/599976649b0309779b4a114462b928acb9b5ccc4))
* add link to Vector Administration in AdminPage navigation ([783da5d](https://github.com/cds-snc/ai-answers/commit/783da5da5235f2c0c580fd90aade722d4c1e38f3))
* add SimilarChatsDashboard component for fetching and displaying similar chats ([02857ae](https://github.com/cds-snc/ai-answers/commit/02857ae54090a77aeca3690e27d4c799460629fb))
* add vector administration and service type options to localization files ([133080e](https://github.com/cds-snc/ai-answers/commit/133080eb21fc47e5bc02ee809ee1137cca15345c))
* add vector page routes for English and French languages ([e2e0f0f](https://github.com/cds-snc/ai-answers/commit/e2e0f0fcce81c705f69235a043b96723c1116cab))
* add vector reinitialize handler for reinitializing VectorService ([f0b3746](https://github.com/cds-snc/ai-answers/commit/f0b3746a8fae61222c0ed279636ea9b71155e30d))
* add vector service type selection and update settings management ([2faa1c7](https://github.com/cds-snc/ai-answers/commit/2faa1c70705de06bf66e49a95a9975ae79b67687))
* add vector stats API endpoint with protection middleware ([d6ee403](https://github.com/cds-snc/ai-answers/commit/d6ee403a76d15ce0b1c6be5104946e1e5606b3c0))
* add VectorPage component for managing vector indexes and embeddings ([0182bdd](https://github.com/cds-snc/ai-answers/commit/0182bdd9655afafbf66fd11db5e43dd6275a7ec1))
* enhance findSimilarChats method to use configurable similarity threshold ([3547ace](https://github.com/cds-snc/ai-answers/commit/3547ace7bcf7b3af31523b9fd34f124b55bc72a4))
* enhance sentenceMatchTraceSchema for improved traceability and optional fields ([748d8b5](https://github.com/cds-snc/ai-answers/commit/748d8b5d376a05d214c68ea4b4913547f3d34d63))
* implement DocDBVectorService for vector management and search functionality ([9f15c90](https://github.com/cds-snc/ai-answers/commit/9f15c90643d33eb282e8b6bfb07ed4b56978dc6b))
* implement generateEvals and deleteEvals methods in EvaluationService for evaluation management ([207ee90](https://github.com/cds-snc/ai-answers/commit/207ee904b7acc9675aa58a7cb2de2d9a87bf4174))
* implement getSiteStatus method in DataStoreService for fetching site availability ([e3865bd](https://github.com/cds-snc/ai-answers/commit/e3865bda5f7bdd214e0ca35c74ccd6642e201a74))
* implement getSiteStatus method in DataStoreService for fetching… ([a181b70](https://github.com/cds-snc/ai-answers/commit/a181b701d7813a5add4446813b713586eaea8284))
* implement IMVectorService with embedding management and search functionality ([622b457](https://github.com/cds-snc/ai-answers/commit/622b4579c7074d5a21dcadfd2dcfc192d898dd75))
* implement QA high score fallback for evaluation and enhance embedding similarity search using VectorService ([0e06bdc](https://github.com/cds-snc/ai-answers/commit/0e06bdce7e1690e7a65b78774790edee4830381b))
* implement similarChatsHandler for retrieving similar chats based on embeddings ([e8f2fe2](https://github.com/cds-snc/ai-answers/commit/e8f2fe242b66a9c222635168d65f0ca0b88b8afc))
* implement VectorService for managing embeddings and interactions with validation and memory usage tracking ([db59d9d](https://github.com/cds-snc/ai-answers/commit/db59d9d1ce5b15d5f0c6c83e7577905fed6fc8f1))
* implement VectorServiceFactory for initializing vector services ([8d3162c](https://github.com/cds-snc/ai-answers/commit/8d3162c3bb1d2d972e7d7b45fbc8fe620f21c230))
* integrate vector service initialization and add new vector API endpoints ([596efe4](https://github.com/cds-snc/ai-answers/commit/596efe4c9149860ad503ea25b1917c77a76c252f))
* integrate VectorService for embedding initialization and enhance server startup process ([e0cb01a](https://github.com/cds-snc/ai-answers/commit/e0cb01a6db111200d8e7eb98f33817741a9edb91))
* refactor import of VectorService to use VectorServiceFactory ([67cac2b](https://github.com/cds-snc/ai-answers/commit/67cac2b8d875ccad6b03bcb16049a22759d9dea2))
* refactor VectorService import to use VectorServiceFactory ([bac0c11](https://github.com/cds-snc/ai-answers/commit/bac0c1129c789af70827206f364078c97413afc2))
* remove unused evaluation methods from DataStoreService ([af58c34](https://github.com/cds-snc/ai-answers/commit/af58c345701cef76c53762dd2270e0dcb1f51522))
* remove VectorService implementation and related functionality ([8afa1ad](https://github.com/cds-snc/ai-answers/commit/8afa1ad2c7fee9e5a9806498b4edb72892029fd5))
* update evalNonEmptyCountHandler to count full evaluations and integrate VectorService for expert feedback embeddings ([2365784](https://github.com/cds-snc/ai-answers/commit/2365784299c5e7a83a4ec9791d64a8b53f4b476b))
* update evaluation and vector administration labels in localization files ([fc27314](https://github.com/cds-snc/ai-answers/commit/fc273147dfcdbbddf4d55373419159f0fe133d57))
* update evaluation processing logic and adjust similarity thresholds in config ([5ce107b](https://github.com/cds-snc/ai-answers/commit/5ce107b7d9d74c02a87643ce937c6adb467a3069))
* update findSimilarChats method to use configurable similarity threshold ([7c4c23c](https://github.com/cds-snc/ai-answers/commit/7c4c23cc3da6682839565310b415d9bf925eca60))
* update navigation label in AdminPage and refine EvalPage by removing unused embedding logic ([db0b7bd](https://github.com/cds-snc/ai-answers/commit/db0b7bd14621840a3f934b1f3468afbd95cb30bd))
* update site status fetching to use settings management ([852d498](https://github.com/cds-snc/ai-answers/commit/852d498878c6b34b0e94798aa8a796b3955ed048))


### Bug Fixes

* comment out vector service initialization for debugging purposes ([bf81762](https://github.com/cds-snc/ai-answers/commit/bf81762783dbb026ce0cfaf5d3285991e057eff4))
* comment out vector service initialization for debugging purposes ([8e9d3d4](https://github.com/cds-snc/ai-answers/commit/8e9d3d43f5e5bb629386f251bec0ac24d5bc5ef5))
* update envFile path in launch configuration to use root .env ([9014cce](https://github.com/cds-snc/ai-answers/commit/9014cce48a36ae3f6ccd5582c7304e58b94ee13e))


### Code Refactoring

* replace DataStoreService with EvaluationService for evaluation-related functions ([baadc1e](https://github.com/cds-snc/ai-answers/commit/baadc1e136e10d02bb4917c2705cb4da634e5cfa))

## [1.14.1](https://github.com/cds-snc/ai-answers/compare/v1.14.0...v1.14.1) (2025-07-22)


### Bug Fixes

* enhance FilterPanel to reset date range and preset value on filt… ([6a9fb54](https://github.com/cds-snc/ai-answers/commit/6a9fb5488cb00023137bf6c70f915b7c7dd51c55))
* enhance FilterPanel to reset date range and preset value on filter type change ([e6d381b](https://github.com/cds-snc/ai-answers/commit/e6d381b9dc79f7b6556713f4602dd5abbf07c61f))
* simplify date filter handling and remove unused parameter conversion in dashboards ([1638cb5](https://github.com/cds-snc/ai-answers/commit/1638cb56c29bd9e382d9192838c6e1f03cd57810))

## [1.14.0](https://github.com/cds-snc/ai-answers/compare/v1.13.1...v1.14.0) (2025-07-22)


### Features

* add skipEmptyCleanup option to eval generation and update simil… ([69dc39f](https://github.com/cds-snc/ai-answers/commit/69dc39fd947c628a5adcb692eb76179a5dead62e))
* add skipEmptyCleanup option to eval generation and update similarity thresholds ([d648e5c](https://github.com/cds-snc/ai-answers/commit/d648e5c0c212694bf29c000c2987b7f7d140d0a8))


### Bug Fixes

* remove pagination logic from chat logs handler and update relate… ([1fb0415](https://github.com/cds-snc/ai-answers/commit/1fb0415e4cb9fbfc58a7c7b12825129b5bc80e72))
* remove pagination logic from chat logs handler and update related components ([204d0f4](https://github.com/cds-snc/ai-answers/commit/204d0f4f2c5fa08562de5c0f33e221be4ec167e5))

## [1.13.1](https://github.com/cds-snc/ai-answers/compare/v1.13.0...v1.13.1) (2025-07-18)


### Bug Fixes

* improve export logic by implementing pagination with lastId tracking ([ddb5d1f](https://github.com/cds-snc/ai-answers/commit/ddb5d1f68d9834861b61a1e92fb600f5ea50e675))


### Miscellaneous Chores

* comment out fargate resource configurations in staging environment ([5ff139f](https://github.com/cds-snc/ai-answers/commit/5ff139fcb58b00c219b9f1ba7348394d56b8b2c9))

## [1.13.0](https://github.com/cds-snc/ai-answers/compare/v1.12.0...v1.13.0) (2025-07-18)


### Features

* add export limit input and logging for database export operations ([74af3c9](https://github.com/cds-snc/ai-answers/commit/74af3c9ad5116330eecaf1dc7ab0dc0620724dff))
* add export limit input and logging for database export operations ([abd39fa](https://github.com/cds-snc/ai-answers/commit/abd39fac928040ee2db99ccc4b5133eb798a503d))


### Bug Fixes

* increase Fargate memory to 16GB for production and staging envir… ([288134c](https://github.com/cds-snc/ai-answers/commit/288134c4fc3d43fb5746b159fd6bd4230020bd2f))
* increase Fargate memory to 16GB for production and staging environments ([af591bb](https://github.com/cds-snc/ai-answers/commit/af591bb6b499e739097a98d7861cfb3076c0b7b8))

## [1.12.0](https://github.com/cds-snc/ai-answers/compare/v1.11.0...v1.12.0) (2025-07-18)


### Features

* add API endpoint to delete evaluations within a date range and implement corresponding handler ([080a9a2](https://github.com/cds-snc/ai-answers/commit/080a9a26cf3483bcb39797ac78dbcfb0d4dc4871))
* enhance database export functionality with collection selection and date range ([27d04c3](https://github.com/cds-snc/ai-answers/commit/27d04c33d7d54fbd34623eceb0754f3466318c71))
* implement non-empty eval count endpoint and integrate with Data… ([9671982](https://github.com/cds-snc/ai-answers/commit/96719827eee79dad82c13682e612bc8ede207628))
* implement non-empty eval count endpoint and integrate with DataStoreService ([27d04c3](https://github.com/cds-snc/ai-answers/commit/27d04c33d7d54fbd34623eceb0754f3466318c71))


### Bug Fixes

* adjust export chunk sizes for improved performance ([b5e00c8](https://github.com/cds-snc/ai-answers/commit/b5e00c80e7e2d99f50acdbc130d264f20fcd1bf4))
* adjust export chunk sizes for improved performance ([c7868ed](https://github.com/cds-snc/ai-answers/commit/c7868edf698fc21c728816c71835c67802a2c20a))
* increase fetch timeout to 5 minutes for improved reliability ([edcb424](https://github.com/cds-snc/ai-answers/commit/edcb424755584b4fbfda789dc57a681ad21a4d11))
* update evalBatchProcessingDuration to 30 seconds and ensure evalConcurrency is set ([565168d](https://github.com/cds-snc/ai-answers/commit/565168d3cadb00721f39f2d1b813703a0f511aff))
* update evaluation processing to include time filters and improve empty eval handling ([27d04c3](https://github.com/cds-snc/ai-answers/commit/27d04c33d7d54fbd34623eceb0754f3466318c71))


### Miscellaneous Chores

* update eval configuration for improved performance and limits ([27d04c3](https://github.com/cds-snc/ai-answers/commit/27d04c33d7d54fbd34623eceb0754f3466318c71))

## [1.11.0](https://github.com/cds-snc/ai-answers/compare/v1.10.11...v1.11.0) (2025-07-17)


### Features

* temp fix to margin shenangians ([2871266](https://github.com/cds-snc/ai-answers/commit/2871266db6d59cbd684ce91e639a7443135be7ad))
* temp fix to margin shenangians ([0401652](https://github.com/cds-snc/ai-answers/commit/04016524033684f0346f28241ea42901ee3614c8))


### Bug Fixes

* admin-filter-panel ([cb1b3e0](https://github.com/cds-snc/ai-answers/commit/cb1b3e08aab7bf84a14f597051ab4f68a274ee0c))
* citation link mobile ([814d43c](https://github.com/cds-snc/ai-answers/commit/814d43cf318b37638fd7f58dc47870e40e1d944e))
* clean-up-messages ([d896351](https://github.com/cds-snc/ai-answers/commit/d89635127b348b47bcf22b95dccb1ab46f274d87))
* clean-up-messages ([2a89e3e](https://github.com/cds-snc/ai-answers/commit/2a89e3e31e4e5552d4f90f2c838736f79c5bb083))
* did a thing ([c918164](https://github.com/cds-snc/ai-answers/commit/c918164c3c6bd6d44146d4cf869f712d5009c9de))
* format-load-one-day ([5d40cd1](https://github.com/cds-snc/ai-answers/commit/5d40cd1b361ef06ddac5619f02f5739d8b4b62b7))
* format-load-one-day ([62d38d8](https://github.com/cds-snc/ai-answers/commit/62d38d86b66a7386833628157c41004ac0a798a1))
* local and codespace debugging ([b0e2208](https://github.com/cds-snc/ai-answers/commit/b0e22087e13508a84797f55c146c2735065279b4))
* mobile font for chat ([c41ee16](https://github.com/cds-snc/ai-answers/commit/c41ee16912b36d493e4f9dfa9d50cd32518d5f7f))
* mobile size ([f76025c](https://github.com/cds-snc/ai-answers/commit/f76025c894a29869b71552767e6acf99fd8d0aa6))
* pagination-only-for-chatlogs ([334affa](https://github.com/cds-snc/ai-answers/commit/334affa1c3c8dc73fd7725f2e6c9174c4f82a468))
* passport-fees-refugees ([af4137d](https://github.com/cds-snc/ai-answers/commit/af4137dfd64e36e1e28c569a1cc5363a8628ff20))
* passport-fees-refugees ([98b1898](https://github.com/cds-snc/ai-answers/commit/98b1898076867086d10d6404630a65c72f0e0b42))


### Miscellaneous Chores

* update Dockerfile to install socat and clean up apt cache; modify ECS config to enable execute command in staging ([eeb0588](https://github.com/cds-snc/ai-answers/commit/eeb0588218ead1139065b33a1d0f6a6898c146fb))


### Code Refactoring

* enhance chat logs filtering with aggregation pipeline for department and referring URL ([a69ab72](https://github.com/cds-snc/ai-answers/commit/a69ab72945682e32730b8fe52e19cdba99e999d4))
* improve chat logs filtering with enhanced date handling and aggregation pipeline ([ab6b07c](https://github.com/cds-snc/ai-answers/commit/ab6b07c6925aede09e9111169eb07e1a68f234fa))
* improve chat logs filtering with enhanced date handling and… ([fb75ec6](https://github.com/cds-snc/ai-answers/commit/fb75ec6c6d060d3bfbeb9b9ef4ae46920058d912))
* improve logging and cleanup in in-memory MongoDB setup ([b5bcc75](https://github.com/cds-snc/ai-answers/commit/b5bcc75861503e6fac71fccd25b43fa57abb54fa))

## [1.10.11](https://github.com/cds-snc/ai-answers/compare/v1.10.10...v1.10.11) (2025-07-14)


### Bug Fixes

* correct typo in SAN entries for production environment ([0f4b801](https://github.com/cds-snc/ai-answers/commit/0f4b801d2b23536e6c23f3b5b2c25d8584a87c6a))
* correct typo in SAN entries for production environment ([626abf0](https://github.com/cds-snc/ai-answers/commit/626abf028bd2d98cf633fabd4a130cbf3625cd09))

## [1.10.10](https://github.com/cds-snc/ai-answers/compare/v1.10.9...v1.10.10) (2025-07-14)


### Bug Fixes

* update SAN handling in ACM certificate and add variable definiti… ([89631f2](https://github.com/cds-snc/ai-answers/commit/89631f2cc20e95837830e73b542ee3843b432e6a))

## [1.10.9](https://github.com/cds-snc/ai-answers/compare/v1.10.8...v1.10.9) (2025-07-11)


### Bug Fixes

* documents ([20cb8d8](https://github.com/cds-snc/ai-answers/commit/20cb8d8018a6d88bd26520aeef2f4fe1a105ff6e))
* imm-text-final ([835f31f](https://github.com/cds-snc/ai-answers/commit/835f31f48b469e85e615032eb6b2a8c91858765a))
* manipulation-reminder ([e7494dd](https://github.com/cds-snc/ai-answers/commit/e7494dd380d649605dd4603d0b9e397ad5a0fdf9))

## [1.10.8](https://github.com/cds-snc/ai-answers/compare/v1.10.7...v1.10.8) (2025-07-10)


### Bug Fixes

* block-robots ([394d033](https://github.com/cds-snc/ai-answers/commit/394d033d0c16ec905b0db10c91784b5dabd0c7ae))
* documents ([e4fb7eb](https://github.com/cds-snc/ai-answers/commit/e4fb7ebfb953576f8994c9f57eac1657eaa737c4))

## [1.10.7](https://github.com/cds-snc/ai-answers/compare/v1.10.6...v1.10.7) (2025-07-09)


### Bug Fixes

* character-limit ([494750e](https://github.com/cds-snc/ai-answers/commit/494750ed882087de0bd9fe374ffcad4d066376af))
* redact-emojis-treat-as-profanity ([77a98b0](https://github.com/cds-snc/ai-answers/commit/77a98b0d444c1156c68c46cc479a93dc66000eea))
* revert emoji-stripping changes from PR [#229](https://github.com/cds-snc/ai-answers/issues/229) ([8bc7632](https://github.com/cds-snc/ai-answers/commit/8bc7632f7e098fba6cf08f665133d13b3f4a90ce))
* revert emoji-stripping changes from PR [#229](https://github.com/cds-snc/ai-answers/issues/229) ([33cdb29](https://github.com/cds-snc/ai-answers/commit/33cdb29465b6df4a78795c84ea41d32cc4eadb54))
* revisions ([d55b074](https://github.com/cds-snc/ai-answers/commit/d55b0743e362e4a2b627b42c07bd8f2845b978f4))

## [1.10.6](https://github.com/cds-snc/ai-answers/compare/v1.10.5...v1.10.6) (2025-07-07)


### Bug Fixes

* add-emoji-stripping-to-redactionService ([fc6a8c3](https://github.com/cds-snc/ai-answers/commit/fc6a8c3788668193c9c73cf04f2d5ad8452664de))

## [1.10.5](https://github.com/cds-snc/ai-answers/compare/v1.10.4...v1.10.5) (2025-07-04)


### Bug Fixes

* missed prompts ([928cbc5](https://github.com/cds-snc/ai-answers/commit/928cbc564ff08845459f58e58cef061a09907338))
* update docs add system card ([829f558](https://github.com/cds-snc/ai-answers/commit/829f55815e90dff29e945713318c6595cd1cbce9))

## [1.10.4](https://github.com/cds-snc/ai-answers/compare/v1.10.3...v1.10.4) (2025-07-03)


### Bug Fixes

* final-tweak ([4c3a2ef](https://github.com/cds-snc/ai-answers/commit/4c3a2efd5f2bc4f075e03f1278455b4e2484dd8e))
* generic name pattern removed ([2c7cece](https://github.com/cds-snc/ai-answers/commit/2c7cecec34be4b56f14e5fb27d82b69eefd81ce3))
* name-patterns ([e8b8dbc](https://github.com/cds-snc/ai-answers/commit/e8b8dbc4d2ccc2776846b79e06d321efa74deaaa))

## [1.10.3](https://github.com/cds-snc/ai-answers/compare/v1.10.2...v1.10.3) (2025-06-27)


### Bug Fixes

* simplify chat fetching by removing aggregation and enhancing interaction filtering ([c7353a1](https://github.com/cds-snc/ai-answers/commit/c7353a1ca82cb53c01d25aefdd47e3ddabc47e41))
* streamline context lookup for filtered interactions and enhance date handling ([0184188](https://github.com/cds-snc/ai-answers/commit/018418861f2f6a615989f23e8fd4bbb0f3914db1))
* update health check URL to use dynamic port and add shell option… ([40efcfb](https://github.com/cds-snc/ai-answers/commit/40efcfb99866d86af977db478eb8258b5984b7d8))

## [1.10.2](https://github.com/cds-snc/ai-answers/compare/v1.10.1...v1.10.2) (2025-06-27)


### Bug Fixes

* correct aggregation logic for interactions and ensure proper dat… ([0037081](https://github.com/cds-snc/ai-answers/commit/0037081b4714c10db4190cbc42682c90b5134521))
* correct aggregation logic for interactions and ensure proper date handling ([e74458a](https://github.com/cds-snc/ai-answers/commit/e74458a24fcea8bfcf66c32884d5052b4885c251))

## [1.10.1](https://github.com/cds-snc/ai-answers/compare/v1.10.0...v1.10.1) (2025-06-26)


### Bug Fixes

* enhance sentence count handling in AI messages and improve feedb… ([8a5dab1](https://github.com/cds-snc/ai-answers/commit/8a5dab1db081fd1ee369f3373c6bdfd16f03633f))
* enhance sentence count handling in AI messages and improve feedback component integration ([c4a8298](https://github.com/cds-snc/ai-answers/commit/c4a829873fac0754ebfac1963ccc42e490447748))

## [1.10.0](https://github.com/cds-snc/ai-answers/compare/v1.9.0...v1.10.0) (2025-06-26)


### Features

* refactor chat fetching to use aggregation for improved interact… ([d730377](https://github.com/cds-snc/ai-answers/commit/d73037753a64848e6733e0f6ac2e0aa130d8109a))
* refactor chat fetching to use aggregation for improved interaction handling ([805be26](https://github.com/cds-snc/ai-answers/commit/805be26af1ba6a253391cc03abf829cf33d162cf))


### Bug Fixes

* ensure date is always returned as ISO string in public evaluatio… ([f1c056e](https://github.com/cds-snc/ai-answers/commit/f1c056e9a70e31e95b5929079b55f8e5063095fa))
* ensure date is always returned as ISO string in public evaluation list ([b8f0bfe](https://github.com/cds-snc/ai-answers/commit/b8f0bfe5e9d4c274d84dc6feb74f562b3a635184))

## [1.9.0](https://github.com/cds-snc/ai-answers/compare/v1.8.1...v1.9.0) (2025-06-26)


### Features

* add date field to public evaluation and implement localized date formatting ([feb8ec2](https://github.com/cds-snc/ai-answers/commit/feb8ec268ce0f65f5156909ce3a29991590bfafa))

## [1.8.1](https://github.com/cds-snc/ai-answers/compare/v1.8.0...v1.8.1) (2025-06-24)


### Bug Fixes

* add repository condition to workflow jobs for consistency ([cf28a14](https://github.com/cds-snc/ai-answers/commit/cf28a14230ac20cfec74f3c624819719226b6a91))

## [1.8.0](https://github.com/cds-snc/ai-answers/compare/v1.7.3...v1.8.0) (2025-06-23)


### Features

* add .gitattributes for YAML file handling and ensure newline at end of apprunner.yaml ([6de9888](https://github.com/cds-snc/ai-answers/commit/6de9888fb927e6155730cefd55dd0e2306846b1a))
* add deployment workflow for AWS App Runner ([9ebfcb3](https://github.com/cds-snc/ai-answers/commit/9ebfcb34592f5cfa3e7dfda54222a19729ea546e))
* add GitHub Actions workflow for deploying to AWS App Runner ([7636696](https://github.com/cds-snc/ai-answers/commit/7636696ded7e916d8cf2dd8f69c1f80cd993ace9))
* add initial App Runner configuration file ([7dee23f](https://github.com/cds-snc/ai-answers/commit/7dee23f18d079c036603fa2ad41a7c30cd50ed07))
* add initial App Runner configuration YAML file ([2a7a013](https://github.com/cds-snc/ai-answers/commit/2a7a01358f800d48dbd8e8b4fb7b6067b5d530b4))
* add update-input.json for AWS App Runner configuration ([7836808](https://github.com/cds-snc/ai-answers/commit/783680824f2ee522671f362e2b9975b34b33f676))
* implement public feedback migration and integrate into existing workflows ([2a54f22](https://github.com/cds-snc/ai-answers/commit/2a54f22948896c990158f499eca5d59464e9c831))


### Bug Fixes

* add console logs for database connection string and options ([f1a402b](https://github.com/cds-snc/ai-answers/commit/f1a402bdd3923274ca4577f6bffbeab7622e1a60))
* add HealthCheckConfiguration to update-input.json and deploy-app-runner.yml ([64c192b](https://github.com/cds-snc/ai-answers/commit/64c192b4bb36295a347ea2249185b32f6ca4fe7e))
* add HealthCheckConfiguration to update-input.json and deploy-app-runner.yml ([dbec5fd](https://github.com/cds-snc/ai-answers/commit/dbec5fd71c9c20daccdcd5388c3a1a0c8f741a32))
* adjust formatting in apprunner.yaml for consistency ([5f1d5d5](https://github.com/cds-snc/ai-answers/commit/5f1d5d53260b195360c87f745951aef5b8624070))
* adjust formatting of workflow name in deploy-app-runner.yml ([e4764d4](https://github.com/cds-snc/ai-answers/commit/e4764d44f52ad160560dae444ec0e9407c4e00e2))
* clean up AWS App Runner deployment workflow by removing unnecessary echo statements and improving variable usage ([82fd5b1](https://github.com/cds-snc/ai-answers/commit/82fd5b1295f581b04306026aefe8d8483b1830c4))
* correct formatting of tlsCAFile in db-connect.js ([5ec29cd](https://github.com/cds-snc/ai-answers/commit/5ec29cd997ccda5f3e7c9ef41ce4084c4777c29c))
* correct formatting of unhealthyThreshold in apprunner.yaml ([75d3271](https://github.com/cds-snc/ai-answers/commit/75d32718124c83045638257631f65df7d4ad9e02))
* correct whitespace in connection string assignment in db-connect.js ([fdacd98](https://github.com/cds-snc/ai-answers/commit/fdacd98588200dfcfad3a7bf285b5fc0593cc6ec))
* enhance AWS App Runner deployment workflow by adding instance role ARN and improving JSON validation ([b272abf](https://github.com/cds-snc/ai-answers/commit/b272abfe71aba71879678a7d91c3d3468ad69690))
* enhance AWS App Runner deployment workflow with improved logging and added deployment run ID ([51f44ca](https://github.com/cds-snc/ai-answers/commit/51f44ca5c41f4ab8eaa8575f779e216562263cd5))
* enhance OIDC token debugging and improve permissions structure in deployment workflow ([5855fb6](https://github.com/cds-snc/ai-answers/commit/5855fb6573df1a5724053dba22fbf4293e496d00))
* enhance public feedback metrics handling and visualization in MetricsDashboard and EndUserFeedbackSection ([1402f31](https://github.com/cds-snc/ai-answers/commit/1402f319f6f1bebfae30f2d24615dd7eb718533f))
* improve AWS App Runner deployment workflow with better logging and retries ([b4e6f39](https://github.com/cds-snc/ai-answers/commit/b4e6f39154a5f32dbcf7e8a80aa34b7f973bc186))
* improve command structure and formatting in apprunner.yaml ([cddb1e5](https://github.com/cds-snc/ai-answers/commit/cddb1e58b0791347f29c5fda70353b5b50c45ffd))
* improve formatting and add deployment run ID in App Runner workflow ([4e61818](https://github.com/cds-snc/ai-answers/commit/4e618188ecb8bb869e570b5cfa2e07f674bb0442))
* improve formatting and enhance AWS App Runner deployment workflow ([88c7afd](https://github.com/cds-snc/ai-answers/commit/88c7afdcfa4d7e2bb453ad4e95549c7ed7996103))
* improve formatting and streamline AWS App Runner deployment workflow ([2c77f12](https://github.com/cds-snc/ai-answers/commit/2c77f1284407e06a3f9c3e63427282fe333d83ca))
* improve OIDC token debugging and clarify permissions in deployment workflow ([cc399e2](https://github.com/cds-snc/ai-answers/commit/cc399e2c468c8a69b80dc22fbe6a2300a5eb998c))
* improve OIDC token debugging and clean up AWS credentials configuration ([6ffb9e1](https://github.com/cds-snc/ai-answers/commit/6ffb9e10e2e9061fd92dbbcc3bf28c238429d6ad))
* prompts ([e4450db](https://github.com/cds-snc/ai-answers/commit/e4450db33189b704c4ea0e685db9f0f8ab18780f))
* refine expert and public feedback score checks in MetricsDashboard ([e54a730](https://github.com/cds-snc/ai-answers/commit/e54a730f26ae324d7124c44c95d66492d07171cf))
* refine expert and public feedback score checks in MetricsDashboard ([dd8e273](https://github.com/cds-snc/ai-answers/commit/dd8e273c1a8d5a1557bfdf05ca6b15d7787ed037))
* refine public feedback metrics handling and categorization ([a549c6a](https://github.com/cds-snc/ai-answers/commit/a549c6a370916555558578b21fb11c154e549c7c))
* remove apprunner.yaml configuration file ([0c17bab](https://github.com/cds-snc/ai-answers/commit/0c17babe82a3bac7cfae4eec636f650767e8dd39))
* remove commented default values from health check configuration ([b488e80](https://github.com/cds-snc/ai-answers/commit/b488e802a241cd9dc4e6e9d51f42e9e9ff665ffe))
* remove HealthCheckConfiguration from update-input.json and deploy-app-runner.yml ([b76b2bf](https://github.com/cds-snc/ai-answers/commit/b76b2bfab9ae1284a41ef8581160255053e00b01))
* remove HealthCheckConfiguration from update-input.json and deploy-app-runner.yml ([dc6ed10](https://github.com/cds-snc/ai-answers/commit/dc6ed10d6c623ac5f820cf4453a223318738857b))
* remove obsolete authentication configuration from App Runner deployment ([ac90b07](https://github.com/cds-snc/ai-answers/commit/ac90b072a8930ef67d7a6937b4d52c51a3b7ca27))
* remove space in deployment completion message for App Runner URL ([13d5c0f](https://github.com/cds-snc/ai-answers/commit/13d5c0fad328d9a7f06529dbced6cf29a547966c))
* remove unnecessary checkout step from deploy workflow ([452f39b](https://github.com/cds-snc/ai-answers/commit/452f39bfd5ee74270730d92fe27c61c27dcbac56))
* remove unnecessary steps from AWS App Runner deployment workflow ([4534aa1](https://github.com/cds-snc/ai-answers/commit/4534aa1b6113ce00a4d2efe6c50dd3a065480f3a))
* remove unnecessary whitespace in runtime declaration of apprunner.yaml ([4000f29](https://github.com/cds-snc/ai-answers/commit/4000f29b0b2c6a31f7dc93f251a3a2d838510bdb))
* remove unused echo statements and improve formatting in AWS App Runner deployment workflow ([73bcb30](https://github.com/cds-snc/ai-answers/commit/73bcb30ba13e1772c9ff79064433fc2a2756812c))
* remove unused environment variable declaration in apprunner.yaml ([4a7595e](https://github.com/cds-snc/ai-answers/commit/4a7595ea8a9b70c568268a693faa0a0c3e9349f6))
* remove unused update-input.json generation step from deployment workflow ([020ed7d](https://github.com/cds-snc/ai-answers/commit/020ed7dd7c3eeadee15db46ea239da6e22c110b9))
* reorganize network configuration and health settings in apprunner.yaml ([dd936e2](https://github.com/cds-snc/ai-answers/commit/dd936e2028a65b988666669483220ccb8c261c72))
* streamline AWS App Runner deployment workflow and enhance health check handling ([b80c059](https://github.com/cds-snc/ai-answers/commit/b80c059e971758cefa5b15468c9230add493d562))
* streamline AWS App Runner deployment workflow by removing unused instance role ARN and improving formatting ([9a3c1e8](https://github.com/cds-snc/ai-answers/commit/9a3c1e8d835c6dc5f45decedb258395424caafcc))
* streamline commands formatting in apprunner.yaml ([d1e8dcf](https://github.com/cds-snc/ai-answers/commit/d1e8dcf0289e8c7533dde47fc8f8d0f820f66d50))
* update App Runner deployment port from 8080 to 3001 ([ab363ce](https://github.com/cds-snc/ai-answers/commit/ab363ce7be4179cfc2f2770e2ac7ff842a956300))
* update App Runner workflow and configuration for environment variables ([cce8a7d](https://github.com/cds-snc/ai-answers/commit/cce8a7d3040857bbf9b8753fa14d251f8b859424))
* update AWS App Runner deployment configuration and remove obsolete update-input.json ([23c4ae2](https://github.com/cds-snc/ai-answers/commit/23c4ae26b8f67a99a758ef560b29399fc1197575))
* update AWS App Runner deployment workflow for improved reliability ([7eb2486](https://github.com/cds-snc/ai-answers/commit/7eb2486c0a749ed5e90514d9ea39721f15fde564))
* update AWS App Runner deployment workflow to streamline configuration and improve health check handling ([2a0cbbe](https://github.com/cds-snc/ai-answers/commit/2a0cbbe9520c8b1e967caa6621e90f51b54b9656))
* update build command to include 'npm install' before building ([fa4617a](https://github.com/cds-snc/ai-answers/commit/fa4617add0095acd845a0b27ea76a6d33e91d9d5))
* update build command to use 'npm run build' for App Runner deployment ([05710ff](https://github.com/cds-snc/ai-answers/commit/05710ffbce3ec8accbcd9d1193ba5bb41175dd77))
* update commands formatting in apprunner.yaml for consistency ([46c355d](https://github.com/cds-snc/ai-answers/commit/46c355d5bba85321d1efc43378535d812b4030ab))
* update deployment command to use YAML input for App Runner service ([f6acd86](https://github.com/cds-snc/ai-answers/commit/f6acd86e42848ae37b353ef86e86e0810048bd67))
* update deployment workflow for App Runner service ([31d5216](https://github.com/cds-snc/ai-answers/commit/31d52160cd213bf1a2857ff0b0c7ce817d31378f))
* update deployment workflow for AWS App Runner service ([70edeff](https://github.com/cds-snc/ai-answers/commit/70edeffcdcdba212b596587347e4264f2cb0187e))
* update deployment workflow name and add health check configuration ([a9bce85](https://github.com/cds-snc/ai-answers/commit/a9bce85696b4016c95aa9fa7123b93e0526743a7))
* update deployment workflow to include debug step and clarify runtime and commands ([da84644](https://github.com/cds-snc/ai-answers/commit/da846445585ec8eafb288a3fc4f0dc2ac6f67f04))
* update deployment workflow to use AWS CLI for App Runner service ([bab7491](https://github.com/cds-snc/ai-answers/commit/bab7491b4e04991f5068f78684ad54ab6aef1720))
* update JSON configuration files to use consistent formatting and improve readability ([105ae2d](https://github.com/cds-snc/ai-answers/commit/105ae2dba830c415d0ef82743624ec293f45c681))
* update localization for department metrics in English and French ([ff6a508](https://github.com/cds-snc/ai-answers/commit/ff6a5081301f14de2d581c164b015d45b03b850e))
* update Node.js runtime version to 22 in AWS App Runner configuration ([24454dc](https://github.com/cds-snc/ai-answers/commit/24454dc97195abf6b3a535de39ac7d7a2f0744c4))
* update Node.js runtime version to 22 in AWS App Runner configuration ([e235f36](https://github.com/cds-snc/ai-answers/commit/e235f36148591a3b0a8164b70a9384c357e5d2b2))
* update public feedback scoring threshold and improve localization for helpful/unhelpful labels ([397cb6b](https://github.com/cds-snc/ai-answers/commit/397cb6b263fd5709172bd992410a20f97c4968f2))
* update run command and network port in apprunner.yaml ([5a5a565](https://github.com/cds-snc/ai-answers/commit/5a5a56540484cd02897014eb04779439efbb9095))
* update runtime version to NODEJS_22 in deployment workflow ([4483330](https://github.com/cds-snc/ai-answers/commit/4483330b27a99a1312035c3a417773f9e527ebf8))
* update StartCommand to use 'npm run start-server' in configuration files ([76becad](https://github.com/cds-snc/ai-answers/commit/76becadd4f7c02822c9253377ded7591e2b25b15))
* update StartCommand to use 'npm start-server' in deployment configurations ([8bbd13b](https://github.com/cds-snc/ai-answers/commit/8bbd13bffb6674ac675d74f6719bc95b4b7d65b3))
* update workflow name from 'Deploy to App Runner' to 'Deploy to AWS' ([dda7f9e](https://github.com/cds-snc/ai-answers/commit/dda7f9e66953b97804476560640b14cb5b7ced5c))


### Miscellaneous Chores

* add spaces to test infra ([7522207](https://github.com/cds-snc/ai-answers/commit/752220724f3e21735da479841af7e38bde9005f0))
* add spaces to test infra ([785d3ab](https://github.com/cds-snc/ai-answers/commit/785d3ab61a747df8264d44bd806652a9b8dcce89))
* clean up whitespace and comments in deployment workflow ([754e894](https://github.com/cds-snc/ai-answers/commit/754e894fa830a13d44f305d404bf9de1382068b5))
* fix whitespace in AWS credentials configuration step ([5c1ae5a](https://github.com/cds-snc/ai-answers/commit/5c1ae5a8d979d7ffc170b799aa7dda7db1ed0d9b))
* fix whitespace in AWS credentials configuration step ([22b290d](https://github.com/cds-snc/ai-answers/commit/22b290de9c29420cc1d8c8ff99bd5f8b98c466e5))
* fix whitespace in build command for App Runner deployment ([4b74e94](https://github.com/cds-snc/ai-answers/commit/4b74e94d521379e74bc0d247ec0effeea66b8c21))
* fix whitespace in deploy to App Runner step ([f00113b](https://github.com/cds-snc/ai-answers/commit/f00113b3c9402e0598d2284208e36c588bc597ca))
* fix whitespace in deploy to App Runner step ([4efb45f](https://github.com/cds-snc/ai-answers/commit/4efb45f3ad3ef163647d0f3c3addc090dd3a15f9))
* fix whitespace in permissions section of deployment workflow ([713040b](https://github.com/cds-snc/ai-answers/commit/713040b63db658134d4225f52d2845b43f7d523a))


### Code Refactoring

* comment out export functions in MetricsDashboard ([255d8f3](https://github.com/cds-snc/ai-answers/commit/255d8f37571d0c3d28d01088055966b38e353c45))

## [1.7.3](https://github.com/cds-snc/ai-answers/compare/v1.7.2...v1.7.3) (2025-06-18)


### Bug Fixes

* update feedback survey URLs for English and French locales ([a19a6c0](https://github.com/cds-snc/ai-answers/commit/a19a6c099ae12324e2b248c6caf528c546363de9))
* update feedback survey URLs for English and French locales ([11f49aa](https://github.com/cds-snc/ai-answers/commit/11f49aaabf5ebd93abfc94b84d6b4a975c6850bb))

## [1.7.2](https://github.com/cds-snc/ai-answers/compare/v1.7.1...v1.7.2) (2025-06-18)


### Bug Fixes

* add output tokens ([df12568](https://github.com/cds-snc/ai-answers/commit/df125689873d30127e4a04c7fb3047bea3ffd9e7))
* add table for reasons ([b1ec332](https://github.com/cds-snc/ai-answers/commit/b1ec3321661227908dda73ccdbad726b93c67c61))
* add token count ([df12568](https://github.com/cds-snc/ai-answers/commit/df125689873d30127e4a04c7fb3047bea3ffd9e7))
* add translation keys ([f56757e](https://github.com/cds-snc/ai-answers/commit/f56757e653e20134ca0dcf874f4d0bb99c28f31e))
* output tokens ([79a1c96](https://github.com/cds-snc/ai-answers/commit/79a1c96209f15d4cf99f3a8621edbed8c1abf6d4))
* remove datatables css ([1351bf3](https://github.com/cds-snc/ai-answers/commit/1351bf393587ab53655188bd0d9464646837e03a))

## [1.7.1](https://github.com/cds-snc/ai-answers/compare/v1.7.0...v1.7.1) (2025-06-17)


### Bug Fixes

* renew passport online ([76eb7aa](https://github.com/cds-snc/ai-answers/commit/76eb7aaa7f4acefe8157a5c16f7f757b2a3c5032))

## [1.7.0](https://github.com/cds-snc/ai-answers/compare/v1.6.2...v1.7.0) (2025-06-16)


### Features

* add context agent as tool ([72556c7](https://github.com/cds-snc/ai-answers/commit/72556c7f7fb6eb3da81ea27625bfbbcc585e3e05))


### Bug Fixes

* update default AI model name and add new model configuration ([ae92cd1](https://github.com/cds-snc/ai-answers/commit/ae92cd1be8646e066f5d3f53bb6163cffdd9e0ac))

## [1.6.2](https://github.com/cds-snc/ai-answers/compare/v1.6.1...v1.6.2) (2025-06-11)


### Bug Fixes

* poke to infra ([553e758](https://github.com/cds-snc/ai-answers/commit/553e758d875e982e7696fd91496b10c6b903f987))
* Update ai-models.js ([9c4aec1](https://github.com/cds-snc/ai-answers/commit/9c4aec10231219a8928909a377a48d3f72d5ad16))
* Update ai-models.js ([553e758](https://github.com/cds-snc/ai-answers/commit/553e758d875e982e7696fd91496b10c6b903f987))

## [1.6.1](https://github.com/cds-snc/ai-answers/compare/v1.6.0...v1.6.1) (2025-06-11)


### Bug Fixes

* Update ai-models.js ([a08143e](https://github.com/cds-snc/ai-answers/commit/a08143ead00d5e3e5872c65ada2224078ac5e005))

## [1.6.0](https://github.com/cds-snc/ai-answers/compare/v1.5.0...v1.6.0) (2025-06-02)


### Features

* add public feedback component and integrate into feedback flow ([30fe0c0](https://github.com/cds-snc/ai-answers/commit/30fe0c078aabbdc6b3027f1416bc0438a58daea0))
* add total score to expert feedback and include public feedback fields in export ([38de1e6](https://github.com/cds-snc/ai-answers/commit/38de1e6f860d5a9e20ed1c55ec7a19b601d69d8e))
* enhance feedback handling with explicit feedback types and scores ([8d02892](https://github.com/cds-snc/ai-answers/commit/8d02892b1f3a5cab7987baccf6ea893ec255da55))

## [1.5.0](https://github.com/cds-snc/ai-answers/compare/v1.4.1...v1.5.0) (2025-06-02)


### Features

* add API for fetching table record counts and integrate into Dat… ([1bde77b](https://github.com/cds-snc/ai-answers/commit/1bde77b9fd083d96f18e24a8a931539f5ac52e80))
* add API for fetching table record counts and integrate into DatabasePage ([d731c05](https://github.com/cds-snc/ai-answers/commit/d731c053f46816e57c82c16f1ef5b3e2b7f7ca93))
* add in-memory MongoDB setup and Azure context agent test scripts ([89ad041](https://github.com/cds-snc/ai-answers/commit/89ad041ca163d949697c03ca5b66973bb4739420))
* add repair functionality for timestamps and expert feedback types in DatabasePage and DataStoreService ([8127bc2](https://github.com/cds-snc/ai-answers/commit/8127bc2d1693c110dd525950db18453fd4b6289c))
* enhance chunked upload handling with uploadId support and consi… ([824e51c](https://github.com/cds-snc/ai-answers/commit/824e51cc32d7c6b5a26c6a464ed51487ac8caeb8))
* enhance chunked upload handling with uploadId support and consistent response messages ([dc8f3f1](https://github.com/cds-snc/ai-answers/commit/dc8f3f18e18902457e7b567a740cec94120331f1))
* enhance database import process with chunk handling and improve… ([eb77e4e](https://github.com/cds-snc/ai-answers/commit/eb77e4ef12abd55af51c465c2d3e0be515485f5d))
* enhance database import process with chunk handling and improved error reporting ([d0c713a](https://github.com/cds-snc/ai-answers/commit/d0c713a78d847bcbd325702490feab0282baee68))
* reduce chunk size for file import process to improve performance ([2eec02b](https://github.com/cds-snc/ai-answers/commit/2eec02b84989c594c0fb8b70226cdfaa663bb34f))
* reduce chunk size for file import process to improve performance ([8753383](https://github.com/cds-snc/ai-answers/commit/8753383943dd175f510a1f465e183a0ee75a99a3))
* update chunked upload handling and remove express-fileupload dependency ([b8d482b](https://github.com/cds-snc/ai-answers/commit/b8d482b1eed0f2fb7cb73602eab20b06d158f360))


### Bug Fixes

* change default AI selection from 'azure' to 'openai' ([5ec188c](https://github.com/cds-snc/ai-answers/commit/5ec188c50e7e4e531236520b27605fed95879a13))
* correct API URL handling in development and test environments ([c58feb1](https://github.com/cds-snc/ai-answers/commit/c58feb17dbc71797bd30564eb2d22fa4b117f92f))
* correct API URL handling in development and test environments ([4b980a8](https://github.com/cds-snc/ai-answers/commit/4b980a893d7ed435807b51295315f5dea4e3618a))
* correct API URL handling in development and test environments ([2e41d9e](https://github.com/cds-snc/ai-answers/commit/2e41d9ef07c7410d67887478511bf2665a3f22a3))
* remove @babel/plugin-proposal-private-property-in-object from package.json ([2e561b5](https://github.com/cds-snc/ai-answers/commit/2e561b513ef610c9f0262a920b4a969b3b65522c))
* remove duplicate entry for @babel/plugin-proposal-private-property-in-object in package.json ([ac303dc](https://github.com/cds-snc/ai-answers/commit/ac303dcc72fc69e41c3d5fc98987e208ac5774be))
* update Azure OpenAI client creation to use correct model configuration and add logging ([83e082b](https://github.com/cds-snc/ai-answers/commit/83e082b59d28051d139a061075bb29e86a5655b0))
* update development server URL to include '/api' path ([019e051](https://github.com/cds-snc/ai-answers/commit/019e0512ff7e26a91778653d9eeecb0f265333a5))


### Miscellaneous Chores

* update dependencies and configuration files for improved stabi… ([1fb7ad0](https://github.com/cds-snc/ai-answers/commit/1fb7ad0c55c847e845b7cdba33618ac66fda1be3))
* update dependencies and configuration files for improved stability ([b152f55](https://github.com/cds-snc/ai-answers/commit/b152f55ae81cb369c0b1186f2b425052475a983f))

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
