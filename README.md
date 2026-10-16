# TP2 — Orchestrer une application multi-conteneurs avec Docker Compose

**Module :** DevOps 2 (ECUE733) · **Durée :** 3 h · **Travail :** en binôme

Vous allez conteneuriser et orchestrer une application web complète composée de quatre services.
Le code des deux applications (`backend/` et `frontend/`) est **fourni**. Vous allez écrire toute
la partie Docker. Le contenu de chaque fichier est donné ci-dessous : **lisez-le, comprenez chaque
ligne** et répondez aux questions. C'est ce qui est évalué.

| Service    | Rôle                                    | Image                     | Port hôte |
|------------|-----------------------------------------|---------------------------|-----------|
| `frontend` | Site Next.js qui affiche des articles   | construite (`./frontend`) | 3000      |
| `strapi`   | CMS headless : API REST + admin         | construite (`./backend`)  | 1337      |
| `postgres` | Base de données de Strapi               | `postgres:16-alpine`      | *aucun*   |
| `pgadmin`  | Interface web d'administration de la BD | `dpage/pgadmin4:9`        | 5050      |

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
- Un éditeur de code. Node.js n'est pas nécessaire sur votre machine : tout se construit dans Docker.
- Avoir terminé le TP1 (images, conteneurs, `Dockerfile` simple)

## Fichiers à créer

Les fichiers marqués ✏️ sont à créer (ou à modifier) par vous. Le reste est fourni.

```
.
├── docker-compose.yml        ✏️ Parties 2 à 6
├── .env.example              ✏️ Partie 2 (commité)
├── .env                      ✏️ Partie 2 (copie de .env.example, NON commitée)
├── .gitignore                ✏️ Partie 2 (à vérifier)
├── pgadmin/
│   └── servers.json          ✏️ Partie 3
├── backend/                  (projet Strapi fourni)
│   ├── Dockerfile            ✏️ Partie 4
│   └── .dockerignore         ✏️ Partie 4
└── frontend/                 (projet Next.js fourni)
    ├── next.config.ts        ✏️ Partie 5 (à modifier)
    ├── Dockerfile            ✏️ Partie 5
    └── .dockerignore         ✏️ Partie 5
```

---

## Partie 1 — Découvrir les deux applications (15 min)

Forkez ce dépôt et clonez votre fork.

| Dossier     | Application                 | Ce qu'il faut regarder                                        |
|-------------|-----------------------------|---------------------------------------------------------------|
| `backend/`  | Strapi 5 (JavaScript)       | `config/database.js`, `config/server.js`, `.env.example`, le type de contenu `src/api/article/` (`title`, `summary`) |
| `frontend/` | Next.js 16 (App Router, TS) | `app/page.tsx` (appel à Strapi), `next.config.ts`             |

Pour information, ils ont été générés avec :

```bash
npx create-strapi@latest backend --non-interactive --skip-cloud --no-run --js \
  --use-npm --no-example --no-git-init \
  --dbclient=postgres --dbhost=postgres --dbport=5432 \
  --dbname=strapi --dbusername=strapi --dbpassword=strapi
npx create-next-app@latest frontend --ts --app --no-eslint --no-tailwind \
  --no-src-dir --import-alias "@/*" --use-npm --disable-git --yes
```

> **Q1.** Lisez `backend/config/database.js` : quelles variables d'environnement Strapi attend-il
> pour se connecter à PostgreSQL ? Quelle valeur faudra-t-il donner à `DATABASE_HOST`, et pourquoi
> pas `localhost` ?
> **Q2.** À quoi sert `backend/.env.example` ? Pourquoi le vrai fichier `.env` ne doit-il jamais
> être commité ?

---

## Partie 2 — PostgreSQL (20 min)

### 2.1 Les variables d'environnement

Créez à la racine le fichier **`.env.example`** :

