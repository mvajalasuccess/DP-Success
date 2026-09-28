import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

export function ScreenShell({ section, title, subtitle, name, actions, error, children }: {
  section: string; title: string; subtitle?: string; name: string; actions?: ReactNode; error?: string; children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background px-6 py-4">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between">
          <a href="/" className="flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" /> Voltar</a>
          <span className="text-sm font-semibold">DP Success · {name}</span>
        </div>
      </header>
      <main className="mx-auto max-w-[1500px] px-6 py-7">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="text-sm font-medium text-primary">{section}</p>
            <h1 className="mt-1 text-3xl font-bold">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
        {error && <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}
        {children}
      </main>
    </div>
  );
}

export function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl border bg-card p-6 shadow-lg">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-xl font-bold">{title}</h2>
          <button type="button" onClick={onClose} className="text-sm text-muted-foreground">Fechar</button>
        </div>
        <div className="mt-5">{children}</div>
        <div className="mt-6 flex justify-end gap-2">{footer}</div>
      </div>
    </div>
  );
}

export const inputCls = "w-full rounded-lg border bg-background px-3 py-2 text-sm font-normal";
export const btnPrimary = "inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50";
export const btnOutline = "inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium disabled:opacity-50";
export const btnDanger = "inline-flex items-center gap-1.5 rounded-lg border border-destructive/30 px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/5 disabled:opacity-50";
