import Foundation
import AppKit
import CryptoKit

struct ImageMetrics: Codable {
    let name: String
    let width: Int
    let height: Int
    let quantizedColorCount: Int
    let luminanceRange: Int
    let darkSampleRatio: Double
    let centerDigest: String
}
var metrics: [ImageMetrics] = []
for path in CommandLine.arguments.dropFirst() {
    let url = URL(fileURLWithPath: path)
    guard let data=try? Data(contentsOf: url),
          let image=NSBitmapImageRep(data: data) else {
        fputs("Cannot parse native screenshot at \(path)\n", stderr)
        exit(1)
    }
    let width=image.pixelsWide, height=image.pixelsHigh
    var count=0, dark=0, minL=255, maxL=0
    var colors=Set<Int>(), hashed=[UInt8]()
    // Mid-screen is page text rather than browser status or bottom navigation.
    for y in stride(from: height/4, to: height*3/4, by: 13) {
        for x in stride(from: width/9, to: width*8/9, by: 13) {
            guard let c=image.colorAt(x:x,y:y)?.usingColorSpace(.deviceRGB) else { continue }
            let r=Int(c.redComponent*255),g=Int(c.greenComponent*255),b=Int(c.blueComponent*255)
            let lum=(r*299+g*587+b*114)/1000
            minL=min(minL,lum);maxL=max(maxL,lum)
            colors.insert((r/16)*256+(g/16)*16+(b/16))
            if lum<175 {dark+=1}
            hashed.append(UInt8(lum/8))
            count+=1
        }
    }
    let digest=SHA256.hash(data: Data(hashed)).map { String(format:"%02x",$0) }.joined()
    metrics.append(ImageMetrics(name:url.lastPathComponent,width:width,height:height,
        quantizedColorCount:colors.count,luminanceRange:maxL-minL,
        darkSampleRatio:count==0 ? 0 : Double(dark)/Double(count),
        centerDigest:String(digest.prefix(16))))
}
let encoder=JSONEncoder()
if let data=try? encoder.encode(metrics), let result=String(data:data,encoding:.utf8) {
    print(result)
} else { exit(2) }
