import { Eraser, Highlighter, PenLine, RotateCcw, RotateCw, Trash2, X } from "lucide-react";
import { INK_COLORS, type InkTool } from "@/lib/reader-ink";
import type { PageInkCommand } from "@/components/reader/ReaderPageInk";

export function ReaderInkToolbar({
  tool,color,width,hasActivePage,onTool,onColor,onWidth,onCommand,onClose,
}:{
  tool:InkTool; color:string; width:number; hasActivePage:boolean;
  onTool:(value:InkTool)=>void;onColor:(value:string)=>void;
  onWidth:(value:number)=>void;
  onCommand:(action:PageInkCommand["action"])=>void;
  onClose:()=>void;
}){
  return (
    <aside className="reader-v3-ink-toolbar"
      role="toolbar" aria-label="Handwriting and drawing tools">
      <div className="reader-v3-ink-tools">
        {([
          ["pen","Pen — write or draw",PenLine],
          ["marker","Marker — translucent color",Highlighter],
          ["eraser","Eraser — remove brush strokes",Eraser],
        ] as const).map(([name,label,Icon])=>(
          <button key={name} type="button" aria-label={label}
            title={label} aria-pressed={tool===name}
            className={"reader-v3-ink-tool "+(tool===name?"reader-v3-ink-tool-selected":"")}
            onClick={()=>onTool(name)}>
            <Icon className="h-4 w-4" aria-hidden="true"/>
            <span className="hidden sm:inline text-xs capitalize">{name}</span>
          </button>
        ))}
      </div>
      <div className="reader-v3-ink-palette" role="group" aria-label="Ink colors">
        {INK_COLORS.map(value=>(
          <button key={value} type="button" className="reader-v3-ink-color"
            aria-label={"Ink color "+value} aria-pressed={color===value}
            title={"Color "+value} onClick={()=>{onColor(value);if(tool==="eraser")onTool("pen");}}
            style={{backgroundColor:value,outline:color===value?"2px solid var(--color-primary)":"none",outlineOffset:2}}/>
        ))}
      </div>
      <label className="reader-v3-ink-width">
        <span className="sr-only">Pen thickness</span>
        <input aria-label="Pen thickness" type="range" min={4} max={24} step={2}
          value={width} onChange={event=>onWidth(Number(event.target.value))}/>
      </label>
      <div className="reader-v3-ink-tools">
        <button type="button" className="reader-v3-ink-tool" aria-label="Undo drawing" title="Undo"
          disabled={!hasActivePage} onClick={()=>onCommand("undo")}>
          <RotateCcw className="h-4 w-4" aria-hidden="true"/>
        </button>
        <button type="button" className="reader-v3-ink-tool" aria-label="Redo drawing" title="Redo"
          disabled={!hasActivePage} onClick={()=>onCommand("redo")}>
          <RotateCw className="h-4 w-4" aria-hidden="true"/>
        </button>
        <button type="button" className="reader-v3-ink-tool" aria-label="Clear drawings on active page"
          title="Clear page" disabled={!hasActivePage}
          onClick={()=>{
            if(window.confirm("Clear all handwritten marks on this page? You can undo this action."))onCommand("clear");
          }}>
          <Trash2 className="h-4 w-4" aria-hidden="true"/>
        </button>
        <button type="button" className="reader-v3-ink-tool" aria-label="Close drawing tools"
          title="Finish drawing" onClick={onClose}>
          <X className="h-4 w-4" aria-hidden="true"/>
        </button>
      </div>
      <span className="reader-v3-ink-hint" role="status">
        Draw with your finger, mouse or stylus · saved per page and reading layout
      </span>
    </aside>
  );
}
