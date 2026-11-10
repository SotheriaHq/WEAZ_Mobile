package expo.modules.wiezliquidglass

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Outline
import android.os.Build
import android.view.MotionEvent
import android.view.View
import android.view.ViewOutlineProvider
import android.view.ViewTreeObserver
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView
import java.lang.ref.WeakReference
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min

/**
 * Hardware-accelerated Android optical Liquid Glass lens surface.
 *
 * - API 33+: Single-pass GPU RenderNode + AGSL RuntimeShader performing SDF normal
 *   estimation, smooth C1 convex meniscus refraction across arbitrary shapes (circles,
 *   pills, rounded rectangles), optional chained blur, sheer optical tint, and
 *   luminance-aware Fresnel edge lighting.
 * - API 31-32: Clean RenderEffect lens over an offscreen RenderNode (no stipple grain
 *   or opaque neutral tint fills), paired with JS SVG specular rim lighting.
 * - Idle frames replay the cached GPU RenderNode without re-recording the backdrop tree;
 *   re-capture occurs only when visible backdrop visuals invalidate or relative geometry shifts.
 */
@SuppressLint("ViewConstructor")
class WiezLiquidGlassLensView(
  context: Context,
  appContext: AppContext,
) : ExpoView(context, appContext) {

  private var targetViewId: Int? = null
  private var targetRef: WeakReference<View>? = null
  private var registeredBackdropRef: WeakReference<WiezLiquidGlassBackdropView>? = null

  private var cornerRadiusDp: Float = 999f
  private var blurRadiusDp: Float = 0f
  private var refractionStrength: Float = 0.88f
  private var chromaticAberration: Float = 0f
  private var rimStrength: Float = 1.0f
  private var reflectionStrength: Float = 1.0f
  private var curvature: Float = 0.58f
  private var opticalThickness: Float = 0.42f
  private var tintColorArgb: Int = Color.WHITE
  private var tintAlpha: Float = 0.02f
  private var isDark: Boolean = false
  private var pressedState: Boolean = false

  private var renderer: LiquidGlassNodeRenderer? = null
  private var isCapturingSelf: Boolean = false
  private var needsCapture: Boolean = true
  private var needsEffectUpdate: Boolean = true
  private var preDrawRegistered: Boolean = false

  private var lastLensInTargetX: Float = Float.NaN
  private var lastLensInTargetY: Float = Float.NaN
  private var lastTargetWidth: Int = -1
  private var lastTargetHeight: Int = -1
  private var lastBackdropVersion: Long = -1L

  private val lensLocation = IntArray(2)
  private val targetLocation = IntArray(2)

  private val outlineProviderImpl = object : ViewOutlineProvider() {
    override fun getOutline(view: View, outline: Outline) {
      if (view.width <= 0 || view.height <= 0) return
      val density = max(resources.displayMetrics.density, 1f)
      val maxRadius = min(view.width, view.height) * 0.5f
      val radiusPx = min(max(0f, cornerRadiusDp * density), maxRadius)
      outline.setRoundRect(0, 0, view.width, view.height, radiusPx)
    }
  }

  private val preDrawListener = ViewTreeObserver.OnPreDrawListener {
    checkTargetGeometryChanged()
    true
  }

  init {
    setWillNotDraw(false)
    isClickable = false
    isFocusable = false
    clipToOutline = true
    outlineProvider = outlineProviderImpl
    renderer = createRenderer()
  }

  private fun createRenderer(): LiquidGlassNodeRenderer? {
    return when {
      Build.VERSION.SDK_INT >= 33 -> Api33GlassRenderer()
      Build.VERSION.SDK_INT >= 31 -> Api31GlassRenderer()
      else -> null
    }
  }

  fun setTargetViewId(id: Int?) {
    if (id == targetViewId) return
    targetViewId = id
    resolveTargetView(forceNotify = true)
  }

  fun setCornerRadius(value: Float) {
    val clamped = if (value.isFinite()) max(0f, value) else 0f
    if (clamped == cornerRadiusDp) return
    cornerRadiusDp = clamped
    invalidateOutline()
    needsEffectUpdate = true
  }

  fun setBlurRadius(value: Float) {
    val clamped = if (value.isFinite()) min(32f, max(0f, value)) else 0f
    if (clamped == blurRadiusDp) return
    blurRadiusDp = clamped
    needsEffectUpdate = true
  }

  fun setRefractionStrength(value: Float) {
    val clamped = if (value.isFinite()) min(2f, max(0f, value)) else 0f
    if (clamped == refractionStrength) return
    refractionStrength = clamped
    needsEffectUpdate = true
  }

  fun setChromaticAberration(value: Float) {
    val clamped = if (value.isFinite()) min(1f, max(0f, value)) else 0f
    if (clamped == chromaticAberration) return
    chromaticAberration = clamped
    needsEffectUpdate = true
  }

  fun setRimStrength(value: Float) {
    val clamped = if (value.isFinite()) min(1.5f, max(0f, value)) else 0f
    if (clamped == rimStrength) return
    rimStrength = clamped
    needsEffectUpdate = true
  }

  fun setReflectionStrength(value: Float) {
    val clamped = if (value.isFinite()) min(1.5f, max(0f, value)) else 0f
    if (clamped == reflectionStrength) return
    reflectionStrength = clamped
    needsEffectUpdate = true
  }

  fun setCurvature(value: Float) {
    val clamped = if (value.isFinite()) min(1f, max(0f, value)) else 0.58f
    if (clamped == curvature) return
    curvature = clamped
    needsEffectUpdate = true
  }

  fun setOpticalThickness(value: Float) {
    val clamped = if (value.isFinite()) min(1f, max(0f, value)) else 0.42f
    if (clamped == opticalThickness) return
    opticalThickness = clamped
    needsEffectUpdate = true
  }

  fun setTintColorValue(color: Int?) {
    val resolved = color ?: Color.WHITE
    if (resolved == tintColorArgb) return
    tintColorArgb = resolved
    needsEffectUpdate = true
  }

  fun setTintAlpha(value: Float) {
    val clamped = if (value.isFinite()) min(0.6f, max(0f, value)) else 0f
    if (clamped == tintAlpha) return
    tintAlpha = clamped
    needsEffectUpdate = true
  }

  fun setFallbackColorValue(@Suppress("UNUSED_PARAMETER") color: Int?) {
    // Retained as a backwards-compatible prop setter; capturing RenderNodes stay transparent
    // to prevent subpixel perimeter color bleed.
  }

  fun setIsDark(dark: Boolean) {
    if (dark == isDark) return
    isDark = dark
    needsEffectUpdate = true
  }

  fun setPressedState(pressed: Boolean) {
    if (pressed == pressedState) return
    pressedState = pressed
    needsEffectUpdate = true
  }

  fun applyConfig() {
    if (targetViewId != null && targetRef?.get() == null) {
      resolveTargetView(forceNotify = false)
    }
    invalidateOutline()
    if (isShown) {
      invalidate()
    }
  }

  internal fun onBackdropInvalidated() {
    if (isCapturingSelf) return
    needsCapture = true
    if (isShown) {
      invalidate()
    }
  }

  private fun unregisterBackdropListener() {
    registeredBackdropRef?.get()?.unregisterLens(this)
    registeredBackdropRef = null
  }

  private fun resolveTargetView(forceNotify: Boolean) {
    unregisterBackdropListener()
    val id = targetViewId
    val resolved = if (id != null) appContext.findView<View>(id) else null
    if (resolved === this) {
      targetRef = null
      return
    }
    targetRef = resolved?.let { WeakReference(it) }
    if (resolved is WiezLiquidGlassBackdropView) {
      resolved.registerLens(this)
      registeredBackdropRef = WeakReference(resolved)
      lastBackdropVersion = -1L
    }
    if (forceNotify || resolved != null) {
      needsCapture = true
      needsEffectUpdate = true
      if (isShown) {
        invalidate()
      }
    }
  }

  private fun checkTargetGeometryChanged() {
    if (!isAttachedToWindow || isCapturingSelf || !isShown || width <= 0 || height <= 0) return
    val id = targetViewId ?: return

    var target = targetRef?.get()
    if (target == null) {
      target = appContext.findView<View>(id)
      if (target != null && target !== this) {
        targetRef = WeakReference(target)
        if (target is WiezLiquidGlassBackdropView) {
          target.registerLens(this)
          registeredBackdropRef = WeakReference(target)
        }
        needsCapture = true
        needsEffectUpdate = true
        invalidate()
      }
      return
    }

    if (!target.isAttachedToWindow || target.width <= 0 || target.height <= 0) return

    getLocationInWindow(lensLocation)
    target.getLocationInWindow(targetLocation)
    val relX = (lensLocation[0] - targetLocation[0]).toFloat()
    val relY = (lensLocation[1] - targetLocation[1]).toFloat()
    val targetVersion = if (target is WiezLiquidGlassBackdropView) target.backdropVersion else 0L

    if (
      needsCapture ||
      relX != lastLensInTargetX ||
      relY != lastLensInTargetY ||
      target.width != lastTargetWidth ||
      target.height != lastTargetHeight ||
      targetVersion != lastBackdropVersion
    ) {
      needsCapture = true
      invalidate()
    }
  }

  override fun onVisibilityChanged(changedView: View, visibility: Int) {
    super.onVisibilityChanged(changedView, visibility)
    if (isShown && (needsCapture || needsEffectUpdate)) {
      invalidate()
    }
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    if (renderer == null) {
      renderer = createRenderer()
    }
    if (targetViewId != null) {
      resolveTargetView(forceNotify = false)
    }
    if (!preDrawRegistered && viewTreeObserver.isAlive) {
      viewTreeObserver.addOnPreDrawListener(preDrawListener)
      preDrawRegistered = true
    }
  }

  override fun onDetachedFromWindow() {
    if (preDrawRegistered && viewTreeObserver.isAlive) {
      viewTreeObserver.removeOnPreDrawListener(preDrawListener)
    }
    preDrawRegistered = false
    unregisterBackdropListener()
    renderer?.discard()
    needsCapture = true
    needsEffectUpdate = true
    super.onDetachedFromWindow()
  }

  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    super.onSizeChanged(w, h, oldw, oldh)
    invalidateOutline()
    needsCapture = true
    needsEffectUpdate = true
  }

  override fun onInterceptTouchEvent(ev: MotionEvent?): Boolean = false

  @SuppressLint("ClickableViewAccessibility")
  override fun onTouchEvent(event: MotionEvent?): Boolean = false

  override fun onDraw(canvas: Canvas) {
    val activeRenderer = renderer ?: return
    if (!canvas.isHardwareAccelerated || isCapturingSelf) return
    if (width <= 0 || height <= 0) return

    val target = targetRef?.get() ?: return
    if (!target.isAttachedToWindow || target.width <= 0 || target.height <= 0) return
    if (target is WiezLiquidGlassBackdropView && target.isInCapturePass()) return

    getLocationInWindow(lensLocation)
    target.getLocationInWindow(targetLocation)
    val lensInTargetX = (lensLocation[0] - targetLocation[0]).toFloat()
    val lensInTargetY = (lensLocation[1] - targetLocation[1]).toFloat()
    val backdropVersion = if (target is WiezLiquidGlassBackdropView) target.backdropVersion else 0L

    val geometryChanged =
      lensInTargetX != lastLensInTargetX ||
      lensInTargetY != lastLensInTargetY ||
      target.width != lastTargetWidth ||
      target.height != lastTargetHeight ||
      backdropVersion != lastBackdropVersion

    val shouldCapture = needsCapture || geometryChanged
    val density = max(resources.displayMetrics.density, 1f)
    val pad = ceil((blurRadiusDp + 36f) * density).toInt()
    val maxRadius = min(width, height) * 0.5f
    val cornerRadiusPx = min(max(0f, cornerRadiusDp * density), maxRadius)

    val config = LensConfig(
      cornerRadiusPx = cornerRadiusPx,
      density = density,
      blurPx = blurRadiusDp * density,
      refractionStrength = refractionStrength,
      chromaticPx = chromaticAberration * density,
      rimStrength = rimStrength,
      reflectionStrength = reflectionStrength,
      curvature = curvature,
      opticalThickness = opticalThickness,
      tintColorArgb = tintColorArgb,
      tintAlpha = tintAlpha,
      isDark = isDark,
      pressed = pressedState,
    )

    val backdrop = target as? WiezLiquidGlassBackdropView
    if (shouldCapture && backdrop != null && !backdrop.beginCapture()) {
      return
    }

    isCapturingSelf = true
    try {
      val rendered = activeRenderer.captureAndDraw(
        canvas = canvas,
        targetView = target,
        lensWidth = width,
        lensHeight = height,
        lensInTargetX = lensInTargetX,
        lensInTargetY = lensInTargetY,
        pad = pad,
        config = config,
        forceCapture = shouldCapture,
        forceEffect = needsEffectUpdate,
      )
      if (rendered) {
        lastLensInTargetX = lensInTargetX
        lastLensInTargetY = lensInTargetY
        lastTargetWidth = target.width
        lastTargetHeight = target.height
        lastBackdropVersion = backdropVersion
        needsCapture = false
        needsEffectUpdate = false
      }
    } finally {
      isCapturingSelf = false
      if (shouldCapture) {
        backdrop?.endCapture()
      }
    }
  }
}
