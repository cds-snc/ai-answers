# Changelog

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
