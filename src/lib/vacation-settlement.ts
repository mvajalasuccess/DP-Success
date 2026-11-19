export const settlementNote = "Registro de controle: férias proporcionais pagas na rescisão. Datas do registro não representam gozo de férias.";

export function isSettlementOnly(record: {
  notes?: string | null;
  official_gozo_start_date?: string | null;
  official_gozo_end_date?: string | null;
}): boolean {
  return record.notes?.trim() === settlementNote &&
    !record.official_gozo_start_date && !record.official_gozo_end_date;
}
