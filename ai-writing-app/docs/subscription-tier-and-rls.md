# Subscriptions: tier changes and RLS

The `public.subscriptions` table stores `tier` (`free`, `pro`, `infinite` per the DB check).

## Client-facing RLS (current model)

- **SELECT** and **INSERT** for the signed-in user’s own row (bootstrap `free`) are expected for the `authenticated` role.
- There is **no** `UPDATE` policy for normal clients, so the browser **cannot** self-upgrade to `pro` / `infinite` by calling PostgREST. That is intentional for security.

## Who may change `tier`?

- **Stripe (or other billing) webhooks** and **server-side** jobs that use the **service role** key, which bypasses RLS, should be the only paths that change `tier` when you add paid plans.
- Keep the **service role key** out of the app bundle and Vite envs exposed to the client.

## Related provisioning

- New `auth.users` rows should get a `subscriptions` row (default `free`) via the `handle_new_user` trigger in `00003_rls_ownership_and_provisioning.sql` or an equivalent, so every provider (email + OAuth) is covered.
