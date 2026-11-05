#!/usr/bin/env python3
"""Correct the previously quarantined SP-CAND-0105 premium artwork author.
Edit only the existing author lettering; do NOT reinterpret the original design.
Input is the verified original named WebP committed to non-public staging.
"""
import hashlib
import json
from pathlib import Path
import numpy as np
import cv2
from PIL import Image, ImageDraw, ImageFont

ROOT=Path(__file__).resolve().parents[2]
INPUT=ROOT/"cover-staging/2026-11-05/SP-CAND-0105_tenda-e-castello.webp"
OUTPUT=ROOT/"public/book-covers/premium-42/SP-CAND-0105_tenda-e-castello.webp"
TITLE="Tenda e castello"
AUTHOR="Roberto Sacchetti"
SOURCE_ID="gutenberg:71320"

def main():
    original=Image.open(INPUT).convert("RGB")
    assert original.size==(1024,1536)
    rgb=np.array(original)
    # Original artwork "Carlo Dossi" occupies x=322..712 and y=94..157.
    # Restrict inpainting strictly to these author glyphs; preserve the gold
    # ornamental border, title, scene, and SEEParah imprint.
    roi=rgb[94:157,322:712]
    selected=(roi[:,:,0]>104)&(roi[:,:,1]>110)&(roi[:,:,2]>100)&(roi.sum(axis=2)>410)
    mask=np.zeros(rgb.shape[:2],dtype=np.uint8)
    mask[94:157,322:712]=cv2.dilate((selected*255).astype(np.uint8),
        np.ones((3,3),np.uint8),iterations=1)
    bgr=cv2.cvtColor(rgb,cv2.COLOR_RGB2BGR)
    inpainted=cv2.inpaint(bgr,mask,4,cv2.INPAINT_TELEA)
    image=Image.fromarray(cv2.cvtColor(inpainted,cv2.COLOR_BGR2RGB))
    draw=ImageDraw.Draw(image)
    # Windows' native Garamond regular matches the original ivory serif author
    # lettering. This font is only used for asset authoring, not distributed.
    fonts=[Path("C:/Windows/Fonts/GARA.TTF"),
           Path("/usr/share/fonts/truetype/ebgaramond/EBGaramond12-Regular.ttf")]
    fpath=next((str(p) for p in fonts if p.exists()),None)
    if not fpath:
        raise RuntimeError("An appropriate regular Garamond font is required")
    font=ImageFont.truetype(fpath,59)
    tracking=2.0
    advances=[draw.textlength(ch,font=font) for ch in AUTHOR]
    width=sum(advances)+tracking*(len(AUTHOR)-1)
    box=draw.textbbox((0,0),AUTHOR,font=font)
    x=(1024-width)/2
    y=106-box[1]
    for letter,advance in zip(AUTHOR,advances):
        draw.text((x,y),letter,font=font,fill=(240,228,204))
        x+=advance+tracking
    assert width<560,("Unexpected text width",width)
    assert image.size==(1024,1536)
    OUTPUT.parent.mkdir(parents=True,exist_ok=True)
    # High-quality separate WebP; all original ornaments/scenery preserved.
    image.save(OUTPUT,"WEBP",quality=96,method=6)
    decoded=Image.open(OUTPUT)
    assert decoded.format=="WEBP" and decoded.size==(1024,1536)
    digest=hashlib.sha256(OUTPUT.read_bytes()).hexdigest()
    # 1024x1536 image is a separate book cover, NOT a combined panel.
    print(json.dumps({"title":TITLE,"author":AUTHOR,"source_id":SOURCE_ID,
        "file":str(OUTPUT),"width":decoded.width,"height":decoded.height,
        "size_bytes":OUTPUT.stat().st_size,"sha256":digest,
        "original_sha256":hashlib.sha256(INPUT.read_bytes()).hexdigest(),
        "original_author_corrected":"Carlo Dossi",
        "correction_region":[322,94,712,157]} ,indent=2))
if __name__=="__main__":
    main()
