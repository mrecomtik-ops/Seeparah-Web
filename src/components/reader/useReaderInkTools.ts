import { useEffect, useState } from "react";
import type { PageInkCommand } from "@/components/reader/ReaderPageInk";
import type { InkTool } from "@/lib/reader-ink";

/** Non-privileged UI state for handwriting tools, isolated from the
 * pagination/selection logic in BookReaderV3.
 */
export function useReaderInkTools(pageIdentity:string){
  const [inkEnabled,setInkEnabled]=useState(false);
  const [inkTool,setInkTool]=useState<InkTool>("pen");
  const [inkColor,setInkColor]=useState("#EF4444");
  const [inkWidth,setInkWidth]=useState(8);
  const [inkCommand,setInkCommand]=useState<PageInkCommand|null>(null);
  const [activeInkPageKey,setActiveInkPageKey]=useState<string|null>(null);
  useEffect(()=>setActiveInkPageKey(null),[pageIdentity]);
  const issueInkCommand=(action:PageInkCommand["action"])=>{
    if(!activeInkPageKey)return;
    setInkCommand(previous=>({
      serial:(previous?.serial??0)+1,
      pageKey:activeInkPageKey,
      action,
    }));
  };
  return {
    inkEnabled,setInkEnabled,inkTool,setInkTool,inkColor,setInkColor,
    inkWidth,setInkWidth,inkCommand,activeInkPageKey,
    setActiveInkPageKey,issueInkCommand,
  };
}
