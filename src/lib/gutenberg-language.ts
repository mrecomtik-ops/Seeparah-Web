/** Provenance-safe ISO language labels for exact Project Gutenberg ebooks. */
const SOURCE_CODES="af ale ang ar arp bg bgs bo br brx ca ceb cs csb cy da de el en enm eo es et fa fi fr fur fy ga gl gla grc hai he hu ia ilo is it iu ja kha kld ko la mi myn nah nai nap nav nl no oc oji pl pt rmq ro ru sa sco sl sr sv te tl zh".split(" ");
const OVERRIDES:Record<string,string>={en:"English",zh:"Chinese",grc:"Ancient Greek",ang:"Old English",enm:"Middle English",tl:"Tagalog"};
const display=typeof Intl.DisplayNames==="function"?new Intl.DisplayNames(["en"],{type:"language"}):null;
export function normalizeGutenbergLanguageCodes(input:unknown):string[]{
  if(!Array.isArray(input)||input.length<1||input.length>12)return [];
  const codes:string[]=[];
  for(const item of input){
    if(typeof item!=="string")return [];
    const code=item.trim().toLowerCase();
    if(!/^[a-z]{2,3}(?:-[a-z]{2,4})?$/u.test(code))return [];
    if(!codes.includes(code))codes.push(code);
  }
  return codes.sort();
}
export function gutenbergSourceLanguage(input:unknown):string{
  const codes=normalizeGutenbergLanguageCodes(input);
  if(!codes.length)throw new Error("Missing or invalid Gutenberg language metadata");
  if(codes.length>1)return codes.length===2?"Bilingual":"Multilingual";
  const code=codes[0]!;
  const label=OVERRIDES[code]??display?.of(code);
  return !label||label===code?"Gutenberg language ("+code+")":label;
}
export function sameGutenbergLanguages(a:unknown,b:unknown):boolean{
  const x=normalizeGutenbergLanguageCodes(a),y=normalizeGutenbergLanguageCodes(b);
  return x.length>0&&x.length===y.length&&x.every((c,i)=>c===y[i]);
}
export function gutenbergLanguageTagForLabel(label:string):string|null{
  if(label==="Bilingual"||label==="Multilingual")return "mul";
  const unknown=/^Gutenberg language \(([a-z]{2,3})\)$/u.exec(label);
  if(unknown)return unknown[1]!;
  for(const code of SOURCE_CODES)if(gutenbergSourceLanguage([code])===label)return code;
  return null;
}
export function gutenbergIdentityKey(input:string):string{
  return input.normalize("NFKD").toLowerCase().replace(/\p{M}/gu,"").replace(/[^\p{L}\p{N}]/gu,"");
}
