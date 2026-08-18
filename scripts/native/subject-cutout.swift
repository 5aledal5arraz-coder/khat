// Lift ONE PERSON out of a video frame, and report what was found.
//
// Uses Vision's VNGenerateForegroundInstanceMaskRequest — the same engine
// behind "Remove Background" in Preview — so this runs entirely on this Mac.
// No image is uploaded anywhere.
//
//   subject-cutout <in.png> <out.png>     → writes the PNG, prints one JSON line
//
// IT USED TO KEEP EVERY FOREGROUND INSTANCE, AND THAT IS WHY CHAIRS SHIPPED.
//
// The previous version called `generateMaskedImage(ofInstances:
// observation.allInstances, …)`. `allInstances` is every object Vision
// separated from the background — the guest, the chair he sits in, the mic
// stand. All of them came out as one "subject", so حسام's cut-out went live
// with a wooden chair leg attached below his hand and two others kept the arm
// of a leather chair. Nothing in the pipeline had an opinion about it, because
// nothing here ever asked WHICH instance was the person.
//
// Now a face is detected first and the mask keeps only the instance the face
// actually sits in. No face → no output, which is the correct answer for a
// frame where the camera was on the host or on a cutaway.
//
// The JSON line is the other half. Frame choice used to be "whichever mask
// reaches furthest down the image", which has no idea whether the subject is
// blinking, mid-word, sliced by the frame edge, or facing away. These are the
// measurements that let the caller reject those frames.

import Foundation
import Vision
import CoreImage
import AppKit

func fail(_ code: String, _ status: Int32) -> Never {
    FileHandle.standardError.write("\(code)\n".data(using: .utf8)!)
    exit(status)
}

let args = CommandLine.arguments
guard args.count >= 3 else {
    fail("usage: subject-cutout <in> <out>", 2)
}
let inURL = URL(fileURLWithPath: args[1])
let outURL = URL(fileURLWithPath: args[2])

guard let ciImage = CIImage(contentsOf: inURL) else { fail("CANNOT_READ", 1) }
let W = ciImage.extent.width
let H = ciImage.extent.height
let handler = VNImageRequestHandler(ciImage: ciImage, options: [:])

// ─── 1. Faces ────────────────────────────────────────────────────────────────
// Landmarks, not just rectangles: the mouth and eye openings below are the
// difference between a portrait and a frame caught mid-word or mid-blink.
let faceReq = VNDetectFaceLandmarksRequest()
do { try handler.perform([faceReq]) } catch { fail("FACE_ERR \(error)", 1) }

guard let faces = faceReq.results, !faces.isEmpty else { fail("NO_FACE", 3) }

// The subject is the largest face in the frame. On a two-seat set the other
// person is further from the camera; when the camera is on the host instead,
// the caller rejects the frame on face position/size, not here.
let face = faces.max(by: { $0.boundingBox.width * $0.boundingBox.height
                         < $1.boundingBox.width * $1.boundingBox.height })!

// Vision's boundingBox is normalized with a BOTTOM-LEFT origin. Everything
// this tool prints is in pixels with a TOP-LEFT origin, because that is what
// sharp and every crop on the other side of this pipe uses.
let fb = face.boundingBox
let faceX = fb.minX * W
let faceW = fb.width * W
let faceH = fb.height * H
let faceY = (1 - fb.maxY) * H

/// Mean of a landmark region's points, in normalized-image space.
func points(_ region: VNFaceLandmarkRegion2D?) -> [CGPoint] {
    guard let r = region else { return [] }
    return r.normalizedPoints.map {
        CGPoint(x: fb.minX + $0.x * fb.width, y: fb.minY + $0.y * fb.height)
    }
}

/// Vertical opening ÷ horizontal width for a closed loop of landmark points.
/// Scale-free on purpose: it must mean the same thing at any face size.
func openness(_ pts: [CGPoint]) -> Double {
    guard pts.count >= 4 else { return -1 }
    let xs = pts.map(\.x), ys = pts.map(\.y)
    let w = (xs.max()! - xs.min()!)
    let h = (ys.max()! - ys.min()!)
    guard w > 0 else { return -1 }
    // y is normalized against image height and x against image width; put them
    // in the same unit before dividing or the ratio changes with aspect.
    return Double((h * H) / (w * W))
}

let mouthOpen = openness(points(face.landmarks?.outerLips))
let leftEye = openness(points(face.landmarks?.leftEye))
let rightEye = openness(points(face.landmarks?.rightEye))
let eyeOpen = (leftEye < 0 || rightEye < 0) ? -1 : min(leftEye, rightEye)

// ─── 2. The instance the face is in ──────────────────────────────────────────
let maskReq = VNGenerateForegroundInstanceMaskRequest()
do { try handler.perform([maskReq]) } catch { fail("MASK_ERR \(error)", 1) }
guard let obs = maskReq.results?.first else { fail("NO_SUBJECT", 3) }

