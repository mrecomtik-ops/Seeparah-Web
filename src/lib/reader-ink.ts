import { supabase } from "@/integrations/supabase/client";
import { DEMO_USER_ID } from "@/lib/library";
import type { Json } from "@/integrations/supabase/types";

export const INK_COLORS = [
  "#EF4444", "#F59E0B", "#EAB308",
  "#22C55E", "#3B82F6", "#A855F7", "#111827",
] as const;
export type InkTool = "pen" | "marker" | "eraser";
export type InkDrawTool = Exclude<InkTool, "eraser">;
export type InkPoint = [number, number];
export interface InkStroke {
  id: string;
  tool: InkDrawTool;
  color: string;
  width: number;
  points: InkPoint[];
}
const MAX_STROKES=250;
const MAX_POINTS=800;
const MAX_BYTES=120_000;
const GUEST_KEY="seeparah:reader-ink:v1:";

export function validateInkStrokes(value:unknown):InkStroke[] {
  if(!Array.isArray(value)||value.length>MAX_STROKES)
    throw new Error("A page may contain at most 250 pen strokes.");
  const strokes:InkStroke[]=value.map((item:unknown)=>{
    if(typeof item!=="object"||item===null)throw new Error("Invalid drawing stroke.");
    const row=item as Partial<InkStroke>;
    if(typeof row.id!=="string"||row.id.length<1||row.id.length>72||
       (row.tool!=="pen"&&row.tool!=="marker")||
       typeof row.color!=="string"||
       !INK_COLORS.includes(row.color as typeof INK_COLORS[number]) ||
       typeof row.width!=="number"||!Number.isFinite(row.width)||
       row.width<1||row.width>32||!Array.isArray(row.points)||
       !row.points.length||row.points.length>MAX_POINTS)
      throw new Error("Drawing stroke contains unsupported data.");
    const points=row.points.map((point)=>{
      if(!Array.isArray(point)||point.length!==2||
         point.some(v=>typeof v!=="number"||!Number.isFinite(v)||v<0||v>1000))
        throw new Error("Drawing point is outside the book page.");
      return [point[0],point[1]] as InkPoint;
    });
    return {id:row.id!,tool:row.tool as InkDrawTool,color:row.color!,width:row.width!,points};
  });
  if(JSON.stringify(strokes).length>MAX_BYTES)
    throw new Error("The drawing exceeds the page storage limit.");
  return strokes;
}
export function makeInkPageKey(
  kind:"front"|"body",
  pageIndex:number,
  width:number,
  height:number,
  typeface:string,
  measure:string,
  lineSpacing:number,
):string {
  if(!Number.isFinite(pageIndex)||pageIndex<0)throw new Error("Invalid page");
  // Font size is intentionally excluded: paper zoom never changes source page
  // boundaries. Other measures alter the actual layout and must be distinct
  // to avoid showing handwritten notes over the wrong paragraph.
  return [
    kind,Math.trunc(pageIndex),"w"+Math.round(width),"h"+Math.round(height),
    "f"+typeface,"m"+measure,"l"+lineSpacing.toFixed(2),
  ].join(":").slice(0,180);
}
export function inkPath(points:InkPoint[]):string{
  return points.map(([x,y],i)=>(i===0?"M":"L")+x.toFixed(2)+" "+y.toFixed(2)).join(" ");
}
function pointSegmentDistance(p:InkPoint,a:InkPoint,b:InkPoint){
  const dx=b[0]-a[0],dy=b[1]-a[1];
  if(dx===0&&dy===0)return Math.hypot(p[0]-a[0],p[1]-a[1]);
  const t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy)));
  return Math.hypot(p[0]-(a[0]+t*dx),p[1]-(a[1]+t*dy));
}
export function eraseInkAt(strokes:InkStroke[],point:InkPoint,radius=16):InkStroke[]{
  return strokes.filter(stroke=>{
    for(let i=0;i<stroke.points.length;i++){
      const next=stroke.points[i]!;
      const prev=stroke.points[Math.max(0,i-1)]!;
      if(pointSegmentDistance(point,prev,next)<=radius+stroke.width/2)return false;
    }
    return true;
  });
}
export function isInkPageDataValid(value:unknown):value is InkStroke[]{
  try{validateInkStrokes(value);return true;}catch{return false;}
}
function localKey(userId:string,bookId:string,language:string,pageKey:string){
  return GUEST_KEY+[userId,bookId,language,pageKey].map(encodeURIComponent).join(":");
}
export async function loadPageInk(
  userId:string,bookId:string,language:string,pageKey:string,
):Promise<InkStroke[]>{
  if(userId===DEMO_USER_ID){
    try{
      const text=window.localStorage.getItem(localKey(userId,bookId,language,pageKey));
      return text?validateInkStrokes(JSON.parse(text) as unknown):[];
    }catch{return [];}
  }
  const {data,error}=await supabase.from("book_page_ink").select("strokes")
    .eq("user_id",userId).eq("book_id",bookId)
    .eq("language",language).eq("page_key",pageKey).maybeSingle();
  if(error)throw new Error("Could not load your handwritten notes: "+error.message);
  return data?validateInkStrokes(data.strokes):[];
}
export async function savePageInk(
  userId:string,bookId:string,language:string,pageKey:string,
  raw:InkStroke[],
):Promise<void>{
  const strokes=validateInkStrokes(raw);
  if(userId===DEMO_USER_ID){
    window.localStorage.setItem(localKey(userId,bookId,language,pageKey),JSON.stringify(strokes));
    return;
  }
  const {error}=await supabase.from("book_page_ink").upsert({
    user_id:userId,book_id:bookId,language,page_key:pageKey,
    strokes:strokes as unknown as Json,updated_at:new Date().toISOString(),
  },{onConflict:"user_id,book_id,language,page_key"});
  if(error)throw new Error("Could not save your handwritten notes: "+error.message);
}
