# Supabase Auth

The live entry point is `index.html`, a static app with protected views. It uses project `niuwscihdpflodhwwdqr` and its public publishable key. Never put a secret or service-role key in this file.

Email/password signup and email confirmation are enabled on the project (verified through `/auth/v1/settings`). Signup saves name and WhatsApp as display/contact metadata; permissions come from `perfis.tipo`, not editable user metadata. The existing Auth trigger creates an `aluno` profile. Existing RLS policies restrict self-service profile writes to `tipo = 'aluno'`.

Navigation to `area`, `admin`, `avaliacao`, `simulado`, and `termo` requires a session and a recognized database profile. Staff use the teacher panel; students cannot open it. The requested student view is resumed after login. Startup validates saved sessions with `getUser()`. Auth events update refreshed tokens and clear app state on sign-out; sign-out uses local scope and reports errors.

## Hosting

Serve over HTTPS (localhost HTTP for development). In Supabase Dashboard → Authentication → URL Configuration, set Site URL to your deployed app and allow its exact URL under Redirect URLs. Confirmation returns to the current origin and pathname. Confirm production and preview URLs before testing confirmation links; these dashboard settings were not changed by this PR because the deployment URL is unknown and the connected tools do not expose Auth configuration updates.

## Verification

Run `node tests/auth-routes.cjs`. It covers guest denial for all five protected views, pending-profile denial, student/staff routing, and unknown routes. Chromium smoke checks with mocked Auth also covered signup payload, confirmation messaging, token refresh, sign-out, and no JavaScript page errors. A real email confirmation / authenticated account flow still requires a test account and mailbox.

The live project has RLS enabled on `perfis`, `alunos`, and `professores`; no schema changes were needed. Client route guards are a UI boundary: database policies remain the authority for data access. Static HTML itself is public. The legacy single-file HTML export is not the supported entry point and is unchanged.

## Existing security advisories

The project reports existing SECURITY DEFINER execute grants, a mutable function search path, and disabled leaked-password protection. These require a separate database/function review and were not changed here:

- https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
- https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable
- https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
