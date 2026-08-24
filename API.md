# Nimbus Drive API

Base URL: `http://localhost:4173/api`

The API uses an `httpOnly` session cookie after login. A client that is hosted on a different origin should send `credentials: 'include'` and set `CORS_ORIGIN` on the API. API responses use camelCase; errors consistently have this shape:

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have access to this resource."
  }
}
```

## Start

### Docker — MongoDB included

```bash
docker compose up --build
```

The API starts on port `4173` and MongoDB is internal to the Compose network. The credentials in `docker-compose.yml` are for local development only; replace them for any shared environment.

### MongoDB Atlas or self-hosted MongoDB

Copy `.env.example` to `.env`, set `MONGODB_URI`, `MONGODB_DB`, and a strong `JWT_SECRET`, then run `npm start`. The server creates all MongoDB collection indexes automatically.

## Endpoint map

| Area             | Endpoints                                                                                                                                     |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Health           | `GET /health`                                                                                                                                 |
| Authentication   | `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`                                                                |
| Drive listing    | `GET /drive`, `GET /recent`, `GET /shared`, `GET /starred`, `GET /search?q=`                                                                  |
| Folders          | `POST /folders`, `GET /folders/:id`, `PATCH /folders/:id`, `DELETE /folders/:id`                                                              |
| Files            | `POST /files` (`multipart/form-data`, field `file`), `GET /files/:id`, `GET /files/:id/download`, `PATCH /files/:id`, `DELETE /files/:id`     |
| Per-user shares  | `POST /shares`, `GET /shares/:resourceType/:resourceId`, `DELETE /shares/:id`                                                                 |
| Public links     | `POST /link-shares`, `GET /link-shares/:resourceType/:resourceId`, `DELETE /link-shares/:id`, `GET /link/:token`, `GET /link/:token/download` |
| Favorites        | `POST /stars`, `DELETE /stars`                                                                                                                |
| Recovery & audit | `GET /trash`, `POST /trash/restore`, `GET /activities/:resourceType/:resourceId`                                                              |

## Key request payloads

```json
POST /auth/register
{ "email": "user@example.com", "password": "at-least-8-characters", "name": "Aarav Mehta" }

POST /folders
{ "name": "Project Aurora", "parentId": null }

PATCH /files/:id
{ "name": "launch-plan.pdf", "folderId": "<folder-object-id>" }

POST /shares
{ "resourceType": "folder", "resourceId": "<object-id>", "granteeEmail": "teammate@example.com", "role": "editor" }

POST /link-shares
{ "resourceType": "file", "resourceId": "<object-id>", "expiryDays": 7, "password": "optional" }

POST /stars
{ "resourceType": "file", "resourceId": "<object-id>" }
```

To download through a password-protected public link, send the password in the `X-Link-Password` header; do not put passwords in a URL.
