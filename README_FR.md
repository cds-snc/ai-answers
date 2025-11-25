# Réponses IA - Assistant IA du gouvernement du Canada

## Aperçu

Réponses IA est un agent de clavardage IA spécialisé conçu pour les sites Web du gouvernement du Canada. Elle fournit des réponses précises et brèves aux questions des utilisateurs sur les services, programmes et informations gouvernementaux, avec une seule citation vers une source gouvernementale officielle ou la prochaine étape de leur tâche. Réponses IA est indépendante du modèle, avec un système d'évaluation innovant qui utilise des évaluations détaillées d'experts humains pour alimenter les évaluations IA automatisées et des réponses précises. Une interface d'administration complète prend en charge les vues d'évaluation, de métriques, de gestion des utilisateurs et de journalisation.

## Documentation

### Documentation du système
- **[SYSTEM_CARD_FR.md](SYSTEM_CARD_FR.md)** - Fiche système complète avec architecture technique, mesures de sécurité, cadre d'évaluation et détails de gouvernance

### Documentation pour développeurs
- **[docs/architecture/pipeline-architecture.md](docs/architecture/pipeline-architecture.md)** - Architecture LangGraph complète et implémentation étape par étape du pipeline
- **[docs/agents-prompts/system-prompt-documentation.md](docs/agents-prompts/system-prompt-documentation.md)** - Invites système des agents IA pour toutes les étapes du pipeline

**English** : [README.md](README.md) | [SYSTEM_CARD.md](SYSTEM_CARD.md)

## Démarrage rapide

### État actuel
- **Environnement** : Préparation pour le projet pilote public
- **Production** : https://reponses-ia.alpha.canada.ca/fr
- **Développement** : ai-answers.cdssandbox.xyz/fr

### Caractéristiques principales
- **Réponses contextuelles** : Utilise les URL de référence et la détection de département
- **Système de citation** : Les réponses du gouvernement fédéral incluent des liens sources vérifiés
- **Protection de la vie privée et de la manipulation** : Blocage automatique des renseignements personnels, de la profanité, de la manipulation et des menaces
- **Axé sur l'évaluation** : Amélioration continue grâce à l'évaluation d'experts et automatisée

### Sécurité et conformité
- **Filtrage du contenu** : Bloque le contenu inapproprié, les menaces et les tentatives de manipulation
- **Limitation du taux** : 3 questions par session pour prévenir les abus
- **Limites de caractères** : Limite de 260 caractères par question
- **Protection des renseignements personnels** : Détection en 2 étapes bloque les renseignements personnels avant la réponse IA et la journalisation (Étape 1 : basée sur motifs, Étape 2 : alimentée par IA)
- **Accessibilité** : Testé avec des utilisateurs de lecteurs d'écran et conforme WCAG
- **Langues officielles** : Conforme aux exigences des langues officielles canadiennes

## Architecture technique

### Composants principaux
- **Interface utilisateur** : Interface de clavardage basée sur React avec le système de conception de Canada.ca
- **Serveur** : Node.js avec orchestration de machine à états LangGraph
- **Services IA** : Modèles Azure OpenAI GPT (production), avec support OpenAI et Anthropic
- **Base de données** : MongoDB (AWS DocumentDB en production)
- **Déploiement** : Nuage Azure

**Pour l'architecture détaillée, voir [docs/architecture/pipeline-architecture.md](docs/architecture/pipeline-architecture.md)**

## 🌟 Caractéristiques principales

### Précision et vérification des sources
- **Recherche intelligente** : Des requêtes de recherche optimisées par IA trouvent du contenu gouvernemental pertinent et actuel dans la langue appropriée
- **Architecture d'invites en couches** : Plusieurs invites spécialisées guident l'IA pour sourcer l'information exclusivement du contenu en ligne du gouvernement fédéral
- **Guidage basé sur des scénarios** : Des scénarios spécifiques aux départements traitent des principales tâches des utilisateurs et des enjeux gouvernementaux courants avec des réponses vérifiées
- **Exigences de citation** : Les réponses du gouvernement fédéral incluent des liens sources vérifiés vers du contenu gouvernemental officiel
- **Vérification en temps réel** : L'agent IA télécharge et lit les pages Web actuelles pour vérifier l'exactitude des informations sensibles au temps
- **Évaluation d'experts** : L'examen continu par des experts humains assure la qualité et la précision des réponses

