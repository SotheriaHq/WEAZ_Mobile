package expo.modules.wiezliquidglass

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Rect
import android.view.View
import android.view.ViewParent
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView
import java.lang.ref.WeakReference

/**
 * Container for background media sampled by Android [WiezLiquidGlassLensView] instances.
 *
 * Uses React Native / Yoga child layout bounds (no LinearLayout pass) and notifies
 * registered sibling glass lenses only when descendant visuals actually invalidate.
 */
@SuppressLint("ViewConstructor")
class WiezLiquidGlassBackdropView(
  context: Context,
  appContext: AppContext,
) : ExpoView(context, appContext) {

  var backdropVersion: Long = 0L
    private set

  private var isCapturing: Boolean = false
  private val registeredLenses = mutableListOf<WeakReference<WiezLiquidGlassLensView>>()

  init {
    clipChildren = false
    clipToPadding = false
  }

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    setMeasuredDimension(
      MeasureSpec.getSize(widthMeasureSpec),
      MeasureSpec.getSize(heightMeasureSpec),
    )
  }

  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
    // React Native Yoga / UIManager owns exact child placement.
  }

  @SuppressLint("MissingSuperCall")
  override fun requestLayout() {
    // Terminated here so async child image decodes do not trigger LinearLayout passes.
  }

  fun registerLens(lens: WiezLiquidGlassLensView) {
    var alreadyRegistered = false
    val iterator = registeredLenses.iterator()
    while (iterator.hasNext()) {
      val current = iterator.next().get()
      if (current == null) {
        iterator.remove()
      } else if (current === lens) {
        alreadyRegistered = true
      }
    }
    if (!alreadyRegistered) {
      registeredLenses.add(WeakReference(lens))
    }
  }

  fun unregisterLens(lens: WiezLiquidGlassLensView) {
    val iterator = registeredLenses.iterator()
    while (iterator.hasNext()) {
      val current = iterator.next().get()
      if (current == null || current === lens) {
        iterator.remove()
      }
    }
  }

  internal fun beginCapture(): Boolean {
    if (isCapturing) return false
    isCapturing = true
    return true
  }

  internal fun endCapture() {
    isCapturing = false
  }

  internal fun isInCapturePass(): Boolean = isCapturing

  fun markBackdropDirty() {
    if (isCapturing) return
    backdropVersion++
    notifyRegisteredLenses()
  }

  private fun notifyRegisteredLenses() {
    if (registeredLenses.isEmpty()) return
    val liveLenses = ArrayList<WiezLiquidGlassLensView>(registeredLenses.size)
    val iterator = registeredLenses.iterator()
    while (iterator.hasNext()) {
      val lens = iterator.next().get()
      if (lens == null) {
        iterator.remove()
      } else {
        liveLenses.add(lens)
      }
    }
    for (lens in liveLenses) {
      lens.onBackdropInvalidated()
    }
  }

  override fun onDescendantInvalidated(child: View, target: View) {
    super.onDescendantInvalidated(child, target)
    markBackdropDirty()
  }

  @Suppress("DEPRECATION", "OVERRIDE_DEPRECATION")
  override fun invalidateChildInParent(location: IntArray?, dirty: Rect?): ViewParent? {
    markBackdropDirty()
    return super.invalidateChildInParent(location, dirty)
  }

  override fun onViewAdded(child: View?) {
    super.onViewAdded(child)
    markBackdropDirty()
  }

  override fun onViewRemoved(child: View?) {
    super.onViewRemoved(child)
    markBackdropDirty()
  }

  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    super.onSizeChanged(w, h, oldw, oldh)
    markBackdropDirty()
  }
}
