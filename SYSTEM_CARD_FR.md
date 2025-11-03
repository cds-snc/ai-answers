# Fiche système Réponses IA

**Version** : 1.0  
**Date** : Juillet 2025  
**Organisation** : Service numérique canadien (SNC)  
**Contact** : Peter Smith à cds.ca  

**English** : [SYSTEM_CARD.md](SYSTEM_CARD.md)

## Résumé exécutif

Réponses IA est un assistant IA spécialisé conçu pour les sites Web du gouvernement du Canada. Il fournit des réponses précises et brèves aux questions des utilisateurs sur les services, programmes et informations gouvernementaux, avec une citation appropriée unique. Réponses IA est indépendant du modèle, avec un système d'évaluation innovant qui utilise des évaluations détaillées d'experts humains pour alimenter les évaluations IA automatisées et des réponses précises. Le système est construit avec la vie privée, l'accessibilité et la précision comme principes fondamentaux. Une interface d'administration complète prend en charge les vues d'évaluation, de métriques, de gestion des utilisateurs et de journalisation.

## État actuel
- **Environnement** : Préparation pour le projet pilote public
- **Production** : https://reponses-ia.alpha.canada.ca/fr (Azure OpenAI + AWS DocumentDB)
- **Développement** : https://ai-answers.cdssandbox.xyz/fr
- **Évaluation** : Collection continue de commentaires d'experts et notation de réponses alimentant les évaluations IA et réponses
- **Plateforme** : Les départements peuvent ajouter des scénarios d'invite pour répondre aux besoins spécifiques

## Objectif et portée du système

### Fonction principale
- Aider les utilisateurs avec des questions sur les enjeux du gouvernement du Canada
- Fournir des informations précises sur les programmes, prestations et services du gouvernement du Canada
- Diriger les utilisateurs vers les ressources gouvernementales appropriées et les prochaines étapes

### Utilisateurs cibles
- Toute personne visitant Canada.ca ou des sites Web fédéraux

### Portée du contenu
- **Dans la portée** : Services, programmes, prestations, réglementations et informations officielles du gouvernement du Canada
- **Hors de portée** : Services provinciaux/territoriaux/municipaux, conseils personnels, sujets non gouvernementaux
- **Sources** : Seulement les domaines Canada.ca, gc.ca et d'organisations fédérales

### Support linguistique
- Support bilingue complet (pages anglaises/françaises)
- Conformité aux langues officielles
- Les utilisateurs peuvent poser des questions dans l'une ou l'autre langue, mais la citation correspond à la langue de la page
- Répond dans d'autres langues au besoin (traduit d'abord en anglais pour la précision et la journalisation)

## Architecture technique

### Composants du système
1. **Interface utilisateur** : Interface de clavardage basée sur React utilisant le système de conception Canada.ca
2. **Serveur** : Microservices Node.js avec architecture de chaînage d'invites
3. **Services IA** : Modèles Azure OpenAI GPT (production)
4. **Base de données** : AWS DocumentDB (production)

### Détails des modèles IA
- **Modèles de production** : Modèles Azure OpenAI GPT-4 et GPT-4o Mini
- **Température** : 0 (réponses déterministes)
- **Ingénierie d'invite** : Invites de chaîne de pensée avec sortie structurée, invite de département tirée au besoin
- **Indépendance de modèle** : Système conçu pour fonctionner avec différents fournisseurs IA, testé avec GPT et Claude

