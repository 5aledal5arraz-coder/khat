"use client"

import { useState, useCallback, useEffect } from "react"
import Cropper from "react-easy-crop"
import type { Area } from "react-easy-crop"
import { Button } from "@/components/ui/button"
import {
  ZoomIn,
  ZoomOut,
  RotateCw,
  X,
  Check,
  Loader2,
} from "lucide-react"

/* ─── Types ─── */

interface ImageCropModalProps {
  /** The raw image file selected by the user */
  file: File
  /** Aspect ratio for the crop area (default: 1 for square) */
  aspect?: number
  /** Shape of the crop area */
  cropShape?: "rect" | "round"
  /** Output image size in pixels (longest side). Default 800. */
  outputSize?: number
  /** Output quality 0–1. Default 0.88 */
  outputQuality?: number
  /** Called with the cropped image blob when user confirms */
  onConfirm: (croppedFile: File) => void
  /** Called when user cancels */
  onCancel: () => void
}

/* ─── Canvas crop helper ─── */

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    img.addEventListener("load", () => resolve(img))
    img.addEventListener("error", (err) => reject(err))
    img.crossOrigin = "anonymous"
    img.src = url
  })
}

function getRadianAngle(degreeValue: number) {
  return (degreeValue * Math.PI) / 180
}

/**
 * Crop an image using canvas.
 * Uses the proven approach from react-easy-crop docs:
 * 1. Create a canvas sized to the rotated bounding box
 * 2. Draw the rotated image
 * 3. Extract the crop area by drawing it onto a second canvas
 */
async function getCroppedImg(
  imageSrc: string,
  pixelCrop: Area,
  rotation: number,
  outputSize: number,
  outputQuality: number,
): Promise<File> {
  const image = await createImage(imageSrc)

  const radians = getRadianAngle(rotation)
  const sin = Math.abs(Math.sin(radians))
  const cos = Math.abs(Math.cos(radians))

  // Bounding box of the rotated image
  const bBoxWidth = image.width * cos + image.height * sin
  const bBoxHeight = image.width * sin + image.height * cos

  // Step 1: Draw the full rotated image onto a canvas
  const rotCanvas = document.createElement("canvas")
  rotCanvas.width = bBoxWidth
  rotCanvas.height = bBoxHeight
  const rotCtx = rotCanvas.getContext("2d")!

  rotCtx.translate(bBoxWidth / 2, bBoxHeight / 2)
  rotCtx.rotate(radians)
  rotCtx.translate(-image.width / 2, -image.height / 2)
  rotCtx.drawImage(image, 0, 0)

  // Step 2: Extract the crop area onto a final output canvas
  const scale = Math.min(outputSize / Math.max(pixelCrop.width, pixelCrop.height), 1)
  const outW = Math.round(pixelCrop.width * scale)
  const outH = Math.round(pixelCrop.height * scale)

  const outCanvas = document.createElement("canvas")
  outCanvas.width = outW
  outCanvas.height = outH
  const outCtx = outCanvas.getContext("2d")!

  outCtx.imageSmoothingEnabled = true
  outCtx.imageSmoothingQuality = "high"

  // Draw the cropped region from the rotated canvas onto the output canvas
  outCtx.drawImage(
    rotCanvas,
    pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height,
    0, 0, outW, outH,
  )

  // Step 3: Export to blob — try WebP first, fall back to JPEG for Safari
  // Some browsers (Safari) return a PNG blob instead of WebP, so we check
  // the actual blob.type to determine the real format.
  const blob = await new Promise<Blob>((resolve, reject) => {
    outCanvas.toBlob(
      (b) => {
        if (b && b.size > 0 && b.type === "image/webp") return resolve(b)
        // Fallback to JPEG if WebP failed or browser returned a different format
        outCanvas.toBlob(
          (jpgBlob) => {
            if (jpgBlob) return resolve(jpgBlob)
            reject(new Error("Canvas export failed"))
          },
          "image/jpeg",
          outputQuality,
        )
      },
      "image/webp",
      outputQuality,
    )
  })

  const extMap: Record<string, string> = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png" }
  const ext = extMap[blob.type] || "jpg"
  return new File([blob], `cropped.${ext}`, { type: blob.type })
}

/* ─── Component ─── */

export function ImageCropModal({
  file,
  aspect = 1,
  cropShape = "round",
  outputSize = 800,
  outputQuality = 0.88,
  onConfirm,
  onCancel,
}: ImageCropModalProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [processing, setProcessing] = useState(false)

  // Read file into data URL
  useEffect(() => {
    const reader = new FileReader()
    reader.onload = () => setImageSrc(reader.result as string)
    reader.readAsDataURL(file)
    return () => reader.abort()
  }, [file])

  const onCropComplete = useCallback((_: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels)
  }, [])

  const handleApply = async () => {
    if (!imageSrc || !croppedAreaPixels) return
    setProcessing(true)
    try {
      const croppedFile = await getCroppedImg(
        imageSrc,
        croppedAreaPixels,
        rotation,
        outputSize,
        outputQuality,
      )
      onConfirm(croppedFile)
    } catch (err) {
      console.error("Crop failed:", err)
    } finally {
      setProcessing(false)
    }
  }

  if (!imageSrc) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-md">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/90 backdrop-blur-md">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
        <h3 className="text-base font-semibold text-white">تعديل الصورة</h3>
        <button
          onClick={onCancel}
          className="flex h-9 w-9 items-center justify-center rounded-xl text-white/60 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Crop Area */}
      <div className="relative flex-1">
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          rotation={rotation}
          aspect={aspect}
          cropShape={cropShape}
          showGrid={false}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onRotationChange={setRotation}
          onCropComplete={onCropComplete}
          style={{
            containerStyle: { background: "transparent" },
            cropAreaStyle: {
              border: "2px solid rgba(var(--primary-rgb, 200 170 110), 0.6)",
              boxShadow: "0 0 0 9999px rgba(0,0,0,0.65)",
            },
          }}
        />
      </div>

      {/* Controls */}
      <div className="space-y-4 border-t border-white/10 bg-black/60 px-6 py-5 backdrop-blur-xl">
        {/* Zoom slider */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => setZoom(Math.max(1, zoom - 0.2))}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="h-1 flex-1 appearance-none rounded-full bg-white/20 accent-primary [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-md"
          />
          <button
            onClick={() => setZoom(Math.min(3, zoom + 0.2))}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          >
            <ZoomIn className="h-4 w-4" />
          </button>

          {/* Rotate */}
          <div className="mx-2 h-5 w-px bg-white/10" />
          <button
            onClick={() => setRotation((r) => (r + 90) % 360)}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-white/60 transition-colors hover:bg-white/10 hover:text-white"
            title="تدوير"
          >
            <RotateCw className="h-4 w-4" />
          </button>
        </div>

        {/* Action buttons */}
        <div className="flex justify-end gap-3">
          <Button
            variant="ghost"
            onClick={onCancel}
            disabled={processing}
            className="rounded-xl text-white/70 hover:bg-white/10 hover:text-white"
          >
            إلغاء
          </Button>
          <Button
            onClick={handleApply}
            disabled={processing}
            className="gap-2 rounded-xl px-6"
          >
            {processing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                جارٍ المعالجة...
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                تطبيق
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
