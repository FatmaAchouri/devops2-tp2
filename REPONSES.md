### Q1. Variables d'environnement de Strapi
Strapi utilise `DATABASE_CLIENT`, `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_NAME`, `DATABASE_USERNAME` et `DATABASE_PASSWORD`. `DATABASE_HOST=postgres` car `postgres` est le nom du service Docker. `localhost` désigne le conteneur Strapi lui-même.

### Q2. Rôle de `.env.example`
Il fournit un modèle des variables nécessaires. Le fichier `.env` contient les secrets et ne doit pas être commité sur GitHub pour protéger les mots de passe et les clés secrètes.

### Q3. Différence entre `down` et `down -v`
`docker compose down` supprime les conteneurs et les réseaux, mais conserve les volumes. `docker compose down -v` supprime aussi les volumes et les données persistantes.

### Q4. Pourquoi `$$` dans le healthcheck ?
`$$` empêche Docker Compose d'interpréter la variable. Le shell du conteneur interprète ensuite `${POSTGRES_USER}` et `${POSTGRES_DB}`.

### Q5. `Host`, `:ro` et `${PGADMIN_PORT:-5050}`
- `Host: postgres` : nom du service PostgreSQL.
- `:ro` : montage en lecture seule.
- `${PGADMIN_PORT:-5050}` : utilise `PGADMIN_PORT` si elle est définie et non vide, sinon `5050`.

### Q6. Ordre de `COPY` et `npm ci`
Copier les fichiers de dépendances en premier permet de réutiliser le cache Docker. Si un fichier de configuration change, les étapes suivantes sont reconstruites, mais `npm ci` peut rester en cache.

### Q7. `USER node` et `--chown=node:node`
`USER node` exécute l'application sans les privilèges de root. `--chown=node:node` attribue les fichiers à l'utilisateur `node`.

### Q8. `depends_on: condition: service_healthy`
Cette option attend que le service dépendant soit déclaré sain avant de démarrer. Sans elle, l'application peut démarrer avant que sa dépendance soit prête.

### Q9. Table `articles`
La table se trouve dans la base `strapi`, généralement sous `Schemas → public → Tables`. Le nombre de lignes dépend du schéma réel de Strapi 5 et ne correspond pas forcément au nombre d'articles publiés.

### Q10. Pourquoi ne pas utiliser `localhost` pour Strapi ?
Dans le conteneur frontend, `localhost` désigne le frontend lui-même. Il faut utiliser `STRAPI_URL=http://strapi:1337`, car `strapi` est le nom du service Docker.

### Q11. Dockerfile Next.js multi-stage
Il contient **3 étapes** : `deps`, `builder` et `runner`. L'image finale contient le serveur Node.js et les fichiers nécessaires à l'exécution. Sans `output: "standalone"`, le dossier `.next/standalone` peut manquer et le `COPY` échoue.

### Q12. Réseaux et port PostgreSQL
Strapi appartient aux deux réseaux pour communiquer avec PostgreSQL et le frontend. Aucun port PostgreSQL n'est publié afin de limiter son accès aux services du réseau backend.

### Q13. Deux mesures de sécurité
1. Utiliser des secrets robustes et ne jamais les commiter.
2. Exécuter les conteneurs sans privilèges root et limiter les ports exposés.

### Q14. `restart: unless-stopped`
Docker redémarre le conteneur après un arrêt inattendu, sauf s'il a été explicitement arrêté. Après `docker compose stop strapi`, il ne redémarre pas automatiquement. On peut le relancer avec `docker compose start strapi`.