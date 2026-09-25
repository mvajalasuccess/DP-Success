import { Link } from "@tanstack/react-router";
import { ArrowLeft, Plus, Search, UserRound, BriefcaseBusiness, WalletCards, Pencil, Trash2, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function Employees() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [positions, setPositions] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", role: "", department: "", salary: "", admission: "", termination: "", bank: "", work_schedule_id: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function loadEmployees() {
    setLoading(true);
    const { data, error } = await supabase
      .from("employees")
      .select("id,full_name,status,hire_date,termination_date,department_id,position_id,work_schedule_id,departments(name),positions(name),work_schedules(name)")
      .order("full_name");
    if (error) setError(error.message);
    else setEmployees(data ?? []);
    setLoading(false);
  }

  async function loadFormOptions() {
    const [dep, pos, schedule] = await Promise.all([
      (supabase).from("departments").select("id,name").eq("active", true).order("name"),
      (supabase).from("positions").select("id,name").eq("active", true).order("name"),
      (supabase).from("work_schedules").select("id,name").eq("active", true).order("name"),
    ]);
    if (dep.error || pos.error || schedule.error) {
      setError(dep.error?.message || pos.error?.message || schedule.error?.message || "Não foi possível carregar as opções do cadastro.");
      return;
    }
    setDepartments(dep.data ?? []);
    setPositions(pos.data ?? []);
    setSchedules(schedule.data ?? []);
  }

  useEffect(() => {
    void loadEmployees();
    void loadFormOptions();
  }, []);

  function openNew() {
    setError("");
    setEditingId(null);
    setForm({ name: "", role: "", department: "", salary: "", admission: "", termination: "", bank: "", work_schedule_id: "" });
    setOpen(true);
  }

  function openEdit(employee: any) {
    setError("");
    setEditingId(employee.id);
    setForm({
      name: employee.full_name ?? "",
      role: employee.position_id ?? "",
      department: employee.department_id ?? "",
      salary: "",
      admission: employee.hire_date ?? "",
      termination: employee.termination_date ?? "",
      bank: "",
      work_schedule_id: employee.work_schedule_id ?? "",
    });
    setOpen(true);
  }

  async function saveEmployee() {
    if (!form.name.trim() || !form.role || !form.department || !form.admission) {
      setError("Preencha nome, cargo, departamento e data de admissão.");
      return;
    }

    if (form.termination && form.termination < form.admission) {
      setError("A data de desligamento não pode ser anterior à data de admissão.");
      return;
    }

    setSaving(true);
    setError("");

    if (editingId) {
      const result = await supabase.from("employees").update({
        full_name: form.name.trim(),
        department_id: form.department,
        position_id: form.role,
        hire_date: form.admission,
        termination_date: form.termination || null,
        status: form.termination ? "inativo" : "ativo",
        work_schedule_id: form.work_schedule_id || null,
      }).eq("id", editingId);

      if (result.error) {
        setError(result.error.message);
        setSaving(false);
        return;
      }

      setOpen(false);
      setSaving(false);
      setEditingId(null);
      await loadEmployees();
      return;
    }

    const salary = Number(form.salary.replace(",", "."));
    const match = form.bank.trim().match(/^([+-])?(\d{1,3}):(\d{2})$/);
    const bankMinutes = match
      ? Number(match[1] === "-" ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3]))
      : 0;

    if (!salary || salary < 0) {
      setError("Informe um salário válido.");
      setSaving(false);
      return;
    }

    const emp = await supabase
      .from("employees")
      .insert({
        full_name: form.name.trim(),
        department_id: form.department,
        position_id: form.role,
        hire_date: form.admission,
        termination_date: form.termination || null,
        status: form.termination ? "inativo" : "ativo",
        work_schedule_id: form.work_schedule_id || null,
      })
      .select("id")
      .single();

    if (emp.error) {
      setError(emp.error.code === "23505" ? "Já existe um funcionário com esse cadastro." : emp.error.message);
      setSaving(false);
      return;
    }

    if (bankMinutes !== 0) {
      const kind = bankMinutes > 0 ? "credito" : "debito";
      const bank = await supabase.from("bank_hours").insert({
        employee_id: emp.data.id,
        entry_date: form.admission,
        kind,
        minutes: Math.abs(bankMinutes),
        previous_balance_minutes: 0,
        balance_minutes: bankMinutes,
        justification: "Saldo inicial do cadastro",
      });
      if (bank.error) {
        setError("Funcionário criado, mas o saldo inicial não pôde ser lançado: " + bank.error.message);
      }
    }

    setForm({ name: "", role: "", department: "", salary: "", admission: "", termination: "", bank: "", work_schedule_id: "" });
    setOpen(false);
    setSaving(false);
    await loadEmployees();
  }

  async function deactivateEmployee(employee: any) {
    const date = window.prompt("Data de desligamento:", new Date().toISOString().slice(0, 10));
    if (!date) return;

    setError("");
    const result = await supabase.from("employees").update({
      status: "inativo",
      termination_date: date,
    }).eq("id", employee.id);

    if (result.error) setError(result.error.message);
    else await loadEmployees();
  }