```dotenv
# Copier ce fichier en .env :  cp .env.example .env
# Ne JAMAIS commiter le fichier .env

# ---------- PostgreSQL ----------
POSTGRES_DB=strapi
POSTGRES_USER=strapi
POSTGRES_PASSWORD=change-me

# ---------- pgAdmin ----------
PGADMIN_DEFAULT_EMAIL=admin@example.com
PGADMIN_DEFAULT_PASSWORD=change-me

# ---------- Strapi ----------
# Générer chaque secret avec :  openssl rand -base64 16
APP_KEYS=cleA==,cleB==,cleC==,cleD==
API_TOKEN_SALT=change-me
ADMIN_JWT_SECRET=change-me
JWT_SECRET=change-me
TRANSFER_TOKEN_SALT=change-me
ENCRYPTION_KEY=change-me

# ---------- Ports exposés sur la machine hôte ----------
FRONTEND_PORT=3000
STRAPI_PORT=1337
PGADMIN_PORT=5050
```

Vérifiez que le fichier **`.gitignore`** à la racine contient bien (créez-le sinon) :

```gitignore
.env
node_modules
.next
```

Puis créez votre `.env` et remplacez les secrets Strapi par des valeurs générées :

```bash
cp .env.example .env
openssl rand -base64 16      # à lancer pour chaque secret (4 fois pour APP_KEYS)
```

### 2.2 Le service `postgres`

Créez **`docker-compose.yml`** à la racine avec ce premier service :

```yaml
name: tp2

services:
  # ---------------- Base de données ----------------
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
    # Pas de "ports" : la base n'est joignable que depuis les autres conteneurs
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}"]
      interval: 5s
      timeout: 5s
      retries: 10

volumes:
  pgdata:
```

Démarrez et vérifiez :

```bash
docker compose config                  # affiche le fichier avec les variables remplacées
docker compose up -d postgres
docker compose ps                      # attendez l'état "healthy"
docker compose exec postgres psql -U strapi -d strapi -c '\l'
```

> **Q3.** Quelle différence entre `docker compose down` et `docker compose down -v` ? Testez.
> **Q4.** Dans le `healthcheck`, pourquoi écrit-on `$${POSTGRES_USER}` avec deux `$` ?

---

## Partie 3 — pgAdmin (15 min)

### 3.1 Pré-enregistrer le serveur

Créez **`pgadmin/servers.json`**. pgAdmin le lit au premier démarrage et ajoute automatiquement
la connexion à PostgreSQL (le mot de passe vous sera demandé à la première connexion) :

```json
{
  "Servers": {
    "1": {
      "Name": "TP2 - PostgreSQL",
      "Group": "DevOps 2",
      "Host": "postgres",
      "Port": 5432,
      "MaintenanceDB": "postgres",
      "Username": "strapi",
      "SSLMode": "prefer"
    }
  }
}
```

### 3.2 Le service `pgadmin`

Dans `docker-compose.yml`, ajoutez ce service **sous `postgres`** (dans `services:`) :

```yaml
  # ---------------- Administration de la base ----------------
  pgadmin:
    image: dpage/pgadmin4:9
    restart: unless-stopped
    environment:
      PGADMIN_DEFAULT_EMAIL: ${PGADMIN_DEFAULT_EMAIL}
      PGADMIN_DEFAULT_PASSWORD: ${PGADMIN_DEFAULT_PASSWORD}
      PGADMIN_CONFIG_MASTER_PASSWORD_REQUIRED: "False"
      # Écoute en IPv4 (évite un crash sur les machines où IPv6 est désactivé)
      PGADMIN_LISTEN_ADDRESS: 0.0.0.0
    volumes:
      - pgadmin-data:/var/lib/pgadmin
      - ./pgadmin/servers.json:/pgadmin4/servers.json:ro
    ports:
      - "${PGADMIN_PORT:-5050}:80"
    depends_on:
      postgres:
        condition: service_healthy
```

et déclarez son volume en bas du fichier :

```yaml
volumes:
  pgdata:
  pgadmin-data:
```

```bash
docker compose up -d pgadmin
docker compose logs -f pgadmin         # attendez "Listening at: http://0.0.0.0:80"
```

Ouvrez <http://localhost:5050> (`admin@example.com` / mot de passe du `.env`), dépliez
*DevOps 2 → TP2 - PostgreSQL* et explorez la base.

