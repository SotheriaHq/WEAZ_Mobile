package expo.modules.wiezliquidglass

import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class WiezLiquidGlassModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("WiezLiquidGlass")

    Constant("supportsRuntimeShader") {
      Build.VERSION.SDK_INT >= 33
    }

    Constant("supportsRenderEffectBlur") {
      Build.VERSION.SDK_INT >= 31
    }

    View(WiezLiquidGlassBackdropView::class) {
      Name("WiezLiquidGlassBackdropView")
    }

    View(WiezLiquidGlassLensView::class) {
      Name("WiezLiquidGlassLensView")

      Prop("targetViewId") { view: WiezLiquidGlassLensView, targetViewId: Int? ->
        view.setTargetViewId(targetViewId)
      }

      Prop("cornerRadius") { view: WiezLiquidGlassLensView, cornerRadius: Float? ->
        view.setCornerRadius(cornerRadius ?: 999f)
      }

      Prop("blurRadius") { view: WiezLiquidGlassLensView, blurRadius: Float? ->
        view.setBlurRadius(blurRadius ?: 1.2f)
      }

      Prop("refractionStrength") { view: WiezLiquidGlassLensView, refractionStrength: Float? ->
        view.setRefractionStrength(refractionStrength ?: 0.85f)
      }

      Prop("chromaticAberration") { view: WiezLiquidGlassLensView, chromaticAberration: Float? ->
        view.setChromaticAberration(chromaticAberration ?: 0.45f)
      }

      Prop("rimStrength") { view: WiezLiquidGlassLensView, rimStrength: Float? ->
        view.setRimStrength(rimStrength ?: 1.0f)
      }

      Prop("reflectionStrength") { view: WiezLiquidGlassLensView, reflectionStrength: Float? ->
        view.setReflectionStrength(reflectionStrength ?: 1.0f)
      }

      Prop("tintColor") { view: WiezLiquidGlassLensView, tintColor: Int? ->
        view.setTintColorValue(tintColor)
      }

      Prop("tintAlpha") { view: WiezLiquidGlassLensView, tintAlpha: Float? ->
        view.setTintAlpha(tintAlpha ?: 0.035f)
      }

      Prop("fallbackColor") { view: WiezLiquidGlassLensView, fallbackColor: Int? ->
        view.setFallbackColorValue(fallbackColor)
      }

      Prop("isDark") { view: WiezLiquidGlassLensView, isDark: Boolean? ->
        view.setIsDark(isDark ?: false)
      }

      Prop("pressed") { view: WiezLiquidGlassLensView, pressed: Boolean? ->
        view.setPressedState(pressed ?: false)
      }

      OnViewDidUpdateProps { view: WiezLiquidGlassLensView ->
        view.applyConfig()
      }
    }
  }
}
