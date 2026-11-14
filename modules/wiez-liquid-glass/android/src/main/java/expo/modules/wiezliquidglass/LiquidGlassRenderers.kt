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

// Strong Lens character. Mirrors tokens.liquidGlass.optics.lens (src/styles/tokens.ts)
// and the Web liquidGlassOptics.ts spec; test-liquid-glass-phase1.js enforces parity.
const float LENS_FALLOFF_K = 1.7;
const float LENS_DEPTH_FRAC = 0.55;
const float LENS_STRETCH_LIMIT = 0.7;
const float LENS_MAGNIFY = 0.1;
const float LENS_MAX_TILT_DEG = 70.0;
const float LENS_FRESNEL_GAIN = 0.7;
const float LENS_SPEC_GAIN = 0.35;
const float LENS_SHININESS = 30.0;
const float LENS_RIM_DP = 1.1;
const float LENS_SHADE_GAIN = 0.08;
const float LENS_SATURATION = 1.15;
const float LENS_BEZEL_MAX_DP = 36.0;

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

  float rimStr = clamp(uRimParams.x, 0.0, 1.5);
  float reflStr = clamp(uRimParams.y, 0.0, 1.5);
  float pressed = uRimParams.w;

  float bezelFrac = clamp(uShapeParams.x, 0.0, 1.0);
  float thickness = clamp(uShapeParams.y, 0.0, 1.0);

  // Geometry: the bezel can span the whole short half-axis (full dome on capsules and circles).
  float bezel = min(min(minHalf, LENS_BEZEL_MAX_DP * density), max(minHalf * bezelFrac * mix(0.6, 1.2, thickness), 3.0 * density));
  float r2 = min(max(cornerR, bezel), minHalf);

  float2 p = fragCoord - center;
  float sdReal = sdRoundRect(p, halfSize - float2(cornerR, cornerR), cornerR);
  float inwardReal = max(0.0, -sdReal);

  // Crease-free normals from the r2-rounded shape (exact for circles and capsules).
  float2 q = abs(p) - (halfSize - float2(r2, r2));
  float2 sgn = float2(p.x >= 0.0 ? 1.0 : -1.0, p.y >= 0.0 ? 1.0 : -1.0);
  float2 n = float2(0.0, sgn.y);
  if (q.x > 0.0 && q.y > 0.0) {
    n = normalize(q) * sgn;
  } else if (q.x > q.y) {
    n = float2(sgn.x, 0.0);
  }
  float inwardOpt = max(0.0, -sdRoundRect(p, halfSize - float2(r2, r2), r2));
  float t = clamp(inwardOpt / bezel, 0.0, 1.0);
  float g = pow(1.0 - t, LENS_FALLOFF_K);

  // Refraction: inward sampling with a monotonic (never folding) displacement profile.
  float magnify = refractStr > 0.001 ? LENS_MAGNIFY : 0.0;
  float designShift = min(
    LENS_DEPTH_FRAC * bezel * mix(0.6, 1.25, thickness),
    max(0.0, LENS_STRETCH_LIMIT - magnify) * bezel / LENS_FALLOFF_K
  );
  float foldLimit = max(0.0, 0.85 - magnify) * bezel / LENS_FALLOFF_K;
  float maxShift = clamp(refractStr * designShift, 0.0, foldLimit);
  float2 medialLimit = max(halfSize - float2(minHalf, minHalf), float2(0.0, 0.0));
  float2 medial = clamp(p, -medialLimit, medialLimit);
  float2 displaced = fragCoord - n * (maxShift * g) - (p - medial) * magnify;

  float4 baseSample = float4(uContent.eval(clampSample(displaced)));
  float contentAlpha = clamp(baseSample.a, 0.0, 1.0);
  float3 rgb = contentAlpha > 0.004
    ? clamp(baseSample.rgb / contentAlpha, 0.0, 1.0)
    : uTintColor.rgb;
  float luma = dot(rgb, float3(0.299, 0.587, 0.114));
  rgb = clamp(mix(float3(luma, luma, luma), rgb, LENS_SATURATION), 0.0, 1.0);

  // Reflection: 3D normal from the rim tilt, Schlick Fresnel, key-light specular and exit caustic.
  float tilt = LENS_MAX_TILT_DEG * 0.0174533 * mix(0.75, 1.1, thickness) * pow(1.0 - t, 1.35);
  float st = sin(tilt);
  float ct = cos(tilt);
  float3 n3 = float3(n.x * st, n.y * st, ct);
  float2 lightDir = float2(-0.616, -0.788);
  float3 keyLight = normalize(float3(lightDir.x * 0.72, lightDir.y * 0.72, 0.7));
  float3 exitLight = normalize(float3(-lightDir.x * 0.72, -lightDir.y * 0.72, 0.7));
  float3 h1 = normalize(keyLight + float3(0.0, 0.0, 1.0));
  float3 h2 = normalize(exitLight + float3(0.0, 0.0, 1.0));
  float fres = 0.04 + 0.96 * pow(1.0 - ct, 5.0);
  float specKey = pow(max(0.0, dot(n3, h1)), LENS_SHININESS);
  float specExit = pow(max(0.0, dot(n3, h2)), LENS_SHININESS * 1.3);
  float spec = (specKey + specExit * 0.38) * LENS_SPEC_GAIN * reflStr;

  float facing = dot(n, lightDir);
  float rimT = clamp(1.0 - inwardReal / (LENS_RIM_DP * density), 0.0, 1.0);
  float pressBoost = 1.0 + pressed * 0.22;
  float rim = pow(rimT, 1.6)
    * (0.1 + 0.65 * pow(max(facing, 0.0), 2.0) + 0.3 * pow(max(-facing, 0.0), 3.0))
    * (LENS_FRESNEL_GAIN * rimStr / 0.9) * pressBoost;
  float highlight = clamp(fres * LENS_FRESNEL_GAIN * reflStr * 0.9 + spec + rim, 0.0, 0.95);
  float shade = clamp(
    exp(-inwardReal / (2.4 * density)) * (0.45 + 0.55 * max(-facing, 0.0)) * LENS_SHADE_GAIN * mix(0.7, 1.3, thickness),
    0.0,
    0.3
  );
  float tintAlpha = clamp(uTintColor.a, 0.0, 0.60);

  rgb = mix(rgb, uTintColor.rgb, tintAlpha);
  rgb = mix(rgb, float3(0.055, 0.055, 0.063), shade);
  rgb = mix(rgb, float3(1.0, 1.0, 1.0), highlight);
  if (pressed > 0.5) {
    rgb = mix(rgb, float3(1.0, 1.0, 1.0), 0.08);
  }

  float glassOverlayAlpha = clamp(tintAlpha + shade + highlight, 0.0, 1.0);
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