### Adapté aux besoins des utilisateurs de Canada.ca
- **Conception centrée sur l'utilisateur** : Plus de 50 séances de tests d'utilisabilité menées pour affiner l'expérience utilisateur pendant le processus de conception, avec des améliorations continues basées sur les commentaires des utilisateurs
- La réponse IA est étiquetée pour que les phrases de la réponse puissent être affichées dans un format Canada.ca accessible et qu'une URL de citation unique puisse être affichée pour la prochaine étape de la tâche, avec un lien cliquable
- Suppose que le service IA sera appelé depuis une page Canada.ca spécifique, et utilise l'URL de référence pour transmettre cette information au service IA
- L'invite système force des réponses courtes d'un maximum de 4 phrases pour améliorer la clarté, utiliser un langage simple et réduire le risque d'hallucinations
- Les scénarios traitent des principales préoccupations des utilisateurs, des problèmes de tâches principales et des instructions générales du GC pour que le service IA réponde à la question avec précision et fournisse une URL de citation pour toutes les réponses provenant de sites Canada.ca ou gc.ca
- Tire parti des modèles d'interaction et du support de Canada.ca - par ex. si un assistant est déjà en place, diriger l'utilisateur à répondre à ces questions plutôt que d'avoir le service IA qui tente de répondre
- **Aligné sur les départements** : Les départements peuvent fournir des scénarios d'invite pour répondre aux besoins de communication spécifiques
- Puisque les pages GC sont ajoutées et mises à jour fréquemment, l'agent IA utilise l'outil downloadWebPage pour lire la page s'il identifie une URL nouvelle, mise à jour ou inconnue

### Capacités de l'agent IA
- **Utilisation autonome d'outils** : L'agent IA peut choisir et utiliser des outils spécialisés (downloadWebPage, checkUrlStatus, contextAgentTool) pendant la génération de réponses
- **Vision future** : L'architecture supporte le transfert vers des agents spécifiques aux départements pour des tâches de service approfondies et des interactions complexes