> **Q5.** Dans `servers.json`, pourquoi `"Host": "postgres"` ? Que signifie `:ro` dans le montage ?
> Que veut dire `${PGADMIN_PORT:-5050}` ?

---

## Partie 4 — Strapi (40 min)

### 4.1 Le Dockerfile

Créez **`backend/Dockerfile`** :

```dockerfile
# ---- 1. Build : dépendances + panneau d'administration ----
FROM node:22-alpine AS build
WORKDIR /opt/app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- 2. Image d'exécution ----
FROM node:22-alpine
WORKDIR /opt/app
ENV NODE_ENV=production
COPY --from=build --chown=node:node /opt/app ./
USER node
EXPOSE 1337
CMD ["npm", "run", "start"]
```

Créez **`backend/.dockerignore`** (les fichiers listés ne sont pas envoyés au build) :

```
node_modules
build
dist
.tmp
.cache
.strapi
.git
Dockerfile
.dockerignore
.env
public/uploads/*
!public/uploads/.gitkeep
```

Testez le build seul :

```bash
docker build -t tp2/strapi ./backend
```

> **Q6.** Pourquoi copier `package*.json` et lancer `npm ci` **avant** de copier le reste du code ?
> Modifiez un fichier de `backend/config/` et relancez le build : quelles étapes sont rejouées ?
> **Q7.** À quoi servent `USER node` et `--chown=node:node` ?

### 4.2 Le service `strapi`

Ajoutez ce service dans `docker-compose.yml` :

```yaml
  # ---------------- CMS headless (API) ----------------
  strapi:
    build: ./backend
    image: tp2/strapi:latest
    restart: unless-stopped
    environment:
      HOST: 0.0.0.0
      PORT: 1337
      DATABASE_CLIENT: postgres
      DATABASE_HOST: postgres
      DATABASE_PORT: 5432
      DATABASE_NAME: ${POSTGRES_DB}
      DATABASE_USERNAME: ${POSTGRES_USER}
      DATABASE_PASSWORD: ${POSTGRES_PASSWORD}
      APP_KEYS: ${APP_KEYS}
      API_TOKEN_SALT: ${API_TOKEN_SALT}
      ADMIN_JWT_SECRET: ${ADMIN_JWT_SECRET}
      JWT_SECRET: ${JWT_SECRET}
      TRANSFER_TOKEN_SALT: ${TRANSFER_TOKEN_SALT}
      ENCRYPTION_KEY: ${ENCRYPTION_KEY}
    volumes:
      - strapi-uploads:/opt/app/public/uploads
    ports:
      - "${STRAPI_PORT:-1337}:1337"
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:1337/_health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
      interval: 10s
      timeout: 5s
      retries: 12
      start_period: 30s
```

et complétez les volumes :

```yaml
volumes:
  pgdata:
  pgadmin-data:
  strapi-uploads:
```

```bash
docker compose up -d --build strapi
docker compose logs -f strapi          # attendez que Strapi annonce son démarrage
```

### 4.3 Configurer Strapi

1. Ouvrez <http://localhost:1337/admin> et créez le compte administrateur.
2. *Content Manager → Article → Create new entry* : créez 2 ou 3 articles et cliquez sur **Publish**.
3. *Settings → Users & Permissions plugin → Roles → Public → Article* : cochez `find` et
   `findOne`, puis **Save**.
4. Vérifiez : `curl http://localhost:1337/api/articles`

> **Q8.** Que fait `depends_on: condition: service_healthy` ? Que se passerait-il sans ?
> **Q9.** Retrouvez la table `articles` dans pgAdmin. Combien de lignes pour un article publié ?

---

## Partie 5 — Next.js (40 min)

### 5.1 Comprendre le code fourni

Lisez `frontend/app/page.tsx` : les articles sont récupérés depuis Strapi **côté serveur**.
L'URL de Strapi vient de la variable d'environnement `STRAPI_URL`, lue **à l'exécution**
(pas au build) :

