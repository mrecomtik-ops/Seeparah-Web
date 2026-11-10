import type { ReactNode } from "react";
import { paperSheetBounds } from "@/lib/reader-page-zoom";

/** Full paper zoom for one or two physical book leaves. The unzoomed sheet
 * remains the pagination master, while the frame grows with the text.
 * Overflow is handled by the stage as page panning, not repagination.
 */
export function ReaderZoomSheet({
  spread,zoom,pageSize,children,
}:{
  spread:boolean;
  zoom:number;
  pageSize:{width:number;height:number};
  children:ReactNode;
}){
  const bounds=paperSheetBounds(pageSize.width,pageSize.height,spread,zoom);
  return (
    <div className="reader-v3-zoom-frame"
      style={{width:bounds.scaledWidth,height:bounds.scaledHeight}}>
      <div className={spread?"reader-v3-spread":"reader-v3-single"}
        style={{
          width:bounds.originalWidth,
          height:pageSize.height,
          transform:`scale(${zoom})`,
          transformOrigin:"top left",
        }}>
        {children}
      </div>
    </div>
  );
}
