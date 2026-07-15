type AuthResult<TSession> = {
  data: { session: TSession | null };
  error: Error | null;
};

type AnonymousSessionClient<TSession> = {
  auth: {
    getSession: () => Promise<AuthResult<TSession>>;
    signInAnonymously: (options: {
      options: { captchaToken: string };
    }) => Promise<AuthResult<TSession>>;
  };
};

export async function ensureAnonymousSession<TSession>(
  client: AnonymousSessionClient<TSession>,
  captchaToken: string,
): Promise<TSession> {
  const existing = await client.auth.getSession();

  if (existing.error) {
    throw existing.error;
  }

  if (existing.data.session) {
    return existing.data.session;
  }

  if (!captchaToken.trim()) throw new Error("captcha_required");

  const created = await client.auth.signInAnonymously({
    options: { captchaToken },
  });

  if (created.error) {
    throw created.error;
  }

  if (!created.data.session) {
    throw new Error("Supabase anonymous sign-in did not return a session.");
  }

  return created.data.session;
}