```tsx
async function getArticles(): Promise<Article[]> {
  await connection(); // force le rendu à la requête : STRAPI_URL est lue au runtime
  const baseUrl = process.env.STRAPI_URL ?? "http://localhost:1337";
  const res = await fetch(`${baseUrl}/api/articles`, { cache: "no-store" });
  // ...
}
```

### 5.2 Activer la sortie « standalone »

Remplacez le contenu de **`frontend/next.config.ts`** par :

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Produit .next/standalone : un serveur Node minimal, idéal pour une image Docker légère
  output: "standalone",
};

export default nextConfig;
```

### 5.3 Le Dockerfile

Créez **`frontend/Dockerfile`** :

```dockerfile
# ---- 1. Dépendances ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- 2. Build ----
FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- 3. Image d'exécution (sortie "standalone", sans node_modules complet) ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
CMD ["node", "server.js"]
```

Créez **`frontend/.dockerignore`** :

```
node_modules
.next
.git
Dockerfile
.dockerignore
.env*
npm-debug.log*
```

### 5.4 Le service `frontend`

Ajoutez ce service dans `docker-compose.yml` :

```yaml
  # ---------------- Front-end ----------------
  frontend:
    build: ./frontend
    image: tp2/frontend:latest
    restart: unless-stopped
    environment:
      # Appel serveur à serveur : on utilise le nom du service, pas "localhost"
      STRAPI_URL: http://strapi:1337
    ports:
      - "${FRONTEND_PORT:-3000}:3000"
    depends_on:
      strapi:
        condition: service_healthy
```

```bash
docker compose up -d --build frontend
```

Ouvrez <http://localhost:3000> : vos articles s'affichent.

> **Q10.** Pourquoi `STRAPI_URL=http://localhost:1337` ne fonctionnerait-il pas dans le conteneur ?
> **Q11.** Combien d'étapes (`FROM`) a ce Dockerfile ? Qu'est-ce qui se retrouve dans l'image
> finale ? Retirez temporairement `output: "standalone"` et relancez le build : que se passe-t-il,
> et pourquoi ? Notez la taille de l'image finale (`docker images tp2/frontend`).

---

## Partie 6 — Réseaux et sécurité (20 min)

Par défaut, Compose met tous les services dans un seul réseau : le front peut donc joindre la base.
On va séparer la stack en deux réseaux :

- `backend` : `postgres`, `pgadmin`, `strapi` ;
- `frontend` : `strapi`, `frontend`.

Ajoutez un bloc `networks:` à **chaque service** :

```yaml
  postgres:
    # ...
    networks:
      - backend

  pgadmin:
    # ...
    networks:
      - backend

  strapi:
    # ...
    networks:
      - backend
      - frontend

  frontend:
    # ...
    networks:
      - frontend
```

et déclarez les réseaux en bas du fichier, au même niveau que `volumes:` :

```yaml
networks:
  backend:
  frontend:
```

Relancez puis vérifiez l'isolation :

```bash
docker compose up -d
docker compose exec frontend sh -c 'nc -zv -w2 postgres 5432'   # doit échouer : "bad address"
docker compose exec frontend sh -c 'wget -qO- http://strapi:1337/_health && echo OK'
docker network ls | grep tp2
```

> **Q12.** Pourquoi `strapi` est-il dans les deux réseaux ? Quel est l'intérêt de ne publier aucun
> port pour `postgres` ?
> **Q13.** Citez deux autres mesures pour durcir cette stack en production.

### Le fichier complet

À la fin de cette partie, votre `docker-compose.yml` doit ressembler à ceci :

<details>
<summary>Afficher le <code>docker-compose.yml</code> complet</summary>

