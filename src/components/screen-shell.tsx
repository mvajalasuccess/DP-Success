import { ArrowLeft } from "lucide-react";
import { ScreenBrand } from "@/components/screen-brand";
import type { ReactNode } from "react";

export function ScreenShell({ section, title, subtitle, name, actions, error, children }: {
  section: string; title: string; subtitle?: string; name: string; actions?: ReactNode; error?: string; children: ReactNode;
}) {
  return (
    <div className="dp-screen min-h-screen bg-background">
      <header className="dp-screen-topbar border-b bg-background px-4 py-3 sm:px-6 sm:py-3.5">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-3">
          <a href="/" className="flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" /> Voltar</a>
          <ScreenBrand name={name} />
        </div>
      </header>
      <main className="dp-screen-content mx-auto max-w-[1500px] px-4 py-5 sm:px-6 sm:py-6">
        <div className="relative isolate mb-6 overflow-hidden rounded-2xl bg-gradient-to-r from-[#102b35] via-[#123c40] to-[#075c50] px-5 py-6 text-white shadow-lg sm:px-7 sm:py-7 flex flex-col justify-between gap-4 md:flex-row md:items-end [&_p]:!text-white/75 [&_h1]:!text-white">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{section}</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-[30px]">{title}</h1>
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
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-lg border bg-card p-5 shadow-none sm:p-6">
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

export const inputCls = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm font-normal shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50";
export const btnPrimary = "inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";
export const btnOutline = "inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";
export const btnDanger = "inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-destructive/30 bg-background px-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";