### Capacités agentiques
- **Utilisation d'outils** : L'IA peut utiliser de manière autonome des outils spécialisés pour améliorer les réponses
- **Outil downloadWebPage** : Critique pour la précision - télécharge et lit les pages Web pour vérifier les informations actuelles, surtout pour :
  - Pages gouvernementales nouvelles ou mises à jour
  - Contenu sensible au temps (changements d'année fiscale, mises à jour de programmes)
  - Pages modifiées dans les derniers 4 mois
  - URLs inconnues non dans les données d'entraînement
  - Détails spécifiques comme numéros, codes, dates, montants en dollars
- **Validation d'URL** : Vérifie automatiquement si les URLs de citation sont actives et accessibles
- **Génération de contexte** : Dérive un contexte frais pour **chaque question**, y compris les questions de suivi, pour assurer une identification précise du département et un contenu pertinent
- **Vérification de contenu** : Priorise le contenu fraîchement téléchargé sur les données d'entraînement
- **Flux de travail DefaultAlwaysContext** : Assure que la dérivation de contexte est effectuée pour toutes les questions d'une conversation, pas seulement les questions initiales

### Flux de données
1. L'utilisateur soumet une question par l'interface de clavardage
2. **Étape 1** : RedactionService applique le filtrage basé sur motifs pour la profanité, les menaces et les renseignements personnels courants
3. **Étape 2** : L'agent de renseignements personnels effectue une détection alimentée par IA de tout renseignement personnel qui a échappé au premier filtrage
4. **Agent de réécriture de requête** : Traduit les questions et crée des requêtes de recherche optimisées (les questions françaises restent en français pour les recherches de pages françaises)
5. Les outils de recherche rassemblent le contenu gouvernemental pertinent en utilisant des requêtes optimisées
6. **Le service de contexte détermine le département pertinent** (effectué pour **chaque question**, y compris les questions de suivi, via le flux de travail DefaultAlwaysContext)
7. **Comportement IA agentique** : L'IA peut utiliser des outils spécialisés incluant :
   - **Outil downloadWebPage** : Télécharge et lit les pages Web pour vérifier les informations actuelles, surtout pour les URLs nouvelles/mises à jour ou le contenu sensible au temps
   - **Outil de validation d'URL** : Vérifie si les URLs de citation sont actives et accessibles
8. Le service de réponse génère une réponse avec citations
9. Réponse enregistrée dans la base de données avec commentaires utilisateur

## Évaluation des risques et mesures de sécurité

### Risques potentiels et stratégies d'atténuation

#### **Risques de précision de l'information**
**Risques potentiels :**
- Fournir des informations gouvernementales périmées ou incorrectes
- Induire les utilisateurs en erreur sur les exigences d'admissibilité ou les échéances
- Donner des informations incomplètes qui pourraient affecter les décisions des utilisateurs

**Stratégies d'atténuation :**
- **Vérification de contenu en temps réel** : L'outil downloadWebPage télécharge et lit les pages Web actuelles pour vérifier la précision de l'information
- **Exigences de citation** : Chaque réponse doit inclure un seul lien source gouvernemental vérifié
- **Validation d'URL** : Vérification automatique des URLs de citation pour la validité et l'accessibilité
- **Système d'évaluation d'experts** : Évaluation humaine experte continue de la précision des réponses
- **Surveillance de fraîcheur du contenu** : Priorise le contenu fraîchement téléchargé sur les données d'entraînement potentiellement périmées
- **Scénarios spécifiques aux départements** : Invites adaptées pour différents départements gouvernementaux pour améliorer la précision

#### **Risques de vie privée et de protection des données**
**Risques potentiels :**
- Exposition accidentelle de renseignements personnels
- Journalisation de données utilisateur sensibles
- Accès non autorisé aux conversations d'utilisateurs

**Stratégies d'atténuation :**
- **Détection et blocage des renseignements personnels à 2 étapes** : 
  - **Étape 1** : Détection basée sur motifs bloque les formats de renseignements personnels connus (NAS, courriels, numéros de téléphone, adresses)
  - **Étape 2** : L'agent de renseignements personnels alimenté par IA attrape les renseignements personnels qui ont échappé au premier filtrage, surtout les noms et identifiants personnels
  - Les numéros de formulaires gouvernementaux, numéros de série de produits et codes de référence publics sont explicitement préservés
- **Notification utilisateur** : Les utilisateurs sont avertis quand des renseignements personnels sont détectés et invités à reformuler
- **Minimisation des données** : Seulement les données de conversation qui sont envoyées au service IA sont stockées
- **Contrôles d'accès** : L'accès à la base de données est restreint au personnel autorisé avec permissions basées sur les rôles
- **Chiffrement** : Toutes les données chiffrées au repos et en transit

#### **Risques de sécurité du contenu**
**Risques potentiels :**
- Génération de contenu inapproprié ou nuisible
- Réponse aux tentatives de manipulation
- Fournir des conseils hors de la portée gouvernementale

**Stratégies d'atténuation :**
- **Filtrage de contenu** : Bloque la profanité, le langage discriminatoire, les menaces et les tentatives de manipulation
- **Application de portée** : Limitation stricte aux informations du gouvernement du Canada seulement
- **Limitation du taux** : 3 questions par session pour prévenir les abus
- **Limites de caractères** : Limite de 260 caractères par question pour prévenir l'injection d'invite
- **Avertissements utilisateur** : Notifications claires quand du contenu inapproprié est détecté - testé pour utilisabilité
- **Limites de longueur de réponse** : Maximum 4 phrases pour réduire le risque d'hallucination

#### **Risques d'accessibilité et d'équité**
**Risques potentiels :**
- Barrières d'accessibilité
- Barrières linguistiques pour les locuteurs non-anglais/français
- Qualité de service incohérente entre différents groupes d'utilisateurs

**Stratégies d'atténuation :**
- **Tests de lecteur d'écran** : Sessions d'utilisabilité itératives tenues avec une gamme d'utilisateurs de lecteurs d'écran pour tester et améliorer
- **Conformité WCAG 2.1 AA** : Implémentation complète des normes d'accessibilité
- **Support bilingue** : Support complet anglais/français avec conformité aux langues officielles
- **Saisie multilingue** : Les utilisateurs peuvent poser des questions dans plusieurs langues et recevoir une réponse dans la même langue - le support des langues autochtones est planifié
- **Langage simple** : Les réponses utilisent un langage clair et simple correspondant aux normes Canada.ca, tests d'utilisabilité itératifs extensifs

#### **Risques de fiabilité du système**
**Risques potentiels :**
- Pannes de service affectant l'accès utilisateur
- Échecs de dépendance API
- Perte ou corruption de données

**Stratégies d'atténuation :**
- **Surveillance d'infrastructure** : Métriques CloudWatch et journalisation pour l'environnement de production
- **Sauvegardes automatisées** : AWS DocumentDB avec systèmes de sauvegarde automatisés
- **Planification de basculement** : Système conçu pour l'indépendance de modèle avec plusieurs fournisseurs IA
- **Limitation du taux** : Prévient la surcharge du système et les abus
- **Paramètre de panne** : Éteindre le système et afficher un message de panne via le panneau d'administration

### Considérations de biais et d'équité

Le système est conçu pour fournir des informations factuelles du gouvernement du Canada sans biais. Les mesures d'atténuation incluent :
- **Sources objectives** : Limitation stricte au contenu Canada.ca et gc.ca
- **Évaluation diverse** : Équipe d'évaluation d'experts incluant des perspectives diverses
- **Tests d'utilisabilité** : Tests avec divers groupes d'utilisateurs incluant des utilisateurs de technologies d'assistance
- **Support multilingue** : Garantit un accès égal dans les langues officielles

## Cadre d'évaluation

### Évaluation d'experts
- **Notation au niveau des phrases** : Chaque phrase évaluée individuellement (100/80/0 points)
- **Évaluation de citation** : Citations notées pour précision et pertinence (25/20/0 points)
- **Score pondéré** : 75% contenu + 25% citation = score total
- **Génération d'incorporations** : Les commentaires créent des incorporations pour l'évaluation automatisée

### Évaluation automatisée
- **Évaluations alimentées par IA** : Utilise les incorporations des évaluations d'experts
- **Surveillance continue** : Surveillance automatique de la qualité des réponses
- **Amélioration itérative** : Le système s'améliore basé sur les commentaires d'évaluation

### Commentaires utilisateur publics
- **Interface simple** : Options "Cela était-il utile ?" Oui/Non
- **Collecte de raisons** : Comprend pourquoi les utilisateurs trouvent les réponses utiles ou non
- **Analytiques** : Suivi des tendances de satisfaction et des domaines d'amélioration

## Gouvernance et supervision

### Supervision organisationnelle
- **Propriétaire** : Service numérique canadien (SNC)
- **Parties prenantes** : Secrétariat du Conseil du Trésor, départements participants
- **Surveillance** : Surveillance continue de la performance et de la précision

### Conformité réglementaire
- **Loi sur la protection des renseignements personnels** : Conception conforme avec minimisation des données
- **Loi sur les langues officielles** : Support bilingue complet
- **Directive sur la prise de décision automatisée** : Évaluation des impacts et mesures de transparence
- **Norme d'accessibilité** : Conformité WCAG 2.1 AA

### Surveillance et audit
- **Journalisation complète** : Toutes les interactions et décisions système sont enregistrées
- **Métriques de performance** : Surveillance en temps réel de la précision et de la performance
- **Révisions régulières** : Audits périodiques de la précision du système et des mesures de sécurité

## Considérations de déploiement

### Infrastructure de production
- **Hébergement** : Services cloud Azure
- **Base de données** : AWS DocumentDB avec sauvegardes automatisées
- **CDN** : Distribution de contenu pour performance optimale
- **Surveillance** : CloudWatch pour métriques et alertes

### Sécurité
- **Chiffrement** : Données chiffrées au repos et en transit
- **Authentification** : Contrôle d'accès basé sur les rôles pour les fonctionnalités d'administration
- **Audit** : Journalisation complète des actions administratives
- **Limitation du taux** : Protection contre les abus et surcharge

### Scalabilité
- **Architecture de microservices** : Composants évolutifs indépendamment
- **Mise en cache** : Mise en cache d'invite pour performance améliorée
- **Équilibrage de charge** : Distribution pour gérer le trafic utilisateur

## Utilisation d'outils agentiques

### Outils disponibles
1. **downloadWebPage** : Télécharge et analyse le contenu des pages Web pour vérification de précision
2. **checkUrl** : Valide que les URLs de citation sont actives et accessibles
3. **generateContext** : Crée un nouveau contexte pour les questions de suivi
4. **Recherche Canada.ca** : Recherche sur les sites Web gouvernementaux
5. **Recherche Google personnalisée** : Fournisseur de recherche alternatif

### Utilisation d'outils
- Les agents IA prennent des décisions autonomes sur quand utiliser les outils
- Utilisation d'outils basée sur le contenu de la question et les exigences de précision
- Journalisation complète de toute utilisation d'outils pour audit et amélioration

## Plan d'amélioration continue

### Améliorations à court terme
- Expansion des scénarios spécifiques aux départements
- Amélioration de la détection et gestion des renseignements personnels
- Amélioration des capacités multilingues

### Améliorations à moyen terme
- Intégration d'incorporations d'évaluation d'experts pour réponses plus rapides
- Support étendu des langues autochtones
- Fonctionnalités d'analytiques avancées

### Améliorations à long terme
- Intégration avec plus de systèmes gouvernementaux
- Capacités de personnalisation avancées
- Expansion à d'autres domaines gouvernementaux

---

*Cette fiche système sera mise à jour régulièrement pour refléter les changements et améliorations du système.*