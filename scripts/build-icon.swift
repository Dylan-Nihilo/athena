import AppKit

// Run from the repository root: swift scripts/build-icon.swift
// Keep the selected portrait unchanged; only resize and apply the macOS icon mask.
let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let source = root.appendingPathComponent("src/renderer/assets/brand/athena-profile.png")
guard let image = NSImage(contentsOf: source),
      let representation = image.representations.first,
      representation.pixelsWide == representation.pixelsHigh else {
    fatalError("Expected a square Athena portrait at \(source.path)")
}

let size = 1024
let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size,
    bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
    colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
NSGraphicsContext.current?.imageInterpolation = .high
NSColor.clear.setFill()
NSRect(x: 0, y: 0, width: size, height: size).fill(using: .copy)
let bounds = NSRect(x: 72, y: 72, width: 880, height: 880)
NSBezierPath(roundedRect: bounds, xRadius: 205, yRadius: 205).addClip()
image.draw(in: bounds, from: .zero, operation: .copy, fraction: 1)
NSGraphicsContext.restoreGraphicsState()

let png = root.appendingPathComponent("resources/athena-icon.png")
try bitmap.representation(using: .png, properties: [:])!.write(to: png)

func run(_ executable: String, _ arguments: [String]) throws {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: executable)
    process.arguments = arguments
    try process.run()
    process.waitUntilExit()
    guard process.terminationStatus == 0 else {
        throw NSError(domain: "AthenaIconBuild", code: Int(process.terminationStatus),
            userInfo: [NSLocalizedDescriptionKey: "\(executable) failed"])
    }
}

let iconset = FileManager.default.temporaryDirectory
    .appendingPathComponent("athena-\(UUID().uuidString).iconset")
try FileManager.default.createDirectory(at: iconset, withIntermediateDirectories: true)
defer { try? FileManager.default.removeItem(at: iconset) }
for points in [16, 32, 128, 256, 512] {
    for scale in [1, 2] {
        let pixels = String(points * scale)
        let suffix = scale == 2 ? "@2x" : ""
        let output = iconset.appendingPathComponent("icon_\(points)x\(points)\(suffix).png")
        try run("/usr/bin/sips", ["-z", pixels, pixels, png.path, "--out", output.path])
    }
}
try run("/usr/bin/iconutil", ["-c", "icns", iconset.path, "-o",
    root.appendingPathComponent("resources/athena-icon.icns").path])
print("Built Athena PNG and ICNS from \(source.lastPathComponent)")
