# CLAUDE.md

## Le projet

Dépôt du **TP2 du module DevOps 2 (ECUE733)**. Les étudiants forkent ce dépôt et conteneurisent
une application **Next.js + Strapi + PostgreSQL + pgAdmin** avec Docker Compose.

- `README.md` : l'énoncé du TP, en français. C'est un tutoriel guidé : il donne le contenu
  complet de chaque fichier Docker à créer, avec des questions (Q1 à Q14), des bonus, les
  livrables, le barème et les pièges fréquents.
- `backend/` : application Strapi 5 (JavaScript), configurée pour PostgreSQL
  (`config/database.js`), avec un type de contenu `Article` (`title`, `summary`) dans
  `src/api/article/`.
- `frontend/` : application Next.js 16 (App Router, TypeScript). `app/page.tsx` récupère les
  articles côté serveur depuis `STRAPI_URL`, lue à l'exécution (`await connection()` dans un
  `<Suspense>`, car `cacheComponents` est activé).

## Règles importantes

- **Le dépôt est public et sert de point de départ aux étudiants.** N'y ajoutez pas la solution :
  pas de `docker-compose.yml`, `Dockerfile`, `.dockerignore`, `.env.example` racine,
  `pgadmin/servers.json`, ni de réponses aux questions. Ces fichiers sont le travail des étudiants
  (leur contenu est donné dans `README.md`). Le corrigé est conservé hors du dépôt.
- `frontend/next.config.ts` ne doit **pas** contenir `output: "standalone"` : les étudiants
  l'ajoutent (partie 5.2) et la question Q11 en dépend.
- `backend/src/index.js` garde le `bootstrap` vide d'origine : l'initialisation automatique est
  le bonus 1.
- Les `package-lock.json` des deux applications doivent rester commités (`npm ci` dans les
  Dockerfiles).
- Tout le contenu destiné aux étudiants est rédigé **en français**.
- Si vous modifiez un fichier dans l'énoncé, gardez la cohérence entre les extraits de chaque
  partie et le `docker-compose.yml` complet de la partie 6, et la numérotation des questions
  (le livrable `REPONSES.md` et le corrigé en dépendent).

## Versions de référence

Node 22 (`node:22-alpine`), Strapi 5.58, Next.js 16.4, React 19, `postgres:16-alpine`,
`dpage/pgadmin4:9`, Docker Compose v2.

## Vérifier l'énoncé

Pour tester, créez les fichiers donnés dans `README.md` dans une **copie** du dépôt (pas ici),
puis :

```bash
cp .env.example .env
docker compose config -q
docker compose up -d --build
docker compose ps                          # postgres et strapi "healthy"
curl http://localhost:1337/api/articles    # après avoir ouvert le rôle Public dans l'admin
curl http://localhost:3000
```

## Pièges constatés

- pgAdmin refuse un `PGADMIN_DEFAULT_EMAIL` en domaine réservé (`.local`, `.test`…) et redémarre
  en boucle : utiliser `admin@example.com`.
- Sans IPv6, pgAdmin plante au démarrage : `PGADMIN_LISTEN_ADDRESS: 0.0.0.0`.
- `restart: unless-stopped` ne relance pas un conteneur arrêté par `docker compose stop` ou
  `docker compose kill` (arrêt volontaire) ; seulement après un crash.
- Strapi 5 stocke deux lignes par article publié (version brouillon + version publiée).
- Sans `output: "standalone"`, le `COPY .next/standalone` du Dockerfile du front échoue.
