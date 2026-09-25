import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!email.trim() || password.length < 6) {
      setError("Informe um e-mail e uma senha com pelo menos 6 caracteres.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setError(error.message);
        setSaving(false);
        return;
      }

      const { error: setupError } = await supabase.rpc("ensure_user_setup", {
        _full_name: null,
        _email: email.trim(),
      });
      if (setupError) {
        setError(setupError.message);
        setSaving(false);
        return;
      }

      setSaving(false);
      await navigate({ to: "/" });
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });

    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }

    setSaving(false);

    if (data.session) {
      const { error: setupError } = await supabase.rpc("ensure_user_setup", {
        _full_name: null,
        _email: email.trim(),
      });
      if (setupError) {
        setError(setupError.message);
        return;
      }
      await navigate({ to: "/" });
    } else {
      setMessage("Cadastro criado. Verifique seu e-mail para confirmar a conta e depois entre no sistema.");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md p-7">
        <div>
          <p className="text-sm font-medium text-primary">DP Success</p>
          <h1 className="mt-1 text-2xl font-bold">{mode === "login" ? "Entrar no sistema" : "Criar acesso"}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Acesso protegido para os dados de RH e Departamento Pessoal.
          </p>
        </div>

        <div className="mt-6 grid gap-4">
          <label className="grid gap-1 text-sm font-medium">
            E-mail
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-lg border bg-background px-3 py-2 font-normal" placeholder="seuemail@empresa.com" />
          </label>

          <label className="grid gap-1 text-sm font-medium">
            Senha
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void submit(); }} className="rounded-lg border bg-background px-3 py-2 font-normal" placeholder="Mínimo de 6 caracteres" />
          </label>

          {error && <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}
          {message && <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm text-primary">{message}</div>}

          <button type="button" disabled={saving} onClick={() => void submit()} className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50">
            {saving ? "Aguarde..." : mode === "login" ? "Entrar" : "Criar acesso"}
          </button>

          <button type="button" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); setMessage(""); }} className="text-sm text-muted-foreground hover:text-foreground">
            {mode === "login" ? "Ainda não tenho acesso" : "Já tenho acesso"}
          </button>
        </div>
      </Card>
    </div>
  );
}