### Protection de la vie privée et filtrage du contenu à 2 étapes
- **Étape 1 - Rédaction initiale** : RedactionService filtre la profanité, les menaces, les tentatives de manipulation et les modèles de renseignements personnels courants (numéros de téléphone, courriels, adresses, numéros d'assurance sociale)
- **Étape 2 - Détection IA des renseignements personnels** : L'agent de renseignements personnels spécialisé effectue une détection intelligente de tout renseignement personnel qui a échappé au premier filtrage, particulièrement les noms et identifiants personnels
- Lorsque des renseignements personnels sont détectés à l'une ou l'autre étape, les utilisateurs sont alertés et la question est bloquée pour protéger la vie privée
- La plupart des renseignements personnels n'atteignent jamais les services IA ou ne sont pas enregistrés dans la base de données
- Les numéros de formulaires gouvernementaux, les numéros de série de produits et les codes de référence publics sont explicitement préservés
- Les tests d'utilisabilité de cette fonctionnalité ont montré que les utilisateurs réussissaient à comprendre les instructions et à poser la question sans mots de menace spécifiques

### Support des langues officielles
- Conforme aux spécifications de Canada.ca avec des versions traduites officielles EN et FR de la page principale Réponses IA
- Les utilisateurs peuvent poser des questions dans n'importe quelle langue sur l'une ou l'autre page, mais l'URL de citation sera vers une URL Canada.ca ou gc.ca anglaise si l'utilisateur demande depuis la page Réponses IA anglaise, et vers une URL de citation française si l'utilisateur demande depuis la page Réponses IA française
- Sélecteur de langue également disponible dans le processus par lots
- Tous les scénarios et mises à jour d'invite système incluent des paires d'URLs de citation anglaises et françaises lorsqu'un scénario ou exemple suggère qu'une URL spécifique soit utilisée pour les questions connexes
- Tout le texte affiché aux utilisateurs dans les fichiers de langue JSON pour des mises à jour et traductions faciles dans le dossier locales

### Indépendance du fournisseur de services IA
- La conception originale a été testée avec deux fournisseurs de services IA pour explorer les forces et faiblesses de différents modèles
- Sur ce dépôt, les modèles Azure OpenAI GPT sont actuellement supportés
- Un basculement était en place, pour passer à l'autre service IA si l'un échoue - avec un seul service, il faudra retirer le produit du service lorsque les performances IA sont dégradées ou arrêtées. Un paramètre pour l'éteindre et afficher un message est fourni dans l'interface d'administration
- Mise en cache d'invite implémentée pour améliorer la qualité et la vitesse des réponses
- Température fixée à 0 pour des réponses plus déterministes pour les deux modèles
- Gestion de l'historique de conversation - passer l'historique de conversation au service IA pour le contexte dans le champ 'message'
- Gestion améliorée des citations - l'IA appelle un outil pour vérifier si l'URL de citation est valide et sinon, trouve une autre URL, échouant finalement vers un lien de recherche si aucune URL n'est trouvée
- Invites système optimisées pour la compatibilité des modèles 2025

### Conception axée sur l'évaluation (Objectif de >95% de précision des réponses)
- **Système d'évaluation d'experts** :
  - **Évaluation en application** : Les experts évaluent les questions dans l'interface d'application réelle, dans la même vue qu'un utilisateur expérimenterait
  - **Évaluation flexible** : Les experts peuvent saisir leurs propres questions ou utiliser des ID de clavardage existants pour évaluer les conversations d'utilisateurs
  - **Notation au niveau des phrases** : Chaque phrase dans les réponses IA est notée individuellement (100/80/0 points) avec des explications détaillées enregistrées et intégrées dans la base de données pour utilisation par l'IA
  - **Évaluation de citation** : Notation séparée pour la précision et la pertinence des citations (25/20/0 points)
  - **Score total pondéré** : 75% scores des phrases + 25% score de citation pour une évaluation complète de la qualité
  - **Génération d'incorporations** : Les commentaires d'experts créent des incorporations qui permettent des évaluations IA automatisées pour des questions similaires
  - **Amélioration future** : Ces incorporations aideront bientôt à répondre aux questions rapidement et avec précision
- **Commentaires utilisateurs publics séparés** :
  - **Interface simple** : "Cela était-il utile ?" avec options Oui/Non pour tous les utilisateurs
  - **Suivi détaillé** : Question unique demandant pourquoi ils ont cliqué Oui ou Non avec des options de raisons spécifiques
  - **Raisons positives** : Aucun appel nécessaire, aucune visite nécessaire, temps économisé, autre
  - **Raisons négatives** : Non pertinent, confus, pas assez détaillé, pas ce qu'ils voulaient, autre

### Fonctionnalités d'accessibilité
- Des sessions d'utilisabilité ont été tenues avec des personnes qui dépendent d'une gamme de technologies d'assistance de lecteur d'écran pour identifier les améliorations qui répondaient à leurs besoins
- Notez que la réponse est formatée et complète avant d'être affichée ou annoncée - pas de diffusion en continu
- Étiquettes Aria pour un contexte utile, utilisation d'Aria-live pour annoncer les réponses et messages d'erreur

## Architecture du pipeline

### Machine à états LangGraph
- **Orchestration côté serveur** utilisant une machine à états LangGraph pour une exécution déterministe et traçable
- **Pipeline en 9 étapes** avec validation, traduction, dérivation de contexte et génération de réponses [voir diagramme](#diagramme-darchitecture)
- **Traitement multi-agents** - Agents IA spécialisés pour différentes tâches :
  - **Agent de renseignements personnels** : Détection de renseignements personnels alimentée par IA (GPT-4 mini)
  - **Agent de traduction** : Détection de langue et traduction (GPT-4 mini)
  - **Agent de réécriture de requête** : Optimisation des requêtes de recherche (GPT-4 mini)
  - **Agent de contexte** : Correspondance de département et dérivation de contexte (modèle configurable)
  - **Agent de réponse** : Génération de réponses avec intégration d'outils (modèle configurable)
- **Optimisations de performance** :
  - **Court-circuit** : Réutilise les questions similaires déjà répondues (taux de succès 40-60%)
  - **Réutilisation de contexte** : Exploite le contexte précédent pour les questions de suivi
  - **Mise en cache d'invites** : Réduit les coûts IA d'environ 50% pour le contenu répété
- **Support multi-fournisseur** - Modèles Azure OpenAI (production), OpenAI et Anthropic Claude

**Voir [docs/architecture/pipeline-architecture.md](docs/architecture/pipeline-architecture.md) pour les détails techniques complets**

### Utilisation d'outils agentiques
Les agents IA peuvent utiliser de manière autonome des outils spécialisés pendant la génération de réponses :

- **Outil de recherche Canada.ca** - Recherche du contenu pertinent sur les sites Web gouvernementaux
- **Outil de recherche de contexte Google** - Fournisseur de recherche alternatif pour un contexte plus large
- **Vérificateur de statut d'URL** - Valide les URLs de citation avant de les inclure dans les réponses
- **Téléchargeur de pages Web** - Télécharge et analyse le contenu des pages Web pour vérification
- **Outil d'agent de contexte** - Re-dérive le contexte si nécessaire pendant la génération de réponses

Pour l'intégration détaillée des outils, voir [docs/architecture/pipeline-architecture.md](docs/architecture/pipeline-architecture.md#agentic-tool-use).

## Fonctionnalités d'administration

### Gestion des utilisateurs
- Gestion des rôles d'administrateur et de partenaire
- Création, modification et suppression d'utilisateurs
- Contrôle d'accès basé sur les rôles

### Traitement par lots
- Évaluation IA en vrac avec téléchargements CSV
- Surveillance et gestion des lots
- Support multi-fournisseur (OpenAI, Anthropic)

### Gestion de base de données
- Capacités d'exportation/importation
- Statistiques et maintenance des tables
- Surveillance du système et analytiques

### Métriques de performance
- Analytiques et rapports en temps réel
- Tableau de bord des journaux de clavardage
- Contrôles de configuration du système

### Chargement de contexte spécifique aux départements
- `scenarios-all.js` - Toujours chargé avec des scénarios généraux pour tous les départements
- Fichiers de scénarios et mises à jour spécifiques aux départements chargés si disponibles
- Situés dans les dossiers de contexte dans [`src/services/systemPrompt/`](src/services/systemPrompt/)
- Assure les scénarios généraux comme base avec des ajouts spécifiques aux départements

## Développement

### Gestionnaire de services IA
**Configuration de modèle** (`config/ai-models.js`) - Gère les clés API, points de terminaison et configurations de modèle pour chaque service IA
- **Azure OpenAI** (production) - Modèles GPT-4 et GPT-4o Mini
- **OpenAI** - Modèles GPT-4.1 et GPT-4o
- **Anthropic** - Modèles Claude Sonnet et Haiku

## Contribution

TODO : Directives de contribution et code de conduite pour des détails sur comment participer à ce projet.

## Diagramme d'architecture

```mermaid
flowchart TB
    User(["Utilisateur/Navigateur"])

    subgraph Frontend
        ChatUI["Interface de clavardage React<br>Conception Canada.ca<br>Mises à jour de statut SSE"]
    end

    subgraph "Pipeline LangGraph (Côté serveur)"
        API["API: /chat-graph-run<br>Point d'entrée d'exécution du graphe"]

        subgraph Graph["Machine à états DefaultWithVectorGraph"]
            Init["1. init<br>Initialiser l'état"]
            Validate["2. validate<br>Vérification courte requête<br>(Programmatique)"]
            Redact["3. redact<br>Étape 1: Rédaction de motifs<br>Étape 2: Détection IA de RP<br>(GPT-4 mini)"]
            Translate["4. translate<br>Détection de langue<br>(GPT-4 mini)"]
            Context["5. contextNode<br>Réécriture de requête → Recherche<br>Correspondance de département<br>(GPT-4 mini)"]
            ShortCircuit["6. shortCircuit<br>Détection de réponse similaire<br>(Vecteur + Reclassement IA)"]
            Answer["7. answerNode<br>Génération de réponse<br>(Modèle configurable)"]
            Verify["8. verifyNode<br>Validation de citation<br>(Programmatique)"]
            Persist["9. persistNode<br>Sauvegarder dans BD<br>Déclencher évaluation"]
        end
    end

    subgraph Infrastructure
        DB["MongoDB<br>DocumentDB"]
        Search["Fournisseurs de recherche<br>Canada.ca / Google"]
        AI["Fournisseurs IA<br>Azure OpenAI / OpenAI / Anthropic"]
        Embeddings["Service d'incorporation<br>Similarité vectorielle"]
    end

    User -->|Question| ChatUI
    ChatUI -->|Connexion SSE| API
    API --> Init
    Init --> Validate
    Validate --> Redact
    Redact -->|Appel IA| AI
    Redact --> Translate
    Translate -->|Appel IA| AI
    Translate --> Context
    Context -->|Appel IA| AI
    Context -->|Recherche| Search
    Context --> ShortCircuit
    ShortCircuit -->|Vérifier vecteurs| Embeddings
    ShortCircuit -->|Correspondance?| Answer
    ShortCircuit -->|Aucune correspondance| Answer
    Answer -->|Appel IA| AI
    Answer --> Verify
    Verify --> Persist
    Persist -->|Sauvegarder| DB
    Persist -->|Créer incorporations| Embeddings
    Persist -->|Retourner| API
    API -->|Flux SSE| ChatUI
```

**Pour le flux détaillé et l'implémentation, voir :**
- [Documentation d'architecture du pipeline](docs/architecture/pipeline-architecture.md) - Architecture technique complète avec implémentation étape par étape