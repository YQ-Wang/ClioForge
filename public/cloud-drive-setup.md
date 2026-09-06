# Google sign-in and Google Drive

Google sign-in establishes identity. Access to Drive is a separate, incremental permission: Canwoo requests access to files the user chooses through Google Picker, not the user's entire Drive.

## Google Cloud configuration

1. Create your own Google Cloud project. Enable Google Drive API and Google Picker API.
2. Configure Google Auth Platform branding, audience and contact information. Use a platform support address and your deployment's homepage and privacy policy. During testing, explicitly add test users; follow Google's current publishing and verification requirements before offering the integration widely.
3. Create an OAuth client of type Web application. For an installation at `https://research.your-domain.org`, use that exact JavaScript origin and these redirect URIs:
   - `https://research.your-domain.org/api/auth/callback/google`
   - `https://research.your-domain.org/api/connections/callback/google`
4. Create a browser API key for Picker. Restrict it to the Drive and Picker APIs, and the required website referrers for your deployment and Picker (`https://research.your-domain.org/*`, `https://docs.google.com/*`). Do not use an unrestricted server key in the browser.
5. Record the numeric Google Cloud project number, not just the project ID. OAuth, Picker and the project number must belong to the same project.

## Canwoo configuration

Set the following through Workers Secrets for the application worker, using the configuration built for your own deployment:

```sh
npx wrangler secret put GOOGLE_DRIVE_CLIENT_ID --config dist/server/wrangler.json
npx wrangler secret put GOOGLE_DRIVE_CLIENT_SECRET --config dist/server/wrangler.json
npx wrangler secret put GOOGLE_PICKER_API_KEY --config dist/server/wrangler.json
npx wrangler secret put GOOGLE_CLOUD_PROJECT_NUMBER --config dist/server/wrangler.json
```

The Picker key and project number are intentionally returned to the browser; API and referrer restrictions protect their intended use. The OAuth client secret must never be exposed to browser code. For local development, use a separate development OAuth client, explicitly registered localhost callbacks and values in ignored `.dev.vars`.

Basic Google sign-in requests identity permissions. Importing from Drive additionally requests `https://www.googleapis.com/auth/drive.file`; the user selects specific files. Check sign-in, cancelled authorization, importing a selected file, and revoking the connection. Merely signing into a Google Cloud dashboard does not configure OAuth for your app.

For current provider requirements, consult [Google OAuth web applications](https://developers.google.com/identity/protocols/oauth2/web-server), [Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth), and [Google Picker](https://developers.google.com/workspace/drive/picker/guides/overview).
