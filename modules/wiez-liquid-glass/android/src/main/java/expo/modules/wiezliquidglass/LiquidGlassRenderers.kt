package expo.modules.wiezliquidglass

import android.graphics.Canvas
import android.graphics.Color
import android.graphics.RenderEffect
import android.graphics.RenderNode
import android.graphics.RuntimeShader
import android.graphics.Shader
import android.view.View
import androidx.annotation.RequiresApi
import kotlin.math.max
import kotlin.math.min

internal data class LensConfig(
  val cornerRadiusPx: Float,
  val density: Float,
  val blurPx: Float,
  val refractionStrength: Float,
  val chromaticPx: Float,
  val rimStrength: Float,
  val reflectionStrength: Float,
  val tintColorArgb: Int,
  val tintAlpha: Float,
  val fallbackColorArgb: Int,
  val isDark: Boolean,
  val pressed: Boolean,
)

internal interface LiquidGlassNodeRenderer {
  fun captureAndDraw(
    canvas: Canvas,
    targetView: View,
    lensWidth: Int,
    lensHeight: Int,
    lensInTargetX: Float,
    lensInTargetY: Float,
    pad: Int,
    config: LensConfig,
    forceCapture: Boolean,
    forceEffect: Boolean,
  ): Boolean

  fun discard()
}

private const val LIQUID_GLASS_AGSL = """
uniform shader uContent;
uniform float4 uGlassRect;
uniform float4 uSafeBounds;
uniform float4 uTintColor;
uniform float4 uOpticalParams;
uniform float4 uRimParams;

float2 clampSample(float2 coord) {
  return clamp(coord, uSafeBounds.xy, uSafeBounds.zw);
}

half4 main(float2 fragCoord) {
  float2 center = uGlassRect.xy + uGlassRect.zw * 0.5;
  float2 halfSize = max(uGlassRect.zw * 0.5, float2(1.0, 1.0));
  float cornerR = clamp(uOpticalParams.x, 0.0, min(halfSize.x, halfSize.y));
  float density = max(uOpticalParams.y, 1.0);
  float refractStr = clamp(uOpticalParams.z, 0.0, 1.0);
  float chromaPx = max(uOpticalParams.w, 0.0);

  float rimStr = clamp(uRimParams.x, 0.0, 1.5);
  float reflStr = clamp(uRimParams.y, 0.0, 1.5);
  float isDark = uRimParams.z;
  float pressed = uRimParams.w;

  float2 p = fragCoord - center;
  float2 innerHalf = max(halfSize - float2(cornerR, cornerR), float2(0.0, 0.0));
  float2 q = abs(p) - innerHalf;
  float sdf = length(max(q, float2(0.0, 0.0))) + min(max(q.x, q.y), 0.0) - cornerR;

  float2 signs = float2(p.x < 0.0 ? -1.0 : 1.0, p.y < 0.0 ? -1.0 : 1.0);
  float2 gradDir = (q.x > 0.0 || q.y > 0.0)
    ? max(q, float2(0.0, 0.0))
    : (q.x > q.y ? float2(1.0, 0.0) : float2(0.0, 1.0));
  float gradLen = max(length(gradDir), 0.0001);
  float2 normal = (gradDir / gradLen) * signs;
  float radialLen = length(p);
  float centerFade = smoothstep(0.0, max(min(halfSize.x, halfSize.y) * 0.14, 1.0), radialLen);
  normal *= centerFade;

  // Restrict curved meniscus strictly to the outer ~33% perimeter so the
  // central ~67% window stays 1:1 undistorted and optically crystal clear.
  float inward = max(0.0, -sdf);
  float minHalf = min(halfSize.x, halfSize.y);
  float bezelWidth = clamp(minHalf * 0.33, density * 5.0, density * 14.0);
  float edgeT = clamp(1.0 - inward / max(bezelWidth, 1.0), 0.0, 1.0);
  float meniscus = edgeT > 0.0 ? pow(edgeT, 2.2) : 0.0;

  float edgeShiftPx = min(bezelWidth * 0.64, density * 5.4) * refractStr * meniscus;
  float2 displaced = fragCoord + normal * edgeShiftPx;

  float2 posG = clampSample(displaced);
  float disp = chromaPx * refractStr * meniscus;
  half4 baseColor;
  if (disp > 0.08) {
    float2 posR = clampSample(displaced + normal * disp);
    float2 posB = clampSample(displaced - normal * disp);
    half rChan = uContent.eval(posR).r;
    half4 gSample = uContent.eval(posG);
    half bChan = uContent.eval(posB).b;
    baseColor = half4(rChan, gSample.g, bChan, max(gSample.a, 0.001h));
  } else {
    baseColor = uContent.eval(posG);
  }

  half alpha = max(baseColor.a, 0.001h);
  half3 rgb = clamp(baseColor.rgb / alpha, half3(0.0h), half3(1.0h));

  // Sampled background luminance keeps perimeter crisp over white banners without dark fill
  float bgLuma = clamp(float(dot(rgb, half3(0.299h, 0.587h, 0.114h))), 0.0, 1.0);
  float brightBg = smoothstep(0.55, 0.94, bgLuma);

  half effectiveTintAlpha = clamp(half(uTintColor.a), 0.0h, 0.18h) + half(edgeT * 0.015);
  rgb = mix(rgb, half3(uTintColor.rgb), effectiveTintAlpha);
  if (pressed > 0.5) {
    rgb = mix(rgb, half3(1.0h, 1.0h, 1.0h), 0.08h);
  }

  float2 lightDir = float2(-0.622, -0.783);
  float facing = dot(normal, lightDir);

  float rimPx = max(density * 0.95, 1.4);
  float rimMask = 1.0 - smoothstep(0.0, rimPx, inward);
  float topLeftArc = facing > 0.0 ? pow(facing, 1.85) : 0.0;
  float bottomRightCaustic = facing < 0.0 ? pow(-facing, 2.55) * 0.38 : 0.0;
  float floorRim = isDark > 0.5 ? 0.03 : 0.035;
  float pressBoost = 1.0 + pressed * 0.22;
  float rimWhite = clamp((floorRim + topLeftArc * (isDark > 0.5 ? 0.44 : 0.52) + bottomRightCaustic * 0.36) * rimStr * pressBoost, 0.0, 0.68);
  float whiteRimAtten = mix(1.0, 0.62, brightBg);
  rgb = mix(rgb, half3(1.0h, 1.0h, 1.0h), half(rimMask * rimWhite * whiteRimAtten));

  if (rimStr > 0.01) {
    float outerEdgeMask = 1.0 - smoothstep(0.0, max(density * 0.72, 1.1), inward);
    float outerOpacity = mix(0.085, 0.19, brightBg) * min(rimStr, 1.0);
    rgb = mix(rgb, half3(0.07h, 0.09h, 0.15h), half(outerEdgeMask * outerOpacity));
  }

  // Confined rim gloss strictly on the outer bevel, leaving central 80%+ optically untouched
  float innerRimMask = smoothstep(0.0, max(density * 0.35, 0.6), inward);
  float glossBand = (1.0 - smoothstep(density * 0.65, density * 4.2, inward)) * innerRimMask;
  float glossDir = facing > 0.0 ? pow(facing, 3.0) : 0.0;
  float glossAlpha = glossBand * glossDir * (isDark > 0.5 ? 0.11 : 0.135) * reflStr * mix(1.0, 0.45, brightBg);
  rgb = mix(rgb, half3(1.0h, 1.0h, 1.0h), half(clamp(glossAlpha, 0.0, 0.20)));

  return half4(clamp(rgb, half3(0.0h), half3(1.0h)), 1.0h);
}
"""

