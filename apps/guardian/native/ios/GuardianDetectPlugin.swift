//
//  GuardianDetectPlugin.swift
//  Guardian — Vision Camera frame processor plugin (iOS)
//
//  Runs a Core ML detector over each frame it is handed and returns normalised
//  boxes plus a mean-luma reading. Registered as "guardianDetect"; the JS side
//  binds to it in src/vision/detector.ts.
//
//  INSTALL: this file is copied into ios/Guardian/ by the prebuild step. See
//  README "Wiring the native detector". You also need GuardianDetector.mlpackage
//  in the Xcode project — the README covers exporting it from YOLO.
//
//  Note on threading: this is called on Vision Camera's frame processor queue,
//  never the main thread. Do not touch UIKit from here.
//

import Foundation
import VisionCamera
import Vision
import CoreML
import CoreImage
import AVFoundation

@objc(GuardianDetectPlugin)
public class GuardianDetectPlugin: FrameProcessorPlugin {

  private var request: VNCoreMLRequest?
  private let ciContext = CIContext(options: [.useSoftwareRenderer: false])

  public override init(proxy: VisionCameraProxyHolder, options: [AnyHashable: Any]! = [:]) {
    super.init(proxy: proxy, options: options)
    loadModel()
  }

  private func loadModel() {
    // Compiled at build time from GuardianDetector.mlpackage.
    guard let url = Bundle.main.url(forResource: "GuardianDetector", withExtension: "mlmodelc"),
          let model = try? MLModel(contentsOf: url),
          let vnModel = try? VNCoreMLModel(for: model) else {
      NSLog("[Guardian] detector model missing — running blind")
      return
    }
    let req = VNCoreMLRequest(model: vnModel)
    // Letterbox rather than crop: cropping loses subjects at the frame edges,
    // which in a perimeter camera is exactly where they enter.
    req.imageCropAndScaleOption = .scaleFit
    request = req
  }

  /// Mean luma of the frame, 0..1. Cheap: sample the Y plane on a coarse grid
  /// rather than reducing every pixel — this runs on every frame.
  private func meanLuma(_ buffer: CVPixelBuffer) -> Double {
    CVPixelBufferLockBaseAddress(buffer, .readOnly)
    defer { CVPixelBufferUnlockBaseAddress(buffer, .readOnly) }

    guard let base = CVPixelBufferGetBaseAddressOfPlane(buffer, 0) else { return 0.5 }
    let width = CVPixelBufferGetWidthOfPlane(buffer, 0)
    let height = CVPixelBufferGetHeightOfPlane(buffer, 0)
    let stride = CVPixelBufferGetBytesPerRowOfPlane(buffer, 0)
    let ptr = base.assumingMemoryBound(to: UInt8.self)

    let stepX = max(1, width / 32)
    let stepY = max(1, height / 32)
    var total = 0
    var count = 0
    for y in Swift.stride(from: 0, to: height, by: stepY) {
      for x in Swift.stride(from: 0, to: width, by: stepX) {
        total += Int(ptr[y * stride + x])
        count += 1
      }
    }
    return count == 0 ? 0.5 : Double(total) / Double(count) / 255.0
  }

  public override func callback(_ frame: Frame, withArguments arguments: [AnyHashable: Any]?) -> Any? {
    let scoreFloor = (arguments?["scoreFloor"] as? Double) ?? 0.25
    let buffer = frame.buffer

    guard let pixelBuffer = CMSampleBufferGetImageBuffer(buffer) else {
      return ["boxes": [], "brightness": 0.5]
    }

    let brightness = meanLuma(pixelBuffer)

    guard let request = request else {
      return ["boxes": [], "brightness": brightness]
    }

    let handler = VNImageRequestHandler(
      cvPixelBuffer: pixelBuffer,
      orientation: frame.orientation.toCGImagePropertyOrientation(),
      options: [:]
    )

    do {
      try handler.perform([request])
    } catch {
      return ["boxes": [], "brightness": brightness]
    }

    var boxes: [[String: Any]] = []
    for observation in (request.results as? [VNRecognizedObjectObservation]) ?? [] {
      guard let top = observation.labels.first, Double(top.confidence) >= scoreFloor else { continue }
      // Vision's origin is bottom-left; the app's is top-left.
      let bb = observation.boundingBox
      boxes.append([
        "x": bb.origin.x,
        "y": 1.0 - bb.origin.y - bb.size.height,
        "w": bb.size.width,
        "h": bb.size.height,
        "score": Double(top.confidence),
        "label": top.identifier,
      ])
    }

    return ["boxes": boxes, "brightness": brightness]
  }
}
