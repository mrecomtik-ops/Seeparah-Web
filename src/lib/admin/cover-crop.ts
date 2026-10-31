/** A deliberate local 2:3 crop for an editor-selected source-edition cover.
 * The original file is never mutated or uploaded when crop is enabled.
 * The editor reviews the preview and still must explicitly assign the staged asset.
 */
export async function cropCoverToPortrait(file: File, focusX: number, focusY: number): Promise<File> {
  const image = await createImageBitmap(file);
  try {
    if (!image.width || !image.height) throw new Error("The artwork dimensions could not be read.");
    const ratio = 2 / 3;
    let sourceWidth = image.width;
    let sourceHeight = image.height;
    if (image.width / image.height > ratio) sourceWidth = image.height * ratio;
    else sourceHeight = image.width / ratio;
    const clampedX = Math.min(100, Math.max(0, focusX)) / 100;
    const clampedY = Math.min(100, Math.max(0, focusY)) / 100;
    const sourceX = (image.width - sourceWidth) * clampedX;
    const sourceY = (image.height - sourceHeight) * clampedY;
    const canvas = document.createElement("canvas");
    canvas.width = 900;
    canvas.height = 1350;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser cannot crop artwork.");
    // White background prevents transparent PNG covers becoming black in JPEG.
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight,
      0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((result) => result ? resolve(result) :
        reject(new Error("Cover export failed.")), "image/jpeg", 0.9));
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + "-portrait.jpg",
      { type: "image/jpeg" });
  } finally {
    image.close();
  }
}
