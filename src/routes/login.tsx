import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Eye, EyeOff, ShieldCheck, Clock3, UsersRound, ArrowRight, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { ensureAccountProfile } from "@/lib/auth/profile";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [
    { title: "Acesso | DP SUCCESS" },
    { name: "description", content: "Entre ou crie seu acesso ao DP SUCCESS." },
    { property: "og:title", content: "Acesso | DP SUCCESS" },
    { property: "og:description", content: "Entre ou crie seu acesso ao DP SUCCESS." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Login,
});

function Login() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (mode === "signup" && !fullName.trim()) {
      setError("Informe seu nome completo.");
      return;
    }
    if (!email.trim() || password.length < 6) {
      setError("Informe um e-mail e uma senha com pelo menos 6 caracteres.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    if (mode === "login") {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setError(error.message);
        setSaving(false);
        return;
      }

      try {
        if (!data.user) throw new Error("Não foi possível identificar sua conta.");
        await ensureAccountProfile(data.user);
      } catch (setupError) {
        setError(setupError instanceof Error ? setupError.message : "Não foi possível carregar seu perfil.");
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
      options: { data: { full_name: fullName.trim() } },
    });

    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }

    setSaving(false);

    if (data.session) {
      try {
        await ensureAccountProfile(data.session.user);
      } catch (setupError) {
        setError(setupError instanceof Error ? setupError.message : "Não foi possível carregar seu perfil.");
        return;
      }
      await navigate({ to: "/" });
    } else {
      setMessage("Cadastro criado. Verifique seu e-mail para confirmar a conta e depois entre no sistema.");
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f4faf7] px-4 py-8 sm:px-6 lg:px-10">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-emerald-500/15 blur-3xl" />
        <div className="absolute -bottom-40 right-0 h-[30rem] w-[30rem] rounded-full bg-teal-400/10 blur-3xl" />
        <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.22) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.22) 1px, transparent 1px)", backgroundSize: "42px 42px" }} />
      </div>
      <div className="relative z-10 grid w-full max-w-6xl overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.04] shadow-2xl shadow-black/30 backdrop-blur-sm lg:min-h-[650px] lg:grid-cols-[1.05fr_0.95fr]">
        <section className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-emerald-500 via-teal-600 to-teal-800 p-10 text-white lg:flex xl:p-14">
          <div aria-hidden="true" className="absolute -right-24 top-20 h-72 w-72 rounded-full border border-white/15" />
          <div aria-hidden="true" className="absolute -right-10 top-36 h-44 w-44 rounded-full border border-white/15" />
          <div aria-hidden="true" className="absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-white/[0.06]" />
          <div className="relative z-10">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/20 bg-white/15 shadow-lg"><span className="text-2xl font-black tracking-tight">DP</span></div>
            <p className="mt-7 text-xs font-bold uppercase tracking-[0.28em] text-emerald-50/80">Gestão inteligente</p>
            <h2 className="mt-3 max-w-md text-4xl font-bold leading-tight tracking-tight xl:text-5xl">Pessoas bem cuidadas. Gestão sob controle.</h2>
            <p className="mt-5 max-w-md text-base leading-7 text-white/80">Seu ambiente de Departamento Pessoal, com informações organizadas para decisões mais seguras no dia a dia.</p>
          </div>
          <div className="relative z-10 my-10 grid gap-4">
            <div className="flex items-center gap-4 rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15"><Clock3 className="h-5 w-5" /></div><div><p className="font-semibold">Ponto e banco de horas</p><p className="mt-1 text-sm text-white/75">Acompanhamento em um só lugar</p></div></div>
            <div className="flex items-center gap-4 rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15"><UsersRound className="h-5 w-5" /></div><div><p className="font-semibold">Gestão de pessoas</p><p className="mt-1 text-sm text-white/75">Cadastros e ocorrências organizados</p></div></div>
            <div className="flex items-center gap-4 rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15"><ShieldCheck className="h-5 w-5" /></div><div><p className="font-semibold">Acesso protegido</p><p className="mt-1 text-sm text-white/75">Informações de RH com controle de acesso</p></div></div>
          </div>
          <p className="relative z-10 text-xs text-white/60">DP SUCCESS · Departamento Pessoal</p>
        </section>
        <section className="flex items-center justify-center bg-slate-50 p-5 sm:p-9 lg:p-12">
          <Card className="w-full max-w-md border-0 bg-transparent p-0 shadow-none">
            <div className="mb-8 lg:hidden"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 text-lg font-black text-white shadow-lg shadow-emerald-600/20">DP</div><p className="mt-4 text-xs font-bold uppercase tracking-[0.22em] text-emerald-700">DP SUCCESS</p></div>
            <div>
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800"><Sparkles className="h-3.5 w-3.5" /> Ambiente de acesso seguro</div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900">{mode === "login" ? "Boas-vindas de volta" : "Crie seu acesso"}</h1>
              <p className="mt-2 text-sm leading-6 text-slate-500">{mode === "login" ? "Entre com suas credenciais para acessar o DP SUCCESS." : "Preencha os dados abaixo para solicitar seu acesso ao sistema."}</p>
            </div>
            <div className="mt-8 grid gap-5">
              {mode === "signup" && <label className="grid gap-2 text-sm font-semibold text-slate-700">Nome completo<input type="text" autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} className="h-12 rounded-xl border border-slate-200 bg-white px-4 font-normal text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10" placeholder="Como podemos te chamar?" /></label>}
              <label className="grid gap-2 text-sm font-semibold text-slate-700">E-mail corporativo<input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-12 rounded-xl border border-slate-200 bg-white px-4 font-normal text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10" placeholder="nome@empresa.com.br" /></label>
              <label className="grid gap-2 text-sm font-semibold text-slate-700">Senha<div className="relative"><input type={showPassword ? "text" : "password"} autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void submit(); }} className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 pr-12 font-normal text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10" placeholder="Mínimo de 6 caracteres" /><button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-0 top-0 flex h-12 w-12 items-center justify-center rounded-r-xl text-slate-400 transition hover:text-emerald-700" aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}>{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></label>
              {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
              {message && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</div>}
              <button type="button" disabled={saving} onClick={() => void submit()} className="group flex h-12 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700 hover:shadow-emerald-700/25 focus:outline-none focus:ring-4 focus:ring-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Aguarde..." : mode === "login" ? "Entrar no sistema" : "Criar acesso"}{!saving && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />}</button>
              <div className="flex items-center gap-3 text-xs text-slate-400"><span className="h-px flex-1 bg-slate-200" /><span>ou</span><span className="h-px flex-1 bg-slate-200" /></div>
              <button type="button" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); setMessage(""); }} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800">{mode === "login" ? "Ainda não tenho acesso" : "Já tenho acesso"}</button>
              {mode === "signup" && <p className="rounded-xl bg-slate-100 p-3 text-xs leading-5 text-slate-500">Novos cadastros entram como Convidado, com permissão somente para visualização. Um administrador pode alterar o perfil depois em Configurações.</p>}
            </div>
            <p className="mt-8 flex items-center justify-center gap-2 text-xs text-slate-400"><ShieldCheck className="h-3.5 w-3.5" /> Acesso restrito a usuários autorizados</p>
          </Card>
        </section>
      </div>
    </div>
  );
}
