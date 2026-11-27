import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type ChartEmployee = { id: string; name: string };
type ChartSelection = { title: string; employees: ChartEmployee[] };

export function useChartEmployees() {
  const [selection, setSelection] = useState<ChartSelection | null>(null);

  function show(title: string, employees: readonly ChartEmployee[]) {
    const unique = [...new Map(employees.filter(employee => employee.name.trim())
      .map(employee => [employee.id, employee])).values()];
    unique.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    setSelection({ title, employees: unique });
  }

  function click<T>(rows: readonly T[], open: (row: T) => void) {
    return {
      cursor: "pointer",
      onClick: (_point: unknown, index: number) => {
        const row = rows[index];
        if (row !== undefined) open(row);
      },
    };
  }

  return { show, click, selection, close: () => setSelection(null) };
}

export function ChartEmployeesDialog({ selection, close }: {
  selection: ChartSelection | null;
  close: () => void;
}) {
  return (
    <Dialog open={selection !== null} onOpenChange={open => { if (!open) close(); }}>
      <DialogContent className="w-[calc(100%-2rem)] rounded-xl">
        <DialogHeader>
          <DialogTitle className="pr-6">Funcionários no gráfico</DialogTitle>
          <DialogDescription>{selection?.title}</DialogDescription>
        </DialogHeader>
        {selection?.employees.length ? (
          <>
            <p className="text-sm font-medium">
              {selection.employees.length} {selection.employees.length === 1 ? "funcionário" : "funcionários"}
            </p>
            <ul className="max-h-[50dvh] divide-y overflow-y-auto rounded-lg border">
              {selection.employees.map(employee => (
                <li key={employee.id} className="px-3 py-2.5 text-sm">{employee.name}</li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhum funcionário identificado para esta seleção.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
