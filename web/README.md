# BaryoKonek Web — Internet-ready browser version

This is a separate browser-based web module added alongside the original Java Swing application. The original source files, `pom.xml`, SQL files, and Swing JAR are retained.

## Features in this first web conversion

- Resident and barangay staff sign-in; resident self-registration
- Existing PostgreSQL accounts and existing password hashes are reused
- Admin dashboard and resident dashboard
- Resident directory: add residents with temporary passwords and archive resident accounts (archived account details are preserved)
- Barangay Documents catalog: add, edit, delete, and set Available / Unavailable
- Resident document requests: create, correct before acceptance, choose quantity
- Staff request workflow: Accept → Processing → Complete
- Completed records move to History (the database records are retained)
- Unified Barangay, Health, and Education announcements; staff can post, edit, and delete
- Resident profile updates; admin/resident password change
- Browser-based Light/Dark mode, notification preference, unread badges, in-app alerts, and a short notification tone
- Responsive layout for desktop, laptop, tablet, and mobile browsers

This is a first web conversion, not a claim that the cloud deployment is already live. The app still needs to be built and connected to the barangay PostgreSQL database in the environment where it will run.

## Database safety

The web server uses the existing `app_users`, `list_items`, and `document_requests` tables and does not call the Swing app's `Database.initialize()` method. It does not reset, drop, or alter existing tables. When an authorized staff member uses **Archive Resident** for the first time, the server creates one additive table named `archived_residents` (if it does not already exist), copies the resident account details into it, and then removes that account from the active `app_users` table in a single transaction. This disables sign-in for the archived account while preserving its details. The database role must have permission to create tables in the current schema. The server also detects whether `quantity` and `completed_at` columns exist and provides fallback behavior when either is absent; it does not add them.

**Important:** the original Swing application's startup code includes a one-time content reset migration when the `user_admin_content_reset_v1` marker is not present. That reset deletes resident accounts, document requests, and `list_items`. The new web launcher does not run that routine. Avoid launching the old Swing app against an unverified existing database until you have checked the migration marker and made a backup.

The web conversion intentionally keeps the existing request ownership convention (`resident_name` matches the resident's current full name), because the existing schema has no resident username/ID column in `document_requests`. Identical resident full names can therefore be ambiguous, as in the desktop version.

Notification read-state and appearance/notification preferences are stored in the browser's local storage. Users can mark individual notifications as read or use Mark all as read; opening the Notifications page no longer marks them automatically. Read-state remains per-browser and does not synchronize between a user's phone and computer. The notification events themselves are read from PostgreSQL.

## Local test on Windows

Requirements:
- JDK 25
- Apache Maven 3.9+
- PostgreSQL running with the existing BaryoKonek database and tables

1. Confirm the local database URL, username, and password. The launcher has sample defaults; it now respects environment variables already set in the terminal so you can avoid saving a real password in the `.bat` file.
2. From PowerShell in the project root, set your local database values (do not use the Render database URL while testing offline), for example:
   ```powershell
   $env:BARYOKONEK_DB_URL = "jdbc:postgresql://localhost:5432/baryokonek"
   $env:BARYOKONEK_DB_USER = "your_local_database_user"
   $env:BARYOKONEK_DB_PASSWORD = "your_local_database_password"
   .\web\run-web.bat
   ```
3. Open `http://localhost:8080` in Chrome.
4. To test from another device on the same Wi-Fi, find the server computer's local IPv4 address (for example `192.168.1.20`) and open `http://192.168.1.20:8080` on the phone/laptop. Allow the app through Windows Firewall on the private network only.

If a staff account already exists in `app_users`, use that existing account. Resident registration is available from the sign-in page. The web module does not silently create a default admin account.

## Render deployment notes

The web server honors Render's platform-provided `PORT` variable and binds to `0.0.0.0` by default. When the `PORT` variable exists, secure session cookies are enabled by default; set `BARYOKONEK_COOKIE_SECURE=false` only for local HTTP testing. The local default remains port `8080`.

For a Render service, keep the app and database configuration in the Render service's Environment settings. Configure these variables using the values for your own PostgreSQL database:

- `BARYOKONEK_DB_URL` — PostgreSQL JDBC URL (for example, `jdbc:postgresql://HOST:5432/DATABASE?sslmode=require` when required by the database provider).
- `BARYOKONEK_DB_USER` — database username.
- `BARYOKONEK_DB_PASSWORD` — database password.
- `BARYOKONEK_COOKIE_SECURE` — normally `true` for the HTTPS production website.

Do not put real database credentials in GitHub or in this project ZIP. Do not expose PostgreSQL port `5432` to the public internet. Use the private/internal database connection string where the hosting provider supports one.

The exact Render Build Command, Start Command, Root Directory, and runtime configuration depend on how the existing Render service was originally created (native build or Docker). Check the current service settings before changing them. Do not replace an existing service's environment variables or database attachment as part of a routine UI update.

**Safe update practice:** test a copy first, keep a database backup, and deploy only after the updated build and workflows are verified. A code update is not applied to the live website until a new deployment succeeds.

## Configuration

| Environment variable | Default | Purpose |
|---|---|---|
| `BARYOKONEK_DB_URL` | `jdbc:postgresql://localhost:5432/baryokonek` | JDBC URL |
| `BARYOKONEK_DB_USER` | `postgres` in Java; launcher sets `baryokonek_app` | Database role |
| `BARYOKONEK_DB_PASSWORD` | `postgres` in Java; launcher sets the existing sample password | Database password |
| `PORT` | `8080` locally; supplied by Render in production | HTTP listener port |
| `BARYOKONEK_WEB_PORT` | `8080` | Local fallback HTTP listener port |
| `BARYOKONEK_WEB_BIND` | `0.0.0.0` | Listener address; use `127.0.0.1` behind HTTPS proxy |
| `BARYOKONEK_COOKIE_SECURE` | `true` when `PORT` is supplied; otherwise `false` | Secure session cookies; keep `true` on HTTPS |

## Build manually

```bash
cd web
mvn clean package
java --add-modules jdk.httpserver -jar target/BaryoKonekWebServer.jar
```

The build uses the project's existing PostgreSQL JDBC driver version and Gson for JSON. No database migration or `schema.sql` change is performed by the web server.
