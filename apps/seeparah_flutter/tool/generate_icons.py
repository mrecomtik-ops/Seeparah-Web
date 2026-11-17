#!/usr/bin/env python3
"""Generate repeatable high-res Seeparah book icon in our evergreen/gold palette."""
from pathlib import Path
from PIL import Image, ImageDraw
ROOT=Path(__file__).resolve().parent.parent
OUTPUT=ROOT/"assets/brand/app_icon_1024.png"
OUTPUT.parent.mkdir(parents=True,exist_ok=True)
N=1024
image=Image.new("RGB",(N,N))
pixels=image.load()
for y in range(N):
    for x in range(N):
        v=max(0.,1.-(((x-N*.45)**2+(y-N*.25)**2)**.5)/(N*.9))
        pixels[x,y]=(int(16+13*v),int(65+19*v),int(53+14*v))
d=ImageDraw.Draw(image,"RGBA")
d.ellipse((185,170,839,824),outline=(214,181,111,105),width=10)
d.rounded_rectangle((188,317,836,717),radius=58,fill=(249,238,209,15))
d.polygon([(213,359),(336,338),(484,369),(505,413),(505,700),
 (466,679),(337,644),(213,665)],fill=(249,243,219,255))
d.polygon([(811,359),(688,338),(540,369),(519,413),(519,700),
 (558,679),(687,644),(811,665)],fill=(249,243,219,255))
d.line([(512,408),(512,706)],fill=(190,149,71,255),width=12)
for i in range(4):
    y=445+i*51
    d.arc((257,y,474,y+46),180,339,fill=(17,86,65,98),width=8)
    d.arc((549,y,767,y+46),201,359,fill=(17,86,65,98),width=8)
d.polygon([(590,287),(649,299),(649,408),(621,386),(590,408)],
 fill=(202,157,85,255))
image.save(OUTPUT,optimize=True)
print("Seeparah icon:",OUTPUT)
