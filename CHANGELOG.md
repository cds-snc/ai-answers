# Changelog

## [1.2.1](https://github.com/cds-snc/ai-answers/compare/v1.2.0...v1.2.1) (2025-04-03)


### Bug Fixes

* add release claim to OIDC configuration ([a5e71b7](https://github.com/cds-snc/ai-answers/commit/a5e71b7041485898c0df7549b9eff1f55aee78ff))
* add release claim to OIDC configuration ([7d4fe1a](https://github.com/cds-snc/ai-answers/commit/7d4fe1aabda2908eec8e00a51593de728ad23644))
* correct security group rule for ECS tasks to allow proper commun… ([91d3b79](https://github.com/cds-snc/ai-answers/commit/91d3b793466340f70435562a8f6dcbc091fa1428))
* correct security group rule for ECS tasks to allow proper communication with AWS Systems Manager ([64674be](https://github.com/cds-snc/ai-answers/commit/64674be1b60507e6ffd63af0cf2963184edf8802))

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
