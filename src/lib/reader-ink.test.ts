import {describe,it,expect} from "vitest";
import {
  validateInkStrokes,eraseInkAt,makeInkPageKey,inkPath,isInkPageDataValid,
  type InkStroke,
} from "./reader-ink";
const stroke:InkStroke={
  id:"stroke-1",tool:"pen",color:"#3B82F6",width:8,
  points:[[100,100],[300,300],[600,600]],
};
describe("Seeparah source-safe per-page handwritten notes",()=>{
  it("accepts normalized pen strokes and a marker while rejecting malformed data",()=>{
    expect(validateInkStrokes([stroke])).toEqual([stroke]);
    expect(isInkPageDataValid([stroke])).toBe(true);
    expect(isInkPageDataValid([{...stroke,color:"url(javascript:evil)"}])).toBe(false);
    expect(()=>validateInkStrokes([{...stroke,points:[[-1,0]]}])).toThrow();
    expect(()=>validateInkStrokes([{...stroke,points:[[4000,0]]}])).toThrow();
    expect(()=>validateInkStrokes(Array(251).fill(stroke))).toThrow();
  });
  it("eraser removes only a hit brush stroke, preserving other notes",()=>{
    const other:InkStroke={...stroke,id:"other",points:[[800,100],[900,200]]};
    expect(eraseInkAt([stroke,other],[200,200])).toEqual([other]);
    expect(eraseInkAt([stroke,other],[0,900])).toHaveLength(2);
    expect(inkPath(stroke.points)).toContain("L600.00 600.00");
  });
  it("ties annotations to layout not font zoom so pages do not gain phantom marks",()=>{
    const a=makeInkPageKey("body",22,380,570,"literary","medium",1.5);
    const b=makeInkPageKey("body",22,380,570,"literary","medium",1.5);
    const other=makeInkPageKey("body",22,420,630,"literary","medium",1.5);
    expect(a).toBe(b);
    expect(other).not.toBe(a);
    expect(makeInkPageKey("front",1,380,570,"literary","medium",1.5)).not.toBe(a);
    expect(a).toMatch(/^body:22:/);
  });
});
