/** A deliberate local 2:3 crop for an editor-selected source-edition cover.
 * The original file is never mutated or uploaded when crop is enabled.
 * The editor reviews the preview and still must explicitly assign the staged asset.
 */
/** Source crop rectangle for preview-equivalent 2:3 portrait output. */
export function calculatePortraitCrop(width: number, height: number, focusX: number, focusY: number) {
  if (width <= 0 || height <= 0) throw new Error("Invalid cover dimensions.");
  const ratio = 2 / 3;
  const sourceWidth = width / height > ratio ? height * ratio : width;
  const sourceHeight = width / height > ratio ? height : width / ratio;
  return {
    x: (width - sourceWidth) * (Math.min(100, Math.max(0, focusX)) / 100),
    y: (height - sourceHeight) * (Math.min(100, Math.max(0, focusY)) / 100),
    width: sourceWidth,
    height: sourceHeight,
  };
}

export async function cropCoverToPortrait(file: File, focusX: number, focusY: number): Promise<File> {
  const image = await createImageBitmap(file);
  try {
    if (!image.width || !image.height) throw new Error("The artwork dimensions could not be read.");
    const crop = calculatePortraitCrop(image.width, image.height, focusX, focusY);
    const canvas = document.createElement("canvas");
    canvas.width = 900;
    canvas.height = 1350;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser cannot crop artwork.");
    // White background prevents transparent PNG covers becoming black in JPEG.
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height,
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
