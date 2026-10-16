# TP2 — Orchestrer une application multi-conteneurs avec Docker Compose

**Module :** DevOps 2 (ECUE733) · **Durée :** 3 h · **Travail :** en binôme

Vous allez conteneuriser et orchestrer une application web complète composée de quatre services :

| Service    | Rôle                                   | Image                         | Port hôte |
|------------|----------------------------------------|-------------------------------|-----------|
| `frontend` | Site Next.js qui affiche des articles  | construite (`./frontend`)     | 3000      |
| `strapi`   | CMS headless : API REST + admin        | construite (`./backend`)      | 1337      |
| `postgres` | Base de données de Strapi              | `postgres:16-alpine`          | *aucun*   |
| `pgadmin`  | Interface web d'administration de la BD | `dpage/pgadmin4:9`            | 5050      |

```
        Navigateur
   :3000 │   :1337 │   :5050 │
         ▼         ▼         ▼
   ┌──────────┐ ┌────────┐ ┌─────────┐
   │ frontend │→│ strapi │ │ pgadmin │
   └──────────┘ └────────┘ └─────────┘
     réseau        │  réseau    │
    "frontend"     ▼ "backend"  ▼
                ┌──────────────────┐
                │     postgres     │  (volume pgdata)
                └──────────────────┘
```

## Objectifs

À la fin du TP, vous saurez :

1. écrire un `Dockerfile` **multi-stage** pour une application Node.js ;
2. décrire une stack complète dans un fichier `docker-compose.yml` ;
3. gérer la configuration et les secrets avec un fichier `.env` ;
4. ordonner le démarrage des services avec `healthcheck` et `depends_on` ;
5. isoler les services avec des **réseaux** et persister les données avec des **volumes** ;
6. diagnostiquer une stack (`logs`, `exec`, `ps`, `config`).

## Prérequis

- Docker Desktop (ou Docker Engine) avec **Docker Compose v2** : `docker compose version`
- Node.js 20 ou 22 et npm (uniquement pour générer les projets)
- Avoir terminé le TP1 (images, conteneurs, `Dockerfile` simple)

## Structure attendue du dépôt

```
.
├── docker-compose.yml
├── .env.example          # commité : valeurs d'exemple
├── .env                  # NON commité (dans .gitignore)
├── pgadmin/
│   └── servers.json
├── backend/              # projet Strapi
│   ├── Dockerfile
│   └── .dockerignore
└── frontend/             # projet Next.js
    ├── Dockerfile
    └── .dockerignore
```

---

## Partie 1 — Générer les deux projets (15 min)

Forkez ce dépôt, clonez-le, puis à la racine :

```bash
# Strapi 5, en JavaScript, configuré pour PostgreSQL
npx create-strapi@latest backend --non-interactive --skip-cloud --no-run --js \
  --use-npm --no-example --no-git-init \
  --dbclient=postgres --dbhost=postgres --dbport=5432 \
  --dbname=strapi --dbusername=strapi --dbpassword=strapi

# Next.js (App Router, TypeScript)
npx create-next-app@latest frontend --ts --app --no-eslint --no-tailwind \
  --no-src-dir --import-alias "@/*" --use-npm --disable-git --yes
```

Dans `backend/`, créez un type de contenu **Article** (champs `title` *texte court, requis* et
`summary` *texte long*). Vous pouvez le faire plus tard depuis l'admin Strapi en mode
développement, ou directement en créant le fichier
`backend/src/api/article/content-types/article/schema.json` (+ `controllers/`, `routes/`, `services/`).

> **Q1.** Pourquoi `--dbhost=postgres` et non `localhost` ?
> **Q2.** Le générateur a créé un fichier `backend/.env`. Que contient-il ? Doit-il être commité ?

## Partie 2 — PostgreSQL (20 min)

Créez `docker-compose.yml` avec un premier service `postgres` :

- image `postgres:16-alpine` ;
- base, utilisateur et mot de passe lus depuis le fichier `.env` (`${POSTGRES_DB}`…) ;
- un **volume nommé** `pgdata` monté sur `/var/lib/postgresql/data` ;
- un `healthcheck` basé sur `pg_isready` ;
- **aucun port publié** sur l'hôte.

Créez `.env.example` (commité) et `.env` (ignoré par git). Démarrez et vérifiez :

```bash
docker compose up -d postgres
docker compose ps                      # le service doit passer "healthy"
docker compose exec postgres psql -U strapi -d strapi -c '\l'
```

