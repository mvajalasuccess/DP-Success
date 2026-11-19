// @ts-nocheck -- compact legacy code; strict index-signature checks disabled until refactor
export type AttendanceDetail={id:string;start:string;end:string;days?:number;minutes?:number;category:string;cid?:string;notes:string};
export type AttendanceKind="atestado"|"declaracao";
type Row=Record<string,any>;
export function attendanceDetails(row:Row,kind:AttendanceKind):AttendanceDetail[]{
 const raw=kind==="atestado"?row.certificate_details:row.declaration_details;
 if(Array.isArray(raw))return raw.filter(x=>x&&typeof x.id==="string"&&typeof x.start==="string"&&typeof x.end==="string");
 const start=kind==="atestado"?row.certificate_display_start:row.declaration_display_start;
 const end=kind==="atestado"?row.certificate_display_end:row.declaration_display_end;
 if(!start||!end)return [];
 return kind==="atestado"?[{id:"legacy-"+row.id,start,end,days:row.certificate_display_days??undefined,category:row.certificate_type||"medico",cid:row.certificate_cid||"",notes:row.certificate_display_notes||""}]:[{id:"legacy-"+row.id,start,end,minutes:row.declaration_display_minutes??row.declaration_minutes,category:row.declaration_display_reason||"Outros",notes:row.declaration_observation||""}];
}
export function expandAttendance<T extends Row>(rows:T[],kind:AttendanceKind):(T&{detail?:AttendanceDetail;detailKey:string})[]{
 return rows.flatMap(row=>{const details=attendanceDetails(row,kind);
 if(!details.length)return [{...row,detailKey:row.id}];
 return details.map(detail=>({...row,detail,detailKey:row.id+"-"+detail.id,
 ...(kind==="atestado"?{certificate_display_start:detail.start,certificate_display_end:detail.end,certificate_display_days:detail.days,certificate_type:detail.category,certificate_cid:detail.cid,certificate_display_notes:detail.notes}:{declaration_display_start:detail.start,declaration_display_end:detail.end,declaration_display_minutes:detail.minutes,declaration_display_reason:detail.category,declaration_observation:detail.notes})}));
 });
}
