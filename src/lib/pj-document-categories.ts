export const pjDocumentCategories=["Pessoais","Contratação","Responsabilidades anuais","Medicina e Segurança do Trabalho","NFs","Vales avulsos, acordos diversos","Diversos"] as const;
export function pjCategory(value:unknown):string{
 const s=String(value??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().toLowerCase();
 if(["pessoais","documentos pessoais"].includes(s))return "Pessoais";
 if(["contrato","contratacao","contrato admissao","contrato de prestacao de servicos"].includes(s))return "Contratação";
 if(s==="responsabilidades anuais")return "Responsabilidades anuais";
 if(s==="medicina e seguranca do trabalho")return "Medicina e Segurança do Trabalho";
 if(["nf","nfs","notafiscal","notasfiscais","nfe","nfes"].includes(s.replace(/[^a-z0-9]/g,"")))return "NFs";
 if(s.includes("vales avulsos"))return "Vales avulsos, acordos diversos";
 return "Diversos";
}
export const pjCategoryLabel=(v:string)=>v==="Pessoais"?"Documentos Pessoais":v==="Contratação"?"Contrato":v==="Responsabilidades anuais"?"Responsabilidades Anuais":v;
export const pjDocKey=(value:unknown)=>String(value??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().toLowerCase().replace(/\s+/g," ");
