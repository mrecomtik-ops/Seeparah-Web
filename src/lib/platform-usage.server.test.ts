import { describe, expect, it } from "vitest";
import { handlePlatformUsageRequest, parsePlatformUsage } from "./platform-usage.server";

const uuid1="6f0aba8e-2b3c-447f-94da-1416a48f760e";
const uuid2="dd25e951-d855-4535-9895-8b58be5dc895";
function request(body:unknown,origin="https://seeparah.com") {
  const req=new Request("https://seeparah.com/api/platform-usage",{
    method:"POST",headers:{"origin":origin,"content-type":"application/json","user-agent":"Mozilla/5.0"},
    body:JSON.stringify(body),
  });
  Object.defineProperty(req,"cf",{value:{country:"AE",region:"Dubai"}});
  return req;
}
describe("anonymous platform usage privacy/security",()=>{
  it("keeps only random pseudonymous identifiers and coarse Cloudflare geography",()=>{
    const result=parsePlatformUsage(request({}),{
      visitorId:uuid1,sessionId:uuid2,area:"reader",
      email:"private@example.com",ip:"10.1.2.3",fullUrl:"/read/secret-book",
    });
    expect(result).toEqual({
      visitor_id:uuid1,session_id:uuid2,area:"reader",
      country_code:"AE",region:"Dubai",
    });
    expect(JSON.stringify(result)).not.toContain("private");
    expect(JSON.stringify(result)).not.toContain("secret-book");
  });
  it("rejects invalid IDs, private page names and oversized untrusted regions",()=>{
    expect(parsePlatformUsage(request({}),{visitorId:"abc",sessionId:uuid2,area:"reader"})).toBeNull();
    expect(parsePlatformUsage(request({}),{visitorId:uuid1,sessionId:uuid2,area:"admin"})).toBeNull();
    const req=request({});
    Object.defineProperty(req,"cf",{value:{country:"XX!",region:"A".repeat(200)},configurable:true});
    const parsed=parsePlatformUsage(req,{visitorId:uuid1,sessionId:uuid2,area:"home"});
    expect(parsed?.country_code).toBe("ZZ");
    expect(parsed?.region.length).toBe(64);
  });
  it("rejects cross-site collection requests without touching the database",async()=>{
    const response=await handlePlatformUsageRequest(request({
      visitorId:uuid1,sessionId:uuid2,area:"home",
    },"https://evil.example"),{});
    expect(response.status).toBe(403);
  });
  it("returns no event when CF bot detection flags automated traffic",async()=>{
    const req=request({visitorId:uuid1,sessionId:uuid2,area:"library"});
    Object.defineProperty(req,"cf",{value:{country:"AE",botManagement:{score:1}}});
    const response=await handlePlatformUsageRequest(req,{});
    expect(response.status).toBe(204);
  });
});
