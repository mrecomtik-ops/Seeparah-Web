import {describe,expect,it} from "vitest";
import {showFloatingFeedback} from "./feedback-route";
describe("QA-023 no help overlay on reading pages",()=>{
  it.each(["/read","/read/1","/read/1/","/sacred-texts/1","/sacred-texts/1/","/admin","/admin/books"])(
    "never overlays %s",path=>expect(showFloatingFeedback(path)).toBe(false));
  it.each(["/","/library","/sacred-texts","/legal","/research","/reading-list"])(
    "keeps support accessible on %s",path=>expect(showFloatingFeedback(path)).toBe(true));
});