@RequiresApi(33)
internal class Api33GlassRenderer : LiquidGlassNodeRenderer {
  private val renderNode = RenderNode("WiezLiquidGlass33")
  private var shader: RuntimeShader? = null
  private var recordedWidth = 0
  private var recordedHeight = 0

  private fun ensureShader(): RuntimeShader? {
    val existing = shader
    if (existing != null) return existing
    return try {
      RuntimeShader(LIQUID_GLASS_AGSL).also { shader = it }
    } catch (_: Throwable) {
      null
    }
  }

  override fun captureAndDraw(
    canvas: Canvas,
    targetView: View,
    lensWidth: Int,
    lensHeight: Int,
    lensInTargetX: Float,
    lensInTargetY: Float,
    pad: Int,
    config: LensConfig,
    forceCapture: Boolean,
    forceEffect: Boolean,
  ): Boolean {
    val rnWidth = lensWidth + pad * 2
    val rnHeight = lensHeight + pad * 2
    if (rnWidth <= 0 || rnHeight <= 0) return false

    val sizeChanged = rnWidth != recordedWidth || rnHeight != recordedHeight
    val shouldCapture = forceCapture || sizeChanged || !renderNode.hasDisplayList()

    if (shouldCapture) {
      recordedWidth = rnWidth
      recordedHeight = rnHeight
      renderNode.setPosition(0, 0, rnWidth, rnHeight)
      val recordingCanvas = renderNode.beginRecording(rnWidth, rnHeight)
      try {
        recordingCanvas.drawColor(config.fallbackColorArgb)
        recordingCanvas.save()
        recordingCanvas.translate(pad.toFloat() - lensInTargetX, pad.toFloat() - lensInTargetY)
        targetView.draw(recordingCanvas)
        recordingCanvas.restore()
      } finally {
        renderNode.endRecording()
      }
    }

    if (shouldCapture || forceEffect) {
      val blurPx = config.blurPx
      val blurEffect = if (blurPx >= 0.75f) {
        RenderEffect.createBlurEffect(blurPx, blurPx, Shader.TileMode.CLAMP)
      } else {
        null
      }

      val rtShader = ensureShader()
      if (rtShader != null) {
        val margin = blurPx + 1.5f
        val targetLeftInRn = pad.toFloat() - lensInTargetX
        val targetTopInRn = pad.toFloat() - lensInTargetY
        val targetRightInRn = targetLeftInRn + targetView.width.toFloat()
        val targetBottomInRn = targetTopInRn + targetView.height.toFloat()

        val safeMinX = max(1f, targetLeftInRn + margin)
        val safeMinY = max(1f, targetTopInRn + margin)
        val safeMaxX = max(safeMinX + 1f, min(rnWidth.toFloat() - 1f, targetRightInRn - margin))
        val safeMaxY = max(safeMinY + 1f, min(rnHeight.toFloat() - 1f, targetBottomInRn - margin))

        rtShader.setFloatUniform(
          "uGlassRect",
          pad.toFloat(),
          pad.toFloat(),
          lensWidth.toFloat(),
          lensHeight.toFloat(),
        )
        rtShader.setFloatUniform("uSafeBounds", safeMinX, safeMinY, safeMaxX, safeMaxY)
        rtShader.setFloatUniform(
          "uTintColor",
          Color.red(config.tintColorArgb) / 255f,
          Color.green(config.tintColorArgb) / 255f,
          Color.blue(config.tintColorArgb) / 255f,
          config.tintAlpha,
        )
        rtShader.setFloatUniform(
          "uOpticalParams",
          config.cornerRadiusPx,
          config.density,
          config.refractionStrength,
          config.chromaticPx,
        )
        rtShader.setFloatUniform(
          "uRimParams",
          config.rimStrength,
          config.reflectionStrength,
          if (config.isDark) 1f else 0f,
          if (config.pressed) 1f else 0f,
        )

        val shaderEffect = RenderEffect.createRuntimeShaderEffect(rtShader, "uContent")
        val chained = if (blurEffect != null) {
          RenderEffect.createChainEffect(shaderEffect, blurEffect)
        } else {
          shaderEffect
        }
        renderNode.setRenderEffect(chained)
      } else {
        renderNode.setRenderEffect(blurEffect)
      }
    }

    canvas.save()
    canvas.translate(-pad.toFloat(), -pad.toFloat())
    canvas.drawRenderNode(renderNode)
    canvas.restore()
    return true
  }

