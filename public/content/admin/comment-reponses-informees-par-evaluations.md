---
title: "Réponses informées par les évaluations — Réponses IA"
description: "Comment les évaluations d'experts influencent les réponses futures, comment voir lesquelles ont été utilisées et comment en retirer une du bassin."
---

# Réponses informées par les évaluations — fonctionnement et utilisation

*Public visé : utilisateurs administrateurs et partenaires. Pour les détails techniques derrière tout ce qui figure dans cette page, voir [docs/architecture/using-evals-for-answers.md](https://github.com/cds-snc/ai-answers/blob/main/docs/architecture/using-evals-for-answers.md) (en anglais).*

## Ce que fait la fonction

Lorsqu'un expert en la matière évalue une réponse et sa citation, ce jugement est conservé avec la question. Plus tard, quand une personne pose une question semblable, le système retrouve ces évaluations d'experts et les paires question-réponse antérieures, puis les présente à l'IA comme exemples de référence avant qu'elle rédige la nouvelle réponse :

- **Les exemples ayant obtenu un score élevé** montrent au modèle une approche qu'un expert a déjà approuvée — la formulation, le niveau de détail et la citation que l'expert a acceptée.
- **Les exemples ayant obtenu un score plus faible** portent le score et la justification de l'expert pour chaque phrase de la réponse, ainsi que l'URL qui *aurait dû* être citée selon l'expert. Le modèle voit l'erreur et la correction ensemble, ce qui lui permet d'éviter de la répéter.
- **Si rien ne se qualifie, rien n'est ajouté.** S'il n'y a aucune question semblable dont l'évaluation se qualifie, la section est entièrement omise et la réponse est générée exactement comme elle le serait sans cette fonction. C'est le résultat normal pour la plupart des questions.

Les évaluations faites par des experts en la matière se propagent ainsi vers l'avant pour améliorer la cohérence et la qualité des nouvelles réponses aux questions semblables. Il en résulte une forme de mémoire institutionnelle : une erreur qu'un expert corrige une fois cesse de se reproduire dans les questions semblables, et les réponses à une même tâche sous-jacente deviennent plus cohérentes au fil du temps.

## Voir quelles évaluations ont été utilisées

Ouvrez le chat en mode révision. Cliquez sur un ID de chat pour l'ouvrir à partir d'un tableau de bord — le plus souvent le **Tableau de bord des évaluations** — ou collez l'ID dans **Voir le chat par ID**, juste sous les menus de la page d'administration.

Si des évaluations antérieures ont été utilisées, un panneau **Évaluations antérieures utilisées** s'affiche sous la réponse. Déployez-le :

![Panneau « Évaluations antérieures utilisées » déployé sous une réponse, listant chaque ID de chat et son score total](/content/admin/images/eval-informed-past-evals-used-fr.jpg)

Le panneau liste chaque chat antérieur ayant informé la réponse, avec le score total de l'expert sur 100. Les scores varient, et un mélange est normal : les exemples au score élevé montrent au modèle une approche approuvée par un expert, tandis que ceux au score plus faible portent les notes de l'expert sur ce qu'il faut éviter. Il n'y a aucun score minimal, donc un score faible dans cette liste n'indique pas qu'il y a eu un problème.

Chaque **ID de chat est un lien**. En l'ouvrant, vous chargez la conversation antérieure en mode révision, où vous pouvez lire la question et la réponse d'origine, les scores et explications de l'expert phrase par phrase, ainsi que l'évaluation de la citation — tout le raisonnement derrière le score affiché dans le tableau.

## Retirer une évaluation du bassin

Si une évaluation d'expert ne devrait plus influencer les réponses futures — le contenu sur lequel elle reposait a changé, le jugement était erroné, ou il s'agissait d'une entrée de test — supprimez-la à partir de ce chat antérieur au moyen du bouton **Supprimer l'évaluation d'expert**. Le bouton est visible lorsque vous déployez l'évaluation d'expert et son score.

![Panneau « Évaluation d'expert » déployé montrant les notes par phrase et le bouton « Supprimer l'évaluation d'expert »](/content/admin/images/eval-informed-delete-button-fr.jpg)

À côté du bouton de suppression se trouve la case **Toujours valide**. La cocher soustrait l'évaluation à la règle d'actualité d'un an : elle demeure admissible indéfiniment au lieu d'être écartée à son premier anniversaire. Utilisez-la pour les évaluations qui reposent sur des directives qui ne se périment pas. Cette case ne remplace que la vérification de l'âge — l'évaluation doit quand même franchir le seuil de similarité et correspondre à la langue, comme toute autre, et la supprimer la retire toujours du bassin.

Le changement prend effet dès la question suivante — il n'y a rien à relancer ni à réindexer.

C'est la principale tâche d'entretien courante pour cette fonction. Il vaut la peine de faire une révision lorsque le contenu web d'un programme change de façon importante, puisque les évaluations faites à partir de l'ancien contenu peuvent encore se trouver dans la fenêtre d'actualité d'un an.

## Fonctionnement, étape par étape

Lorsque la fonction est activée, le système ajoute une étape avant la rédaction de la réponse. À cette étape, il :

1. **Trouve les questions antérieures semblables.** La question de l'utilisateur est comparée à l'index vectoriel des questions antérieures par similarité sémantique, de sorte que la correspondance se fait sur le sens plutôt que sur la formulation. Seules les questions ayant une évaluation d'expert dans la même langue sont retenues.
2. **Applique un seuil de similarité et une règle d'actualité.** Les correspondances doivent franchir un score de similarité de 0,75, ce qui est délibérément strict. Les évaluations de plus d'un an sont écartées, sauf si elles sont marquées **Toujours valide**. L'âge qui compte est *le moment où l'expert a fait l'évaluation*, et non le moment où la question a été posée à l'origine — une question vieille de deux ans évaluée le mois dernier est donc considérée comme actuelle. Il n'y a aucun score d'expert minimal : toute correspondance évaluée qui franchit ces deux règles est admissible.
3. **Retient jusqu'à trois des correspondances restantes les plus semblables**, et les regroupe dans un bloc de texte de référence ajouté aux instructions données à l'IA pour cette question.

Les instructions qui accompagnent ce bloc indiquent au modèle de traiter les exemples au score parfait comme un modèle à suivre, de lire les notes sur les exemples au score plus faible et de ne pas répéter ces problèmes, de préférer l'URL corrigée par l'expert à celle citée à l'origine, et d'utiliser le tout comme référence plutôt que de le citer textuellement.

## Dépannage rapide

| Ce que vous voyez | Raison la plus probable |
|---|---|
| Aucun panneau **Évaluations antérieures utilisées** sur une réponse | Rien ne s'est qualifié — aucune question semblable évaluée, ou tout est passé sous le seuil de similarité ou hors de la fenêtre d'un an. C'est le résultat normal pour la plupart des questions. |
| Le panneau est absent de toutes les réponses | Le site (ou cette session) utilise le flux de travail de base, et non *Contexte d'évaluations antérieures ACTIVÉ*. |
| Un exemple attendu ne figure pas dans la liste | Vérifiez l'âge de l'évaluation (plus d'un an est écarté, sauf si elle est marquée **Toujours valide**) et si la question antérieure est réellement assez semblable — le seuil est délibérément strict. Utilisez **Voir la trace complète d'un chat** pour vérifier si elle s'est rendue. |
| Un exemple figure dans la liste alors qu'il ne devrait pas | Ouvrez son ID de chat et supprimez la rétroaction d'expert. Elle cesse d'être admissible immédiatement. |

## Liens connexes

- [Utiliser les évaluations pour améliorer les réponses](https://github.com/cds-snc/ai-answers/blob/main/SYSTEM_CARD_FR.md#utiliser-les-évaluations-pour-améliorer-les-réponses) — le résumé public dans la fiche de système
- [docs/architecture/using-evals-for-answers.md](https://github.com/cds-snc/ai-answers/blob/main/docs/architecture/using-evals-for-answers.md) — mécanique de récupération, seuils, câblage du graphe, modes de défaillance (en anglais)
- [Processus d'évaluation par les experts, avec captures d'écran](https://github.com/cds-snc/ai-answers/blob/main/docs/pdf/fr-reponses-ai-integration-evaluations.pdf)
- [Version anglaise de cette page](/en/how-to/eval-informed-answers)
