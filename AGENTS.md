<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Authenticated identity is loaded through the account-identity hook and account-scoped profile helpers; this invalidates stale reads on account changes and preserves stored names during login.

- Access level lives only in `user_roles` (Administrador edits, Convidado views); `profiles.role` is a trigger-maintained mirror for display. Why: two sources of truth let the UI and RLS disagree.
- Invites are consumed by a trigger on account creation that reads only the invite token from signup metadata. Why: the role must come from the database, never from the URL or browser.