  override fun discard() {
    renderNode.setRenderEffect(null)
    renderNode.discardDisplayList()
    recordedWidth = 0
    recordedHeight = 0
  }
}

@RequiresApi(31)
internal class Api31GlassRenderer : LiquidGlassNodeRenderer {
  private val renderNode = RenderNode("WiezLiquidGlass31")
  private var recordedWidth = 0
  private var recordedHeight = 0

  override fun captureAndDraw(
    canvas: Canvas,
    targetView: View,
    lensWidth: Int,
    lensHeight: Int,
    lensInTargetX: Float,
    lensInTargetY: Float,
    pad: Int,
    config: LensConfig,
    forceCapture: Boolean,
    forceEffect: Boolean,
  ): Boolean {
    val rnWidth = lensWidth + pad * 2
    val rnHeight = lensHeight + pad * 2
    if (rnWidth <= 0 || rnHeight <= 0) return false

    val sizeChanged = rnWidth != recordedWidth || rnHeight != recordedHeight
    val shouldCapture = forceCapture || sizeChanged || !renderNode.hasDisplayList()

    if (shouldCapture) {
      recordedWidth = rnWidth
      recordedHeight = rnHeight
      renderNode.setPosition(0, 0, rnWidth, rnHeight)
      val recordingCanvas = renderNode.beginRecording(rnWidth, rnHeight)
      try {
        recordingCanvas.drawColor(config.fallbackColorArgb)
        recordingCanvas.save()
        recordingCanvas.translate(pad.toFloat() - lensInTargetX, pad.toFloat() - lensInTargetY)
        targetView.draw(recordingCanvas)
        recordingCanvas.restore()
      } finally {
        renderNode.endRecording()
      }
    }

    if (shouldCapture || forceEffect) {
      val blurPx = config.blurPx
      val blurEffect = if (blurPx >= 0.75f) {
        RenderEffect.createBlurEffect(blurPx, blurPx, Shader.TileMode.CLAMP)
      } else {
        null
      }
      renderNode.setRenderEffect(blurEffect)
    }

    canvas.save()
    canvas.translate(-pad.toFloat(), -pad.toFloat())
    canvas.drawRenderNode(renderNode)
    canvas.restore()
    return true
  }

  override fun discard() {
    renderNode.setRenderEffect(null)
    renderNode.discardDisplayList()
    recordedWidth = 0
    recordedHeight = 0
  }
}
