//
//  GuardianDetectPlugin.kt
//  Guardian — Vision Camera frame processor plugin (Android)
//
//  LiteRT (formerly TensorFlow Lite) detector over each frame, returning
//  normalised boxes and a mean-luma reading. Registered as "guardianDetect".
//
//  INSTALL: copied into android/app/src/main/java/com/coachcolin/guardian/ by
//  the prebuild step; see README "Wiring the native detector". Needs
//  guardian_detector.tflite and labels.txt in src/main/assets/.
//
//  The GPU delegate is tried first and falls back to NNAPI, then CPU. On the
//  cheap Android hardware this app is aimed at, that fallback chain is the
//  difference between 12fps and 2fps.
//

package com.coachcolin.guardian

import android.graphics.ImageFormat
import android.util.Log
import com.mrousavy.camera.frameprocessors.Frame
import com.mrousavy.camera.frameprocessors.FrameProcessorPlugin
import com.mrousavy.camera.frameprocessors.VisionCameraProxy
import org.tensorflow.lite.Interpreter
import org.tensorflow.lite.gpu.GpuDelegate
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.MappedByteBuffer
import java.nio.channels.FileChannel

class GuardianDetectPlugin(
  proxy: VisionCameraProxy,
  options: Map<String, Any>?,
) : FrameProcessorPlugin() {

  private var interpreter: Interpreter? = null
  private var labels: List<String> = emptyList()
  private var gpuDelegate: GpuDelegate? = null

  private val inputSize = 320
  private val inputBuffer: ByteBuffer =
    ByteBuffer.allocateDirect(inputSize * inputSize * 3).order(ByteOrder.nativeOrder())

  init {
    try {
      val opts = Interpreter.Options()
      try {
        gpuDelegate = GpuDelegate()
        opts.addDelegate(gpuDelegate)
      } catch (e: Throwable) {
        Log.w(TAG, "GPU delegate unavailable, falling back to NNAPI/CPU", e)
        opts.setUseNNAPI(true)
      }
      opts.numThreads = 2
      interpreter = Interpreter(loadModel(proxy), opts)
      labels = loadLabels(proxy)
    } catch (e: Throwable) {
      Log.e(TAG, "detector model missing — running blind", e)
    }
  }

  private fun loadModel(proxy: VisionCameraProxy): MappedByteBuffer {
    val fd = proxy.context.assets.openFd(MODEL_ASSET)
    fd.createInputStream().use { stream ->
      return stream.channel.map(FileChannel.MapMode.READ_ONLY, fd.startOffset, fd.declaredLength)
    }
  }

  private fun loadLabels(proxy: VisionCameraProxy): List<String> =
    proxy.context.assets.open(LABELS_ASSET).bufferedReader().readLines()

  /**
   * Mean luma from the Y plane, sampled on a coarse grid. YUV_420_888's first
   * plane is luminance, so this needs no colour conversion — it is close to
   * free, which matters because it runs on every frame.
   */
  private fun meanLuma(frame: Frame): Double {
    val image = frame.image
    if (image.format != ImageFormat.YUV_420_888) return 0.5
    val plane = image.planes[0]
    val buf = plane.buffer
    val rowStride = plane.rowStride
    val width = image.width
    val height = image.height

    val stepX = maxOf(1, width / 32)
    val stepY = maxOf(1, height / 32)
    var total = 0L
    var count = 0
    var y = 0
    while (y < height) {
      var x = 0
      while (x < width) {
        val idx = y * rowStride + x
        if (idx < buf.limit()) {
          total += (buf.get(idx).toInt() and 0xFF)
          count++
        }
        x += stepX
      }
      y += stepY
    }
    buf.rewind()
    return if (count == 0) 0.5 else total.toDouble() / count / 255.0
  }

  override fun callback(frame: Frame, arguments: Map<String, Any>?): Any {
    val scoreFloor = (arguments?.get("scoreFloor") as? Double) ?: 0.25
    val brightness = meanLuma(frame)
    val interp = interpreter
      ?: return mapOf("boxes" to emptyList<Any>(), "brightness" to brightness)

    // TODO(model): fill inputBuffer from the frame's YUV planes, resized and
    // letterboxed to inputSize. Kept out of this skeleton because the exact
    // preprocessing must match how the model was exported — see README.
    inputBuffer.rewind()

    val locations = Array(1) { Array(MAX_DETECTIONS) { FloatArray(4) } }
    val classes = Array(1) { FloatArray(MAX_DETECTIONS) }
    val scores = Array(1) { FloatArray(MAX_DETECTIONS) }
    val count = FloatArray(1)

    try {
      interp.runForMultipleInputsOutputs(
        arrayOf<Any>(inputBuffer),
        mapOf(0 to locations, 1 to classes, 2 to scores, 3 to count),
      )
    } catch (e: Throwable) {
      Log.e(TAG, "inference failed", e)
      return mapOf("boxes" to emptyList<Any>(), "brightness" to brightness)
    }

    val boxes = ArrayList<Map<String, Any>>()
    val n = minOf(count[0].toInt(), MAX_DETECTIONS)
    for (i in 0 until n) {
      val score = scores[0][i].toDouble()
      if (score < scoreFloor) continue
      // Model emits [top, left, bottom, right] normalised.
      val (top, left, bottom, right) = locations[0][i].let {
        listOf(it[0], it[1], it[2], it[3])
      }
      val labelIdx = classes[0][i].toInt()
      boxes.add(
        mapOf(
          "x" to left.toDouble(),
          "y" to top.toDouble(),
          "w" to (right - left).toDouble(),
          "h" to (bottom - top).toDouble(),
          "score" to score,
          "label" to (labels.getOrNull(labelIdx) ?: "other"),
        ),
      )
    }

    return mapOf("boxes" to boxes, "brightness" to brightness)
  }

  companion object {
    private const val TAG = "GuardianDetect"
    private const val MODEL_ASSET = "guardian_detector.tflite"
    private const val LABELS_ASSET = "labels.txt"
    private const val MAX_DETECTIONS = 25
  }
}