> **Q3.** Quelle différence entre `docker compose down` et `docker compose down -v` ? Testez.
> **Q4.** Dans un `healthcheck`, pourquoi écrit-on `$${POSTGRES_USER}` avec deux `$` ?

## Partie 3 — pgAdmin (15 min)

Ajoutez le service `pgadmin` :

- image `dpage/pgadmin4:9`, port hôte `5050` → port conteneur `80` ;
- identifiants via `PGADMIN_DEFAULT_EMAIL` / `PGADMIN_DEFAULT_PASSWORD` (depuis `.env`) ;
- un volume nommé pour `/var/lib/pgadmin` ;
- démarre **après** que `postgres` est *healthy*.

**Bonus de la partie :** pré-enregistrez le serveur PostgreSQL dans pgAdmin grâce à un fichier
`pgadmin/servers.json` monté en lecture seule sur `/pgadmin4/servers.json`.

Connectez-vous sur <http://localhost:5050> et explorez la base.

> **Q5.** Dans pgAdmin, quel *hostname* faut-il saisir pour joindre la base ? Pourquoi ?

## Partie 4 — Strapi (40 min)

### 4.1 Dockerfile

Écrivez `backend/Dockerfile` en **deux étapes** :

1. étape `build` : `node:22-alpine`, copie de `package.json` + `package-lock.json`, `npm ci`,
   copie du code, `npm run build` (construit le panneau d'admin) ;
2. étape finale : repart de `node:22-alpine`, récupère le résultat, s'exécute avec
   l'utilisateur **non-root** `node`, expose `1337`, lance `npm run start`.

Ajoutez un `.dockerignore` (au minimum `node_modules`, `.env`, `.tmp`, `build`, `.git`).

> **Q6.** Pourquoi copier `package*.json` et lancer `npm ci` **avant** de copier le reste du code ?

### 4.2 Service

Ajoutez le service `strapi` :

- `build: ./backend` ;
- variables `DATABASE_*` pointant vers le service `postgres`, et les secrets Strapi
  (`APP_KEYS`, `API_TOKEN_SALT`, `ADMIN_JWT_SECRET`, `JWT_SECRET`, `TRANSFER_TOKEN_SALT`,
  `ENCRYPTION_KEY`) depuis `.env` — générez-les avec `openssl rand -base64 16` ;
- un volume pour `public/uploads` ;
- démarre quand `postgres` est *healthy* ;
- un `healthcheck` sur `http://127.0.0.1:1337/_health`.

Ouvrez <http://localhost:1337/admin>, créez le compte administrateur, puis créez et **publiez**
quelques articles. Dans *Settings → Users & Permissions → Roles → Public*, autorisez `find` et
`findOne` sur *Article*. Vérifiez : `curl http://localhost:1337/api/articles`.

> **Q7.** Retrouvez la table `articles` dans pgAdmin. Combien de lignes pour un article publié ?

## Partie 5 — Next.js (40 min)

### 5.1 Code

Dans `frontend/app/page.tsx`, récupérez les articles depuis Strapi **côté serveur** et
affichez leur titre et leur résumé. L'URL de Strapi doit venir d'une variable d'environnement
`STRAPI_URL`, lue **à l'exécution** (pas au build) :

```tsx
import { connection } from "next/server";

async function getArticles() {
  await connection(); // force le rendu à la requête : STRAPI_URL est lue au runtime
  const res = await fetch(`${process.env.STRAPI_URL}/api/articles`, { cache: "no-store" });
  return (await res.json()).data;
}
```

Avec Next.js 16 (`cacheComponents`), le composant qui fait ce `fetch` doit être placé dans un
`<Suspense>`.

### 5.2 Dockerfile

Activez `output: "standalone"` dans `next.config.ts`, puis écrivez un `Dockerfile` en
**trois étapes** : `deps` (`npm ci`), `builder` (`npm run build`), `runner` qui ne contient
que `.next/standalone`, `.next/static` et `public`, et lance `node server.js` en tant que `node`.

### 5.3 Service

Ajoutez le service `frontend` (port `3000`, `STRAPI_URL=http://strapi:1337`, démarre quand
`strapi` est *healthy*). Ouvrez <http://localhost:3000> : vos articles s'affichent.

> **Q8.** Pourquoi `STRAPI_URL=http://localhost:1337` ne fonctionne-t-il pas dans le conteneur ?
> **Q9.** Comparez la taille de l'image `frontend` avec et sans `output: "standalone"`
> (`docker images`). Expliquez.

## Partie 6 — Réseaux et sécurité (20 min)

Définissez deux réseaux :

- `backend` : `postgres`, `pgadmin`, `strapi` ;
- `frontend` : `strapi`, `frontend`.

Vérifiez que le front ne peut **pas** joindre la base :

```bash
docker compose exec frontend sh -c 'nc -zv -w2 postgres 5432'   # doit échouer
docker compose exec frontend sh -c 'wget -qO- http://strapi:1337/_health && echo OK'
```

> **Q10.** Quel est l'intérêt de ne publier aucun port pour `postgres` ?
> **Q11.** Citez deux autres mesures pour durcir cette stack en production.

## Partie 7 — Cycle de vie (15 min)

1. Arrêtez la stack avec `docker compose down`, relancez-la : vos articles sont-ils toujours là ?
2. Faites une sauvegarde : `docker compose exec postgres pg_dump -U strapi strapi > backup.sql`
3. Modifiez un titre dans le code du front, reconstruisez **uniquement** ce service :
   `docker compose up -d --build frontend`
4. Simulez une panne : `docker compose stop strapi` puis rechargez le front. Que se passe-t-il ?
   Que fait `restart: unless-stopped` ?

## Bonus

- **Mode développement** : un fichier `compose.dev.yml` qui lance `npm run develop` (Strapi) et
  `npm run dev` (Next.js) avec le code monté en volume ou via `develop.watch`
  (`docker compose -f docker-compose.yml -f compose.dev.yml watch`).
- **Initialisation automatique** : dans `backend/src/index.js` (`bootstrap`), donner les droits
  publics sur *Article* et créer un article de démonstration au premier démarrage.
- **CI** : un workflow GitHub Actions qui exécute `docker compose build` à chaque push.

---

## Livrables

Sur votre fork, avant la fin de la séance :

1. le code complet (structure ci-dessus) — `docker compose up -d --build` doit suffire à
   tout démarrer à partir d'un clone + `cp .env.example .env` ;
2. un fichier `REPONSES.md` avec les réponses aux questions Q1 à Q11 ;
3. une capture d'écran du front affichant vos articles et une de pgAdmin montrant la table `articles`.

## Barème indicatif (/20)

| Critère                                                         | Points |
|-----------------------------------------------------------------|:------:|
| `postgres` : volume, healthcheck, `.env`, pas de port publié    | 3      |
| `pgadmin` fonctionnel (+ `servers.json`)                        | 2      |
| `Dockerfile` Strapi multi-stage, non-root, `.dockerignore`      | 3      |
| Service `strapi` : variables, `depends_on` healthy, healthcheck | 2      |
| `Dockerfile` Next.js standalone, non-root                       | 3      |
| Front affichant les articles via `STRAPI_URL`                   | 2      |
| Réseaux `frontend` / `backend` correctement isolés              | 2      |
| Réponses aux questions (`REPONSES.md`)                          | 3      |
| Bonus                                                           | +2     |

## Pièges fréquents

- **`localhost` dans un conteneur** désigne le conteneur lui-même : utilisez le **nom du service**.
- **pgAdmin redémarre en boucle** : l'email `PGADMIN_DEFAULT_EMAIL` est refusé s'il utilise un
  domaine réservé (`.local`, `.test`…) → prenez `admin@example.com`. Sur une machine sans IPv6,
  ajoutez `PGADMIN_LISTEN_ADDRESS: 0.0.0.0`.
- **Strapi plante au démarrage** avec « Missing APP_KEYS » : une variable secrète est vide.
- **`npm ci` échoue** : le `package-lock.json` est absent ou ignoré par `.dockerignore`.
- **Le front affiche « Forbidden »** : les permissions du rôle *Public* ne sont pas accordées,
  ou l'article n'est pas **publié**.
- **Le build Next.js échoue en contactant Strapi** : la page est pré-rendue au build ; utilisez
  `await connection()` (ou `cache: "no-store"`) pour un rendu à la requête.
- Après un changement des variables `POSTGRES_*`, la base **n'est pas recréée** tant que le volume
  existe : `docker compose down -v`.

## Commandes utiles

```bash
docker compose config            # valide et affiche la configuration finale
docker compose up -d --build     # construit et démarre tout
docker compose ps                # état et santé des services
docker compose logs -f strapi    # suivre les logs d'un service
docker compose exec strapi sh    # shell dans un conteneur
docker compose down [-v]         # arrêter (et supprimer les volumes)
```
