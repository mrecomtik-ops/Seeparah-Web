// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const supportSubmit=vi.hoisted(()=>vi.fn(async()=>({ok:true as const,referenceCode:"SP-TEST-123"})));
vi.mock("@/lib/admin/support.functions",()=>({submitSupportRequest:supportSubmit}));
vi.mock("@/integrations/supabase/client",()=>({
  supabase:{auth:{getSession:vi.fn(async()=>({data:{session:null}}))}},
}));
import { FloatingFeedback } from "./FloatingFeedback";

afterEach(()=>{cleanup();supportSubmit.mockClear();});
describe("site-wide feedback widget",()=>{
  it("allows a guest author to suggest an improvement and records it in the support queue",async()=>{
    render(<FloatingFeedback bare={false}/>);
    fireEvent.click(screen.getByRole("button",{name:"Open support tickets and suggestions"}));
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:"Suggest idea"}));
    fireEvent.change(screen.getByRole("combobox"),{target:{value:"author"}});
    fireEvent.change(screen.getByRole("textbox",{name:"Your name"}),{target:{value:"Example Author"}});
    fireEvent.change(screen.getByRole("textbox",{name:"Reply email"}),{target:{value:"author@example.org"}});
    fireEvent.change(screen.getByRole("textbox",{name:"Your idea"}),{target:{value:"Improve table of contents"}});
    fireEvent.change(screen.getByRole("textbox",{name:/What could we improve/i}),{target:{value:"Offer more author formatting options."}});
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button",{name:"Send suggestion"}));
    await waitFor(()=>expect(supportSubmit).toHaveBeenCalledTimes(1));
    expect(supportSubmit).toHaveBeenCalledWith({
      data:expect.objectContaining({
        requestType:"platform_suggestion",audience:"author",
        subject:"Improve table of contents",
        replyEmail:"author@example.org",
      }),
    });
    expect(await screen.findByText("SP-TEST-123")).toBeTruthy();
  });
  it("exposes a technical-issue ticket action and closable accessible dialog",()=>{
    render(<FloatingFeedback bare/>);
    fireEvent.click(screen.getByRole("button",{name:"Open support tickets and suggestions"}));
    expect(screen.getByRole("button",{name:"Create support ticket"})).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:"Close feedback"}));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
