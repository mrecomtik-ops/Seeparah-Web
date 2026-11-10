/** A physical book page is typeset once at the 16px editorial master.
 * The page + its text then zoom together. This preserves chapter/folio
 * boundaries when a reader changes only the text-size slider.
 */
export const CANONICAL_BOOK_FONT_SIZE = 16;
export function paperZoomForFontSize(size:number):number{
  if(!Number.isFinite(size))return 1;
  return Math.max(1,Math.min(1.25,size/CANONICAL_BOOK_FONT_SIZE));
}
export function paperSheetBounds(
  width:number,height:number,spread:boolean,zoom:number,spineGap=10,
){
  const originalWidth=width*(spread?2:1)+(spread?spineGap:0);
  return {
    originalWidth,
    scaledWidth:Math.ceil(originalWidth*zoom),
    scaledHeight:Math.ceil(height*zoom),
  };
}
