// Lift the subject out of a photograph and write a transparent PNG.
//
// Uses Vision's VNGenerateForegroundInstanceMaskRequest — the same engine
// behind "Remove Background" in Preview — so this runs entirely on this Mac.
// No image is uploaded anywhere.
//
//   swift cutout.swift <in.jpg> <out.png>

import Foundation
import Vision
import CoreImage
import AppKit

let args = CommandLine.arguments
guard args.count >= 3 else {
    FileHandle.standardError.write("usage: cutout.swift <in> <out>\n".data(using: .utf8)!)
    exit(2)
}
let inURL = URL(fileURLWithPath: args[1])
let outURL = URL(fileURLWithPath: args[2])

guard let ciImage = CIImage(contentsOf: inURL) else {
    FileHandle.standardError.write("cannot read \(args[1])\n".data(using: .utf8)!)
    exit(1)
}

let handler = VNImageRequestHandler(ciImage: ciImage, options: [:])
let request = VNGenerateForegroundInstanceMaskRequest()

do {
    try handler.perform([request])
    guard let observation = request.results?.first else {
        FileHandle.standardError.write("NO_SUBJECT\n".data(using: .utf8)!)
        exit(3)
    }
    let masked = try observation.generateMaskedImage(
        ofInstances: observation.allInstances,
        from: handler,
        croppedToInstancesExtent: false
    )
    let ci = CIImage(cvPixelBuffer: masked)
    let context = CIContext()
    guard
        let colorSpace = CGColorSpace(name: CGColorSpace.sRGB),
        let data = context.pngRepresentation(of: ci, format: .RGBA8, colorSpace: colorSpace)
    else {
        FileHandle.standardError.write("ENCODE_FAILED\n".data(using: .utf8)!)
        exit(4)
    }
    try data.write(to: outURL)
    let coverage = Double(observation.allInstances.count)
    print("OK instances=\(Int(coverage))")
} catch {
    FileHandle.standardError.write("ERR \(error)\n".data(using: .utf8)!)
    exit(1)
}
