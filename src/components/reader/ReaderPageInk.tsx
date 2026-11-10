import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  eraseInkAt, inkPath, loadPageInk, savePageInk,
  type InkDrawTool, type InkPoint, type InkStroke, type InkTool,
} from "@/lib/reader-ink";

export interface PageInkCommand {
  serial:number;
  pageKey:string;
  action:"undo"|"redo"|"clear";
}
export interface ReaderPageInkProps {
  userId:string;
  bookId:string;
  language:string;
  pageKey:string;
  enabled:boolean;
  tool:InkTool;
  color:string;
  width:number;
  command:PageInkCommand|null;
  onActivate:(pageKey:string)=>void;
}
type Draft={pageKey:string;strokes:InkStroke[]};
const limitHistory=30;

/** A transparent layer above one source-preserving physical book leaf.
 * Coordinates are normalized to the page (0-1000 each axis) and stay
 * accurate when paper zoom changes. Other reflows get a different pageKey;
 * we never silently move a handwritten note onto an unrelated passage.
 */
export function ReaderPageInk({
  userId,bookId,language,pageKey,enabled,tool,color,width,command,onActivate,
}:ReaderPageInkProps){
  const client=useQueryClient();
  const queryKey=["reader-page-ink",userId,bookId,language,pageKey] as const;
  const saved=useQuery({
    queryKey,
    queryFn:()=>loadPageInk(userId,bookId,language,pageKey),
    staleTime:Infinity,
    retry:false,
  });
  const [draft,setDraft]=useState<Draft|null>(null);
  const [drawing,setDrawing]=useState<InkStroke|null>(null);
  const originalRef=useRef<InkStroke[]>([]);
  const erasingRef=useRef<InkStroke[]|null>(null);
  const historyRef=useRef<InkStroke[][]>([]);
  const redoRef=useRef<InkStroke[][]>([]);
  const queueRef=useRef<Promise<void>>(Promise.resolve());
  const lastCommandRef=useRef(0);
  const activePageRef=useRef(pageKey);
  const strokes=draft?.pageKey===pageKey?draft.strokes:(saved.data??[]);
  const liveStrokesRef=useRef(strokes);
  liveStrokesRef.current=strokes;

  useEffect(()=>{
    // React may reuse this canvas between adjacent leaves; never let an
    // earlier page's local unsaved draft flash on the new page.
    activePageRef.current=pageKey;
    historyRef.current=[];
    redoRef.current=[];
    setDraft(null);
    setDrawing(null);
    erasingRef.current=null;
  },[pageKey]);

  const commit=useCallback((next:InkStroke[],remember:boolean)=>{
    const previous=liveStrokesRef.current;
    if(remember){
      historyRef.current=[...historyRef.current.slice(-(limitHistory-1)),previous];
      redoRef.current=[];
    }
    liveStrokesRef.current=next;
    setDraft({pageKey,strokes:next});
    client.setQueryData([...queryKey],next);
    const captured={userId,bookId,language,pageKey,strokes:next};
    queueRef.current=queueRef.current.catch(()=>{}).then(()=>savePageInk(
      captured.userId,captured.bookId,captured.language,captured.pageKey,captured.strokes,
    ));
    void queueRef.current.catch(()=>toast.error("Could not sync handwriting. Check your connection."));
  },[bookId,client,language,pageKey,queryKey,userId]);

  useEffect(()=>{
    if(!command||command.pageKey!==pageKey||
       command.serial<=lastCommandRef.current)return;
    lastCommandRef.current=command.serial;
    const current=liveStrokesRef.current;
    if(command.action==="clear"){
      if(current.length)commit([],true);
    }else if(command.action==="undo"){
      const previous=historyRef.current.pop();
      if(previous){
        redoRef.current.push(current);
        commit(previous,false);
      }
    }else if(command.action==="redo"){
      const next=redoRef.current.pop();
      if(next){
        historyRef.current.push(current);
        commit(next,false);
      }
    }
  },[command,commit,pageKey]);

  const pointFromEvent=(event:React.PointerEvent<SVGSVGElement>):InkPoint=>{
    const bounds=event.currentTarget.getBoundingClientRect();
    return [
      Math.max(0,Math.min(1000,(event.clientX-bounds.left)/Math.max(1,bounds.width)*1000)),
      Math.max(0,Math.min(1000,(event.clientY-bounds.top)/Math.max(1,bounds.height)*1000)),
    ];
  };
  const onPointerDown=(event:React.PointerEvent<SVGSVGElement>)=>{
    if(!enabled||saved.isPending||saved.isError||!event.isPrimary||
       (event.pointerType==="mouse"&&event.button!==0))return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    onActivate(pageKey);
    const point=pointFromEvent(event);
    originalRef.current=liveStrokesRef.current;
    if(tool==="eraser"){
      const next=eraseInkAt(originalRef.current,point);
      erasingRef.current=next;
      setDraft({pageKey,strokes:next});
    }else{
      const next:InkStroke={
        id:crypto.randomUUID(),
        tool:tool as InkDrawTool,color,
        width:tool==="marker"?Math.max(20,width*2.5):width,
        points:[point],
      };
      setDrawing(next);
    }
  };
  const onPointerMove=(event:React.PointerEvent<SVGSVGElement>)=>{
    if(!enabled||!event.currentTarget.hasPointerCapture(event.pointerId))return;
    event.preventDefault();
    event.stopPropagation();
    const point=pointFromEvent(event);
    if(tool==="eraser"&&erasingRef.current!==null){
      const next=eraseInkAt(erasingRef.current,point);
      erasingRef.current=next;
      setDraft({pageKey,strokes:next});
      return;
    }
    setDrawing(previous=>{
      if(!previous||previous.points.length>=800)return previous;
      const last=previous.points[previous.points.length-1]!;
      if(Math.hypot(point[0]-last[0],point[1]-last[1])<1.3)return previous;
      return {...previous,points:[...previous.points,point]};
    });
  };
  const finish=(event:React.PointerEvent<SVGSVGElement>)=>{
    if(!event.currentTarget.hasPointerCapture(event.pointerId))return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.releasePointerCapture(event.pointerId);
    if(tool==="eraser"){
      const next=erasingRef.current;
      erasingRef.current=null;
      if(next&&next.length!==originalRef.current.length)commit(next,true);
      else setDraft({pageKey,strokes:originalRef.current});
    }else if(drawing){
      commit([...originalRef.current,drawing],true);
      setDrawing(null);
    }
  };
  const renderStroke=(stroke:InkStroke)=>stroke.points.length===1?
    <circle key={stroke.id} cx={stroke.points[0]![0]} cy={stroke.points[0]![1]}
      r={stroke.width/2} fill={stroke.color} opacity={stroke.tool==="marker"?0.35:1}/>:
    <path key={stroke.id} d={inkPath(stroke.points)} fill="none"
      stroke={stroke.color} strokeWidth={stroke.width}
      strokeLinecap="round" strokeLinejoin="round"
      opacity={stroke.tool==="marker"?0.35:1}/>;
  return (
    <svg className={"reader-v3-ink-canvas "+(enabled?"reader-v3-ink-active":"")}
      role={enabled?"application":"img"}
      aria-label={enabled?"Draw or erase handwritten notes on this book page":"Handwritten notes on this page"}
      viewBox="0 0 1000 1000" preserveAspectRatio="none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={finish}
      style={{pointerEvents:enabled?"auto":"none",touchAction:enabled?"none":"auto"}}
    >
      {strokes.map(renderStroke)}
      {drawing&&renderStroke(drawing)}
      {enabled&&saved.isPending&&
        <text x="500" y="30" textAnchor="middle" fill="currentColor" fontSize="24">
          Loading annotations…
        </text>}
    </svg>
  );
}
