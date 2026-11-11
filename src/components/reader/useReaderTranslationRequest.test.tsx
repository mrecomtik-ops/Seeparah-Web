// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Book } from "@/lib/data";

const fake=vi.hoisted(()=>{
  const getSession=vi.fn(async()=>({data:{session:null},error:null}));
  const refreshSession=vi.fn(async()=>({data:{session:{user:{id:"reader-123"},access_token:"renewed-token"}},error:null}));
  const request=vi.fn(async()=>({status:"requested"}));
  const list=vi.fn(async()=>[]);
  const info=vi.fn();const success=vi.fn();const error=vi.fn();
  return {getSession,refreshSession,request,list,info,success,error};
});
vi.mock("@/integrations/supabase/client",()=>({supabase:{auth:{getSession:fake.getSession,refreshSession:fake.refreshSession}}}));
vi.mock("@/lib/admin/translation-access.functions",()=>({
  requestBookTranslationAccess:fake.request,
  listMyTranslationRequests:fake.list
}));
vi.mock("sonner",()=>({toast:{info:fake.info,success:fake.success,error:fake.error}}));
import { useReaderTranslationRequest } from "./useReaderTranslationRequest";

const book={id:"book-abc",content_classification:"general",
  translation_generation_policy:"approved_only"} as unknown as Book;
function Form({signedIn}:{signedIn:boolean}) {
  const c=useReaderTranslationRequest(book,"reader-123",signedIn);
  return <>
    <button onClick={()=>c.setRequestLanguage("Urdu")}>Choose Urdu</button>
    <button onClick={()=>void c.handleTranslationRequest()}>Request Urdu</button>
  </>;
}
function mount(signedIn:boolean){
  return render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}>
    <Form signedIn={signedIn}/>
  </QueryClientProvider>);
}
afterEach(()=>{cleanup();for(const v of Object.values(fake))v.mockClear();});
describe("QA-026 signed-in translation request",()=>{
  it("refreshes a briefly missing JWT once and submits as the authenticated account",async()=>{
    mount(true);
    fireEvent.click(screen.getByRole("button",{name:"Choose Urdu"}));
    fireEvent.click(screen.getByRole("button",{name:"Request Urdu"}));
    await waitFor(()=>expect(fake.request).toHaveBeenCalledWith({
      data:{accessToken:"renewed-token",bookId:"book-abc",language:"Urdu"}
    }));
    expect(fake.refreshSession).toHaveBeenCalled();
    expect(fake.info).not.toHaveBeenCalledWith(
      expect.stringContaining("Sign in to submit"),expect.anything());
  });
  it("never refreshes a guest session or sends an unauthenticated request",async()=>{
    mount(false);
    fireEvent.click(screen.getByRole("button",{name:"Choose Urdu"}));
    fireEvent.click(screen.getByRole("button",{name:"Request Urdu"}));
    await waitFor(()=>expect(fake.info).toHaveBeenCalled());
    expect(fake.refreshSession).not.toHaveBeenCalled();
    expect(fake.request).not.toHaveBeenCalled();
  });
});