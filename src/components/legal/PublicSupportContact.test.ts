import {describe,expect,it} from "vitest";
import { publicSupportChannel } from "./PublicSupportContact";
describe("QA-035 verified configured support channel",()=>{
  it("accepts only a valid published email and an HTTPS Seeparah link",()=>{
    expect(publicSupportChannel({email:"support@example.org",helpUrl:"https://seeparah.com/legal#support"})).toEqual({
      email:"support@example.org",helpUrl:"https://seeparah.com/legal#support"
    });
  });
  it("does not fabricate missing addresses or trust an external script URL",()=>{
    expect(publicSupportChannel({email:""})).toBeNull();
    expect(publicSupportChannel({})).toBeNull();
    expect(publicSupportChannel({email:"valid@example.org",helpUrl:"javascript:alert(1)"}))
      .toEqual({email:"valid@example.org",helpUrl:null});
    expect(publicSupportChannel({email:"valid@example.org",helpUrl:"https://evil.example/"})?.helpUrl).toBeNull();
  });
});