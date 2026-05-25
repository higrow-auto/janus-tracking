# CLAUDE.md — Jet

## Contexto do Projeto

**Jet** é uma plataforma enterprise de gestão de links, UTMs e redirecionamento. Roda em Node.js/Fastify com PostgreSQL e Redis, deployada em Docker Swarm.

- **URL em produção:** https://jet.escolatocha.com.br
- **Admin password:** `J3tAdm1n@2025!`
- **Código na VPS:** `/root/jet/` (IP: `62.169.19.235`)
- **Base de conhecimento:** vault Obsidian `jet-context`

## Stack
- **Runtime:** Node.js 20 (CommonJS — não usar ESM)
- **Framework:** Fastify v4
- **DB:** PostgreSQL 16 via `pg` (pool singleton em `src/db.js`)
- **Cache:** Redis 7 via `ioredis` (lazyConnect, singleton em `src/redis.js`)
- **Frontend:** Vanilla JS SPA sem build step (`public/`)
- **Infra:** Docker Swarm + Traefik v3 + Let's Encrypt

## Estrutura de Arquivos
```
src/
├── server.js           ← Entry point, hooks de auth, registro de rotas
├── db.js / redis.js    ← Singletons de conexão
├── routes/
│   ├── redirect.js     ← GET /:slug (público, caminho crítico <50ms)
│   └── api/            ← campaigns, links, analytics (protegidos por Bearer)
├── services/           ← abTesting, botDetector, clickLogger
└── utils/slugGenerator.js
public/                 ← index.html + css/style.css + js/app.js
migrations/init.sql     ← Schema idempotente (IF NOT EXISTS)
jet.yaml               ← Docker Swarm stack file
```

## Invariantes Críticas
1. `GET /:slug` é a rota mais crítica — nunca adicionar await desnecessário nela
2. `logClick()` deve ser sempre fire-and-forget (sem await no callsite)
3. Redis failures não devem jamais quebrar redirects — sempre try/catch em chamadas Redis
4. Serviços internos nomeados `jetdb` e `jetredis` (não `postgres`/`redis`) para evitar conflito DNS no Swarm
5. Migrations são idempotentes — `CREATE TABLE IF NOT EXISTS` sempre

## Autenticação
- Rotas `/api/*` exigem `Authorization: Bearer <ADMIN_PASSWORD>`
- Rotas públicas têm `config: { skipAuth: true }` nas opções da rota
- Frontend armazena senha no localStorage, envia em cada chamada

## Padrões de Código
- Queries SQL sempre parametrizadas com `$1, $2` (nunca interpolação)
- Chaves Redis: `recurso:identificador` (ex: `link:promo-black`)
- Cache TTL padrão: 300s (5 min)
- Invalidar cache no PUT e DELETE de links

## Rotina de Sessão
- **Ao iniciar:** consulte `/sessoes/` no vault `jet-context` para ver onde paramos
- **Antes de implementar:** verifique `/padroes/` no vault para seguir convenções
- **Ao finalizar:** crie nota de sessão em `/sessoes/YYYY-MM-DD.md` no vault
- **Decisões técnicas:** registre em `/decisoes/` usando o template

## Deploy
```bash
# Sincronizar e rebuildar
rsync -avz --exclude '.git' --exclude 'node_modules' . root@62.169.19.235:/root/jet/
ssh root@62.169.19.235 "cd /root/jet && docker build -t jet-app:latest . && docker stack deploy -c jet.yaml jet"

# Ver logs
ssh root@62.169.19.235 "docker service logs jet_app --tail 50"
```