// `instanceMask` labels every pixel with the index of the instance it belongs
// to (0 = background). Sampling it just under the face centre — the neck, not
// the eyes, so a pair of glasses or a headscarf edge cannot decide it — names
// the instance that is the person.
let probeX = fb.midX
let probeY = fb.minY - fb.height * 0.10   // below the chin, bottom-left origin

let maskBuf = obs.instanceMask
CVPixelBufferLockBaseAddress(maskBuf, .readOnly)
let mw = CVPixelBufferGetWidth(maskBuf)
let mh = CVPixelBufferGetHeight(maskBuf)
let rowBytes = CVPixelBufferGetBytesPerRow(maskBuf)
guard let base = CVPixelBufferGetBaseAddress(maskBuf) else {
    CVPixelBufferUnlockBaseAddress(maskBuf, .readOnly)
    fail("MASK_UNREADABLE", 4)
}
let bytes = base.assumingMemoryBound(to: UInt8.self)

func label(atNormalized x: CGFloat, _ yBottomLeft: CGFloat) -> Int {
    let px = min(max(Int(x * CGFloat(mw)), 0), mw - 1)
    let py = min(max(Int((1 - yBottomLeft) * CGFloat(mh)), 0), mh - 1)
    return Int(bytes[py * rowBytes + px])
}

// One probe can land on a highlight or a mask hole. Vote over a small column
// under the chin instead, and take the most common non-background label.
var votes: [Int: Int] = [:]
for dy in stride(from: 0.0, through: 0.18, by: 0.03) {
    for dx in [-0.06, -0.02, 0.02, 0.06] as [CGFloat] {
        let l = label(atNormalized: probeX + dx * fb.width, probeY - CGFloat(dy))
        if l != 0 { votes[l, default: 0] += 1 }
    }
}
let picked = votes.max(by: { $0.value < $1.value })?.key

guard let instance = picked, obs.allInstances.contains(instance) else {
    CVPixelBufferUnlockBaseAddress(maskBuf, .readOnly)
    fail("FACE_NOT_IN_ANY_INSTANCE", 3)
}

// How far the chosen instance reaches, and whether it is cut off by the frame.
// A subject touching the left or right edge is one whose arm the crop sliced;
// touching the TOP means the crown of the head is gone. The bottom is expected
// — the clothing is supposed to run off it.
var minX = mw, maxX = -1, minY = mh, maxY = -1
for py in 0..<mh {
    let row = py * rowBytes
    for px in 0..<mw where Int(bytes[row + px]) == instance {
        if px < minX { minX = px }
        if px > maxX { maxX = px }
        if py < minY { minY = py }
        if py > maxY { maxY = py }
    }
}
CVPixelBufferUnlockBaseAddress(maskBuf, .readOnly)
guard maxX >= 0 else { fail("EMPTY_INSTANCE", 3) }

let sx = W / CGFloat(mw), sy = H / CGFloat(mh)
let edge = 2   // a mask edge is not pixel-exact; 2px of slack, in mask space

// ─── 3. Write the cut-out ────────────────────────────────────────────────────
do {
    let masked = try obs.generateMaskedImage(
        ofInstances: [instance],
        from: handler,
        croppedToInstancesExtent: false
    )
    let ci = CIImage(cvPixelBuffer: masked)
    let context = CIContext()
    guard
        let colorSpace = CGColorSpace(name: CGColorSpace.sRGB),
        let data = context.pngRepresentation(of: ci, format: .RGBA8, colorSpace: colorSpace)
    else { fail("ENCODE_FAILED", 4) }
    try data.write(to: outURL)
} catch {
    fail("ERR \(error)", 1)
}

func j(_ v: Double) -> String { String(format: "%.5f", v) }

print("""
{"ok":true,\
"width":\(Int(W)),"height":\(Int(H)),\
"faces":\(faces.count),"instances":\(obs.allInstances.count),"picked":\(instance),\
"face":{"x":\(j(Double(faceX))),"y":\(j(Double(faceY))),\
"w":\(j(Double(faceW))),"h":\(j(Double(faceH)))},\
"mouthOpen":\(j(mouthOpen)),"eyeOpen":\(j(eyeOpen)),\
"yaw":\(j(face.yaw?.doubleValue ?? 0)),"roll":\(j(face.roll?.doubleValue ?? 0)),\
"mask":{"x":\(j(Double(CGFloat(minX) * sx))),"y":\(j(Double(CGFloat(minY) * sy))),\
"w":\(j(Double(CGFloat(maxX - minX + 1) * sx))),"h":\(j(Double(CGFloat(maxY - minY + 1) * sy)))},\
"touch":{"left":\(minX <= edge),"right":\(maxX >= mw - 1 - edge),\
"top":\(minY <= edge),"bottom":\(maxY >= mh - 1 - edge)}}
""")
