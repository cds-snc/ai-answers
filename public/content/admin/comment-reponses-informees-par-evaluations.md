---
title: "Réponses informées par les évaluations"
description: "Comment les évaluations d'experts influencent les réponses futures, comment voir lesquelles ont été utilisées et comment en retirer une du bassin."
---

# Réponses informées par les évaluations

**Public visé :** Utilisateurs administrateurs et partenaires.

**Détails techniques :** [Using evals for answers](https://github.com/cds-snc/ai-answers/blob/main/docs/architecture/using-evals-for-answers.md) (en anglais)

## Ce que fait la fonction

Les évaluations d'experts portant sur des réponses antérieures sont présentées à l'IA comme exemples évalués avant qu'elle rédige une nouvelle réponse à une question semblable.

- **Exemples au score élevé :** une approche approuvée par un expert, y compris la formulation, le niveau de détail et la citation.
- **Exemples au score plus faible :** les notes de l'expert sur ce qui n'allait pas, ainsi que l'URL qui aurait dû être citée.
- **Rien ne se qualifie :** rien n'est ajouté et la réponse est générée normalement. C'est le résultat habituel.

Une erreur corrigée une fois par un expert devrait cesser de se reproduire dans les questions semblables.

## Voir quelles évaluations ont été utilisées

1. Ouvrez le chat en mode révision. Sélectionnez un ID de chat dans un tableau de bord, ou collez-en un dans **Voir le chat par ID** sur la page d'administration.
2. Déployez **Évaluations antérieures utilisées** sous la réponse. Ce panneau n'apparaît que si le système a trouvé des évaluations admissibles pour cette question. La plupart des questions n'en ont aucune : pour bien des réponses, il n'y a donc rien à déployer.

![Panneau « Évaluations antérieures utilisées » déployé sous une réponse, listant chaque ID de chat et son score total](/content/admin/images/eval-informed-past-evals-used-fr.jpg)

- Chaque ligne est un chat antérieur ayant informé la réponse, avec le score de l'expert sur 100.
- Un mélange de scores élevés et faibles est normal. Il n'y a aucun score minimal.
- Les ID de chat sont des liens. Ouvrez-en un pour lire les notes de l'expert phrase par phrase et l'évaluation de la citation.

### Retirer une évaluation

Retirez-en une lorsque le contenu sur lequel elle reposait a changé, que le jugement était erroné ou qu'il s'agissait d'une entrée de test.

1. Ouvrez ce chat antérieur en mode révision.
2. Déployez **Évaluation d'expert**.
3. Sélectionnez **Supprimer l'évaluation d'expert**.

![Panneau « Évaluation d'expert » déployé montrant les notes par phrase et le bouton « Supprimer l'évaluation d'expert »](/content/admin/images/eval-informed-delete-button-fr.jpg)

- Prend effet dès la question suivante. Il n'y a rien à relancer ni à réindexer.
- À revoir chaque fois que le contenu web d'un programme change de façon importante.

## Règles appliquées par le système

- Correspondance sur le sens plutôt que sur la formulation.
- Même langue seulement.
- Similarité d'au moins 0,75, ce qui est délibérément strict.
- Évaluée depuis moins d'un an, sauf si l'évaluateur l'a marquée **Toujours valide**. L'âge compte à partir de la date d'évaluation, et non de la date de la question.
- Aucun score d'expert minimal.
- Jusqu'à 3 correspondances sont utilisées, classées par similarité.
- À similarité égale, l'évaluation la plus récente est retenue.

## Dépannage

| Ce que vous voyez | Raison la plus probable |
|---|---|
| Aucun panneau **Évaluations antérieures utilisées** sur une réponse | Rien ne s'est qualifié. Normal pour la plupart des questions. |
| Le panneau est absent de toutes les réponses | Le site ou la session utilise le flux de travail de base, et non **Contexte d'évaluations antérieures ACTIVÉ**. |
| Un exemple attendu ne figure pas dans la liste | Vérifiez son âge et si la question antérieure est assez semblable. Utilisez **Voir la trace complète d'un chat** pour vérifier si elle s'est rendue. |
| Un exemple figure dans la liste alors qu'il ne devrait pas | L'évaluation est souvent valable, mais elle correspond mal à cette question. Ne supprimez l'évaluation d'expert que si l'évaluation elle-même est erronée ou périmée. Une mauvaise correspondance avec une évaluation valable est un problème d'appariement : signalez-le plutôt que de supprimer une bonne rétroaction. |

## Liens connexes

- [Utiliser les évaluations pour améliorer les réponses](https://github.com/cds-snc/ai-answers/blob/main/SYSTEM_CARD_FR.md#utiliser-les-évaluations-pour-améliorer-les-réponses) : le résumé public dans la fiche de système
- [Mécanique de récupération, seuils, modes de défaillance](https://github.com/cds-snc/ai-answers/blob/main/docs/architecture/using-evals-for-answers.md) (en anglais)
- [Processus d'évaluation par les experts, avec captures d'écran](https://github.com/cds-snc/ai-answers/blob/main/docs/pdf/fr-reponses-ai-integration-evaluations.pdf)