```yaml
name: tp2

services:
  # ---------------- Base de données ----------------
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
    networks:
      - backend
    # Pas de "ports" : la base n'est joignable que depuis le réseau "backend"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}"]
      interval: 5s
      timeout: 5s
      retries: 10

  # ---------------- Administration de la base ----------------
  pgadmin:
    image: dpage/pgadmin4:9
    restart: unless-stopped
    environment:
      PGADMIN_DEFAULT_EMAIL: ${PGADMIN_DEFAULT_EMAIL}
      PGADMIN_DEFAULT_PASSWORD: ${PGADMIN_DEFAULT_PASSWORD}
      PGADMIN_CONFIG_MASTER_PASSWORD_REQUIRED: "False"
      # Écoute en IPv4 (évite un crash sur les machines où IPv6 est désactivé)
      PGADMIN_LISTEN_ADDRESS: 0.0.0.0
    volumes:
      - pgadmin-data:/var/lib/pgadmin
      - ./pgadmin/servers.json:/pgadmin4/servers.json:ro
    ports:
      - "${PGADMIN_PORT:-5050}:80"
    networks:
      - backend
    depends_on:
      postgres:
        condition: service_healthy

  # ---------------- CMS headless (API) ----------------
  strapi:
    build: ./backend
    image: tp2/strapi:latest
    restart: unless-stopped
    environment:
      HOST: 0.0.0.0
      PORT: 1337
      DATABASE_CLIENT: postgres
      DATABASE_HOST: postgres
      DATABASE_PORT: 5432
      DATABASE_NAME: ${POSTGRES_DB}
      DATABASE_USERNAME: ${POSTGRES_USER}
      DATABASE_PASSWORD: ${POSTGRES_PASSWORD}
      APP_KEYS: ${APP_KEYS}
      API_TOKEN_SALT: ${API_TOKEN_SALT}
      ADMIN_JWT_SECRET: ${ADMIN_JWT_SECRET}
      JWT_SECRET: ${JWT_SECRET}
      TRANSFER_TOKEN_SALT: ${TRANSFER_TOKEN_SALT}
      ENCRYPTION_KEY: ${ENCRYPTION_KEY}
    volumes:
      - strapi-uploads:/opt/app/public/uploads
    ports:
      - "${STRAPI_PORT:-1337}:1337"
    networks:
      - backend
      - frontend
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:1337/_health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
      interval: 10s
      timeout: 5s
      retries: 12
      start_period: 30s

  # ---------------- Front-end ----------------
  frontend:
    build: ./frontend
    image: tp2/frontend:latest
    restart: unless-stopped
    environment:
      # Appel serveur à serveur : on utilise le nom du service, pas "localhost"
      STRAPI_URL: http://strapi:1337
    ports:
      - "${FRONTEND_PORT:-3000}:3000"
    networks:
      - frontend
    depends_on:
      strapi:
        condition: service_healthy

networks:
  backend:
  frontend:

volumes:
  pgdata:
  pgadmin-data:
  strapi-uploads:
```

</details>

Test final, depuis un état vierge :

```bash
docker compose down -v
docker compose up -d --build
docker compose ps        # postgres et strapi "healthy", frontend et pgadmin "Up"
```

---

## Partie 7 — Cycle de vie (15 min)

1. **Persistance** : `docker compose down` puis `docker compose up -d`. Vos articles sont-ils
   toujours là ? Et après `docker compose down -v` ?
2. **Sauvegarde** :
   ```bash
   docker compose exec postgres pg_dump -U strapi strapi > backup.sql
   ```
3. **Rebuild ciblé** : modifiez le titre `<h1>` dans `frontend/app/page.tsx`, puis reconstruisez
   **uniquement** ce service :
   ```bash
   docker compose up -d --build frontend
   ```
4. **Panne** : `docker compose stop strapi`, rechargez <http://localhost:3000>. Que s'affiche-t-il ?
   Relancez avec `docker compose start strapi`.

> **Q14.** Que fait `restart: unless-stopped` ? Testez avec `docker compose kill strapi` puis
> `docker compose ps`.

---

## Bonus

### Bonus 1 — Initialisation automatique de Strapi

Remplacez le contenu de `backend/src/index.js` pour qu'au démarrage Strapi ouvre la lecture des
articles au public et crée un article de démonstration si la table est vide :

