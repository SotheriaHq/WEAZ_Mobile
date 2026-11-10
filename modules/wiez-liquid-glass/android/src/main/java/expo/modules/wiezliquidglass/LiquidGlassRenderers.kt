package expo.modules.wiezliquidglass

import android.graphics.Canvas
import android.graphics.Color
import android.graphics.RenderEffect
import android.graphics.RenderNode
import android.graphics.RuntimeShader
import android.graphics.Shader
import android.os.Build
import android.util.Log
import android.view.View
import androidx.annotation.RequiresApi
import kotlin.math.max
import kotlin.math.min

private const val LOG_TAG = "WiezLiquidGlass"

internal data class LensConfig(
  val cornerRadiusPx: Float,
  val density: Float,
  val blurPx: Float,
  val refractionStrength: Float,
  val chromaticPx: Float,
  val rimStrength: Float,
  val reflectionStrength: Float,
  val curvature: Float,
  val opticalThickness: Float,
  val tintColorArgb: Int,
  val tintAlpha: Float,
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

// Written strictly in valid Android SkSL/AGSL (no half-literal 'h' or 'f' suffixes,
// float math throughout, half4 returned only at output) so RuntimeShader compiles
// reliably across Adreno, Mali, PowerVR, and SwiftShader drivers on API 33+.
private const val LIQUID_GLASS_AGSL = """
uniform shader uContent;
uniform float4 uGlassRect;
uniform float4 uSafeBounds;
uniform float4 uTintColor;
uniform float4 uOpticalParams;
uniform float4 uRimParams;
uniform float4 uShapeParams;

float sdRoundRect(float2 p, float2 innerHalf, float r) {
  float2 q = abs(p) - innerHalf;
  return length(max(q, float2(0.0, 0.0))) + min(max(q.x, q.y), 0.0) - r;
}

float2 clampSample(float2 coord) {
  return clamp(coord, uSafeBounds.xy, uSafeBounds.zw);
}

half4 main(float2 fragCoord) {
  float2 center = uGlassRect.xy + uGlassRect.zw * 0.5;
  float2 halfSize = max(uGlassRect.zw * 0.5, float2(1.0, 1.0));
  float minHalf = min(halfSize.x, halfSize.y);
  float cornerR = clamp(uOpticalParams.x, 0.0, minHalf);
  float density = max(uOpticalParams.y, 1.0);
  float refractStr = clamp(uOpticalParams.z, 0.0, 2.0);
  float chromaPx = max(uOpticalParams.w, 0.0);

  float rimStr = clamp(uRimParams.x, 0.0, 1.5);
  float reflStr = clamp(uRimParams.y, 0.0, 1.5);
  float isDark = uRimParams.z;
  float pressed = uRimParams.w;

  float curvature = clamp(uShapeParams.x, 0.0, 1.0);
  float thickness = clamp(uShapeParams.y, 0.0, 1.0);

  float2 p = fragCoord - center;
  float2 innerHalf = max(halfSize - float2(cornerR, cornerR), float2(0.0, 0.0));
  float sdf = sdRoundRect(p, innerHalf, cornerR);
  float inward = max(0.0, -sdf);

  // Smooth C1 outward normal via finite differences on exact rounded-box SDF.
  // Eliminates interior Voronoi diagonal creases on circles, pills, and cards,
  // and tapers smoothly to zero along center / medial axes.
  float eps = clamp(minHalf * 0.06, 1.0, density * 1.8);
  float gx = sdRoundRect(p + float2(eps, 0.0), innerHalf, cornerR)
           - sdRoundRect(p - float2(eps, 0.0), innerHalf, cornerR);
  float gy = sdRoundRect(p + float2(0.0, eps), innerHalf, cornerR)
           - sdRoundRect(p - float2(0.0, eps), innerHalf, cornerR);
  float2 rawGrad = float2(gx, gy) / (2.0 * eps);
  float gradMag = length(rawGrad);
  float2 lensNormal = gradMag > 0.0001 ? (rawGrad / max(gradMag, 1.0)) : float2(0.0, 0.0);

  // Adaptive meniscus shoulder width across small controls, elongated pills, and cards.
  // Inner plateau keeps inward > bezelWidth at zero distortion (crystal clear center).
  float bezelReachDp = mix(6.0, 28.0, thickness) * mix(0.85, 1.28, curvature);
  float bezelWidth = min(minHalf * mix(0.22, 0.86, thickness), bezelReachDp * density);
  bezelWidth = max(bezelWidth, density * 4.0);

  float edgeT = clamp(1.0 - inward / bezelWidth, 0.0, 1.0);
  float curveExp = mix(2.55, 1.25, curvature);
  float meniscus = edgeT > 0.0001 ? pow(edgeT, curveExp) : 0.0;

  // Physical convex Snell refraction: subtract outward normal to sample inward
  // toward the lens core, creating visible outward magnification & contour wrapping
  // along curved borders while keeping rim samples safely inside backdrop bounds.
  float maxShiftPx = min((7.0 + thickness * 12.0) * density * refractStr, minHalf * 0.92);
  float edgeShiftPx = maxShiftPx * meniscus;
  float2 displaced = fragCoord - lensNormal * edgeShiftPx;

  float2 posG = clampSample(displaced);
  float disp = chromaPx * refractStr * meniscus;
  float4 baseSample;
  if (disp > 0.08) {
    float2 posR = clampSample(displaced - lensNormal * disp);
    float2 posB = clampSample(displaced + lensNormal * disp);
    float4 rSample = float4(uContent.eval(posR));
    float4 gSample = float4(uContent.eval(posG));
    float4 bSample = float4(uContent.eval(posB));
    float rA = max(rSample.a, 0.001);
    float gA = max(gSample.a, 0.001);
    float bA = max(bSample.a, 0.001);
    baseSample = float4(
      (rSample.r / rA) * gSample.a,
      gSample.g,
      (bSample.b / bA) * gSample.a,
      gSample.a
    );
  } else {
    baseSample = float4(uContent.eval(posG));
  }

  float contentAlpha = clamp(baseSample.a, 0.0, 1.0);
  float3 rgb = contentAlpha > 0.004
    ? clamp(baseSample.rgb / contentAlpha, 0.0, 1.0)
    : uTintColor.rgb;

  float bgLuma = clamp(dot(rgb, float3(0.299, 0.587, 0.114)), 0.0, 1.0);
  float brightBg = smoothstep(0.50, 0.92, bgLuma);

  float userTintAlpha = clamp(uTintColor.a, 0.0, 0.60);
  float meniscusTint = meniscus * (isDark > 0.5 ? 0.024 : 0.018);
  float effectiveTintAlpha = clamp(userTintAlpha * (0.48 + 0.52 * edgeT) + meniscusTint, 0.0, 0.72);
  rgb = mix(rgb, uTintColor.rgb, effectiveTintAlpha);
  if (pressed > 0.5) {
    rgb = mix(rgb, float3(1.0, 1.0, 1.0), 0.09);
  }

  float2 lightDir = float2(-0.622, -0.783);
  float facing = clamp(dot(lensNormal, lightDir), -1.0, 1.0);
  float pressBoost = 1.0 + pressed * 0.22;

  // Soft optical bevel thickness depth (~3.4dp taper) over bright surfaces without 1px dark ring.
  float bevelShadeAlpha = 0.0;
  if (rimStr > 0.01) {
    float bevelNorm = clamp(1.0 - inward / max(density * 3.4, 5.0), 0.0, 1.0);
    float bevelShadeCurve = bevelNorm > 0.0001 ? pow(bevelNorm, 1.6) : 0.0;
    float dirShade = mix(0.22, 1.0, clamp(0.52 - facing * 0.48, 0.0, 1.0));
    float darkFloor = isDark > 0.5 ? 0.014 : 0.024;
    float shadeStrength = mix(darkFloor, 0.125, brightBg) * dirShade * min(rimStr, 1.0);
    bevelShadeAlpha = bevelShadeCurve * shadeStrength;
    rgb = mix(rgb, float3(0.16, 0.19, 0.30), bevelShadeAlpha);
  }

  // Rounded silica Fresnel rim highlight (~2.35dp soft inward crest).
  float rimIn = smoothstep(0.0, max(density * 0.42, 0.8), inward);
  float rimOut = 1.0 - smoothstep(max(density * 0.42, 0.8), max(density * 2.35, 3.6), inward);
  float rimEnvelope = rimOut * (0.52 + 0.48 * rimIn);

  float topLeftArc = facing > 0.0001 ? pow(facing, 1.65) : 0.0;
  float bottomRightCaustic = facing < -0.0001 ? pow(-facing, 2.05) : 0.0;
  float floorRim = mix(isDark > 0.5 ? 0.09 : 0.08, 0.02, brightBg);
  float rimWhite = clamp(
    (floorRim + topLeftArc * (isDark > 0.5 ? 0.54 : 0.58) + bottomRightCaustic * (isDark > 0.5 ? 0.34 : 0.36)) * rimStr * pressBoost,
    0.0,
    0.72
  );
  float rimAlpha = rimEnvelope * rimWhite * mix(1.0, 0.72, brightBg);
  rgb = mix(rgb, float3(1.0, 1.0, 1.0), rimAlpha);

  // Restrained specular sheen strictly along outer top-left meniscus shoulder.
  float innerRimMask = smoothstep(0.0, max(density * 0.45, 0.8), inward);
  float glossBand = (1.0 - smoothstep(density * 0.8, max(bezelWidth * 0.55, density * 5.2), inward)) * innerRimMask;
  float glossDir = facing > 0.0001 ? pow(facing, 2.35) : 0.0;
  float glossAlpha = clamp(glossBand * glossDir * (isDark > 0.5 ? 0.17 : 0.19) * reflStr * mix(1.0, 0.55, brightBg), 0.0, 0.24);
  rgb = mix(rgb, float3(1.0, 1.0, 1.0), glossAlpha);

  float glassOverlayAlpha = clamp(effectiveTintAlpha + bevelShadeAlpha + rimAlpha + glossAlpha, 0.0, 1.0);
  float outAlpha = contentAlpha >= 0.995
    ? 1.0
    : clamp(contentAlpha + (1.0 - contentAlpha) * glassOverlayAlpha, 0.0, 1.0);
  float3 premulRgb = clamp(rgb, float3(0.0, 0.0, 0.0), float3(1.0, 1.0, 1.0)) * outAlpha;
  return half4(premulRgb, outAlpha);
}
"""

internal object LiquidGlassShaderDiagnostics {
  @Volatile
  private var probed = false

  @Volatile
  private var compileSucceeded = false

  @Volatile
  private var compileErrorMessage: String? = null

  private fun ensureProbed() {
    if (probed) return
    synchronized(this) {
      if (probed) return
      if (Build.VERSION.SDK_INT < 33) {
        compileSucceeded = false
        compileErrorMessage = "API < 33 (RuntimeShader requires Android 13+)"
        probed = true
        return
      }
      try {
        RuntimeShader(LIQUID_GLASS_AGSL)
        compileSucceeded = true
        compileErrorMessage = null
        Log.i(LOG_TAG, "AGSL optical lens shader compiled successfully on API ${Build.VERSION.SDK_INT}")
      } catch (t: Throwable) {
        compileSucceeded = false
        compileErrorMessage = t.message ?: t::class.java.simpleName
        Log.e(LOG_TAG, "AGSL RuntimeShader compilation failed; falling back to blur/lightweight overlays", t)
      } finally {
        probed = true
      }
    }
  }

  fun supportsRuntimeShader(): Boolean {
    ensureProbed()
    return compileSucceeded
  }

  fun lastCompileError(): String? {
    ensureProbed()
    return compileErrorMessage
  }
}

@RequiresApi(33)
internal class Api33GlassRenderer : LiquidGlassNodeRenderer {
  private val renderNode = RenderNode("WiezLiquidGlass33")
  private var shader: RuntimeShader? = null
  private var shaderFailed = false
  private var recordedWidth = 0
  private var recordedHeight = 0

  private fun ensureShader(): RuntimeShader? {
    if (shaderFailed) return null
    val existing = shader
    if (existing != null) return existing
    if (!LiquidGlassShaderDiagnostics.supportsRuntimeShader()) {
      shaderFailed = true
      return null
    }
    return try {
      RuntimeShader(LIQUID_GLASS_AGSL).also { shader = it }
    } catch (t: Throwable) {
      shaderFailed = true
      Log.e(LOG_TAG, "RuntimeShader instantiation failed", t)
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
        // Keep recording surface transparent (never draw an opaque surfaceAlt fill) so
        // anti-aliased outlines never double-blend stale theme colors along perimeter pixels.
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
        val margin = min(blurPx + 1.5f, min(targetView.width, targetView.height) * 0.25f)
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
        rtShader.setFloatUniform(
          "uShapeParams",
          config.curvature,
          config.opticalThickness,
          0f,
          0f,
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