```js
'use strict';

const PUBLIC_ACTIONS = ['api::article.article.find', 'api::article.article.findOne'];

module.exports = {
  register(/*{ strapi }*/) {},

  async bootstrap({ strapi }) {
    const publicRole = await strapi.db
      .query('plugin::users-permissions.role')
      .findOne({ where: { type: 'public' } });

    for (const action of PUBLIC_ACTIONS) {
      const existing = await strapi.db
        .query('plugin::users-permissions.permission')
        .findOne({ where: { action, role: publicRole.id } });
      if (!existing) {
        await strapi.db
          .query('plugin::users-permissions.permission')
          .create({ data: { action, role: publicRole.id } });
      }
    }

    const articles = strapi.documents('api::article.article');
    if ((await articles.count()) === 0) {
      await articles.create({
        data: {
          title: 'Hello DevOps 2',
          summary: 'Article servi par Strapi, stocké dans PostgreSQL, affiché par Next.js.',
        },
        status: 'published',
      });
    }
  },
};
```

Testez avec `docker compose down -v && docker compose up -d --build` : l'article s'affiche sans
aucune action dans l'admin.

### Bonus 2 — CI

Créez `.github/workflows/docker.yml` pour vérifier à chaque push que la stack se construit :

```yaml
name: Docker build

on: [push, pull_request]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: cp .env.example .env
      - run: docker compose config -q
      - run: docker compose build
```

### Bonus 3 — Mode développement (sans corrigé)

Écrivez un `compose.dev.yml` qui lance `npm run develop` (Strapi) et `npm run dev` (Next.js) avec
rechargement à chaud, en utilisant `develop.watch`
(`docker compose -f docker-compose.yml -f compose.dev.yml watch`).

---

## Livrables

Sur votre fork, avant la fin de la séance :

1. tous les fichiers ✏️ commités — `cp .env.example .env && docker compose up -d --build` doit
   suffire à tout démarrer à partir d'un clone ;
2. un fichier `REPONSES.md` avec les réponses aux questions **Q1 à Q14** ;
3. une capture d'écran du front affichant vos articles et une de pgAdmin montrant la table `articles`.

## Barème indicatif (/20)

| Critère                                                                  | Points |
|--------------------------------------------------------------------------|:------:|
| La stack démarre depuis un clone (`up -d --build`), sans `.env` commité  | 4      |
| `postgres` + `pgadmin` fonctionnels (volume, healthcheck, `servers.json`) | 3      |
| Image Strapi construite, service `strapi` healthy, API publique          | 3      |
| Image Next.js standalone, front affichant les articles                   | 3      |
| Réseaux `frontend` / `backend` isolés                                    | 2      |
| Réponses aux questions (`REPONSES.md`)                                   | 5      |
| Bonus                                                                    | +2     |

## Pièges fréquents

- **`localhost` dans un conteneur** désigne le conteneur lui-même : utilisez le **nom du service**.
- **YAML** : l'indentation compte (2 espaces, pas de tabulation). En cas de doute :
  `docker compose config`.
- **pgAdmin redémarre en boucle** : l'email `PGADMIN_DEFAULT_EMAIL` est refusé s'il utilise un
  domaine réservé (`.local`, `.test`…) → gardez `admin@example.com`.
- **Strapi plante au démarrage** avec « Missing APP_KEYS » : une variable secrète est vide dans `.env`.
- **`npm ci` échoue** : le `package-lock.json` a été supprimé ou ajouté au `.dockerignore`.
- **Le front affiche « Strapi a répondu 403 »** : les permissions du rôle *Public* ne sont pas
  accordées (Partie 4.3).
- **Le front affiche « Aucun article publié »** : l'article est en brouillon, cliquez sur **Publish**.
- **`COPY ... /app/.next/standalone` échoue** : `output: "standalone"` manque dans `next.config.ts`.
- Après un changement des variables `POSTGRES_*`, la base **n'est pas recréée** tant que le volume
  existe : `docker compose down -v`.
- Sur Mac Apple Silicon ou Windows, le premier build de Strapi peut prendre plusieurs minutes.

## Commandes utiles

```bash
docker compose config            # valide et affiche la configuration finale
docker compose up -d --build     # construit et démarre tout
docker compose ps                # état et santé des services
docker compose logs -f strapi    # suivre les logs d'un service
docker compose exec strapi sh    # shell dans un conteneur
docker compose down [-v]         # arrêter (et supprimer les volumes)
docker images | grep tp2         # taille des images construites
```
